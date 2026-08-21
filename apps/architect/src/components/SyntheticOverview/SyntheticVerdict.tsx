import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { SyntheticFeasibilityAnnouncer } from '~/components/Synthetic/SyntheticFeasibilityAnnouncer';
import type { SyntheticFeasibility } from '~/hooks/useSyntheticFeasibility';

import { conflictKey, SyntheticConflictAlert } from './SyntheticConflictAlert';

/**
 * The protocol-wide verdict at the top of the overview (spec, Surfaces §4):
 * either "Generation is possible" or the engine's own list of conflicts.
 *
 * The verdict comes from `useSyntheticFeasibility`, which runs the same
 * pre-seed gate `generateInterviews` refuses with — so this screen and a real
 * generation run cannot disagree. Verdict CHANGES are announced politely by
 * `SyntheticFeasibilityAnnouncer`; nothing here announces on its own.
 */

const CHECKING_TITLE = 'Checking this protocol…';
const CHECKING_DESCRIPTION =
  'The verdict for this protocol appears here in a moment.';

const INVALID_TITLE = 'This protocol cannot be checked yet';
const INVALID_DESCRIPTION =
  'Synthetic data can only be checked once the protocol is valid. Resolve the problems Architect reports and this verdict will update.';

const FEASIBLE_TITLE = 'Generation is possible';
const FEASIBLE_DESCRIPTION =
  'Every stage and attribute in this protocol can produce synthetic data.';

const CONFLICTS_TITLE = 'Synthetic data cannot be generated';
const CONFLICTS_DESCRIPTION =
  'These demands cannot all be met, so no synthetic interview could be produced. Open the stage or attribute named in each one to change it.';

export type SyntheticVerdictProps = {
  feasibility: SyntheticFeasibility;
};

export function SyntheticVerdict({ feasibility }: SyntheticVerdictProps) {
  return (
    <>
      <SyntheticFeasibilityAnnouncer feasibility={feasibility} />
      {feasibility.status === 'checking' && (
        <Alert variant="info" density="compact">
          <AlertTitle>{CHECKING_TITLE}</AlertTitle>
          <AlertDescription>{CHECKING_DESCRIPTION}</AlertDescription>
        </Alert>
      )}
      {feasibility.status === 'invalid' && (
        <Alert variant="warning" density="compact">
          <AlertTitle>{INVALID_TITLE}</AlertTitle>
          <AlertDescription>{INVALID_DESCRIPTION}</AlertDescription>
        </Alert>
      )}
      {feasibility.status === 'feasible' && (
        <Alert variant="success" density="compact">
          <AlertTitle>{FEASIBLE_TITLE}</AlertTitle>
          <AlertDescription>{FEASIBLE_DESCRIPTION}</AlertDescription>
        </Alert>
      )}
      {feasibility.status === 'conflicts' && (
        <div className="flex flex-col gap-4">
          <Alert variant="destructive" density="compact" className="my-0">
            <AlertTitle>{CONFLICTS_TITLE}</AlertTitle>
            <AlertDescription>{CONFLICTS_DESCRIPTION}</AlertDescription>
          </Alert>
          {feasibility.conflicts.map((conflict, index) => (
            <SyntheticConflictAlert
              key={conflictKey(conflict, index)}
              conflict={conflict}
            />
          ))}
        </div>
      )}
    </>
  );
}
