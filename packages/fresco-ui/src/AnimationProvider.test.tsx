import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  AnimatePresence,
  motion,
  MotionConfigContext,
  MotionGlobalConfig,
} from 'motion/react';
import {
  type ComponentProps,
  useContext,
  useLayoutEffect,
  useState,
} from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnimationProvider } from './AnimationProvider';

describe('AnimationProvider', () => {
  beforeEach(() => {
    globalThis.BASE_UI_ANIMATIONS_DISABLED = false;
  });

  afterEach(() => {
    MotionGlobalConfig.skipAnimations = true;
    globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
    window.history.replaceState({}, '', '/');
    Reflect.deleteProperty(window.navigator, 'webdriver');
    vi.restoreAllMocks();
  });

  /**
   * Reports what a descendant's effects see as it mounts: where Motion starts
   * its animations and Base UI runs its transition callbacks.
   */
  function RecordAtMount({
    read,
    record,
  }: {
    read: () => boolean | undefined;
    record: (value: boolean | undefined) => void;
  }) {
    useLayoutEffect(() => {
      record(read());
    }, [read, record]);
    return null;
  }

  const readBaseUiFlag = () => globalThis.BASE_UI_ANIMATIONS_DISABLED;

  /** Base UI's flag as a descendant of `provider` saw it on mounting. */
  function baseUiFlagAtMount(
    props: Omit<ComponentProps<typeof AnimationProvider>, 'children'>,
  ) {
    const seen: Array<boolean | undefined> = [];
    render(
      <AnimationProvider {...props}>
        <RecordAtMount read={readBaseUiFlag} record={(v) => seen.push(v)} />
      </AnimationProvider>,
    );
    return seen;
  }

  function ReducedMotionSetting() {
    return <span>{String(useContext(MotionConfigContext).reducedMotion)}</span>;
  }

  /**
   * motion's own default is `reducedMotion: "never"` — it ignores the
   * preference until something opts in. Every app root delegates that opt-in to
   * this provider, and components such as the Fresco dashboard navigation bar
   * and the website's `Reveal` deliberately carry no reduced-motion check of
   * their own because of it: reading the preference to choose a prop would
   * serialise an answer the server cannot know into the markup it sends.
   *
   * So this default is load-bearing for the preference being honoured at all,
   * and for those components being allowed to stay preference-free.
   */
  it('asks motion to honour the user preference by default', () => {
    render(
      <AnimationProvider>
        <ReducedMotionSetting />
      </AnimationProvider>,
    );

    expect(screen.getByText('user')).toBeTruthy();
  });

  it('lets a host override the reduced-motion setting', () => {
    render(
      <AnimationProvider reducedMotion="always">
        <ReducedMotionSetting />
      </AnimationProvider>,
    );

    expect(screen.getByText('always')).toBeTruthy();
  });

  it('disables Base UI before descendants mount', () => {
    expect(baseUiFlagAtMount({ disableAnimations: true })).toEqual([true]);
  });

  // Layout and `layoutId` animations ignore `MotionConfig`'s `skipAnimations`
  // and read only the global flag, so a disabled provider has to set it.
  it('skips Motion layout animations before descendants mount', () => {
    MotionGlobalConfig.skipAnimations = false;
    const seen: Array<boolean | undefined> = [];

    render(
      <AnimationProvider disableAnimations>
        <RecordAtMount
          read={() => MotionGlobalConfig.skipAnimations}
          record={(v) => seen.push(v)}
        />
      </AnimationProvider>,
    );

    expect(seen).toEqual([true]);
  });

  it('leaves Motion layout animations running by default', () => {
    MotionGlobalConfig.skipAnimations = false;

    render(<AnimationProvider>content</AnimationProvider>);

    expect(MotionGlobalConfig.skipAnimations).toBe(false);
  });

  it('does not disable Base UI by default', () => {
    globalThis.BASE_UI_ANIMATIONS_DISABLED = false;

    render(<AnimationProvider>content</AnimationProvider>);

    expect(globalThis.BASE_UI_ANIMATIONS_DISABLED).toBe(false);
  });

  it('detects WebDriver automation when requested', () => {
    Object.defineProperty(window.navigator, 'webdriver', {
      configurable: true,
      value: true,
    });

    expect(baseUiFlagAtMount({ disableAnimationsForAutomation: true })).toEqual(
      [true],
    );
  });

  it.each(['?chromatic=true', '?disableAnimations=1'])(
    'detects the %s visual-test query switch when requested',
    (search) => {
      window.history.replaceState({}, '', `/${search}`);

      expect(
        baseUiFlagAtMount({ disableAnimationsForAutomation: true }),
      ).toEqual([true]);
    },
  );

  it('detects the Chromatic user agent when requested', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 Chromatic/18.1.0',
    );

    expect(baseUiFlagAtMount({ disableAnimationsForAutomation: true })).toEqual(
      [true],
    );
  });

  it('does not auto-detect automation unless requested', () => {
    globalThis.BASE_UI_ANIMATIONS_DISABLED = false;

    Object.defineProperty(window.navigator, 'webdriver', {
      configurable: true,
      value: true,
    });

    expect(baseUiFlagAtMount({})).toEqual([false]);
  });

  it('removes AnimatePresence exits promptly under the shared test setup', async () => {
    function PresenceHarness() {
      const [visible, setVisible] = useState(true);

      return (
        <>
          <button type="button" onClick={() => setVisible(false)}>
            Remove
          </button>
          <AnimatePresence>
            {visible ? (
              <motion.div
                data-testid="exiting-element"
                exit={{ opacity: 0 }}
                transition={{ duration: 60 }}
              />
            ) : null}
          </AnimatePresence>
        </>
      );
    }

    expect(MotionGlobalConfig.skipAnimations).toBe(true);

    render(<PresenceHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(
      () => {
        expect(screen.queryByTestId('exiting-element')).not.toBeInTheDocument();
      },
      { timeout: 250 },
    );
  });
});
