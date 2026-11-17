'use client';

import { useEffect, useState } from 'react';

// Interview chrome is English only, so the sentence is marked lang="en"
// rather than translated.
const READY_TO_CONTINUE = 'You can continue to the next step.';

/**
 * Puts the meaning of the Next button's green pulse into a polite live region:
 * the screen is ready to move on. The sentence is added once for each screen
 * (a stage and prompt, identified by `screenId`) while that screen is ready,
 * whether it became ready there or was ready on arrival. Losing readiness
 * removes it and adds nothing; regaining it adds a new node.
 *
 * Each new `screenId`, including the first, empties the region and adds the
 * sentence a task later. Without that, a change between two ready prompts
 * leaves the region untouched, and on arrival at a prompt that is not ready
 * the previous prompt's readiness briefly mounts the sentence.
 *
 * The same sentence sits in a separate hidden element for the Next button's
 * `aria-describedby`, which follows readiness directly.
 */
export default function ReadyToContinueAnnouncer({
  ready,
  screenId,
  descriptionId,
}: {
  ready: boolean;
  screenId: string;
  descriptionId: string;
}) {
  const [settledScreenId, setSettledScreenId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setSettledScreenId(screenId), 0);
    return () => clearTimeout(timeout);
  }, [screenId]);

  return (
    <>
      <output
        aria-live="polite"
        aria-atomic
        className="sr-only"
        lang="en"
        data-testid="ready-to-continue-announcer"
      >
        {ready && settledScreenId === screenId && (
          <span>{READY_TO_CONTINUE}</span>
        )}
      </output>
      <span id={descriptionId} hidden lang="en">
        {READY_TO_CONTINUE}
      </span>
    </>
  );
}
