'use client';

const READY_TO_CONTINUE = 'You can continue to the next step.';

/**
 * Tells screen reader users what the Next button's green pulse tells sighted
 * participants: the screen is ready to move on. The live region is always
 * rendered, so it exists before its content changes; the sentence is mounted
 * each time readiness is gained and unmounted when it is lost, so every gain
 * is a new node and is announced again. Losing readiness is silent.
 *
 * The same sentence sits in a separate hidden element for the Next button's
 * `aria-describedby`, so it is not read twice from the live region.
 */
export default function ReadyToContinueAnnouncer({
  ready,
  descriptionId,
}: {
  ready: boolean;
  descriptionId: string;
}) {
  return (
    <>
      <output
        aria-live="polite"
        aria-atomic
        className="sr-only"
        lang="en"
        data-testid="ready-to-continue-announcer"
      >
        {ready && <span>{READY_TO_CONTINUE}</span>}
      </output>
      <span id={descriptionId} hidden lang="en">
        {READY_TO_CONTINUE}
      </span>
    </>
  );
}
