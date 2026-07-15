import { ScrollLinkedPageBackground } from './ScrollLinkedPageBackground';

const TARGET_SELECTOR = '[data-homepage-weave-target]';
const INTERACTIVE_TARGET_SELECTOR = '[data-homepage-weave-interactive-target]';
const HOLD_TARGET_SELECTOR = '[data-homepage-weave-hold-until-exit]';
const MOVING_TARGET_SELECTOR = '[data-homepage-weave-moving-target]';

export function HomepagePageBackground() {
  return (
    <ScrollLinkedPageBackground
      targetSelector={TARGET_SELECTOR}
      interactiveTargetSelector={INTERACTIVE_TARGET_SELECTOR}
      interactiveIntensityBoost={0.22}
      holdTargetSelector={HOLD_TARGET_SELECTOR}
      movingTargetSelector={MOVING_TARGET_SELECTOR}
    />
  );
}
