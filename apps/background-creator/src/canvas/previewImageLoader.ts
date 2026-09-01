// Structural subset of HTMLImageElement the loader touches. `decode` is optional
// because jsdom's Image has no decode method; the loader falls back to the load
// event when it is absent or rejects. A real `new Image()` is assignable to this.
export type PreviewImageElement = {
  src: string;
  complete: boolean;
  decode?: () => Promise<void>;
  addEventListener: (
    type: 'load' | 'error',
    listener: () => void,
    options?: { once?: boolean },
  ) => void;
};

export type PreviewImageLoaderDeps = {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  createImage: () => PreviewImageElement;
  scheduleFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
};

type PreviewImageLoaderOptions<Source> = {
  // Turns a source into the SVG markup for one preview frame. Invoked at most
  // once per animation frame during a burst (see `runFrame`).
  serialize: (source: Source) => string;
  // Assigns a fully-decoded blob URL to the visible <img>.
  onSwap: (url: string) => void;
  deps?: PreviewImageLoaderDeps;
};

export type PreviewImageLoader<Source> = {
  update: (source: Source) => void;
  dispose: () => void;
};

function browserDeps(): PreviewImageLoaderDeps {
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createImage: () => new Image(),
    scheduleFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
  };
}

// Coalescing preview pipeline: serialize -> blob URL -> decode -> swap the
// visible <img>, keeping the last good frame on screen the whole time. A gesture
// produces a document version every pointer frame; feeding those straight into
// the <img> blanks it each swap. This loader instead decodes off-screen first
// and drops every intermediate frame that arrives while a decode is in flight,
// so a fast drag serializes and decodes at most one frame per animation frame.
export function createPreviewImageLoader<Source>({
  serialize,
  onSwap,
  deps = browserDeps(),
}: PreviewImageLoaderOptions<Source>): PreviewImageLoader<Source> {
  let disposed = false;
  // Latest source not yet serialized. Newer sources overwrite it (latest-wins),
  // so no queue accumulates while the pointer is moving.
  let pending: { source: Source } | null = null;
  let frameHandle: number | null = null;
  let running = false;
  // The URL the visible <img> was last told to show. Never revoked until a newer
  // frame has taken its place — revoking the on-screen URL would blank the <img>.
  let displayedUrl: string | null = null;
  // Every created-but-not-yet-revoked URL, so `dispose` can free them all,
  // including one whose decode is still outstanding.
  const outstanding = new Set<string>();

  function scheduleIfNeeded(): void {
    if (disposed || running || frameHandle !== null || pending === null) return;
    frameHandle = deps.scheduleFrame(runFrame);
  }

  function runFrame(): void {
    frameHandle = null;
    if (disposed || pending === null) return;
    const { source } = pending;
    pending = null;
    running = true;

    const svg = serialize(source);
    const url = deps.createObjectURL(
      new Blob([svg], { type: 'image/svg+xml' }),
    );
    outstanding.add(url);
    const image = deps.createImage();

    let settled = false;
    const swap = () => {
      // If the component unmounted mid-decode, drop the frame; `dispose` already
      // owns revoking every outstanding URL (including this one).
      if (settled || disposed) return;
      settled = true;
      // Decode-before-swap: the URL is only handed to the visible <img> once its
      // bytes are decoded, so the <img> repaints without a blank intermediate.
      onSwap(url);
      const previous = displayedUrl;
      displayedUrl = url;
      // Revoke the outgoing URL only after its replacement has been swapped in —
      // the <img> has long finished loading `previous`, and freeing the URL it is
      // still displaying is what would make the stage flash.
      if (previous !== null) {
        deps.revokeObjectURL(previous);
        outstanding.delete(previous);
      }
      running = false;
      scheduleIfNeeded();
    };
    const drop = () => {
      if (settled || disposed) return;
      settled = true;
      // The frame failed to load; keep the last good frame on screen and free the
      // dead URL so it cannot leak.
      deps.revokeObjectURL(url);
      outstanding.delete(url);
      running = false;
      scheduleIfNeeded();
    };

    image.addEventListener('load', swap, { once: true });
    image.addEventListener('error', drop, { once: true });
    image.src = url;
    const decode = image.decode;
    if (typeof decode === 'function') {
      decode.call(image).then(swap, () => {
        // decode() rejected. Do not swap based on `image.complete`: it is true even
        // for a broken image, so swapping here could show a dead URL and revoke the
        // last good frame. Let the load/error listeners settle this frame — a real
        // decode failure fires 'error' (drop keeps the current frame), and a decode
        // that rejected on a usable image still fires 'load' (swap).
      });
    } else if (image.complete) {
      swap();
    }
  }

  return {
    update(source) {
      if (disposed) return;
      pending = { source };
      scheduleIfNeeded();
    },
    dispose() {
      disposed = true;
      if (frameHandle !== null) {
        deps.cancelFrame(frameHandle);
        frameHandle = null;
      }
      pending = null;
      for (const url of outstanding) deps.revokeObjectURL(url);
      outstanding.clear();
      displayedUrl = null;
    },
  };
}
