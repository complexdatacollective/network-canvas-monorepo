import { DirectionProvider } from '@base-ui/react/direction-provider';
import type { Decorator, Preview } from '@storybook/react-vite';
import {
  createContext,
  Fragment,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';

import {
  type AppLocale,
  type CatalogMessages,
  pseudoAppLocales,
} from '@codaco/app-i18n/locales';
import { AppDirectionOverride, AppI18nProvider } from '@codaco/app-i18n/react';
import {
  compareMirrored,
  type LayoutSnapshot,
  layoutsMatch,
  snapshotLayout,
} from '@codaco/e2e-helpers/direction-audit';

/**
 * Storybook's language and writing-direction controls, shared by every
 * Storybook in the repo (2026-09-04 localization design §9).
 *
 * They are here rather than in `@codaco/fresco-ui` because they are
 * development configuration, not part of the component library's published
 * API — the same reason `@codaco/vitest-config` and `@codaco/tsconfig` live
 * alongside this. A Storybook adopts them by calling `storybookI18n()` with
 * its own registry and catalogs, so `fresco-ui`, `interview` and each app get
 * one implementation and their own locales.
 *
 * Two controls, because they answer two different questions:
 *
 * - **Language** proves a component reads its copy from a catalog. Switching
 *   it should visibly change every string a component owns; anything that
 *   stays in English is hardcoded. The accented pseudo-locale makes that
 *   verdict available before any translation exists.
 * - **Direction** proves a component lays out with logical properties. It is
 *   a separate axis on purpose: it mirrors a story in any language, real
 *   words included, where the right-to-left pseudo-locale brings its own
 *   right-to-left text with it. Left on "Automatic" it follows the selected
 *   locale's declared direction, which is what a real host does.
 */

const LOCALE_KEY = 'appLocale';
const DIRECTION_KEY = 'appDirection';
const LOCALE_STORAGE_KEY = 'storybook-app-locale-preference';
const DIRECTION_STORAGE_KEY = 'storybook-app-direction-preference';

/** `auto` defers to the active locale's declared direction. */
const directionModes = {
  auto: { name: 'Automatic' },
  ltr: { name: 'LTR' },
  rtl: { name: 'RTL' },
} as const;

export type DirectionMode = keyof typeof directionModes;

const DirectionModeContext = createContext<DirectionMode>('auto');

/**
 * What the Direction control is set to, for a story that takes its direction
 * from something of its own and has to tell "Automatic" from a choice. An
 * interview is one: it reads from its protocol's language whatever surrounds
 * it, so its stories pass an explicit LTR or RTL on and leave Automatic to
 * the language. The direction a story is drawn in, whichever way it was
 * arrived at, is `useAppDirection()`.
 */
export function useStorybookDirectionMode(): DirectionMode {
  return useContext(DirectionModeContext);
}

export type StorybookI18nOptions = Readonly<{
  /**
   * The Storybook's locale registry. Usually `ecosystemLocales` for a shared
   * package, or the app's own registry for an app.
   */
  locales: readonly AppLocale[];
  /**
   * Messages per locale, already merged in host order
   * (common → shared packages → app). A locale with no entry renders from the
   * descriptors' own `defaultMessage`s, which is correct for the source
   * language and a visible gap for any other.
   */
  catalogs: Readonly<Record<string, CatalogMessages>>;
  /** Which locale a Storybook with no stored preference opens in. */
  defaultLocale?: string;
  /**
   * Whether to offer the pseudo-locales. On by default: they are the only way
   * to see untranslated strings, clipped layouts and right-to-left text
   * before translations exist.
   */
  includePseudoLocale?: boolean;
}>;

export type StorybookI18n = Readonly<{
  /**
   * Storybook's own type rather than `Record<string, unknown>`, so a preview
   * can pass this straight to `definePreview({ globalTypes })`. A preview that
   * typechecks its own config — `@codaco/protocol-builder`'s does — rejects the
   * loose record, and widening it there would only hide a toolbar entry this
   * builds wrongly.
   */
  globalTypes: NonNullable<Preview['globalTypes']>;
  initialGlobals: Readonly<{ appLocale: string; appDirection: DirectionMode }>;
  withAppI18n: Decorator;
  /**
   * A preview addon: a story tagged `mirror` is drawn in each direction once
   * its play function has run, and fails unless every box sits as far from
   * the right edge as it sat from the left, and every arrow that points along
   * the line turns round. See `mirrorCheck` below.
   *
   * It goes first in the preview's `addons`. Storybook runs `afterEach`
   * hooks in the reverse of the order they are composed (addons in order,
   * then the preview's own), so the first addon's runs last: after the
   * accessibility audit has read the page the play function left, which the
   * mirror check's fresh renders would otherwise have replaced.
   */
  mirrorAddon: Preview;
}>;

/** The tag a story or a whole stories file opts into the mirror check with. */
export const MIRROR_TAG = 'mirror';

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Resolves once no element has been added or removed for a moment: a story
 * drawn afresh may load its data first ("Loading…" and then the table), and
 * the two renders have to be compared in the same state. Attribute and style
 * changes do not count, since an animation writes those every frame. The time
 * limit bounds a story that never stops; it is not a pause.
 */
function domAtRest(quietMs = 50, limitMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    let quiet: ReturnType<typeof setTimeout>;
    const finish = () => {
      clearTimeout(quiet);
      clearTimeout(limit);
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(() => {
      clearTimeout(quiet);
      quiet = setTimeout(finish, quietMs);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    quiet = setTimeout(finish, quietMs);
    const limit = setTimeout(finish, limitMs);
  });
}

/**
 * The layout once it has stopped moving: snapshots a frame apart until two in
 * a row agree. Components that measure themselves (a bin sized to its
 * neighbours, a popup placed against its trigger) can take several frames
 * after the DOM settles, and longer on a loaded machine. Gives up after
 * `limit` tries and returns the last snapshot, which the comparison then
 * reports if it is still moving.
 */
async function stableLayout(limit = 30): Promise<LayoutSnapshot> {
  let previous = snapshotLayout();
  for (let attempt = 0; attempt < limit; attempt += 1) {
    await nextFrame();
    const current = snapshotLayout();
    if (layoutsMatch(previous, current)) return current;
    previous = current;
  }
  return previous;
}

/**
 * Waits for a change of direction to reach the page: React's commit, the
 * popups Base UI positions (which recompute on a resize, not on a change of
 * direction), and any finite animation or transition the change started.
 * The time limit bounds one that never ends; it is not a pause.
 */
async function settleLayout() {
  await domAtRest();
  await nextFrame();
  window.dispatchEvent(new Event('resize'));
  await nextFrame();
  const finite = document
    .getAnimations()
    .filter(
      (animation) => animation.effect?.getComputedTiming().endTime !== Infinity,
    );
  await Promise.race([
    Promise.allSettled(finite.map((animation) => animation.finished)),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  await nextFrame();
}

/**
 * Whether the controls' remembered selections apply.
 *
 * They are a convenience for somebody clicking around Storybook, and actively
 * harmful to a test run: a story that pins a global — `DropdownMenu` and
 * `Table` both set `appDirection: 'rtl'` — writes that choice to storage, and
 * every later story in the run then opens in it. Stories that never mention
 * direction start rendering mirrored, which is invisible until an assertion
 * about arrow keys or a click position happens to disagree.
 *
 * Same detection the animation provider uses to stand down for automated
 * hosts, and the same reasoning: a run has to start from the declared default
 * every time, or it is not testing what it says it is.
 */
function isAutomatedHost(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.navigator.webdriver ||
    /Chromatic/.test(window.navigator.userAgent) ||
    /(?:[?&])chromatic=true(?:[&#]|$)/.test(window.location.href)
  );
}

function readStored<T extends string>(
  key: string,
  valid: (value: string) => value is T,
): T | null {
  if (isAutomatedHost()) return null;
  try {
    const stored = localStorage.getItem(key);
    return stored !== null && valid(stored) ? stored : null;
  } catch {
    // A Storybook running where storage is unavailable (a sandboxed iframe,
    // a browser with site data blocked) still has to render — it just opens
    // on the default every time.
    return null;
  }
}

function writeStored(key: string, value: string) {
  if (isAutomatedHost()) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Persisting a toolbar choice is a convenience; failing to is not worth
    // a console the story author has to read past.
  }
}

export function storybookI18n(options: StorybookI18nOptions): StorybookI18n {
  const {
    locales,
    catalogs,
    defaultLocale = locales[0]?.locale ?? 'en',
    includePseudoLocale = true,
  } = options;

  if (locales.length === 0) {
    throw new Error('storybookI18n: the locale registry is empty');
  }

  // The pseudo-locales are appended rather than expected in the registry: a
  // production registry must never contain them, so every caller would
  // otherwise have to build a Storybook-only copy of its own list.
  const offered: readonly AppLocale[] = includePseudoLocale
    ? [
        ...locales,
        ...pseudoAppLocales.filter(
          (pseudo) => !locales.some((entry) => entry.locale === pseudo.locale),
        ),
      ]
    : locales;

  const isOffered = (value: string): value is string =>
    offered.some((entry) => entry.locale === value);
  const isDirectionMode = (value: string): value is DirectionMode =>
    value in directionModes;

  const initialLocale =
    readStored(LOCALE_STORAGE_KEY, isOffered) ?? defaultLocale;
  const initialDirection =
    readStored(DIRECTION_STORAGE_KEY, isDirectionMode) ?? 'auto';

  // Set by the mounted frame: draws the story afresh (remounted) in the given
  // direction, or in the one its globals choose when given null. Only the
  // mirror check calls it.
  let forceDirection:
    | ((direction: AppLocale['direction'] | null) => void)
    | null = null;

  // The decorator's state and effects live in a component of their own:
  // Storybook calls a decorator as a plain function, which is no place for
  // hooks.
  function I18nFrame({
    locale,
    mode,
    direction,
    children,
  }: {
    locale: string;
    mode: DirectionMode;
    direction: AppLocale['direction'];
    children: ReactNode;
  }) {
    const [{ forced, generation }, setForced] = useState<{
      forced: AppLocale['direction'] | null;
      generation: number;
    }>({ forced: null, generation: 0 });
    useLayoutEffect(() => {
      const force = (next: AppLocale['direction'] | null) =>
        setForced((previous) => ({
          forced: next,
          generation: previous.generation + 1,
        }));
      forceDirection = force;
      return () => {
        if (forceDirection === force) forceDirection = null;
      };
    }, []);
    const shownMode: DirectionMode = forced ?? mode;
    const shownDirection = forced ?? direction;

    useEffect(() => {
      writeStored(LOCALE_STORAGE_KEY, locale);
    }, [locale]);
    useEffect(() => {
      writeStored(DIRECTION_STORAGE_KEY, mode);
    }, [mode]);

    // The preview is its own iframe, so writing these mirrors the story canvas
    // and nothing else — Storybook's sidebar, toolbar and panels live in the
    // manager document and stay in the reader's own direction.
    //
    // It has to be the document rather than the wrapper alone. Dialogs,
    // popovers, menus and toasts portal to `document.body`, which is outside
    // any wrapper a decorator can render, so a scoped `dir` leaves exactly the
    // components whose RTL behaviour is worth checking rendering
    // left-to-right.
    //
    // Set on mount and never restored, deliberately. Restoring a remembered
    // value is what made this leak between stories: a story that forces RTL
    // (`globals: { appDirection: 'rtl' }`) would hand the document back at a
    // moment the next story had already claimed it, and an unrelated story
    // then ran mirrored — arrow keys moving the wrong way and a click at
    // `rect.right` landing at the visual start. Every story sets what it
    // wants, so there is nothing to hand back. Layout effect rather than
    // effect so it lands before the story paints, and before a play function
    // measures anything.
    useLayoutEffect(() => {
      const root = document.documentElement;
      root.lang = locale;
      root.dir = shownDirection;
    }, [locale, shownDirection]);

    return (
      // An explicit LTR or RTL is an override for every language provider in
      // the story, not only the one below. A story that mounts a host's own
      // provider stack (`ArchitectI18nProvider`, say) puts that host's
      // registry and its `LocaleDirectionProvider` nearer the components than
      // anything here, and without the override they would write the
      // language's own direction to the document and hand it to Base UI: the
      // CSS and the controls would disagree. On Automatic there is nothing to
      // override, and each language keeps its own direction.
      <DirectionModeContext.Provider value={shownMode}>
        <AppDirectionOverride
          direction={shownMode === 'auto' ? null : shownMode}
        >
          <AppI18nProvider
            locale={locale}
            locales={offered}
            messages={catalogs[locale]}
            // The effect above owns `<html lang>`/`<html dir>`: it is what the
            // comment there explains, and two writers would be one too many.
            manageDocument={false}
          >
            {/*
            Base UI reads direction from context, not from the DOM, and uses it
            for popover placement and for which arrow key moves where. Without
            this provider a story's CSS mirrors while its dropdowns, tabs and
            menus keep behaving as LTR — so the switcher would show a layout
            that looks right and hide the interaction bugs it exists to find.
          */}
            <DirectionProvider direction={shownDirection}>
              {/*
              `contents` so the wrapper contributes no box of its own: a story
              laid out by its parent (a grid cell, a flex child) must not gain
              an anonymous block between it and that parent.
            */}
              <div dir={shownDirection} className="contents">
                <Fragment key={generation}>{children}</Fragment>
              </div>
            </DirectionProvider>
          </AppI18nProvider>
        </AppDirectionOverride>
      </DirectionModeContext.Provider>
    );
  }

  const withAppI18n: Decorator = (Story, context) => {
    // Storybook types `globals` values as `any`; narrow before use.
    const storedLocale: unknown = context.globals[LOCALE_KEY];
    const storedMode: unknown = context.globals[DIRECTION_KEY];
    const locale =
      typeof storedLocale === 'string' ? storedLocale : defaultLocale;
    const mode =
      typeof storedMode === 'string' && isDirectionMode(storedMode)
        ? storedMode
        : 'auto';

    const declared =
      offered.find((entry) => entry.locale === locale)?.direction ?? 'ltr';
    const direction = mode === 'auto' ? declared : mode;

    return (
      <I18nFrame locale={locale} mode={mode} direction={direction}>
        <Story />
      </I18nFrame>
    );
  };

  /**
   * The layout mirrors: the right-to-left check every story tagged `mirror`
   * runs after its play function. The story is drawn afresh in each
   * direction and the two renders are compared element by element; the text
   * is the same in both, so every distance can be compared exactly.
   *
   * Afresh rather than flipped in place, because components that measure
   * themselves (Base UI's tab indicator and popup positions) measure again
   * when their size changes, not when the direction does: a story flipped in
   * place shows the old measurement, which a real change of language (whose
   * text changes every size) never would. The cost is that what the play
   * function opened is closed again, so the check sees the story as first
   * drawn; a story that should be checked open renders open (`defaultOpen`).
   * The accessibility audit has already run on what the play function left.
   *
   * It runs only in an automated browser (the Storybook test suites), so a
   * person clicking through stories never sees the story flip.
   */
  const mirrorCheck = async ({
    tags,
  }: Readonly<{ tags: readonly string[] }>) => {
    if (!tags.includes(MIRROR_TAG) || !window.navigator.webdriver) return;
    const setDirection = forceDirection;
    if (!setDirection) {
      throw new Error(
        `A story tagged “${MIRROR_TAG}” rendered without the language decorator, so it cannot be mirrored`,
      );
    }
    const drawn =
      document.documentElement.dir === 'rtl' ? 'rtl' : ('ltr' as const);
    setDirection(drawn);
    await settleLayout();
    const first = await stableLayout();
    setDirection(drawn === 'rtl' ? 'ltr' : 'rtl');
    await settleLayout();
    const second = await stableLayout();
    // Back to the story's own direction, settled, so the story is left as
    // it was drawn rather than unmounting mid-render.
    setDirection(null);
    await settleLayout();

    const issues = compareMirrored(first, second);
    if (issues.length > 0) {
      throw new Error(
        `The story does not mirror (${issues.length} problem${issues.length === 1 ? '' : 's'}):\n${issues.slice(0, 25).join('\n')}`,
      );
    }
  };

  return {
    withAppI18n,
    mirrorAddon: { afterEach: mirrorCheck },
    initialGlobals: {
      [LOCALE_KEY]: initialLocale,
      [DIRECTION_KEY]: initialDirection,
    },
    // `dynamicTitle` and no `showName`: the latter was a Storybook 6 option
    // and no longer exists anywhere in Storybook 10, so it was only ever
    // ignored — typing this record as Storybook's own `globalTypes` is what
    // said so.
    globalTypes: {
      [LOCALE_KEY]: {
        name: 'Language',
        description: 'Locale the story renders in',
        toolbar: {
          icon: 'globe' as const,
          items: offered.map((entry) => ({
            value: entry.locale,
            title: entry.label,
          })),
          dynamicTitle: true,
        },
      },
      [DIRECTION_KEY]: {
        name: 'Direction',
        description: "Writing direction, or the locale's own",
        toolbar: {
          icon: 'transfer' as const,
          items: Object.entries(directionModes).map(([value, { name }]) => ({
            value,
            title: name,
          })),
          dynamicTitle: true,
        },
      },
    },
  };
}
