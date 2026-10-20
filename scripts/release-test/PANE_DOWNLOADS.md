# Capturing downloads in the Browser pane

Release-test agents that drive an app in the Claude Browser pane
(`mcp__Claude_Browser__*`) must never let a download reach the browser. In a
cloud session the pane aborts it (`net::ERR_ABORTED`); in the Claude desktop
app it opens a native "Save as…" dialog that no tool can answer, and every
download leaves another one on the person's screen.

Our apps all download the same way: they create an object URL for a `Blob`,
point an `<a download>` at it, and click that anchor. The hook below records
each such download (its file name and its `Blob`) and cancels the click, so
the app runs its whole export path, the agent gets the file's contents, and
nothing is handed to the browser's download manager.

Install it with `javascript_tool` on your tab **before** the action that
downloads, and again after any navigation or reload (a new document drops
it). Installing it twice is harmless.

```js
(() => {
  window.__captures ??= [];
  window.__downloads ??= [];
  if (!window.__downloadHook) {
    window.__downloadHook = true;
    const blobs = new Map();
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj) => {
      const url = create(obj);
      if (obj instanceof Blob) {
        blobs.set(url, obj);
        window.__captures.push(obj);
      }
      return url;
    };
    const record = (a) =>
      window.__downloads.push({
        name: a.getAttribute('download') || a.href.split('/').pop(),
        href: a.href,
        blob: blobs.get(a.href) ?? null,
      });
    // Detached anchors never dispatch to the window, so catch .click() too.
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.hasAttribute('download') && !this.isConnected) return record(this);
      return click.call(this);
    };
    window.addEventListener(
      'click',
      (event) => {
        const a = event.target instanceof Element ? event.target.closest('a[download]') : null;
        if (!a) return;
        event.preventDefault();
        record(a);
      },
      true,
    );
  }
  return 'download hook installed';
})()
```

After triggering the download, read what was captured, for example:

```js
(async () =>
  Promise.all(
    window.__downloads.map(async ({ name, blob }) => ({
      name,
      size: blob?.size ?? null,
      // "PK" for a zip (.netcanvas, export archives)
      magic: blob ? await blob.slice(0, 2).text() : null,
    })),
  ))()
```

A download with `blob: null` came from a URL the hook did not mint (a link to
a server route, say); report it rather than following the link.

`window.__captures` keeps every `Blob` turned into an object URL, in order, for
flows that read the newest one (`window.__captures.at(-1)`), such as Fresco's
presigned-PUT capture in `apps/fresco/release-test/AGENT_NOTES.md`.
