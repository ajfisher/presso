---
id: content
layout: bullets
time: "2:00"
---

## A tiny vertical slice

- Markdown slides
- Speaker notes
- Browser runtime

:::notes
Talk through the main pieces of the vertical slice.

Start with Markdown slides because that is the authoring surface people will touch every day. The point is to keep slide content reviewable, editable, and easy to turn into transcripts later.

Then move to speaker notes. Notes should be comfortable enough for rehearsal and delivery, not just an export artifact. This is where the teleprompter behavior needs to feel steady and predictable.

Finally, describe the browser runtime. Navigation, presenter view, notes, controller sync, and static builds all need to work from the same compiled deck model so conference delivery does not depend on a fragile local setup.

This slide also gives the presenter enough text to verify slide-change behavior. When the speaker advances from the title slide, the teleprompter should return to the top and wait for this first paragraph before it begins moving again.

The global pace should carry through from the previous slide. If the speaker has dialed the pace up or down, they should not need to repeat that adjustment every time they advance.

Keep an eye on the notes panel rather than the slide preview. The current and next slides are still visible as reference material, but the readable script is now the main working surface.

Use this slide to check that the teleprompter resets when the speaker advances. It should start at the top, wait for the opening sentence, and then continue scrolling at the selected pace.
:::
