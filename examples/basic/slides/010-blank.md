---
id: blank
title: Blank
layout: blank
---

:::notes
Blank layouts are useful for live demos, pauses, and externally controlled visuals.

Use this pause to reset the room and make sure the audience is ready for the next section. If the preceding demo ran long, this is the place to collapse detail and move to the conclusion. If it landed quickly, use the spare time to connect the example back to the main argument and give people a simple way to remember the pattern.

- Restate the decision the slide is meant to support.
- Call out what was deliberately left out of the demo.
- Mention where the supporting resources will be published.
- Leave a clear verbal bridge into questions or the next topic.

These longer notes are intentionally included in the fixture so export layouts can be checked against realistic speaker material rather than a single short sentence.

This paragraph starts an intentionally overlong notes section. It exists so the PDF export can be checked against the uncomfortable case where a speaker has written more than one physical notes page can hold. The expected behaviour is not to squeeze the type until it becomes unreadable, and not to clip content, but to let the notes continue cleanly.

In a real conference talk this might be the point where the speaker adds a backup explanation, a story about how the example failed in rehearsal, or a set of caveats that are useful in the room but not useful on the projected slide. The export needs to preserve that material because the PDF is often what gets rehearsed from on a train, in a hotel room, or beside the lectern.

The notes should still be pleasant to scan. Paragraph spacing, list spacing, and page breaks matter here because the speaker is using this document under pressure. If the words run together, or if a page break lands in a way that hides context, the output stops being useful even if every character technically appears somewhere in the file.

Another practical detail is that slides and notes need to remain associated. When the speaker layout interleaves slide pages and notes pages, an overflow page should still clearly feel like it belongs to the same slide. The page header and slide number become important anchors when the notes run longer than the first sheet.

For handouts, the behaviour is a little different. A same-page layout cannot include unlimited notes without either continuing on another page or becoming unreadable. For now the fixture is mainly checking that the panel remains bounded, the text remains smaller than the dedicated notes layout, and the slide preview still gets enough space to look like an actual slide.

If this becomes too dense, the next slice should probably add an explicit long-notes treatment for handouts. That could mean continuing notes underneath the slide on a second page, emitting an appendix page for overflow, or making handout exports opt into a maximum notes length. Those are product decisions rather than CSS accidents, so this fixture gives us a way to see the tradeoff.

The final check is that Markdown features survive the overflow. A list should still render as a list, code should still wrap or scroll according to the print rules, and raw HTML should still be allowed where the deck author deliberately used it. Export is only useful if it preserves the same authoring model as the live deck.

- First overflow checkpoint: the notes should not be clipped.
- Second overflow checkpoint: the printed page should not collapse the slide page that follows.
- Third overflow checkpoint: the handout preview should stay centred even when notes are long.
- Fourth overflow checkpoint: the type should remain readable enough for rehearsal.

End the overlong section with a plain final paragraph so there is an obvious tail to look for in the generated speaker notes PDF. If this paragraph disappears, the export has clipped content. If it appears on a continuation page, the export is doing the safer thing.
:::
