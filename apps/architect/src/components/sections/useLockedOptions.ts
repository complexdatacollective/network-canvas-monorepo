import {
  getLockedOptions,
  type LockedOptionList,
} from '~/components/Options/getLockedOptions';
import { useAppSelector } from '~/ducks/hooks';
import { getVariablesForSubject } from '~/selectors/codebook';
import { getInterfaceOwnedOptionMap, roleMapKey } from '~/selectors/indexes';

/**
 * The read-only option list a prompt editor must render for its bound
 * variable, or undefined when the researcher may edit it.
 *
 * The question — and its two answers, an interface-owned canonical set or a
 * `readOnly` codebook variable — is `getLockedOptions`', the same one the form
 * field editors ask. This is only the Redux wiring the prompt editors share:
 * they reach their variable through a stage subject rather than through
 * `useFieldHandlers`.
 *
 * Every branch returns a reference held by the store or by
 * `INTERFACE_OWNED_OPTION_SETS`, so the selector is stable under
 * reference equality.
 */
export const useLockedOptions = (
  subject: { entity: 'node' | 'edge' | 'ego'; type?: string } | null,
  variableId: string | undefined,
): LockedOptionList | undefined =>
  useAppSelector((state) => {
    if (!subject || !variableId) return undefined;
    return getLockedOptions(
      getVariablesForSubject(state, subject),
      variableId,
      getInterfaceOwnedOptionMap(state)[roleMapKey(subject, variableId)],
    );
  });
