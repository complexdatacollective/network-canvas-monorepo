import { useMemo, useRef } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import Section from '@codaco/fresco-ui/Section';

import DraftValidationRulesField, {
  draftRulesIssue,
} from '../../fields/DraftValidationRulesField.tsx';
import { validationSectionMessages } from '../codebookMessages.ts';
import { isValidationMap, type StageRendering } from '../variableValidation.ts';

export type DraftVariableValidationSectionProps = Readonly<{
  /** Whose codebook the attribute will be created in. */
  entity: 'node' | 'edge' | 'ego';
  /** The kind of answer the row chose for it. */
  variableType: string;
  /** The name the researcher typed into the picker's create row. */
  variableName: string;
  /** Where in the row the rules are held until its own save creates them. */
  rulesField: string;
  /** The rules the row arrived holding, for the field's seed. */
  initialValue?: unknown;
  /** The attributes a comparison rule may be pointed at. */
  allVariables: Readonly<Record<string, unknown>>;
  stageRendering?: StageRendering;
  disabled?: boolean;
}>;

/**
 * Architect's nested Validation section, for an attribute the row is inventing.
 *
 * The same section a bound attribute gets (`CodebookVariableValidationSection`)
 * with the one difference that matters: there is no codebook record to write
 * to yet, so the rules are a field of the row and are written with the create.
 * The row's save is what refuses a half-set or contradictory map, exactly as
 * Architect's `validation` field did.
 */
export default function DraftVariableValidationSection({
  entity,
  variableType,
  variableName,
  rulesField,
  initialValue,
  allVariables,
  stageRendering,
  disabled = false,
}: DraftVariableValidationSectionProps) {
  const intl = useAppIntl();

  /**
   * What the rules are judged against, kept live.
   *
   * A validation object is part of what a field registers with and is memoised
   * on a JSON of its rules — which drops functions, so a rebuilt closure would
   * never replace the one registered on the first render. Read through a ref,
   * the rule judges the map against the attribute the row is inventing NOW.
   */
  const judgeAgainst = useRef({
    variableType,
    variableName,
    allVariables,
    stageRendering,
  });
  judgeAgainst.current = {
    variableType,
    variableName,
    allVariables,
    stageRendering,
  };
  const rulesValidation = useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) => draftRulesIssue({ ...judgeAgainst.current, value }),
      ]),
    }),
    [],
  );

  const seeded = isValidationMap(initialValue) ? initialValue : undefined;

  return (
    <Section
      title={intl.formatMessage(validationSectionMessages.sectionTitle)}
      description={intl.formatMessage(
        validationSectionMessages.sectionDescription,
      )}
      disabled={disabled}
      toggleable
      defaultOpen={seeded !== undefined && Object.keys(seeded).length > 0}
    >
      <Field<typeof DraftValidationRulesField>
        name={rulesField}
        component={DraftValidationRulesField}
        label={intl.formatMessage(validationSectionMessages.rulesLabel)}
        hint={intl.formatMessage(validationSectionMessages.rulesHint)}
        entity={entity}
        variableType={variableType}
        allVariables={allVariables}
        {...(stageRendering === undefined ? {} : { stageRendering })}
        {...(seeded === undefined ? {} : { initialValue: seeded })}
        {...rulesValidation}
      />
    </Section>
  );
}
