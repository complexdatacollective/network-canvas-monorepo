import { useMemo } from 'react';
import SuperJSON from 'superjson';

import type { SyntheticInterview } from '@codaco/protocol-utilities';

import StoryInterviewShell from './StoryInterviewShell';

export type CaptureRatio = '1:1' | '4:3' | '16:9';

/**
 * Contract for `parameters.capture` on screenshot-capture stories. The
 * @codaco/interface-images capture runner enumerates stories tagged
 * `capture` and reads this block (via `__STORYBOOK_PREVIEW__.extract()`)
 * to drive screenshot generation.
 */
export type CaptureParameters = {
  /** Manifest key; must match the interface type. */
  interface: string;
  /** Extra settle time after network idle, ms. Default 500. */
  delay?: number;
  /** Subset of ratios to capture. Default: all three. */
  ratios?: CaptureRatio[];
  /** Env vars the story needs at storybook build time (documentation only). */
  env?: string[];
  /** Temporarily exclude from capture without deleting the story. */
  skip?: boolean;
  /**
   * Click the navigation's Next button this many times before capturing —
   * for interfaces with an internal introduction step (e.g. DyadCensus).
   * The story must also pass `showNavigation` to CaptureStory; the runner
   * removes the navigation from the DOM before taking the screenshot.
   */
  advance?: number;
};

/**
 * Render wrapper for screenshot-capture stories: a full-viewport Shell with
 * the navigation rail hidden, landed directly on `currentStep`.
 *
 * `showNavigation` keeps the navigation mounted for stories whose capture
 * parameters use `advance` — the runner needs the Next button, and removes
 * the navigation from the DOM before screenshotting.
 */
const CaptureStory = ({
  build,
  currentStep = 1,
  showNavigation = false,
}: {
  build: () => SyntheticInterview;
  currentStep?: number;
  showNavigation?: boolean;
}) => {
  const rawPayload = useMemo(
    () => SuperJSON.stringify(build().getInterviewPayload({ currentStep })),
    [build, currentStep],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={rawPayload}
        hideNavigation={!showNavigation}
        isDevelopment={false}
      />
    </div>
  );
};

export default CaptureStory;
