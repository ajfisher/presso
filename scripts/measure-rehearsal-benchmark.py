import json
from pathlib import Path
import re
import sys

result = json.loads(Path(sys.argv[1]).read_text())
vtt = Path(sys.argv[2]).read_text()


def tokens(text):
    text = re.sub(r'\[[^\]]*\]|<[^>]*>|(?:JASON KU|STUDENT):', '', text)
    return re.findall(r"\b[\w']+\b", text.lower().replace("’", "'"))


def seconds(clock):
    hour, minute, second = clock.split(':')
    return 3600 * int(hour) + 60 * int(minute) + float(second)


def edit_distance(expected, actual):
    row = list(range(len(actual) + 1))
    for index, reference_word in enumerate(expected, 1):
        following = [index]
        for column, candidate in enumerate(actual, 1):
            following.append(min(row[column] + 1, following[-1] + 1,
                                 row[column - 1] + (reference_word != candidate)))
        row = following
    return row[-1]


captions = []
for block in re.split(r'\n\s*\n', vtt):
    lines = block.splitlines()
    timestamp = next((i for i, row in enumerate(lines) if ' --> ' in row), None)
    if timestamp is not None:
        start, _, stop, *_ = lines[timestamp].split()
        words_in_cue = tokens(' '.join(lines[timestamp + 1:]))
        if words_in_cue:
            captions.append((seconds(start), seconds(stop), words_in_cue))


def midpoint(word):
    return (word['startMs'] + word['endMs']) / 2000


# Mirror the Markdown export's overlap rule for the timestamped WER estimate.
segments = result['segments']
kept = {}
for segment in segments:
    index = segment['index']
    for word_index, word in enumerate(segment['words']):
        if index * 24 <= midpoint(word) < segment['endMs'] / 1000:
            kept[index, word_index] = word

for index in range(1, len(segments)):
    boundary = 24 * index
    previous, current = segments[index - 1:index + 1]
    right = [(i, w) for i, w in enumerate(current['words']) if abs(midpoint(w) - boundary) <= 2]
    for left_index, word in enumerate(previous['words']):
        if abs(midpoint(word) - boundary) > 2:
            continue
        match = next((i for i, (_, other) in enumerate(right)
                      if word['text'].strip().lower() == other['text'].strip().lower()
                      and word['startMs'] < other['endMs'] and other['startMs'] < word['endMs']), None)
        if match is None:
            continue
        right_index, _ = right.pop(match)
        left_key, right_key = (index - 1, left_index), (index, right_index)
        if left_key not in kept and right_key in kept:
            continue
        kept.pop(right_key, None)
        kept[left_key] = word

words = sorted(kept.values(), key=midpoint)


def sample(start, end):
    reference = [token for a, b, cue in captions if start <= (a + b) / 2 < end for token in cue]
    actual = [token for word in words if start <= midpoint(word) < end for token in tokens(word['text'])]
    return reference, actual


for start, end in [(10, 70), (230, 290), (1020, 1080), (1835, 1895), (2630, 2690), (2690, 2738)]:
    reference, actual = sample(start, end)
    if reference:
        errors = edit_distance(reference, actual)
        print(f'{start}–{end}s: {errors}/{len(reference)} edits ({100 * errors / len(reference):.1f}% sampled WER)')

for label, start, end, terms in [
    ('opening', 10, 70, ('jason ku',)),
    ('problems', 230, 290, ('binary relation',)),
    ('correctness', 1020, 1080, ('inductive reasoning',)),
    ('bounds', 1835, 1895, ('omega', 'theta')),
    ('closing examples', 2630, 2738, ('python', 'dictionary', 'recursive algorithm'))
]:
    reference, actual = map(' '.join, sample(start, end))
    print(label, [(term, term in reference, term in actual) for term in terms])

for boundary_ms, _ in result['visits'][1:]:
    boundary = boundary_ms / 1000
    before_ref, before_words = sample(boundary - 6, boundary)
    after_ref, after_words = sample(boundary, boundary + 6)
    before = sorted(set(before_ref) & set(before_words))
    after = sorted(set(after_ref) & set(after_words))
    print(f'Slide marker {boundary:.0f}s also crosses a decode seam: '
          f'{len(before)} common caption terms before, {len(after)} after the marker')

print(f'{len(words)} exported word candidates. '
      f'Last decoded word ends at {words[-1]["endMs"] / 1000:.2f}s, '
      f'last spoken caption at {captions[-1][1]:.2f}s, audio at {result["samples"] / 16000:.2f}s.')
