import { dynamicValueNameFor } from '@codaco/protocol-validation';

import { storedCondition } from '../../rules/ConditionRulesControl.tsx';
import {
  type DynamicAttributeDraft,
  dynamicAttributeOfDraft,
} from './dynamicAttributeDraft.ts';
import type { DynamicTextEnvironment } from './editorEnvironment.ts';

/** The name that text uses for the dynamic attribute `id`. */
export const dynamicAttributeName = (id: string): string =>
  dynamicValueNameFor({ kind: 'dynamicAttribute', id });

/**
 * Writes `draft` as the dynamic attribute `id` beside the text, with the
 * conditions its condition versions test. A condition that a condition version
 * no longer tests stays until the owner is saved, which drops every condition
 * nothing uses. False where dynamic attributes cannot be written here.
 */
export const writeDynamicAttribute = (
  environment: DynamicTextEnvironment,
  id: string,
  draft: DynamicAttributeDraft,
): boolean => {
  const setDefinitions = environment.dynamicAttributes.set;
  if (setDefinitions === undefined || !environment.editable) return false;
  if (draft.option === 'if' || draft.option === 'ifNot') {
    const setConditions = environment.conditions.set;
    if (setConditions === undefined) return false;
    const { aboutChoices } = environment.conditions.scope;
    setConditions({
      ...environment.conditions.values,
      ...Object.fromEntries(
        draft.conditionVersions.map((conditionVersion) => [
          conditionVersion.conditionId,
          storedCondition(
            draft.conditions[conditionVersion.conditionId] ?? { rules: [] },
            aboutChoices,
          ),
        ]),
      ),
    });
  }
  setDefinitions({
    ...environment.dynamicAttributes.values,
    [id]: dynamicAttributeOfDraft(draft),
  });
  return true;
};
