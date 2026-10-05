# Driving Fresco in the in-app browser — verified techniques

Read this before driving a release-test Fresco instance with the in-app
Browser tools. Every technique below was verified against the real app; the
generic approaches they replace (accessibility tree, native scrolling, file
choosers, downloads) do NOT work in this environment.

## Environment quirks

- **`read_page` returns empty** for Fresco pages. Use `computer` screenshots
  for orientation and `javascript_tool` DOM queries for state. Verify outcomes
  via the DOM or the database, not pixels.
- **Resize first**: run `resize_window` to 1280x1100 on your tab before
  interacting — at the default pane size the setup wizard and dialogs overflow
  and mouse scrolling can hang (`computer` scroll may time out; the pane is a
  hidden surface). Scroll with JS `el.scrollIntoView({block:'center'})`
  instead.
- **Animations stall**: menus and dialogs render as semi-transparent ghosts
  and may never finish opening/closing visually. They ARE interactive in the
  DOM. Find and click their elements via `javascript_tool`, e.g.
  `[...document.querySelectorAll('[role=menuitem]')].find(el => /export all interviews/i.test(el.textContent)).click()`.
- **`javascript_tool` shares one page scope across calls** — a top-level
  `const x` persists and re-declaring it throws. Wrap every snippet in an
  IIFE: `(() => { ... })()` or `(async () => { ... })()`.
- **React-controlled inputs** ignore plain `.value =`. Use the native setter:
  `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'text')`
  then dispatch `new Event('input', {bubbles:true})` and `change`. For native
  `<select>`s use `HTMLSelectElement.prototype`'s setter + `change`. Plain
  `computer` clicking + typing works for ordinary text fields.

## Uploading a protocol (no file chooser exists)

The pane cannot operate a native file dialog. Stage the file into the lane's
MinIO and inject it:

1. Host: `bash apps/fresco/release-test/stage-fixture.sh --lane <lane> --file <path> --name <name>` — prints a fetch URL.
2. Page JS:

```js
(async () => {
  const res = await fetch('<printed url>');
  const file = new File([await res.blob()], '<display name>.netcanvas', { type: 'application/octet-stream' });
  const input = document.querySelector('input[type=file]');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'dispatched ' + file.size;
})()
```

3. Verify via the network log (presigned OPTIONS 204 + PUT 200 to MinIO) or
   the protocols table — the dropzone UI may not visibly react.

## Capturing a download (exports) — downloads abort in the pane

A real download attempt shows `[FAILED: net::ERR_ABORTED]`; that alone is NOT
an export failure. Capture the blob instead:

1. Host, once per lane: `bash apps/fresco/release-test/enable-captures.sh --lane <lane>` — prints the capture base URL.
2. Page JS BEFORE triggering the export/download:

```js
(() => {
  window.__captures = [];
  if (!window.__origCreateObjectURL) {
    window.__origCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj) => { if (obj instanceof Blob) window.__captures.push(obj); return window.__origCreateObjectURL(obj); };
  }
  return 'hook installed';
})()
```

3. Drive the export UI (menu + "Confirm File Export Options" dialog →
   "Start export process"; the export streams for ~10-30s).
4. Page JS: check `window.__captures` has a blob, then
   `await fetch('<capture base>/<name>.zip', { method: 'PUT', body: window.__captures.at(-1) })`.
5. Host: `curl -fsS -o <dest> <capture base>/<name>.zip`.

## Backgrounded tabs go dead — check visibility EARLY

When another agent's tab has the pane's focus, a backgrounded tab's
`document.visibilityState` stays `hidden` and every element (even
`document.body`) reports a zero-size `getBoundingClientRect()`. Coordinate
clicks, JS `.click()`/`.focus()` on custom listbox/radio components, and
screenshots ("Browser pane is not displayed") all silently fail — server
actions never fire. This looks like the stalled-animation ghost issue but is
not. Check `document.visibilityState` and `document.body.getBoundingClientRect()`
via `javascript_tool` BEFORE debugging dead interactions. The fix: open a
brand-new tab with `preview_start {url}` and continue there. Sessions are NOT
shared between separately opened tabs in this environment — re-authenticate
via `/signin` in the new tab.

## Misc verified facts

- Setup wizard storage step: choose "S3 / S3-Compatible"; fields are named
  `s3Endpoint`, `s3PublicUrl`, `s3Bucket`, `s3Region`, `s3AccessKeyId`,
  `s3SecretAccessKey`.
- Synthetic interview generation: settings → Synthetic Interview Data; the
  protocol picker is a native `<select name="Protocol">`; the count field is a
  number input; a toast confirms "Generation complete". "Simulate participant
  drop-out" is ON by default, so some interviews stay partial — that is fine
  and consistent across the upgrade diff.
- The stack's Postgres is reachable from the host for verification queries:
  `docker exec fresco-release-test-<lane>-postgres-1 psql -U postgres -t -c '<sql>'`.
- A `POST .../setup?step=3` or export POST marked `ERR_ABORTED` in the network
  log with a 200 status usually still succeeded server-side — verify state,
  not the request log.

## Driving Fresco with Playwright (the script-driven lanes)

The lanes under `scripts/` drive the app with the repository's own Playwright
rather than the in-app browser, so most of the constraints above do not apply
to them: the real file input can be used for imports, real downloads arrive as
`download` events, and the accessibility snapshot is readable. The facts below
are the ones that cost a run to discover, and every one of them fails silently
rather than loudly.

- **posthog-js will not capture for a browser it takes for a bot, and says
  nothing.** Masking `navigator.webdriver` is not enough: Chromium also reports
  `HeadlessChrome` in `navigator.userAgentData.brands`, which posthog-js reads.
  A lane that misses this records initialisation traffic, no events at all, and
  every "nothing sensitive was sent" assertion passes over an empty file.
  `fresco-driver.mjs` masks both and sets a plain desktop user agent.
- **The viewport has to clear 1280px with room to spare.** `laptop` is
  1280px, and the interview's small-screen overlay is `laptop:hidden` — so at
  exactly 1280 a page that happens to scroll loses 15px to the scrollbar and
  the overlay covers the stage. It looks exactly like an interview that failed
  to render, intermittently. The driver uses 1440×1000.
- **The first render of `/interview/<id>` on a freshly started container can
  come back as the app's error screen.** The next attempt serves the interview.
  Both lanes that open one retry, bounded and counted, and report the count.
- **A stage that is leaving stays mounted while it animates out**, so for part
  of a second there are two `[data-stage-step]` elements. Read them all and
  wait for one, rather than asking for "the" stage.
- **A drag into a bin has to pause over the target before releasing.** Arriving
  and letting go in the same frame drops the node nowhere, silently. The
  sociogram needs only the 8px jiggle that clears the drag threshold; the bins
  need the jiggle, a pause on arrival, and a small move before the release.
- **A field filled before hydration is discarded.** Fill every field of a form
  and then read them all back together: a field verified on its own can be
  emptied by a Suspense boundary streaming in behind it, which surfaces as
  "Username cannot be empty" on a form you watched being filled.
- **The setup wizard's last button is what marks the installation
  configured.** A lane that stops before it leaves an instance that redirects
  every later request back to `/setup`, and whatever it was testing is never
  reached.
