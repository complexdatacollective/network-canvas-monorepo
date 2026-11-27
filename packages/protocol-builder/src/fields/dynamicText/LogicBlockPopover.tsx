import { useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import {
  BlockDeleteButton,
  type RichTextLogicBlockFieldScope,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import { presentationalTextValue } from '@codaco/fresco-ui/PresentationalText';

import {
  asConditionDraft,
  type ConditionDraft,
} from '../../localization/conditionText.ts';
import type { ConditionVersionMeta } from '../../localization/messageDocument.ts';
import {
  conditionProblem,
  storedCondition,
} from '../../rules/ConditionRulesControl.tsx';
import {
  formAnswerGroups,
  formAnswerScopeOf,
  FormAnswerScopeProvider,
} from '../../rules/formAnswerScope.ts';
import { FORM_DOCUMENT_POPUP } from '../../sections/form-document/formDocumentEnvironment.ts';
import VariablePickerField from '../VariablePickerField.tsx';
import type { VariablePickerOption } from '../VariablePickerField.tsx';
import { ConditionVersions } from './ConditionVersions.tsx';
import { attributeOptionsFor } from './DynamicAttributeControls.tsx';
import { newConditionVersion } from './dynamicAttributeDraft.ts';
import { useDynamicTextEnvironment } from './editorEnvironment.ts';
import {
  caseKeysOf,
  type LogicBlockState,
  logicBlockOf,
  logicBlockWithOption,
  logicBlockWithValue,
} from './logicBlockModel.ts';
import {
  isLogicOption,
  LOGIC_OPTIONS,
  logicMessages,
  logicOptionDescription,
  logicOptionLabel,
  logicOptionUnavailableReason,
} from './logicOptions.ts';

export const logicBlockMessages = defineMessages({
  title: {
    id: 'protocolBuilder.logicBlock.title',
    defaultMessage: 'Logic block',
    description:
      'Name of a logic block: content in a text that is shown only in some cases. Heading of the block in the text, and of the popover where its settings are edited.',
  },
  remove: {
    id: 'protocolBuilder.logicBlock.remove',
    defaultMessage: 'Delete logic block',
    description:
      'Button that deletes a logic block from the text, with all of its content.',
  },
  attribute: {
    id: 'protocolBuilder.logicBlock.attribute',
    defaultMessage: 'Attribute',
    description:
      'Label of the control where a researcher chooses the attribute whose answer (or number) decides which content of a logic block is shown.',
  },
  answersWithVersions: {
    id: 'protocolBuilder.logicBlock.answersWithVersions',
    defaultMessage: 'Answers with their own content',
    description:
      'Label of the list of the answers to an attribute, each with a checkbox: a ticked answer has content of its own in the logic block. Content for the other answers is under “Any other answer”.',
  },
  formAnswersCleared: {
    id: 'protocolBuilder.logicBlock.formAnswersCleared',
    defaultMessage:
      'When the participant submits the form, the answers to any fields in versions that are not shown are cleared.',
    description:
      'Note in the settings of a logic block in a form. A version is one of the alternative contents of the logic block, of which the participant is shown one.',
  },
  dropTitle: {
    id: 'protocolBuilder.logicBlock.dropTitle',
    defaultMessage: 'Delete content?',
    description:
      'Title of the dialog that asks a researcher to confirm a change to a logic block that removes versions that contain content. A version is one of the alternative contents of the logic block.',
  },
  dropDescription: {
    id: 'protocolBuilder.logicBlock.dropDescription',
    defaultMessage:
      'This change removes {count, plural, one {a version that contains content} other {# versions that contain content}}. The content is deleted with {count, plural, one {it} other {them}}.',
    description:
      'Explanation in the dialog that asks a researcher to confirm a change to a logic block. count is how many versions with content the change removes. A version is one of the alternative contents of the logic block.',
  },
  dropConfirm: {
    id: 'protocolBuilder.logicBlock.dropConfirm',
    defaultMessage: 'Delete content',
    description:
      'Button that confirms a change to a logic block that deletes the content of some of its versions.',
  },
  removeTitle: {
    id: 'protocolBuilder.logicBlock.removeTitle',
    defaultMessage: 'Delete logic block?',
    description:
      'Title of the dialog that asks a researcher to confirm deleting a logic block that contains content.',
  },
  removeDescription: {
    id: 'protocolBuilder.logicBlock.removeDescription',
    defaultMessage:
      'This logic block contains content, which is deleted with it.',
    description:
      'Explanation in the dialog that asks a researcher to confirm deleting a logic block that contains content, such as text or fields, in its versions.',
  },
});

/**
 * Deletes the logic block, asking first when any of its versions contains
 * content (`branchesWithContent`, fresco-ui's), as a change that removes
 * versions with content does. Resolves to whether it was deleted.
 * `onAsking` is told while the question is open.
 */
const useLogicBlockRemoval = (
  remove: () => void,
  branchesWithContent: () => readonly string[],
  onAsking?: (asking: boolean) => void,
): (() => Promise<boolean>) => {
  const intl = useAppIntl();
  const { confirm } = useDialog();
  return async () => {
    if (branchesWithContent().length > 0) {
      onAsking?.(true);
      const confirmed = await confirm({
        title: intl.formatMessage(logicBlockMessages.removeTitle),
        description: intl.formatMessage(logicBlockMessages.removeDescription),
        confirmLabel: intl.formatMessage(logicBlockMessages.remove),
        cancelLabel: intl.formatMessage(commonMessages.cancel),
        intent: 'destructive',
        // Answered without leaving the form that the block may be in.
        dataAttributes: FORM_DOCUMENT_POPUP.attributes,
        onConfirm: () => undefined,
      }).finally(() => onAsking?.(false));
      if (confirmed !== true) return false;
    }
    remove();
    return true;
  };
};

type LogicBlockSettingsProps = Readonly<{
  state: LogicBlockState;
  update: (
    meta: unknown,
    branches: readonly Readonly<{ key: string; meta: unknown }>[],
  ) => void;
  remove: () => void;
  /** The keys of the block's versions that show something (fresco-ui's). */
  branchesWithContent: () => readonly string[];
  /** Where the document's fields are, seen from the block (fresco-ui's). */
  fieldScope: () => RichTextLogicBlockFieldScope;
  /**
   * Told while a question that the settings ask (a confirmation) is open
   * over them: they stay open behind it rather than closing as it takes the
   * keyboard.
   */
  onAsking: (asking: boolean) => void;
  /** Closes the settings, once the block they belong to is deleted. */
  onClose: () => void;
}>;

/**
 * The settings of a logic block, drawn in the popover attached to the
 * settings button in its header (`BlockSettingsPopover`): its logic, the
 * rules of each condition version of an “If” (or the attribute whose answers
 * or number it reads), and Delete logic block. Each change is made at once,
 * as an edit of the text that undo reverses; a change that removes versions
 * with content, and deleting a block with content, ask first.
 *
 * A condition version's problem (no rules, say) is shown once its rules have
 * been changed in these settings, as a form shows a field's problem once the
 * field has been changed: a block just put in is not met with errors. The
 * stage's own list of problems names whatever is left when it is saved.
 */
export function LogicBlockSettings({
  state,
  update,
  remove,
  branchesWithContent,
  fieldScope,
  onAsking,
  onClose,
}: LogicBlockSettingsProps) {
  const intl = useAppIntl();
  const { confirm } = useDialog();
  // The condition versions whose rules have been changed here.
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const removeBlock = useLogicBlockRemoval(
    remove,
    branchesWithContent,
    onAsking,
  );
  const environment = useDynamicTextEnvironment();
  const { choices, editable, locale } = environment;
  const readOnly = !editable;
  const subject = 'content' as const;
  const availability = {
    writesConditions: environment.conditions.writes,
    choices,
  };

  const conditionsOf = (
    conditionVersions: readonly ConditionVersionMeta[],
  ): Record<string, ConditionDraft> =>
    Object.fromEntries(
      conditionVersions.map((conditionVersion) => [
        conditionVersion.conditionId,
        asConditionDraft(
          Object.hasOwn(
            environment.conditions.values,
            conditionVersion.conditionId,
          )
            ? environment.conditions.values[conditionVersion.conditionId]
            : undefined,
        ),
      ]),
    );

  const writeConditions = (
    written: Readonly<Record<string, ConditionDraft>>,
  ) => {
    const set = environment.conditions.set;
    if (set === undefined || Object.keys(written).length === 0) return;
    const { aboutChoices } = environment.conditions.scope;
    set({
      ...environment.conditions.values,
      ...Object.fromEntries(
        Object.entries(written).map(([id, condition]) => [
          id,
          storedCondition(condition, aboutChoices),
        ]),
      ),
    });
  };

  const apply = async (
    next: LogicBlockState,
    written: Readonly<Record<string, ConditionDraft>> = {},
  ) => {
    const { meta, branches } = logicBlockOf(next, locale);
    const kept = new Set(branches.map(({ key }) => key));
    const dropped = branchesWithContent().filter((key) => !kept.has(key));
    if (dropped.length > 0) {
      onAsking(true);
      const confirmed = await confirm({
        title: intl.formatMessage(logicBlockMessages.dropTitle),
        description: intl.formatMessage(logicBlockMessages.dropDescription, {
          count: dropped.length,
        }),
        confirmLabel: intl.formatMessage(logicBlockMessages.dropConfirm),
        cancelLabel: intl.formatMessage(commonMessages.cancel),
        intent: 'destructive',
        // Answered without leaving the form that the block may be in.
        dataAttributes: FORM_DOCUMENT_POPUP.attributes,
        onConfirm: () => undefined,
      }).finally(() => {
        onAsking(false);
      });
      if (confirmed !== true) return;
    }
    writeConditions(written);
    update(meta, branches);
  };

  // In a form, the answers that the block's rules can read as the
  // participant types them: those of the fields outside the block.
  const formFieldVariable = environment.formFieldVariable;
  const formScope =
    formFieldVariable === undefined
      ? undefined
      : formAnswerScopeOf(fieldScope(), formFieldVariable);
  const variableOfChoice = (option: VariablePickerOption) =>
    choices.find((choice) => choice.name === option.value)?.variableId ?? '';
  const attributeOptions =
    state.option === 'answers' || state.option === 'number'
      ? attributeOptionsFor(environment, state.option)
      : [];

  const versionConditions = conditionsOf(state.conditionVersions);
  const rowProblems = Object.fromEntries(
    state.conditionVersions.flatMap((conditionVersion) => {
      if (!touched.has(conditionVersion.conditionId)) return [];
      const problem = conditionProblem(
        versionConditions[conditionVersion.conditionId] ?? { rules: [] },
        environment.conditions.scope,
        intl,
      );
      return problem === undefined
        ? []
        : [[conditionVersion.conditionId, problem]];
    }),
  );
  const answerOptions =
    state.option === 'answers'
      ? (
          choices.find((choice) => choice.name === state.value)?.options ?? []
        ).map((option) => ({
          value: option.caseKey,
          label: presentationalTextValue(
            environment.naming.answerLabel(state.value ?? '', option.caseKey) ??
              option.caseKey,
          ),
        }))
      : [];

  // The fields are spaced by their own margins, as every list of fields is,
  // in a block whose margins collapse into each other.
  return (
    <div className="w-[40rem] max-w-full">
      <UnconnectedField
        name="logic-block-logic"
        label={intl.formatMessage(logicMessages.logicLabel)}
        hint={logicOptionDescription(intl, state.option, subject)}
        component={SelectField}
        readOnly={readOnly}
        options={LOGIC_OPTIONS.map((option) => {
          const unavailable =
            option === state.option
              ? undefined
              : logicOptionUnavailableReason(intl, option, availability);
          return {
            value: option,
            label: logicOptionLabel(intl, option, subject),
            // What the option does, or why it cannot be chosen here.
            description:
              unavailable ?? logicOptionDescription(intl, option, subject),
            disabled: unavailable !== undefined,
          };
        })}
        value={state.option}
        onChange={(next) => {
          if (!isLogicOption(next) || next === state.option) return;
          const written: Record<string, ConditionDraft> = {};
          const changed = logicBlockWithOption(state, next, choices, (when) => {
            const added = newConditionVersion(when);
            written[added.conditionVersion.conditionId] = added.condition;
            return added.conditionVersion;
          });
          void apply(changed, written);
        }}
      />
      {(state.option === 'if' || state.option === 'ifNot') && (
        <FormAnswerScopeProvider value={formScope}>
          <ConditionVersions
            name="logic-block"
            conditionVersions={state.conditionVersions}
            conditions={versionConditions}
            problems={rowProblems}
            onChange={(conditionVersions, conditions) => {
              setTouched((before) => {
                const changed = conditionVersions
                  .map(({ conditionId }) => conditionId)
                  // A version just added has not been changed yet.
                  .filter(
                    (conditionId) =>
                      Object.hasOwn(versionConditions, conditionId) &&
                      conditions[conditionId] !==
                        versionConditions[conditionId],
                  );
                return changed.every((conditionId) => before.has(conditionId))
                  ? before
                  : new Set([...before, ...changed]);
              });
              const rowsChanged =
                conditionVersions.length !== state.conditionVersions.length ||
                conditionVersions.some(
                  (conditionVersion, index) =>
                    conditionVersion.conditionId !==
                    state.conditionVersions[index]?.conditionId,
                );
              const written = Object.fromEntries(
                conditionVersions.flatMap((conditionVersion) => {
                  const condition = conditions[conditionVersion.conditionId];
                  return condition === undefined
                    ? []
                    : [[conditionVersion.conditionId, condition]];
                }),
              );
              if (rowsChanged) {
                void apply({ ...state, conditionVersions }, written);
              } else {
                writeConditions(written);
              }
            }}
          />
        </FormAnswerScopeProvider>
      )}
      {(state.option === 'answers' || state.option === 'number') && (
        <UnconnectedField
          name="logic-block-attribute"
          label={intl.formatMessage(logicBlockMessages.attribute)}
          component={VariablePickerField}
          {...(formScope === undefined
            ? { options: attributeOptions }
            : {
                groups: formAnswerGroups(
                  attributeOptions,
                  formScope,
                  intl,
                  variableOfChoice,
                ),
              })}
          readOnly={readOnly}
          value={state.value}
          onChange={(next) => {
            if (
              typeof next === 'string' &&
              next !== '' &&
              next !== state.value
            ) {
              void apply(logicBlockWithValue(state, next, choices));
            }
          }}
        />
      )}
      {state.option === 'answers' && answerOptions.length > 0 && (
        <UnconnectedField
          name="logic-block-answers"
          label={intl.formatMessage(logicBlockMessages.answersWithVersions)}
          component={CheckboxGroupField}
          options={answerOptions}
          readOnly={readOnly}
          value={[...state.answerKeys]}
          onChange={(next) => {
            const ticked = new Set((next ?? []).map(String));
            void apply({
              ...state,
              // In the attribute's order, whatever order they were ticked in.
              answerKeys: caseKeysOf(choices, state.value).filter((key) =>
                ticked.has(key),
              ),
            });
          }}
        />
      )}
      {environment.isForm && (
        <Alert variant="info">
          <AlertDescription>
            {intl.formatMessage(logicBlockMessages.formAnswersCleared)}
          </AlertDescription>
        </Alert>
      )}
      {editable && (
        <div className="flex justify-end">
          <BlockDeleteButton
            onClick={async () => {
              if (await removeBlock()) onClose();
            }}
          >
            {intl.formatMessage(logicBlockMessages.remove)}
          </BlockDeleteButton>
        </div>
      )}
    </div>
  );
}
