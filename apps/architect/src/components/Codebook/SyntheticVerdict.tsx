import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import {
  conflictKey,
  SyntheticConflictAlert,
} from '~/components/Synthetic/SyntheticConflictAlert';
import { SyntheticFeasibilityAnnouncer } from '~/components/Synthetic/SyntheticFeasibilityAnnouncer';
import type { SyntheticFeasibility } from '~/hooks/useSyntheticFeasibility';

/**
 * The protocol-wide synthetic verdict, at the top of the Codebook: either
 * "Generation is possible" or the engine's own list of conflicts.
 *
 * The Codebook is where a protocol's attributes and their generated values are
 * read, so it is where the whole-protocol answer belongs (spec revision 2,
 * item 6 — the separate overview screen is gone). The verdict comes from
 * `useSyntheticFeasibility`, which runs the same pre-seed gate
 * `generateInterviews` refuses with, so this screen and a real generation run
 * cannot disagree. Verdict CHANGES are announced politely by
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
  'These demands cannot all be met, so no synthetic interview could be produced. Change the attribute named in each one below, or open the stage it names.';

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
              // The description above tells the researcher to open the stage a
              // refusal names; this is what lets it mean that.
              linkToOwner
            />
          ))}
        </div>
      )}
    </>
  );
}
