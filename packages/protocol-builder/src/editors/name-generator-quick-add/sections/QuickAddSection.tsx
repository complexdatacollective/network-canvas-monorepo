import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createMessageError,
  defineMessages,
  formatMessageError,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { resolveFieldErrorTarget } from '@codaco/fresco-ui/form/utils/focusFirstError';

import { documentWithUpdatedVariable } from '../../../codebook/editing.ts';
import {
  type AnswerLands,
  useCreateCodebookVariable,
  useWhereTheAnswerLands,
} from '../../../codebook/useCodebookVariableEdits.ts';
import {
  buildVariableRoleMap,
  excludeUnvalidatedUses,
} from '../../../codebook/variableRoles.ts';
import { useCodebookSectionWrite } from '../../../codebook/writes.ts';
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
    defaultMessage: 'Quick add configuration',
    description:
      'Heading of the section choosing which attribute a participant fills in when they add a network member with a single box. An attribute is one field the protocol records about that member, which may be a person, an organisation, a place, or anything else the study is about.',
  },
  description: {
    id: 'protocolBuilder.quickAdd.description',
    defaultMessage:
      'Choose the attribute populated when a participant creates a node with Quick Add.',
    description:
      'Description of the quick-add section. "Quick Add" is the name of the button a participant uses.',
  },
  waitingDescription: {
    id: 'protocolBuilder.quickAdd.waitingDescription',
    defaultMessage: 'Select a node type above to configure this section.',
    description:
      'Shown in place of the quick-add section’s description while the researcher has not yet chosen which node type the stage is about, so there are no attributes to choose from. The node type is chosen in the section above this one.',
  },
  fieldLabel: {
    id: 'protocolBuilder.quickAdd.fieldLabel',
    defaultMessage: 'Select an attribute',
    description:
      'Label of the control choosing which attribute receives what the participant types into the quick-add box.',
  },
  fieldHint: {
    id: 'protocolBuilder.quickAdd.fieldHint',
    defaultMessage:
      "Select the attribute that is assigned a value when creating a new node using the Quick Add button. Use an attribute called 'name' here, unless you have a good reason not to. Interviewer will then automatically use this attribute as the label for the node in the interview.",
    description:
      'Guidance under the quick-add attribute control. "Quick Add" is the name of the button a participant uses, "Interviewer" is the name of the app that runs an interview, and the quoted attribute name is a protocol identifier: none of the three is translated.',
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
  canBeEmptyTitle: {
    id: 'protocolBuilder.quickAdd.canBeEmptyTitle',
    defaultMessage: 'This attribute can be left empty',
    description:
      'Warning heading shown when the attribute quick add fills in does not have to be answered, so a network member could be created with no name.',
  },
  canBeEmptyDescription: {
    id: 'protocolBuilder.quickAdd.canBeEmptyDescription',
    defaultMessage:
      'What the participant types here is the only thing they gave, so a “{typeName}” added without it has no name. Requiring an answer changes the attribute everywhere the protocol uses it.',
    description:
      'Warning body offering to make the quick-add attribute one that has to be answered, and saying that the change reaches every other stage using the same attribute. typeName is the researcher’s own name for the node type this stage adds and is not translated.',
  },
  requireAnswer: {
    id: 'protocolBuilder.quickAdd.requireAnswer',
    defaultMessage: 'Require an answer',
    description:
      'Action that adds "must be answered" to the rules of the attribute quick add fills in.',
  },
  nowRequired: {
    id: 'protocolBuilder.quickAdd.nowRequired',
    defaultMessage:
      'This attribute now has to be answered, everywhere the protocol uses it.',
    description:
      'Confirmation shown to the researcher who just asked for the quick-add attribute to be required, because focus has moved to a control that says nothing about what changed.',
  },
  nowRequiredElsewhere: {
    id: 'protocolBuilder.quickAdd.nowRequiredElsewhere',
    defaultMessage:
      '“{variableName}” now has to be answered, everywhere the protocol uses it. It is not the attribute this stage fills in any more.',
    description:
      'Confirmation shown to a researcher who asked for the quick-add attribute to be required, when the stage moved off that attribute while the change was being made — they chose a different node type, or a different attribute. The change was still made, so it is said rather than swallowed. variableName is the attribute’s own name and is not translated.',
  },
});

const CHOOSE_AN_ATTRIBUTE = createMessageError(messages.fieldRequired);

/**
 * An attribute's own rules, read structurally.
 *
 * The codebook's variable union has no `validation` on the shapes that cannot
 * carry one — layout and location — and quick add can only ever have chosen a
 * text attribute, but the union is what the context hands back.
 */
const validationOf = (variable: unknown): Record<string, unknown> => {
  if (typeof variable !== 'object' || variable === null) return {};
  const validation = Reflect.get(variable, 'validation');
  return typeof validation === 'object' && validation !== null
    ? (validation as Record<string, unknown>)
    : {};
};

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
      // The attribute and nothing else. What quick add needs of it — that an
      // answer is required — is a rule about the attribute, and the section
      // offers it below rather than writing it here: an attribute created from
      // this stage belongs to the codebook, is read by every other stage that
      // uses it, and a rule nobody asked for is content in the protocol the
      // researcher did not write.
      const outcome = await createVariable({
        name: variableName,
        type: QUICK_ADD_TYPE,
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
      <QuickAddAnswerRequirement
        subject={subject}
        typeName={typeName}
        variableId={fillsIn}
      />
    </BuilderSection>
  );
}

/**
 * Whether the chosen attribute has to be answered, and an offer to make it so.
 *
 * Architect renders the attribute's whole validation editor beneath this
 * picker (`sections/QuickAdd/QuickAdd.tsx`), because quick add's bargain is
 * that the attribute's own rules are honoured while the participant types.
 * Only one of those rules belongs to the ROLE rather than to the researcher's
 * study: the answer has to exist. It is the only thing the participant gave,
 * and a node created without it has no name at all — so an attribute quick add
 * created carries it from the start, and an existing one chosen here is asked
 * about.
 *
 * Stated and offered rather than done silently, and rather than the full
 * editor: the rule is the attribute's, and the attribute is used wherever else
 * the protocol uses it, so adding one is the researcher's decision. Its other
 * rules are edited from the codebook surface, which is where that editor has a
 * page of its own.
 */
function QuickAddAnswerRequirement({
  subject,
  typeName,
  variableId,
}: Readonly<{
  subject: CodebookSubject | undefined;
  typeName: string;
  variableId: string | undefined;
}>) {
  const intl = useAppIntl();
  const protocolContext = useProtocolContext();
  const requireAnswer = useRequireCodebookAnswer();
  const answerLands = useWhereTheAnswerLands(subject, () => variableId);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  /**
   * The requirement this session added, and the name the attribute had when it
   * was asked about — which is what the sentence names, because the picker may
   * be about something else by the time it is read.
   */
  const [added, setAdded] = useState<
    Readonly<{
      variableId: string;
      variableName: string;
      landedAs: AnswerLands;
    }>
  >();

  // Accepting destroys the control that was pressed — the offer is about an
  // attribute that can be left empty, and it no longer can — so focus goes to
  // the picker the offer was about, which otherwise falls to `<body>` with
  // nothing said. `resolveFieldErrorTarget` is the package's one answer to
  // "which control does this field name?", tiers and all; asking it here rather
  // than reaching for a selector keeps that answer in one place. In an effect,
  // so the field is asked for after the commit that removed the button, and
  // only where the answer landed here: a researcher who has moved the picker on
  // has chosen where they are, and taking focus back would undo their gesture.
  useEffect(() => {
    if (added?.landedAs !== 'here') return;
    resolveFieldErrorTarget(QUICK_ADD)?.focus();
  }, [added]);

  const variable =
    subject === undefined || variableId === undefined
      ? undefined
      : variablesForSubject(protocolContext, subject)[variableId];
  const alreadyRequired = validationOf(variable).required === true;

  const accept = async () => {
    if (subject === undefined || variable === undefined) return;
    if (variableId === undefined) return;
    const asked = { subject, fillsIn: variableId };
    const variableName = variable.name;
    setBusy(true);
    try {
      const outcome = await requireAnswer(subject, variableId);
      if (outcome.status === 'refused') {
        setProblem(outcome.message);
        return;
      }
      setProblem(undefined);
      setAdded({ variableId, variableName, landedAs: answerLands(asked) });
    } finally {
      // In a `finally` because the button is disabled while this is true: an
      // offer that ended in a throw would otherwise leave the researcher
      // looking at a control that never comes back, with no way to try again.
      setBusy(false);
    }
  };

  /**
   * What this session still has to say about a requirement it added, read
   * against the picker as it stands now rather than as it stood when the
   * answer was asked for.
   *
   * Each sentence is true of exactly one reading, and stops being said the
   * moment that reading changes: the in-place confirmation while the picker
   * still holds the attribute and the codebook shows the rule, the elsewhere
   * confirmation while it holds something else. A researcher who has moved the
   * picker since has answered the question the notice asked.
   */
  const said =
    added === undefined
      ? undefined
      : added.landedAs === 'here'
        ? variableId === added.variableId && alreadyRequired
          ? intl.formatMessage(messages.nowRequired)
          : undefined
        : variableId === added.variableId
          ? undefined
          : intl.formatMessage(messages.nowRequiredElsewhere, {
              variableName: added.variableName,
            });

  return (
    <>
      {/* A dangling reference has its own message on the picker above, and a
          requirement offered against an attribute that is not there would be a
          second, worse explanation of the same thing. With no type chosen
          there is no attribute to be offered anything about either. */}
      {subject !== undefined && variable !== undefined && !alreadyRequired && (
        <Alert variant="warning" className="my-7">
          <AlertTitle>
            {intl.formatMessage(messages.canBeEmptyTitle)}
          </AlertTitle>
          <AlertDescription>
            <p className="m-0">
              {intl.formatMessage(messages.canBeEmptyDescription, { typeName })}
            </p>
            <Button
              // Never a submit: this control sits inside the stage's own form.
              type="button"
              className="mt-4"
              disabled={busy}
              onClick={() => void accept()}
            >
              {intl.formatMessage(messages.requireAnswer)}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {/* Always mounted, so a screen reader is watching this region before
          anything appears in it: a live region added to the page at the same
          moment as its own content is not reliably announced — and accepting
          the offer destroys the control that was pressed, so this sentence is
          the whole of what the researcher is told. The `Alert` inside it is
          presentational because its success variant is a `role="status"` of
          its own, and a second polite region inserted into this one is the
          double announcement the wrapper exists to avoid. */}
      <div role="status" aria-live="polite">
        {said !== undefined && (
          <Alert variant="success" role="presentation" className="my-7">
            <AlertDescription>{said}</AlertDescription>
          </Alert>
        )}
      </div>
      {/* Outside the offer rather than inside it. The offer is about an
          attribute that can be left empty, so a collaborator deleting that
          attribute while the write was in flight took the warning away — and
          the refusal that arrived a moment later went with it, leaving a
          researcher who had pressed a button with no account of what
          happened. */}
      {problem !== undefined && (
        <Alert variant="destructive" className="my-7">
          <AlertDescription>
            {formatMessageError(problem, intl) ?? problem}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}

/** Nothing left to ask for, or nothing was written — either way, carry on. */
type RequireAnswerOutcome =
  | Readonly<{ status: 'required' }>
  | Readonly<{ status: 'refused'; message: string }>;

/**
 * Adds "must be answered" to an attribute's own rules.
 *
 * The rules belong to the codebook variable rather than to the stage that
 * references it, so this is a codebook write asked for from a stage editor —
 * the same route as inventing an attribute, under the codebook section's own
 * lock, committing before the stage does. The attribute's other rules are
 * carried through: this ADDS a requirement, it does not replace the
 * researcher's rules with the one the role needs.
 */
function useRequireCodebookAnswer() {
  const write = useCodebookSectionWrite();

  return useCallback(
    async (
      subject: CodebookSubject,
      variableId: string,
    ): Promise<RequireAnswerOutcome> => {
      const outcome = await write(subject, (authoritativeDocument) => {
        const variables = authoritativeDocument.variables;
        const current =
          typeof variables === 'object' && variables !== null
            ? Reflect.get(variables, variableId)
            : undefined;
        return documentWithUpdatedVariable({
          subject,
          authoritativeDocument,
          variableId,
          draft: {
            // Laid over the rules the AUTHORITATIVE document holds rather than
            // the ones this editor read when it opened, so a rule a
            // collaborator added while the researcher was deciding is kept.
            validation: { ...validationOf(current), ...QUICK_ADD_VALIDATION },
          },
          replaceProperties: ['validation'],
        });
      });
      return outcome.status === 'applied'
        ? { status: 'required' }
        : { status: 'refused', message: outcome.message };
    },
    [write],
  );
}
