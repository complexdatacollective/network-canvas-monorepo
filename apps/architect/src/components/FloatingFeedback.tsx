import { useSyncExternalStore } from 'react';

import FeedbackDialog from '@codaco/fresco-ui/navigation/FeedbackDialog';
import { appFeedbackSurvey } from '@codaco/shared-consts';
import { posthog } from '~/analytics';
import { usePublishedBlockHeight } from '~/hooks/usePublishedBlockHeight';
import { FLOATING_FEEDBACK_WIDTH_VARIABLE } from '~/utils/floatingFeedbackWidth';

const survey = appFeedbackSurvey((event, properties) =>
  posthog.capture(event, properties),
);

const ownWidth = (element: HTMLElement): number =>
  element.getBoundingClientRect().width;

// Below the tablet-landscape breakpoint the action toolbar needs the room the
// label takes, so the button keeps only its icon, named in a tooltip. Where
// there is no `matchMedia` (a test document), it keeps its label.
const WIDE_QUERY = '(min-width: 1024px)';
const wideQuery = () =>
  typeof window.matchMedia === 'function'
    ? window.matchMedia(WIDE_QUERY)
    : undefined;
const subscribeToWidth = (onChange: () => void) => {
  const query = wideQuery();
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
};
const isWide = () => wideQuery()?.matches ?? true;

/** Feedback about Architect, floating in the bottom corner at the start edge. */
export default function FloatingFeedback() {
  const wide = useSyncExternalStore(subscribeToWidth, isWide);
  const corner = usePublishedBlockHeight<HTMLDivElement>(
    FLOATING_FEEDBACK_WIDTH_VARIABLE,
    ownWidth,
  );

  return (
    <div
      ref={corner}
      className="phone-landscape:inset-s-6 pointer-events-none fixed inset-s-4 bottom-5 z-20 print:hidden"
    >
      <FeedbackDialog
        {...survey}
        display={wide ? 'label' : 'icon'}
        variant="default"
        color="info"
        size="md"
        className="elevation-medium pointer-events-auto"
      />
    </div>
  );
}
