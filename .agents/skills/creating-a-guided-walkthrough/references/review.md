# Reviewing a walkthrough

Run these checks before showing the user a built walkthrough. Render it in the
local docs dev server and drive it with Playwright; look at the screenshots
yourself rather than assuming they match the code.

## Style

Screenshot every beat at the smallest and largest supported dialog sizes, and
compare against the fresco-ui stories:

- Headings, body text, and buttons are fresco-ui components at fresco-ui's
  scale — no hand-set font sizes, no heading font used for body text.
- No border, radius, or shadow on the player itself inside the dialog (no
  double frame).
- Text sits in the caption area, never over a capture, and is readable at the
  smallest size.
- Colors and spacing come from tokens; nothing pasted.

## Pace

Read every beat aloud at a normal pace, as the reader in the brief, with the
other tab in mind. Note any beat where the motion is still going when you have
finished reading, or where you reached for the confirmation before the capture
finished. Fix those beats, not the global timing.

## Behavior

- Every choice: take each option and confirm only the right beats appear; go
  back, change the choice, and confirm the dependent beats change.
- Close mid-chapter and reopen: it resumes; "Start over" resets.
- Every "Watch this step" button opens the right chapter; every guide link
  lands on the right heading with focus on it.

## Accessibility

- Keyboard only, start to finish, including choices and the guide link.
- With a screen reader (or by inspecting the live region), each beat's text is
  announced once when it appears.
- With reduced motion on: no movement; scenes and stills show their final
  frame, and captures show their final-frame image.
- A capture can be paused and played from the keyboard.

## Accuracy

Walk through the article beside the walkthrough. Every instruction, label, and
value on screen must match the article and the current UI, and every item in
the storyboard's _Guide changes_ must be made in the article in the same pull
request.

## Reporting

Tell the user which checks passed, which failed and how you fixed them, and
which you could not run (for example, no screen reader available).
