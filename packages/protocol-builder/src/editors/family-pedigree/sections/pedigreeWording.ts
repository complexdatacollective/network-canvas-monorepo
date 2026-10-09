import { get } from 'es-toolkit/compat';
import { useMemo } from 'react';

import {
  type LocalizedString,
  suppliedStageText,
} from '@codaco/protocol-validation';

import { isLocalizedString } from '../../../localization/localizedText.ts';
import { useProtocolLocalization } from '../../../localization/ProtocolLocalization.tsx';

/**
 * Network Canvas's wording for each of the Family Pedigree's text settings,
 * in the protocol's languages, by dotted path; undefined until the
 * protocol's languages are known.
 */
export function useSuppliedPedigreeText():
  | ReadonlyMap<string, LocalizedString>
  | undefined {
  const localization = useProtocolLocalization();
  return useMemo(
    () =>
      localization === undefined
        ? undefined
        : new Map(
            suppliedStageText('FamilyPedigree', localization).map(
              ({ path, value }) => [path.join('.'), value],
            ),
          ),
    [localization],
  );
}

/**
 * A wording field's starting value: what the stage already holds, else the
 * supplied wording, so switching on the object that holds it (the
 * completeness requirement) seeds it. `initialValue` replaces what the form
 * would otherwise seed from the document, so the supplied wording given alone
 * would overwrite the researcher's.
 */
export const startingWording = (
  committedFields: Parameters<typeof get>[0],
  path: string,
  supplied: ReadonlyMap<string, LocalizedString>,
): LocalizedString | undefined => {
  const committed: unknown = get(committedFields, path);
  return isLocalizedString(committed) ? committed : supplied.get(path);
};
