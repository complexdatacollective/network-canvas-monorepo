/**
 * The Mapbox SDK, replaced for every story in this Storybook.
 *
 * NOTHING here may build a real Mapbox map. A real one fetches a style, tiles,
 * sprites and fonts from Mapbox's servers — billed requests against a live
 * account, from a Storybook that is built on every push and replayed by every
 * visual comparison — and the account is the project's own, not a story's.
 *
 * The package's tests replace the same module for the same reason (see
 * `src/testing/mapboxMock.ts`, and `src/testing/__tests__/
 * mapboxIsAlwaysMocked.test.ts`, which holds both replacements in place). This
 * is that guard's Storybook half: `.storybook/main.ts` aliases `mapbox-gl` and
 * `mapbox-gl/esm` here, so a story that opens a starting-view preview gets
 * this instead — no story, and no story file, has to remember to ask for it.
 *
 * A separate file from the test mock rather than the same one, because that
 * one imports `vitest` to record what it built, and nothing in a browser
 * bundle can.
 *
 * It behaves the way a preview dialog needs a map to behave: it reports the
 * view it was opened at, it announces that it loaded, and it moves when told
 * to. It draws a labelled placeholder rather than pretending to be a map,
 * because a story showing a convincing but fictional map of somewhere would be
 * worse than one that says plainly there is no map here.
 */

/** `load`, `error` and `move` are the three the preview dialog registers. */
type MapEvent = string;

type MapOptions = {
  container?: HTMLElement;
  style?: string;
  center?: [number, number];
  zoom?: number;
};

export class Map {
  private readonly handlers = new Map<MapEvent, () => void>();
  private center: { lng: number; lat: number };
  private zoom: number;
  private readonly placeholder: HTMLElement | undefined;

  constructor(options: MapOptions) {
    this.center = {
      lng: options.center?.[0] ?? 0,
      lat: options.center?.[1] ?? 0,
    };
    this.zoom = options.zoom ?? 0;

    const container = options.container;
    if (container === undefined) {
      this.placeholder = undefined;
    } else {
      const placeholder = container.ownerDocument.createElement('p');
      placeholder.textContent =
        'No map is drawn in Storybook: the Mapbox SDK is replaced so no story reaches a live account.';
      placeholder.style.padding = '2rem';
      placeholder.style.textAlign = 'center';
      container.append(placeholder);
      this.placeholder = placeholder;
    }

    // Asynchronously, the way a real map reports a style it has fetched: a
    // handler registered on the line after `new Map()` still hears it.
    queueMicrotask(() => this.handlers.get('load')?.());
  }

  addControl(): this {
    return this;
  }

  getCenter(): { lng: number; lat: number } {
    return this.center;
  }

  getZoom(): number {
    return this.zoom;
  }

  on(event: MapEvent, handler: () => void): this {
    this.handlers.set(event, handler);
    return this;
  }

  remove(): void {
    this.placeholder?.remove();
    this.handlers.clear();
  }
}

/** The zoom control the preview adds. It has nothing to draw here. */
export class NavigationControl {
  readonly options: Readonly<Record<string, unknown>>;

  constructor(options: Readonly<Record<string, unknown>> = {}) {
    this.options = options;
  }
}
