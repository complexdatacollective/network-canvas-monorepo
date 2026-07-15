import { ScrollLinkedPageBackground } from './ScrollLinkedPageBackground';

const TARGET_SELECTOR = '[data-homepage-weave-target]';
const INTERACTIVE_TARGET_SELECTOR = '[data-homepage-weave-interactive-target]';

export function HomepagePageBackground() {
  return (
    <ScrollLinkedPageBackground
      targetSelector={TARGET_SELECTOR}
      interactiveTargetSelector={INTERACTIVE_TARGET_SELECTOR}
    />
  );
}
