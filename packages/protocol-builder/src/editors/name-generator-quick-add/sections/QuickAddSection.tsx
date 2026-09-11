import { useCallback, useMemo, useState } from 'react';

import {
  createMessageError,
  defineMessages,
  formatMessageError,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';

import {
  useCreateCodebookVariable,
  useWhereTheAnswerLands,
} from '../../../codebook/useCodebookVariableEdits.ts';
import CodebookVariableValidationSection from '../../../codebook/validation/CodebookVariableValidationSection.tsx';
import {
  buildVariableRoleMap,
  excludeUnvalidatedUses,
} from '../../../codebook/variableRoles.ts';
import VariablePickerField, {
  type CreateOptionOutcome,
  type VariablePickerOption,
} from '../../../fields/VariablePickerField.tsx';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import {
  type CodebookSubject,
  variablesForSubject,
} from '../../../protocol-context.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { useStageSubject } from '../../../sections/useStageSubject.ts';
import { useProtocolContext } from '../../../state/protocolContext.ts';

/** Where a quick-add name generator records what it fills in. */
const QUICK_ADD = 'quickAdd';

/**
 * Quick add writes the participant's typing straight into one attribute as the
 * node is created, and the attribute's own rules are honoured while they type —
 * a VALIDATED writer. Only text can be typed into a single box, so only text
 * attributes can be offered.
 */
const QUICK_ADD_TYPE = 'text';

/**
 * A quick-add attribute must hold a value from the moment the node exists:
 * that value is the only thing the participant gave, and a node created
 * without it has no name at all.
 */
const QUICK_ADD_VALIDATION = { required: true };

const NO_OPTIONS: readonly VariablePickerOption[] = Object.freeze([]);

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.quickAdd.title',
    defaultMessage: 'Quick add',
    description:
      'Heading of the section choosing which attribute a participant fills in when they add a network member with a single box. An attribute is one field the protocol records about that member, which may be a person, an organisation, a place, or anything else the study is about.',
  },
  description: {
    id: 'protocolBuilder.quickAdd.description',
    defaultMessage:
      'Choose the attribute the participant fills in when they add a “{typeName}” with a single box.',
    description:
      'Description of the quick-add section. typeName is the researcher’s own name for the node type this stage adds — a person, an organisation, a place — and is not translated.',
  },
  waitingDescription: {
    id: 'protocolBuilder.quickAdd.waitingDescription',
    defaultMessage:
      'Choose what this stage works with before setting up quick add.',
    description:
      'Shown in place of the quick-add section’s description while the researcher has not yet chosen which node type the stage is about, so there are no attributes to choose from.',
  },
  fieldLabel: {
    id: 'protocolBuilder.quickAdd.fieldLabel',
    defaultMessage: 'Attribute filled in',
    description:
      'Label of the control choosing which attribute receives what the participant types into the quick-add box.',
  },
  fieldHint: {
    id: 'protocolBuilder.quickAdd.fieldHint',
    defaultMessage:
      'What the participant types goes here. Use the attribute holding the name unless you have a reason not to — the interview labels what it creates by it.',
    description:
      'Guidance under the quick-add attribute control. Said without naming what is created, because this interface can add any kind of network member and the control is shown before the researcher has chosen which.',
  },
  fieldRequired: {
    id: 'protocolBuilder.quickAdd.fieldRequired',
    defaultMessage: 'Choose the attribute quick add fills in.',
    description:
      'Refusal shown when a researcher saves a quick-add stage without saying which attribute receives what the participant types, which would create network members with no name at all.',
  },
  noTextAttribute: {
    id: 'protocolBuilder.quickAdd.noTextAttribute',
    defaultMessage:
      'This type has no text attribute quick add could fill in. Create one below.',
    description:
      'Shown in place of the quick-add attribute list when the chosen node type has no attribute holding typed text. Points at the control beneath, which invents one.',
  },
});

const CHOOSE_AN_ATTRIBUTE = createMessageError(messages.fieldRequired);

/**
 * What this stage adds, in the researcher's own words.
 *
 * Every sentence here that names what quick add creates says it with this
 * rather than with "someone": the interface adds whatever node type the stage
 * is about, and the repository's own development protocol uses it for a venue.
 * The codebook's name for the type is the only accurate word for it, and it is
 * the researcher's own — so it falls back to the type id rather than to a noun
 * this section chose.
 */
const useTypeName = (subject: CodebookSubject | undefined): string => {
  const protocolContext = useProtocolContext();
  if (subject === undefined || subject.entity === 'ego') return '';
  return (
    protocolContext.codebook[subject.entity]?.[subject.type]?.name ??
    subject.type
  );
};

/**
 * What a quick-add name generator records.
 *
 * The participant types one thing and a person exists, so exactly one
 * attribute receives it — which is why this is required rather than an
 * optional capability, and why the attribute must be text: there is one box,
 * and no room to ask for anything more.
 *
 * The attribute is a validated writer, so the pool excludes anything written
 * unvalidated elsewhere in the protocol: an export must not mix a checked
 * answer with a value some other stage stamped.
 */
export default function QuickAddSection() {
  const intl = useAppIntl();
  const { identity, storeApi } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const subject = useStageSubject('node');
  const typeName = useTypeName(subject);
  const committed = useStageValue(QUICK_ADD);
  const fillsIn = typeof committed === 'string' ? committed : undefined;

  const roleMap = useMemo(
    () => buildVariableRoleMap(protocolContext, identity.id),
    [identity.id, protocolContext],
  );

  const options = useMemo(() => {
    if (subject === undefined) return NO_OPTIONS;
    const pool = Object.entries(variablesForSubject(protocolContext, subject))
      .filter(([, variable]) => variable.type === QUICK_ADD_TYPE)
      .map(([value, variable]) => ({
        value,
        label: variable.name,
        type: variable.type,
      }));
    return excludeUnvalidatedUses(roleMap, subject, pool, fillsIn);
  }, [fillsIn, protocolContext, roleMap, subject]);

  // Answered as an outcome rather than by writing the picker itself: the
  // control owns the name box and what becomes of the name in it, and the
  // caller owns where the attribute goes. The refusal is kept and shown here,
  // because the picker is handed an outcome with no words of its own.
  const createVariable = useCreateCodebookVariable(subject);
  const answerLands = useWhereTheAnswerLands(subject, () => fillsIn);
  const [problem, setProblem] = useState<string | undefined>(undefined);

  const createQuickAddAttribute = useCallback(
    async (variableName: string): Promise<CreateOptionOutcome> => {
      if (subject === undefined) return { status: 'refused' };
      const asked = { subject, fillsIn };
      // Born required, as Architect creates it. What the participant types
      // into the quick-add box is the only thing they gave, so an attribute
      // invented for that box has to hold a value from the moment the node
      // exists — and the validation section below mounts open with the rule
      // switched on, where the researcher can take it off deliberately.
      const outcome = await createVariable({
        name: variableName,
        type: QUICK_ADD_TYPE,
        validation: QUICK_ADD_VALIDATION,
      });
      if (outcome.status === 'refused') {
        setProblem(outcome.message);
        return { status: 'refused' };
      }
      setProblem(undefined);
      // The codebook holds it either way. Selecting it is only right while
      // this section is still pointed where the create was asked from: a stage
      // repointed at another type would be left naming an attribute the new
      // type does not have, and a researcher who has chosen a different
      // attribute meanwhile has answered the very question this create was
      // going to answer.
      if (answerLands(asked) !== 'here') return { status: 'unassigned' };
      // Written into the form rather than dispatched, because the picker above
      // is a registered field and a command that went round it would be
      // overwritten by whatever the control still held when the stage saved.
      storeApi.getState().setFieldValue(QUICK_ADD, outcome.variableId);
      return { status: 'created' };
    },
    [answerLands, createVariable, fillsIn, storeApi, subject],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(
        subject === undefined
          ? messages.waitingDescription
          : messages.description,
        { typeName },
      )}
      disabled={subject === undefined}
    >
      <Field<typeof VariablePickerField>
        name={QUICK_ADD}
        component={VariablePickerField}
        label={intl.formatMessage(messages.fieldLabel)}
        hint={intl.formatMessage(messages.fieldHint)}
        options={options}
        emptyMessage={intl.formatMessage(messages.noTextAttribute)}
        onCreateOption={createQuickAddAttribute}
        required={CHOOSE_AN_ATTRIBUTE}
      />
      {problem !== undefined && (
        <Alert variant="destructive" className="my-7">
          <AlertDescription>
            {formatMessageError(problem, intl) ?? problem}
          </AlertDescription>
        </Alert>
      )}
      <CodebookVariableValidationSection
        subject={subject}
        variableId={fillsIn}
      />
    </BuilderSection>
  );
}
