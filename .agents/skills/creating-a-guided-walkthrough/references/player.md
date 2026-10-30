# The walkthrough player

Every walkthrough runs on one shared player in the documentation app. A
walkthrough is then only data — its chapters, beats, text, and visuals — plus
its assets. Consistency between walkthroughs comes from the player, not from
each author following the rules.

If the player does not exist yet, build it before the first walkthrough that
needs it, to the contract below. If it exists but lacks something a storyboard
needs, extend the player rather than special-casing one walkthrough.

## Where it lives

A React component in `apps/documentation`, rendered directly in the docs page
(inside a fresco-ui `Dialog` for the full-screen view). Not an iframe around a
standalone HTML page: rendering in the docs app is what lets it use the real
fresco-ui components and tokens, the docs' fonts, `next-intl` messages, and
the dialog's own focus handling, and it removes the `postMessage` bridge the
iframe needed.

The player is built. One MDX tag serves every walkthrough:
`<Walkthrough id="fresco-deployment">` renders the card that starts or
resumes it, and `<Walkthrough id="fresco-deployment" chapter="fork">` renders
a section's "Walk through this step" button.

| Path (under `apps/documentation`)             | Holds                                                                |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `components/customComponents/Walkthrough.tsx` | The MDX tag: card or button, the dialog, the return to the guide     |
| `components/walkthrough/`                     | The player, its visuals, the step sequence logic, and saved progress |
| `walkthroughs/<id>/storyboard.md`             | The approved storyboard                                              |
| `walkthroughs/<id>/en.ts`                     | The walkthrough's data and on-screen text, one file per locale       |
| `walkthroughs/registry.ts`                    | Maps ids to data; register a new walkthrough here                    |
| `walkthroughs/<id>/capture.ts`                | The Playwright script that records the captures                      |
| `public/assets/walkthroughs/<id>/`            | Rendered captures: WebM, MP4 and a final-frame JPEG per clip         |

On-screen text lives in the data file rather than in `messages/*.json`: it is
article content, translated with the article. Only the player's own controls
(Continue, Back, Start over) are in `messages`.

### The iframe prototype

An earlier Fresco walkthrough (`DeploymentWalkthrough.tsx` wrapping a
standalone `index.html` in an iframe) was an experiment that predates this
contract. Do not build on it or revive it; the player replaced it, keeping its
chapter ids and its focus and scroll handling for "Read this step in the
guide".

## Data model

Model the storyboard directly (`components/walkthrough/types.ts`). A beat
carries its type (explain, do, choose, checkpoint, finish), its text, its visual, its confirmation
labels, and, for choices, the options. A beat may declare `when` — the choices
that must be made for it to appear — and its text may vary by an earlier
choice, so branching is data, not code. Keep the model typed with no `any`;
the storyboard table columns map one-to-one onto fields.

## Controls and behavior

- **Advancing** follows the beat type (see `storyboard.md`): Continue for
  explain beats, a named confirmation for do beats, an option for choose beats.
  Nothing advances on a timer by default.
- **Back** always works and keeps earlier choices; changing a choice discards
  only the beats that depended on it.
- **Chapter list** shows every chapter, which are done, and which one is
  current; any chapter can be opened directly. Deep links open a chapter
  (`chapter=<id>`), which is how each section's "Watch this step" button works.
  A chapter opened directly whose beats depend on a choice not yet made asks
  that choice first; one already made is shown with the earlier answer
  selected, so the reader can confirm or change it.
- **Progress persists** in `localStorage` per walkthrough: current beat and
  choices. A reader who closes the dialog to switch tabs, or comes back the next
  day, resumes where they were, with a visible way to start over.
- **Guide link.** Each chapter, and any beat with a guide link, offers "Read
  this step in the guide", which closes the dialog, scrolls to the section
  heading, and moves focus to it. In a tabbed article it first switches to the
  walkthrough's tab, since a heading in a hidden tab cannot be scrolled to.
- **Keyboard.** Every control is reachable and labelled. Enter/Space activate
  the focused control; arrow keys do not silently advance, because a reader
  using them to scroll a capture would skip a step. Escape closes the dialog.
- **Live region.** When the beat changes, its on-screen text is announced, so a
  screen-reader user hears each step without hunting for it.

## Pacing and motion

The walkthrough's motion is in the style of the illustrations on
networkcanvas.com/updates: flat SVG drawings with thick navy outlines in the
brand colors, set on a pale band of one color, where pieces pop in with an
overshoot, dotted links carry particles between things, and a tilted badge
stamps the result. Each animation tells its small story once when its step
appears, then rests on its final frame with gentle floating; **Replay**
restarts it. It never moves the reader on.

The drawing pieces are shared with the website through `@codaco/art`
(`illustration/motion` for the clock and easing, plus `BrowserWindow`,
`AppTile`, `Badge`, `Cursor`, `DottedPath` and `Confetti`). Reuse them; add a
new shared piece there rather than drawing a near-copy in one app.

| Visual    | Declare                                               | What plays                                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scene`   | `scene: '<id>'`                                       | An illustrated scene from `components/walkthrough/scenes/`, listed in `sceneRegistry.ts`. Use one for every explain beat. Each scene uses `useIllustrationClock(end, { from: 0 })` so it plays once; with reduced motion the clock stays on `end`, its final frame.                                                                                                                              |
| `capture` | `src` (no extension), `url`, `width`, `height`, `alt` | The recording in the same illustrated browser window. It plays once, muted, and rests on its last frame; **Pause**/**Play** sits beside **Replay**. With reduced motion the final-frame JPEG is shown instead and nothing plays.                                                                                                                                                                 |
| `still`   | `url`, `highlights` (in order), optional `zoom`       | The screenshot in an illustrated browser window showing `url`. The camera zooms to the highlights, then the /updates cursor visits each in turn and clicks while the rest of the page dims. `marked: true` on a highlight the screenshot already circles: no extra ring. `zoom: false` keeps the whole screenshot in view. Zoom is capped so a screenshot is never enlarged past its own pixels. |

These are the only kinds, so the type itself refuses a beat with no
picture. Steps without a screenshot get a scene too: a sign-in page, a list to
pick from, a text file being edited. When several beats share a drawing,
write one component with a prop and export a named variant per beat
(`EnvEditScene`, `EnvCheckScene`), each registered under its own id. Links
the reader must open go in the beat text as markdown links.

Writing a scene: draw in a 1200 × 460 view box; time each piece with
`segment` and `backOut` against the clock; keep the story under about four
seconds; float with `Math.sin((TAU * t) / 2.7) * 3`; use the shared pieces for
anything that recurs (`scenes/parts.tsx` has the cursor click, the check
stamp and placeholder text lines). Look at `apps/networkcanvas.com/components/updates/illustrations/`
for the house style.

Between steps, the visual slides in from the side the reader is heading
towards, the caption follows (label, text, actions), and a chapter's check
mark springs in when it is finished. Each chapter has a `tint` for its band.

- One thing at a time: camera, then cursor, then highlight; never two at once.
- Highlight coordinates are percentages of the image. For screenshots with
  baked-in circles or boxes, measure them rather than guessing.
- A do beat's animation should be finished by the time the reader reaches for
  the confirmation.
- Reduced motion (`usePrefersReducedMotion`): every visual is drawn in its
  final state, with no cursor, no slide, and no Replay button.

## Styling

- **Components.** Build from fresco-ui: `dialogs/Dialog`, `Button` (with
  `asChild` around a router link for links that should look like buttons),
  `NativeLink` (with `render` for a router link) for text links,
  `typography/Paragraph`, `typography/Eyebrow` for the step label,
  `ProgressBar`, `RenderMarkdown` and `layout/Surface`. Do not restyle them to
  "look like" themselves at another size. The chapter list is the one local
  control: fresco-ui has no step list (`NavItem` renders links to pages, not
  buttons for steps), so it stays in the player, built from tokens.
- **Type and color** come from the tokens fresco-ui and `@codaco/tailwind-config`
  already provide. Never paste token values into walkthrough code.
- **Scale.** Lay the stage out in rem at a fixed design size and scale the whole
  stage, so the type scale stays fresco-ui's scale rather than per-element pixel
  values. On-screen text should read at the size of the docs' body text or
  larger at the smallest supported dialog size.
- **Text versus visual.** Keep the beat's text in a consistent place (a caption
  area beside or below the visual), never overlaid on a capture, so it is
  always readable and always in the same place the reader's eye returns to.
- **No frame.** The player fills its container edge to edge with no border,
  radius, or shadow; the dialog or the poster card supplies the frame.
- Check every rendered state against Storybook's `TypeScale` and the
  components' stories, not against memory.
