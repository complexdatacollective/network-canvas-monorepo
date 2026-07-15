import { ScrollLinkedPageBackground } from './ScrollLinkedPageBackground';

const TARGET_SELECTOR = '[data-get-started-weave-target]';
const INTERACTIVE_TARGET_SELECTOR =
  '[data-get-started-weave-interactive-target]';

export function GetStartedPageBackground() {
  return (
    <ScrollLinkedPageBackground
      targetSelector={TARGET_SELECTOR}
      interactiveTargetSelector={INTERACTIVE_TARGET_SELECTOR}
      postTargetBehavior="figure-eight"
    />
  );
}
