import { useId } from 'react';

import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import { presentationalTextValue } from '@codaco/fresco-ui/PresentationalText';
import { cx } from '@codaco/fresco-ui/utils/cva';
import {
  type DynamicAttribute,
  DynamicAttributeSchema,
} from '@codaco/protocol-validation';

import { useLanguageNaming } from '../../localization/LanguageNaming.tsx';
import { conditionVersionKey } from '../../localization/messageDocument.ts';
import {
  conditionProblem,
  type ConditionScope,
} from '../../rules/ConditionRulesControl.tsx';
import VariablePickerField, {
  type VariablePickerOption,
} from '../VariablePickerField.tsx';
import { variablePillKindOf } from '../VariablePill.tsx';
import { AddElseIfButton, ConditionVersions } from './ConditionVersions.tsx';
import {
  type DynamicAttributeDraft,
  dynamicAttributeOfDraft,
  draftVersionKeyOf,
  draftVersionKeys,
  draftWithOption,
  draftWithWording,
  newConditionVersion,
  NUMBER_WORDING,
} from './dynamicAttributeDraft.ts';
import {
  type DynamicTextEnvironment,
  useDynamicTextEnvironment,
} from './editorEnvironment.ts';
import { logicBlockWithValue, logicMetaOf } from './logicBlockModel.ts';
import {
  answerChoices,
  isLogicOption,
  LOGIC_OPTIONS,
  logicMessages,
  logicOptionDescription,
  logicOptionLabel,
  logicOptionUnavailableReason,
  numberChoices,
} from './logicOptions.ts';
import {
  dynamicAttributeVersionAt,
  numberWordingExamples,
  versionWordingText,
  valueNamingMessages,
} from './valueNaming.ts';
import { logicVersionLabel } from './versionLabels.ts';

const messages = defineMessages({
  attribute: {
    id: 'protocolBuilder.dynamicAttribute.attribute',
    defaultMessage: 'Attribute',
    description:
      'Label of the control where a researcher chooses the attribute whose answer (or number) decides which version of a dynamic attribute or a logic block is shown.',
  },
  attributeAnswersHint: {
    id: 'protocolBuilder.dynamicAttribute.attributeAnswersHint',
    defaultMessage:
      'The answer to this attribute decides which version is shown.',
    description:
      'Guidance under the Attribute control of a dynamic attribute or a logic block that has a version for each answer.',
  },
  attributeNumberHint: {
    id: 'protocolBuilder.dynamicAttribute.attributeNumberHint',
    defaultMessage:
      'The number in this attribute decides which version is shown.',
    description:
      'Guidance under the Attribute control of a dynamic attribute or a logic block that has a version for singular or plural numbers.',
  },
  wordingForEachCase: {
    id: 'protocolBuilder.dynamicAttribute.wordingForEachCase',
    defaultMessage: 'Wording for each case',
    description:
      'Heading above the versions of a dynamic attribute whose logic is “If … else”: one short word or phrase for each case.',
  },
  wordingForEachAnswer: {
    id: 'protocolBuilder.dynamicAttribute.wordingForEachAnswer',
    defaultMessage: 'Wording for each answer',
    description:
      'Heading above the versions of a dynamic attribute that has a version for each answer to an attribute.',
  },
  versionsHeading: {
    id: 'protocolBuilder.dynamicAttribute.wording',
    defaultMessage: 'Wording',
    description:
      'Heading above the versions of a dynamic attribute whose logic is singular or plural numbers, or participant or someone else.',
  },
  wordingHint: {
    id: 'protocolBuilder.dynamicAttribute.wordingHint',
    defaultMessage:
      'Keep each version short. It is shown in place of the pill.',
    description:
      'Guidance under the heading above the versions of a dynamic attribute. The pill is how the dynamic attribute is drawn in the text being edited.',
  },
  numberWording: {
    id: 'protocolBuilder.dynamicAttribute.numberWording',
    defaultMessage: 'If known',
    description:
      'Label of the version of a dynamic attribute that is shown when the number it depends on is known. It contains one version for each plural form, such as “1 child” and “3 children”.',
  },
  reference: {
    id: 'protocolBuilder.dynamicAttribute.reference',
    defaultMessage: '{language}: {wording}',
    description:
      'Shown under a version of a dynamic attribute while it is edited in a language that is not the protocol’s default language: the same version in the default language, for reference. language is that language’s name, such as “English”; wording is the version, such as “their”.',
  },
  noReference: {
    id: 'protocolBuilder.dynamicAttribute.noReference',
    defaultMessage: '{language}: (not written yet)',
    description:
      'Shown under a version of a dynamic attribute while it is edited in a language that is not the protocol’s default language, when the version has not been written in the default language yet. language is that language’s name, such as “English”.',
  },
  referenceShowsNothing: {
    id: 'protocolBuilder.dynamicAttribute.referenceShowsNothing',
    defaultMessage: '{language}: (shows nothing)',
    description:
      'Shown under a version of a dynamic attribute while it is edited in a language that is not the protocol’s default language, when the version is empty in the default language, so that nothing is shown in its place. language is that language’s name, such as “English”.',
  },
  versionUnreadable: {
    id: 'protocolBuilder.dynamicAttribute.versionUnreadable',
    defaultMessage:
      'This wording cannot be saved as it is written. Write it again.',
    description:
      'Problem shown under a version of a dynamic attribute whose wording, in the language being edited, uses something that the wording cannot contain, such as a choice between versions inside its sentence. This can happen when the wording was imported from elsewhere.',
  },
  chooseAttribute: {
    id: 'protocolBuilder.dynamicAttribute.chooseAttribute',
    defaultMessage: 'Choose an attribute.',
    description:
      'Problem shown under the Attribute control of a dynamic attribute or a logic block when no attribute is chosen.',
  },
  noAttributes: {
    id: 'protocolBuilder.dynamicAttribute.noAttributes',
    defaultMessage: 'No attribute of this kind can be used here.',
    description:
      'Shown in the empty Attribute list of a dynamic attribute or a logic block when no attribute of the kind that its logic needs is available.',
  },
});

/** What is wrong with a draft, by the control each problem belongs to. */
export type DraftProblems = Readonly<{
  conditionVersions: Readonly<Record<string, string>>;
  value?: string;
  wordings: Readonly<Record<string, string>>;
}>;

/**
 * The attribute options of a logic that reads an attribute's answers or number.
 */
export const attributeOptionsFor = (
  environment: DynamicTextEnvironment,
  kind: 'answers' | 'number',
): VariablePickerOption[] =>
  (kind === 'answers'
    ? answerChoices(environment.choices)
    : numberChoices(environment.choices)
  ).map((choice) => {
    const type = variablePillKindOf(choice.variableType);
    return {
      value: choice.name,
      label: presentationalTextValue(environment.naming.valueLabel(choice)),
      ...(type !== undefined && { type }),
    };
  });

/**
 * The key of the version of `dynamicAttribute` (a draft's,
 * `dynamicAttributeOfDraft`) that `path` in it is about, or undefined for a
 * path outside every version.
 */
const versionKeyAt = (
  dynamicAttribute: DynamicAttribute,
  path: readonly PropertyKey[],
): string | undefined => {
  const version = dynamicAttributeVersionAt(dynamicAttribute, path);
  return version === undefined ? undefined : draftVersionKeyOf(version);
};

/**
 * What stops the draft being saved: a condition version without rules (or with
 * a rule its codebook refuses), no attribute, or a version whose wording in the
 * language being edited the dynamic attribute's own schema refuses, such as
 * wording that chooses between versions inside its sentence. A version may be
 * empty: it shows nothing.
 */
export const draftProblems = (
  draft: DynamicAttributeDraft,
  scope: ConditionScope,
  locale: string,
  intl: IntlShape,
): DraftProblems => {
  const conditionVersions: Record<string, string> = {};
  if (draft.option === 'if' || draft.option === 'ifNot') {
    for (const conditionVersion of draft.conditionVersions) {
      const problem = conditionProblem(
        draft.conditions[conditionVersion.conditionId] ?? { rules: [] },
        scope,
        intl,
      );
      if (problem !== undefined)
        conditionVersions[conditionVersion.conditionId] = problem;
    }
  }
  const value =
    (draft.option === 'answers' || draft.option === 'number') &&
    (draft.value === undefined || draft.value === '')
      ? intl.formatMessage(messages.chooseAttribute)
      : undefined;
  // Each version's wording in the language being edited, as the stage's
  // schema reads it.
  const inLocale: DynamicAttributeDraft = {
    ...draft,
    wordings: Object.fromEntries(
      draftVersionKeys(draft).map((key) => {
        const message = draft.wordings[key]?.[locale];
        return [key, message === undefined ? {} : { [locale]: message }];
      }),
    ),
  };
  const wordings: Record<string, string> = {};
  const dynamicAttribute = dynamicAttributeOfDraft(inLocale);
  const parsed = DynamicAttributeSchema.safeParse(dynamicAttribute);
  for (const issue of parsed.success ? [] : parsed.error.issues) {
    const key = versionKeyAt(dynamicAttribute, issue.path);
    if (key === undefined || Object.hasOwn(wordings, key)) continue;
    wordings[key] = intl.formatMessage(messages.versionUnreadable);
  }
  return { conditionVersions, ...(value !== undefined && { value }), wordings };
};

export const hasDraftProblems = (problems: DraftProblems): boolean =>
  Object.keys(problems.conditionVersions).length > 0 ||
  problems.value !== undefined ||
  Object.keys(problems.wordings).length > 0;

type DynamicAttributeControlsProps = Readonly<{
  /** Unique among the controls on screen. */
  name: string;
  /**
   * The dynamic attribute's id, which its wording may not show; absent while
   * it is being created, when nothing can show it yet.
   */
  id?: string;
  draft: DynamicAttributeDraft;
  onChange: (draft: DynamicAttributeDraft) => void;
  /** Shown once the researcher has tried to save. */
  problems?: DraftProblems;
  /** Labels beside their controls, for a popover; above them otherwise. */
  compact?: boolean;
}>;

/**
 * The controls of a dynamic attribute, for the dialog that creates one and
 * the popover that edits one: its logic, the rules of each case (or the
 * attribute whose answers or number it reads), and one short wording for
 * each version, in the language being edited. Each version is written as
 * other one-line text is, in bold or italics and with the values that the
 * text can show, including other dynamic attributes that do not show this
 * one.
 */
export function DynamicAttributeControls({
  name,
  id,
  draft,
  onChange,
  problems,
  compact = false,
}: DynamicAttributeControlsProps) {
  const intl = useAppIntl();
  const environment = useDynamicTextEnvironment();
  const { name: languageName } = useLanguageNaming();
  const { locale, defaultLocale, choices, editable } = environment;
  const readOnly = !editable;
  const availability = {
    writesConditions: environment.conditions.writes,
    choices,
  };
  const subject = 'wording' as const;
  const meta = logicMetaOf(draft);
  const versionKeys = draftVersionKeys(draft);
  const headingId = useId();

  const wordingHeading = intl.formatMessage(
    draft.option === 'if' || draft.option === 'ifNot'
      ? messages.wordingForEachCase
      : draft.option === 'answers'
        ? messages.wordingForEachAnswer
        : messages.versionsHeading,
  );

  const versionLabel = (key: string): string => {
    if (key === NUMBER_WORDING)
      return intl.formatMessage(messages.numberWording);
    const versionIndex = draft.conditionVersions.findIndex(
      (conditionVersion) =>
        conditionVersionKey(conditionVersion.conditionId) === key,
    );
    const conditionVersion =
      versionIndex === -1 ? undefined : draft.conditionVersions[versionIndex];
    return logicVersionLabel(
      {
        intl,
        naming: environment.naming,
        locale,
        conditionSentence: (conditionId) =>
          environment.sentenceOf(
            draft.conditions[conditionId] ?? { rules: [] },
          ),
        hasCondition: () => true,
      },
      meta,
      key,
      conditionVersion,
      Math.max(versionIndex, 0),
    );
  };

  const reference = (key: string): string | undefined => {
    if (locale === defaultLocale) return undefined;
    const stored = draft.wordings[key]?.[defaultLocale];
    const language = languageName(defaultLocale);
    if (stored === undefined) {
      return intl.formatMessage(messages.noReference, { language });
    }
    // As it reads, each value by its name; number wording one version for
    // each plural form.
    const { naming } = environment;
    const valueText = (valueName: string) =>
      `[${presentationalTextValue(naming.recordedLabel(valueName))}]`;
    const wording =
      key === NUMBER_WORDING
        ? numberWordingExamples(stored, defaultLocale, valueText)
            .filter((example) => example.trim() !== '')
            .join(' / ')
        : versionWordingText(stored, defaultLocale, valueText);
    return wording.trim() === ''
      ? intl.formatMessage(messages.referenceShowsNothing, { language })
      : intl.formatMessage(messages.reference, { language, wording });
  };

  // A label beside its version's wording; each version is spaced from the
  // next by its own margin.
  const rowClass = compact
    ? 'grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-start gap-x-4 not-last:mb-3'
    : 'grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] items-start gap-x-6 not-last:mb-3';

  return (
    // Each field is spaced by its own margin.
    <div data-dynamic-attribute-controls={name}>
      <UnconnectedField
        name={`${name}-logic`}
        label={intl.formatMessage(logicMessages.logicLabel)}
        hint={logicOptionDescription(intl, draft.option, subject)}
        component={SelectField}
        readOnly={readOnly}
        options={LOGIC_OPTIONS.map((option) => {
          const unavailable =
            option === draft.option
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
        value={draft.option}
        onChange={(next) => {
          if (!isLogicOption(next) || next === draft.option) return;
          onChange(draftWithOption(draft, next, choices));
        }}
      />

      {(draft.option === 'if' || draft.option === 'ifNot') && (
        <ConditionVersions
          name={name}
          conditionVersions={draft.conditionVersions}
          conditions={draft.conditions}
          problems={problems?.conditionVersions}
          withAddElseIf={false}
          onChange={(conditionVersions, conditions) =>
            onChange({ ...draft, conditionVersions, conditions })
          }
        />
      )}

      {(draft.option === 'answers' || draft.option === 'number') && (
        <UnconnectedField
          name={`${name}-attribute`}
          label={intl.formatMessage(messages.attribute)}
          hint={intl.formatMessage(
            draft.option === 'answers'
              ? messages.attributeAnswersHint
              : messages.attributeNumberHint,
          )}
          component={VariablePickerField}
          options={attributeOptionsFor(environment, draft.option)}
          emptyMessage={intl.formatMessage(messages.noAttributes)}
          readOnly={readOnly}
          value={draft.value}
          errors={problems?.value === undefined ? [] : [problems.value]}
          showErrors={problems?.value !== undefined}
          onChange={(next) => {
            if (typeof next === 'string' && next !== '') {
              onChange(logicBlockWithValue(draft, next, choices));
            }
          }}
        />
      )}

      <section aria-labelledby={headingId}>
        <div className="mb-3 flex flex-col gap-1">
          <h3 id={headingId} className="text-base font-semibold">
            {wordingHeading}
          </h3>
          {!compact && (
            <p className="text-sm text-current/70">
              {intl.formatMessage(messages.wordingHint)}
            </p>
          )}
        </div>
        {versionKeys.map((key) => {
          const inputId = `${name}-wording-${key}`;
          const label = versionLabel(key);
          const problem = problems?.wordings[key];
          const shownReference = reference(key);
          const noteId = `${inputId}-note`;
          const note = (problem !== undefined ||
            shownReference !== undefined) && (
            <>
              <span
                id={noteId}
                className={cx(
                  'text-xs',
                  problem === undefined
                    ? 'text-current/70'
                    : 'text-destructive',
                )}
              >
                {problem ?? shownReference}
              </span>
              {problem !== undefined && shownReference !== undefined && (
                <span className="text-xs text-current/70">
                  {shownReference}
                </span>
              )}
            </>
          );
          const stored = draft.wordings[key]?.[locale];
          if (key === NUMBER_WORDING) {
            return (
              <div key={key} className={rowClass}>
                <span
                  id={`${inputId}-label`}
                  className="pt-2 text-sm font-semibold text-current/70"
                >
                  {label}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  {environment.editors.number({
                    id: inputId,
                    name: inputId,
                    message: stored ?? '',
                    onMessageChange: (message) =>
                      onChange(draftWithWording(draft, key, locale, message)),
                    readOnly,
                    locale,
                    site: environment.site,
                    ownDynamicAttribute: id,
                    counted: draft.value,
                    ariaLabelledBy: `${inputId}-label`,
                    ariaDescribedBy: note === false ? '' : noteId,
                    ariaInvalid: problem !== undefined,
                  })}
                  {note}
                </div>
              </div>
            );
          }
          return (
            <div key={key} className={rowClass}>
              <span
                id={`${inputId}-label`}
                className="pt-2 text-sm font-semibold text-current/70"
              >
                {label}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                {environment.editors.version({
                  id: inputId,
                  name: inputId,
                  readOnly,
                  message: stored ?? '',
                  // An empty version shows nothing, except where a language
                  // has not been written yet and falls back to another. The
                  // placeholder is never taken away, only emptied, so that
                  // the first letter typed keeps the editor it is typed in.
                  placeholder:
                    stored === '' ||
                    (stored === undefined && locale === defaultLocale)
                      ? intl.formatMessage(valueNamingMessages.showsNothing)
                      : '',
                  ariaLabelledBy: `${inputId}-label`,
                  ariaDescribedBy: note === false ? '' : noteId,
                  ariaInvalid: problem !== undefined,
                  onMessageChange: (message) =>
                    onChange(draftWithWording(draft, key, locale, message)),
                  locale,
                  site: environment.site,
                  ownDynamicAttribute: id,
                })}
                {note}
              </div>
            </div>
          );
        })}
        {(draft.option === 'if' || draft.option === 'ifNot') && !readOnly && (
          <AddElseIfButton
            onAdd={() => {
              const added = newConditionVersion();
              onChange({
                ...draft,
                conditionVersions: [
                  ...draft.conditionVersions,
                  added.conditionVersion,
                ],
                conditions: {
                  ...draft.conditions,
                  [added.conditionVersion.conditionId]: added.condition,
                },
              });
            }}
          />
        )}
      </section>
    </div>
  );
}
