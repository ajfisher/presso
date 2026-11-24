import argparse
import os
import selectors
import shlex
import signal
import subprocess
import sys
import time
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--quiet', type=float)
parser.add_argument('--duration', type=float, default=180)
parser.add_argument('--dev-url')
parser.add_argument('--log', required=True)
parser.add_argument('command', nargs=argparse.REMAINDER)
args = parser.parse_args()
command = args.command
if command[0] == '--':
    command.pop(0)

def process_table():
    output = subprocess.check_output(['ps', '-ax', '-o', 'pid=,ppid=,pgid=,rss=,pcpu='], text=True)
    return [tuple([*map(int, fields[:4]), float(fields[4])]) for row in output.splitlines() if len(fields := row.split()) == 5]

process_table()
child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
selector = selectors.DefaultSelector()
selector.register(child.stdout, selectors.EVENT_READ)
print(f'Guarding PGID {child.pid} at 4 GiB RSS: {shlex.join(command)}', flush=True)
started = time.monotonic()
last_output = started
last_line = ''
seen = {child.pid}
peak_kib = 0
previous_kib = 0
rapid_samples = 0
problem = ''
smoked = False
dev_ready = False

def owned():
    table = process_table()
    owners = seen.copy()
    while True:
        descendants = {pid for pid, ppid, pgid, *_ in table if pgid == child.pid or ppid in owners}
        if descendants <= owners:
            break
        owners.update(descendants)
    rows = [(pid, pgid, rss, cpu) for pid, _, pgid, rss, cpu in table if pid in owners]
    seen.update(pid for pid, _, _, _ in rows)
    return rows

def stop(sig, rows):
    try:
        os.killpg(child.pid, sig)
    except ProcessLookupError:
        pass
    for pid, group, *_ in rows:
        if group == child.pid:
            continue
        try:
            os.kill(pid, sig)
        except ProcessLookupError:
            pass

with open(args.log, 'wb', buffering=0) as log:
    try:
        while True:
            for _, _ in selector.select(.25):
                data = os.read(child.stdout.fileno(), 65536)
                if data:
                    log.write(data)
                    sys.stdout.buffer.write(data)
                    sys.stdout.flush()
                    dev_ready |= b'dev server running' in data
                    last_output = time.monotonic()
                    last_line = data.decode(errors='replace').rstrip().splitlines()[-1] if data.strip() else last_line
                else:
                    selector.unregister(child.stdout)
            rows = owned()
            now = time.monotonic()
            rss = sum(row[2] for row in rows)
            peak_kib = max(peak_kib, rss)
            rapid_samples = rapid_samples + 1 if rss >= 1.5 * 1024**2 and rss - previous_kib > 384 * 1024 else 0
            previous_kib = rss
            if rss > 4 * 1024**2 or rapid_samples >= 2:
                problem = f'abnormal process RSS {rss // 1024} MiB'
            elif args.quiet and now - last_output > args.quiet:
                problem = f'focused run has had no progress for {now - last_output:.0f}s'
            elif now - started > args.duration:
                problem = f'run exceeded {args.duration:.0f}s (CPU {sum(row[3] for row in rows):.1f}%, RSS {rss // 1024} MiB)'
            if args.dev_url and dev_ready:
                with urllib.request.urlopen(args.dev_url + '/presenter', timeout=3) as response:
                    assert b'Start timing' in response.read(), 'presenter did not render rehearsal controls'
                with urllib.request.urlopen(args.dev_url + '/control', timeout=3) as response:
                    assert b'Start timing' not in response.read(), 'controller rendered rehearsal controls'
                smoked = True
                break
            if problem or (child.poll() is not None and not selector.get_map()):
                break
    except BaseException as error:
        problem = str(error) or type(error).__name__
    finally:
        rows = owned()
        if problem:
            print(f'Guard stopped PGID {child.pid}: {problem}. Last progress: {last_line}', flush=True)
        if rows:
            stop(signal.SIGTERM, rows)
            for _ in range(12):
                child.poll()
                rows = owned()
                if not rows:
                    break
                time.sleep(.25)
        if rows:
            stop(signal.SIGKILL, rows)
            for _ in range(12):
                child.poll()
                rows = owned()
                if not rows:
                    break
                time.sleep(.25)
        code = child.wait(timeout=2)
        remaining = owned()
        print(f'Guard PGID {child.pid} exited {code}; peak RSS {peak_kib // 1024} MiB; remaining process IDs {[row[0] for row in remaining]}; log {args.log}', flush=True)
        sys.exit(125 if problem or remaining else (0 if smoked else code))
