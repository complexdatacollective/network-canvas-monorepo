import { DROPOUT_HAZARD_RATE } from '@codaco/protocol-validation';

import type { SessionStreams } from '../session-engine/streams';

/**
 * Decide whether the participant abandons the interview at this point.
 *
 * The decision is made against every stage completed so far rather than the
 * current stage alone: dropout is driven by accumulated fatigue, so a
 * demanding stage late in a long protocol is far more likely to end the
 * session than the same stage encountered first. Each stage contributes its
 * own `synthetic.responseBurden`, so zero-burden stages (Information,
 * Narrative) lengthen the interview without making it more tiring.
 *
 * The burden is read off the stage rather than looked up by type, because the
 * protocol is where it is declared: a researcher who knows their sociogram
 * takes twice as long as most says so on the stage, and the schema's per-type
 * default fills in for everyone who does not.
 *
 * The die comes from the session's own dropout substream, so a given seed
 * always produces the same dropout points — and adding a draw anywhere else
 * in the walk cannot move them.
 */
export const determineDropout = (
  completedStages: readonly { synthetic: { responseBurden: number } }[],
  streams: SessionStreams,
): boolean => {
  const cumulativeBurden = completedStages.reduce(
    (total, stage) => total + stage.synthetic.responseBurden,
    0,
  );

  const dropoutProbability =
    1 - Math.exp(-DROPOUT_HAZARD_RATE * cumulativeBurden);

  return streams.draw('dropout') < dropoutProbability;
};
