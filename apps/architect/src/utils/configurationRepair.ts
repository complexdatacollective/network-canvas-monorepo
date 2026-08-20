import {
  type ConfigurationProblem,
  type CurrentProtocol,
  repairConfigurationConflicts,
  validateProtocol,
} from '@codaco/protocol-validation';

export type ConfigurationRepairAssessment =
  /** Nothing this module recognises; the caller reports the underlying error. */
  | { status: 'clean' }
  /** Problems found, but fixing them would not produce a protocol that opens. */
  | { status: 'unrepairable'; problems: ConfigurationProblem[] }
  /** Problems found, and the repaired protocol is proven to validate. */
  | {
      status: 'repairable';
      problems: ConfigurationProblem[];
      protocol: CurrentProtocol;
    };

/**
 * Whether a protocol that failed validation failed for reasons Architect can
 * offer to fix — a form collecting one variable twice, a prompt bound to a
 * variable an interface owns, a disease bound to one, two diseases on one
 * variable, two diseases sharing a name.
 *
 * Which of those it can offer is not decided here: it is whatever
 * `repairConfigurationConflicts` schedules, and the list above is a reading of
 * that function rather than a second statement of the rules. (It said until
 * recently that a disease bound to an interface-owned variable could never be
 * detected, because `diseases[].variable` carried no `usage` tag. It carries
 * `usage: 'unvalidatedAttribute'` now, so `findExclusiveVariableConflicts`
 * reports it and the repair drops the row — leaving `unrepairable` only where
 * it was the stage's last disease, which a Narrative Pedigree may not be
 * without. The comment had outlived its limitation and was telling readers a
 * working repair did not exist.)
 *
 * Called only AFTER validation has failed, and never reports a repair it has
 * not proven: the repaired protocol is re-validated here, so accepting the fix
 * cannot lead to a second dead end. A repair that leaves the protocol invalid
 * for some other reason reports `clean`, and the caller falls back to showing
 * the underlying validation error rather than offering a fix that would not
 * help.
 */
export const assessConfigurationRepair = async (
  protocol: unknown,
): Promise<ConfigurationRepairAssessment> => {
  const result = repairConfigurationConflicts(protocol);
  if (result.problems.length === 0) return { status: 'clean' };
  if (!result.repairable) {
    return { status: 'unrepairable', problems: result.problems };
  }

  const repaired = result.protocol as CurrentProtocol;
  const validation = await validateProtocol(repaired);
  if (!validation.success) return { status: 'clean' };

  return {
    status: 'repairable',
    problems: result.problems,
    protocol: repaired,
  };
};
