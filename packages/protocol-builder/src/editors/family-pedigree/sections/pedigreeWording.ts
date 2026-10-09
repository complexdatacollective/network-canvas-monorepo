import type { LocalizedString } from '@codaco/protocol-validation';

import { useSuppliedStageWording } from '../../../form/suppliedStageWording.ts';

export { startingWording } from '../../../form/suppliedStageWording.ts';

/**
 * Network Canvas's wording for each of the Family Pedigree's text settings,
 * in the protocol's languages, by dotted path; undefined until the
 * protocol's languages are known.
 */
export function useSuppliedPedigreeText():
  | ReadonlyMap<string, LocalizedString>
  | undefined {
  return useSuppliedStageWording('FamilyPedigree');
}
