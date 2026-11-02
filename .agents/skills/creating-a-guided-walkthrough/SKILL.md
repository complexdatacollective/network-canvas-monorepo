---
name: creating-a-guided-walkthrough
description: 'Use when creating, revising, or reviewing a guided walkthrough for the Network Canvas documentation — an interactive, step-by-step companion to a docs article (Fresco deployment, Architect or Interviewer how-tos, setup procedures) that a reader follows while doing the task. Covers storyboarding the content before anything is built, the beat types (explain, do, choose, checkpoint, finish), pacing, on-screen text, fresco-ui styling, screen captures of local dev, and review. Use it whenever someone asks for an animated explainer, video, tour, demo, or "watch this step" for a docs page, even if they call it a video, and before editing an existing walkthrough. Keywords: walkthrough, guided tour, explainer video, animated guide, storyboard, screen capture, screen recording, watch this step, DeploymentWalkthrough.'
---

# Creating a guided walkthrough

A guided walkthrough is an interactive companion to one docs article. The reader
opens it beside the task they are doing — deploying Fresco, starting a first
protocol in Architect — and moves through it at their own pace, acting on each
step in the app or another tab before continuing. It is not a video: nothing
advances while the reader is still reading or still doing the step.

Walkthroughs fail in four predictable ways. This skill is ordered to prevent
them:

| Failure                                                                         | Cause                                               | Prevented by                               |
| ------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------ |
| Covers the article but not the reader's needs; explains internals nobody needed | Scenes derived straight from the article text       | The storyboard, approved before building   |
| Too fast                                                                        | A fixed timeline the reader does not control        | Beat types and reader-controlled advancing |
| Looks "almost" like Network Canvas                                              | Tokens and components copied into a standalone page | Building with fresco-ui itself             |
| Screens drift out of date                                                       | Hand-made mocks and one-off screenshots             | Scripted captures that can be re-recorded  |

## Workflow

Work through these phases in order. Phases 1 and 2 produce one document — the
storyboard — that the user signs off on. Write no walkthrough code until it is
approved: every later phase is cheaper to change on paper.

### Phase 0 — Check what exists

Look for an existing walkthrough of the article (search the article for
walkthrough tags and `apps/documentation` for walkthrough components and
`storyboard.md` files). If one exists, read it and its storyboard before
anything else, and treat the work as a revision:

- Keep its chapter ids. The article's "Watch this step" buttons link to them.
- Start from its storyboard if it has one; record in the storyboard what you
  changed and why.
- An iframe-based Fresco walkthrough (`DeploymentWalkthrough.tsx` and a
  standalone `index.html`) was an earlier experiment, not the shared player.
  Do not build on it (see `references/player.md`).

### Phase 1 — Brief and coverage map

Read the source article in full, and its prerequisite articles: the pages the
reader needs before or during the procedure (what to set up, what to avoid,
where their work is stored), not the pages for afterwards (advanced features,
FAQs, next tutorials). Together these are **the source** for the rest of this
skill.

Then write the brief and coverage map at the top of the storyboard (format in
`references/storyboard.md`):

- **Reader.** Who opens this, what they already know, and the jargon they will
  not know. Derive it from the article: a deployment guide's reader has
  probably never used GitHub or a cloud console; an Architect guide's reader
  knows web apps but not Network Canvas's vocabulary (protocol, stage,
  codebook, schema).
- **Outcome.** What the reader has _done_ by the end — a state of the world
  ("a running Fresco instance with an admin account"), not a topic covered.
- **Context of use.** What else is on their screen: another tab they switch to
  between steps, or the app itself beside the docs.
- **Coverage map.** Every section of the source, marked _include_, _condense_,
  _omit_, or _link out_, each with a reason. This is where coverage gaps and
  over-explanation are both caught: a section about how a system works
  internally is usually _link out_, unless the reader must act on that
  knowledge.
- **Visual inventory.** Which sections have screenshots, and which product
  screens a capture would need. This decides the visual mix early.

If the article is split into tabs (`AppSwitch` — for example Architect and
Architect Classic), the walkthrough covers one variant. Say which in the brief,
and offer a choose beat at the start that sends readers of the other variant
to its section.

### Phase 2 — Storyboard

Write the full storyboard: chapters, then beats, with the exact on-screen text,
the visual for each beat, where the reader acts, and where they choose. Follow
`references/storyboard.md` — it has the beat types, the writing rules, and
worked examples.

Verify every UI label you quote against the product: the app's message files
or source for Network Canvas apps, a screenshot for third-party sites. Articles
drift; list the labels you could not verify.

Save the storyboard as
`apps/documentation/walkthroughs/<walkthrough-id>/storyboard.md` (create the
directory). It is a document, not code; committing it before approval is fine
and gives the user something to comment on.

Run the plain-language pass described in `references/storyboard.md`, then
present the storyboard to the user for approval. Expect to revise.

### Phase 3 — Visual plan and captures

Choose each beat's visual with `references/screen-capture.md`, then produce the
captures from local dev with a committed Playwright script, so they can be
re-recorded when the UI changes. Third-party sites (GitHub, Neon, Netlify,
UploadThing) cannot be captured reproducibly; use the article's screenshots or
an illustrated scene for those.

### Phase 4 — Build

Build the walkthrough as data for the shared player, not as a bespoke page.
`references/player.md` describes the player's contract: beat types, controls,
progress persistence, embedding in the docs, and the styling rules. If the
player does not exist yet, building it is the first task — once, in the
documentation app, with fresco-ui components — so every later walkthrough is
only a storyboard and its assets.

Invoke `developing-network-canvas-ui` before the first UI edit, as for any
user-facing change.

### Phase 5 — Review

Go through `references/review.md` before showing the result: rendered-frame
review against the style rules, a timed read-through, keyboard and
reduced-motion passes, and a check that every beat still matches the source.
Report what you checked and what you could not.

## Principles

**The reader sets the pace.** Each beat holds until the reader continues.
Motion inside a beat plays once and settles; it never carries the reader to the
next beat.

**One idea per beat.** If a beat needs two separate instructions, it is two
beats. Short beats feel slow to build and fast to follow — the right trade.

**Show the real thing, in the house style.** Every beat has a screenshot or a
scene; none is text alone. Explain beats, and steps with no screenshot, get
illustrated scenes in the style of networkcanvas.com/updates, built from the
shared pieces in `@codaco/art`. Screenshots sit inside the same illustrated browser
window. The player's own controls are fresco-ui components. Never draw an
imitation of a fresco-ui control; it will drift.

**The article and the walkthrough agree.** Every instruction on screen is
backed by the source. When the walkthrough needs something the source lacks or
gets wrong — a wrong label, a missing step, a safer order — record it in the
storyboard's _Guide changes_ section. Approving the storyboard approves those
changes, and the article is updated in the same pull request as the
walkthrough, so the two never disagree.

**The host draws the frame.** The walkthrough fills whatever container hosts it
and draws no border, rounded corner, or shadow of its own; the docs dialog or
card around it supplies that.
