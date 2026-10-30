# Visuals and screen capture

## Choosing a visual

Every beat gets one of these; there are no text-only beats.

| Show                                                                             | Use                       | Why                                                                                                                                           |
| -------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A sequence of actions in Fresco (filling the setup wizard, uploading a protocol) | `capture`                 | Motion through the real UI is what a still cannot show, and the script re-records it when the UI changes.                                     |
| One action on a third-party site (GitHub, Neon, Netlify, UploadThing)            | `still`, with a highlight | These sites cannot be captured reproducibly, change without notice, and need real accounts. The article's screenshots are already maintained. |
| A concept (what a fork is, how the pieces connect), or a step with no screenshot | `scene`                   | A small illustrated story explains a relationship better than a screenshot, and stands in for a third-party screen the article doesn't show.  |

Do not mix visual types inside one beat.

## How many captures

Every capture is a script to maintain and a clip to re-record when the UI
changes. Prefer an existing still when one shows the step well; capture where
motion matters (a sequence of fields, a drag, something appearing) or where no
still exists. A Fresco walkthrough is mostly stills of third-party sites with a
few captures of the setup wizard; an Architect walkthrough is first-party
throughout and mostly captures. Either is fine — the point is that each
capture earns its upkeep.

## Capturing from local dev

There is no seeded environment for any app, so captures come from local dev:

| App         | Start                                                                          | Known starting state                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fresco      | `pnpm --filter fresco dev` (Postgres and Garage S3 in Docker, then `next dev`) | Reset the dev database; the setup wizard only appears on an unconfigured instance.                                                                     |
| Architect   | `pnpm --filter @codaco/architect dev`                                          | A fresh browser context: protocols live in IndexedDB, so a new context is an empty library. Load fixture protocols through the UI if a beat needs one. |
| Interviewer | `pnpm --filter @codaco/interviewer dev`                                        | A fresh browser context, with any protocol installed through the UI by the script.                                                                     |

Commit a Playwright capture script with the walkthrough
(`apps/documentation/walkthroughs/<id>/capture.ts`) that:

1. **Starts from the known state** in the table above, and drives every step
   from the script — never record a manual session.
2. **Uses a fixed viewport** with even dimensions (the encoders need them),
   with the color scheme set explicitly. Playwright records video at the
   viewport's CSS pixels, so a device scale factor does not sharpen it; pick
   a viewport wide enough to read at the stage's size (1280 × 736 for
   Fresco).
3. **Shows a cursor.** Headless Chromium draws none; inject an overlay that
   follows `mousemove` and pulses on click, so the reader can see where the
   action happens. Draw the /updates cursor (the `Cursor` arrow from
   `@codaco/art`, in the theme's `--color-sea-serpent`) so it matches the
   stills and scenes, and hide the Next.js dev indicator.
4. **Moves at reading speed.** Type with a per-character delay, move the
   pointer in steps rather than teleporting, and pause on each result long
   enough to read it. A capture that looks slow while recording is about right
   to watch. Paste long values (tokens, keys, URLs) with
   `keyboard.insertText` after clicking the field, as the reader would;
   typing them out makes a clip drag.
5. **Uses dummy values only.** Every password, token, URL, and name is made up
   for the capture (`fresco-demo-study`, a token-shaped string of the right
   length). Never record real credentials, even blurred: a blur can be undone
   and a frame can be paused.
6. **Exports per beat**: one short clip per capture name, trimmed to the
   action, encoded as WebM and MP4, plus the final frame as a JPEG, which the
   player shows instead of the clip with reduced motion. Record one session
   per run, mark each clip's start and end as it goes, then cut the clips
   with ffmpeg.
7. **Waits on what the reader waits on.** Wait for each result the reader
   would wait for (a heading, a success message), and for anything that
   covers the next control to go away; Fresco's import message sits over
   **Continue** until it closes.

Know what local dev can and cannot reach before choosing `capture`:

- Fresco verifies an UploadThing token with UploadThing itself
  (`verifyUploadThingToken` in `apps/fresco/actions/appSettings.ts`), and its
  S3 form refuses an endpoint on a private or loopback address. Neither
  storage form can be saved with made-up values in local dev. End those clips
  on **Save and continue**; to keep a rejection out of the last frame, hold
  the save request open (`page.route` on POST requests, never fulfilled) so
  the clip ends with Fresco saving.
- Steps after storage (uploading a protocol, finishing setup) need working
  storage: record them on an instance whose storage is pinned to the local
  Garage store (`.env.development` with `scripts/dev-s3.ts` running). Its
  storage step is filled in from the environment, and its upload screens look
  the same as a deployed instance's.
- Record the storage clips against an instance with storage left
  unconfigured: set `STORAGE_PROVIDER` and every `S3_*` variable to blank in
  the environment of `next dev`, which takes precedence over
  `.env.development`.
- Run Fresco on its own throwaway Postgres (not the branch's dev database),
  migrated with `prisma migrate deploy` and initialized with
  `scripts/initialize.ts`, and keep a template copy to reset from between
  runs; the wizard only appears on an instance with no account. Start
  `next dev` on a port the docs server is not using. Fresco caches whether
  setup is complete on disk, so after a run that finishes setup, stop
  `next dev` and delete `apps/fresco/.next/cache` and `.next/dev` before
  recording on a reset database, or the wizard answers "Setup is already
  complete".
- Device prompts (passkeys, OS file pickers) are drawn outside the page and
  never appear in a recording. Use the article's still for a passkey step;
  for a file upload, click **Browse files** and hand the file to Playwright's
  file chooser, so the clip shows the click and the result.
- Third-party sites are never captured (see the table above).

Verify claims like these in the app's source before relying on them, and note
in the storyboard any step you could not capture.

## Stills

Use the article's screenshots from `/assets/img/fresco-images` (or the
equivalent for other guides) rather than taking new ones, so the guide and the
walkthrough show the same thing. Highlights are drawn by the player over the
image, not baked into a new PNG.
