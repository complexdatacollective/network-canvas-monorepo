import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AnimatePresence, motion, MotionGlobalConfig } from 'motion/react';
import { useState } from 'react';
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

  function AnimationState() {
    return <span>{String(globalThis.BASE_UI_ANIMATIONS_DISABLED)}</span>;
  }

  it('disables Base UI before rendering descendants', () => {
    render(
      <AnimationProvider disableAnimations>
        <AnimationState />
      </AnimationProvider>,
    );

    expect(screen.getByText('true')).toBeTruthy();
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

    render(
      <AnimationProvider disableAnimationsForAutomation>
        <AnimationState />
      </AnimationProvider>,
    );

    expect(screen.getByText('true')).toBeTruthy();
  });

  it.each(['?chromatic=true', '?disableAnimations=1'])(
    'detects the %s visual-test query switch when requested',
    (search) => {
      window.history.replaceState({}, '', `/${search}`);

      render(
        <AnimationProvider disableAnimationsForAutomation>
          <AnimationState />
        </AnimationProvider>,
      );

      expect(screen.getByText('true')).toBeTruthy();
    },
  );

  it('detects the Chromatic user agent when requested', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 Chromatic/18.1.0',
    );

    render(
      <AnimationProvider disableAnimationsForAutomation>
        <AnimationState />
      </AnimationProvider>,
    );

    expect(screen.getByText('true')).toBeTruthy();
  });

  it('does not auto-detect automation unless requested', () => {
    globalThis.BASE_UI_ANIMATIONS_DISABLED = false;

    Object.defineProperty(window.navigator, 'webdriver', {
      configurable: true,
      value: true,
    });

    render(
      <AnimationProvider>
        <AnimationState />
      </AnimationProvider>,
    );

    expect(screen.getByText('false')).toBeTruthy();
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
