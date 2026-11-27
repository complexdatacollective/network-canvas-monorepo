import { createContext, useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import type { RichTextLogicBlockFieldScope } from '@codaco/fresco-ui/form/fields/RichTextEditor';

import { attributeGroupMessages } from '../fields/attributeGroups.ts';
import type { VariablePickerOption } from '../fields/VariablePickerField.tsx';
import type { VariablePickerGroup } from '../fields/VariablePickerList.tsx';

const messages = defineMessages({
  insideBlock: {
    id: 'protocolBuilder.formAnswers.insideBlock',
    defaultMessage:
      'A field inside this logic block collects this attribute, so it cannot decide which content the block shows.',
    description:
      'Why an attribute cannot be chosen for a rule of a logic block in a form: the question that collects it is inside the same logic block, so it is shown only after the block has decided what to show.',
  },
  otherVersion: {
    id: 'protocolBuilder.formAnswers.otherVersion',
    defaultMessage:
      'This attribute is collected only by fields in another version of a logic block that contains this block, so those fields are never shown with this logic block.',
    description:
      'Why an attribute cannot be chosen for a rule of a logic block in a form: the logic block is inside one version of a larger logic block, and the only question that collects the attribute is in a different version of that larger block. The participant sees only one version, so that question is never shown together with this logic block. A version is one of the alternative contents of a logic block.',
  },
});

/**
 * Which attributes the fields of a form collect, seen from one logic block
 * in the form's text: the fields outside the block, whose answers a rule of
 * the block reads as the participant types them; the fields inside it,
 * which cannot decide what the block shows; and the fields in another
 * version of a logic block that contains it, which are never shown with it.
 * An attribute is in one set only: one that a field outside the block
 * collects is `outside`, whatever other fields collect it.
 */
export type FormAnswerScope = Readonly<{
  outside: ReadonlySet<string>;
  inside: ReadonlySet<string>;
  elsewhere: ReadonlySet<string>;
}>;

const FormAnswerScopeContext = createContext<FormAnswerScope | undefined>(
  undefined,
);

/**
 * Gives the rule editors beneath it the form answers of the logic block that
 * their rules belong to, so their attribute lists put those answers first.
 */
export const FormAnswerScopeProvider = FormAnswerScopeContext.Provider;

export function useFormAnswerScope(): FormAnswerScope | undefined {
  return useContext(FormAnswerScopeContext);
}

/**
 * The attributes that the fields of `scope` collect, split as `FormAnswerScope`
 * splits them. `scope` is where the editor's document places the form's
 * fields, seen from one logic block (fresco-ui's `fieldScope()`), and
 * `variableOf` names the attribute that a field collects, or nothing for a
 * field that has none yet.
 */
export const formAnswerScopeOf = (
  scope: RichTextLogicBlockFieldScope,
  variableOf: (fieldId: string) => string | undefined,
): FormAnswerScope => {
  const variablesOf = (ids: readonly string[]) =>
    new Set(
      ids.flatMap((id) => {
        const variable = variableOf(id);
        return variable === undefined || variable === '' ? [] : [variable];
      }),
    );
  const outside = variablesOf(scope.outside);
  // An attribute that a field outside the block also collects is answered
  // there, so the block can read it.
  const inside = new Set(
    [...variablesOf(scope.inside)].filter((variable) => !outside.has(variable)),
  );
  return {
    outside,
    inside,
    elsewhere: new Set(
      [...variablesOf(scope.otherVersions)].filter(
        (variable) => !outside.has(variable) && !inside.has(variable),
      ),
    ),
  };
};

/**
 * An attribute list for a rule of a logic block in a form: the answers on
 * the form first, then the attributes recorded before it. An attribute that
 * only a field inside the block, or in another version of a block that
 * contains it, collects is listed with the form's answers, with the reason
 * that it cannot be chosen. `variableOf` names the attribute
 * that an option stands for.
 */
export const formAnswerGroups = (
  options: readonly VariablePickerOption[],
  scope: FormAnswerScope,
  intl: IntlShape,
  variableOf: (option: VariablePickerOption) => string = (option) =>
    option.value,
): VariablePickerGroup[] => {
  const onForm: VariablePickerOption[] = [];
  const earlier: VariablePickerOption[] = [];
  for (const option of options) {
    const variable = variableOf(option);
    if (scope.outside.has(variable)) {
      onForm.push(option);
    } else if (scope.inside.has(variable)) {
      onForm.push({
        ...option,
        unavailableReason:
          option.unavailableReason ?? intl.formatMessage(messages.insideBlock),
      });
    } else if (scope.elsewhere.has(variable)) {
      onForm.push({
        ...option,
        unavailableReason:
          option.unavailableReason ?? intl.formatMessage(messages.otherVersion),
      });
    } else {
      earlier.push(option);
    }
  }
  return [
    {
      id: 'form-answers',
      label: intl.formatMessage(attributeGroupMessages.formAnswers),
      options: onForm,
    },
    {
      id: 'earlier-answers',
      label: intl.formatMessage(attributeGroupMessages.earlierAnswers),
      options: earlier,
    },
  ].filter((group) => group.options.length > 0);
};
