import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { v4 as uuid } from 'uuid';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { resolveFieldErrorTarget } from '@codaco/fresco-ui/form/utils/focusFirstError';

import { compoundFailureMessage } from '../codebook/compoundFailureCopy.ts';
import { buildUpdateVariableRequest } from '../codebook/editing.ts';
import {
  useCreateCodebookVariable,
  useSubjectStillCollected,
} from '../codebook/useCodebookVariableEdits.ts';
import {
  buildVariableRoleMap,
  excludeUnvalidatedUses,
} from '../codebook/variableRoles.ts';
import {
  VariablePickerControl,
  type VariablePickerOption,
} from '../fields/VariablePicker.tsx';
import ProtocolField from '../form/ProtocolField.tsx';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { useStageValue } from '../form/stageFormHooks.ts';
import {
  type CodebookSubject,
  type ProtocolBuilderProtocolContext,
  variablesForSubject,
} from '../protocol-context.ts';
import BuilderSection from './BuilderSection.tsx';
import { useStageSubject } from './useStageSubject.ts';

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

const NO_OPTIONS: VariablePickerOption[] = [];

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
  missingType: {
    id: 'protocolBuilder.quickAdd.missingType',
    defaultMessage:
      'This type is no longer in the codebook, so its attributes cannot be changed.',
    description:
      'Refusal shown when the node type the stage works with has been deleted from the codebook — the protocol’s definition of what an interview records — while the researcher was editing.',
  },
  refusedUnchanged: {
    id: 'protocolBuilder.quickAdd.refusedUnchanged',
    defaultMessage:
      'This attribute could not be changed, so nothing was changed. Try again.',
    description:
      'Refusal shown when requiring an answer for the quick-add attribute failed for a reason with no explanation of its own.',
  },
  requireAnswerDescription: {
    id: 'protocolBuilder.quickAdd.requireAnswerDescription',
    defaultMessage: 'Require an answer for the quick-add attribute',
    description:
      'What the change is called in the record a host keeps of protocol edits, and in any undo history it offers.',
  },
  newAttributeLabel: {
    id: 'protocolBuilder.quickAdd.newAttributeLabel',
    defaultMessage: 'Create a new attribute',
    description:
      'Label of the box naming an attribute to add to the codebook for quick add to fill in.',
  },
  newAttributeHint: {
    id: 'protocolBuilder.quickAdd.newAttributeHint',
    defaultMessage:
      'Adds a text attribute to this type’s codebook and fills it in here.',
    description:
      'Guidance under the box naming a new quick-add attribute, saying that inventing one also selects it above.',
  },
  newAttributePlaceholder: {
    id: 'protocolBuilder.quickAdd.newAttributePlaceholder',
    defaultMessage: 'name',
    description:
      'Example shown in the empty box naming a new quick-add attribute. The attribute most studies want here is the one holding a person’s name, so the example is that word, lower case as an attribute name is written.',
  },
  createAttribute: {
    id: 'protocolBuilder.quickAdd.createAttribute',
    defaultMessage: 'Create the attribute',
    description:
      'Action that adds the named text attribute to the codebook and selects it for quick add.',
  },
  nameTheAttribute: {
    id: 'protocolBuilder.quickAdd.nameTheAttribute',
    defaultMessage: 'Name the attribute quick add should fill in.',
    description:
      'Refusal shown when a researcher asks to create a quick-add attribute without typing a name for it.',
  },
  createdNotSelected: {
    id: 'protocolBuilder.quickAdd.createdNotSelected',
    defaultMessage:
      '“{variableName}” was added to the codebook. You have chosen a different attribute here since you asked for it, so it has not been selected.',
    description:
      'Notice shown when an attribute the researcher asked for was added to the codebook — the protocol’s definition of what an interview records — but they chose a different attribute for quick add to fill in while it was being added, so the newer choice is left standing. variableName is the name they typed and is not translated.',
  },
  nowRequiredElsewhere: {
    id: 'protocolBuilder.quickAdd.nowRequiredElsewhere',
    defaultMessage:
      '“{variableName}” now has to be answered, everywhere the protocol uses it. It is not the attribute this stage fills in any more.',
    description:
      'Confirmation shown to a researcher who asked for the quick-add attribute to be required, when the stage moved off that attribute while the change was being made — they chose a different node type, or a different attribute. The change was still made, so it is said rather than swallowed. variableName is the attribute’s own name and is not translated.',
  },
  createdOnAnotherType: {
    id: 'protocolBuilder.quickAdd.createdOnAnotherType',
    defaultMessage:
      '“{variableName}” was added to the type this stage was about when you asked for it. This stage is about a different type now, so it has not been selected here.',
    description:
      'Notice shown when an attribute the researcher asked for was added to the codebook — the protocol’s definition of what an interview records — but the node type the stage works with was changed while it was being added, so the new attribute belongs to the old type and nothing here uses it. variableName is the name they typed and is not translated.',
  },
});

const CHOOSE_AN_ATTRIBUTE = createMessageError(messages.fieldRequired);

/** Nothing left to ask for, or nothing was written — either way, carry on. */
type RequireAnswerOutcome =
  | Readonly<{ status: 'required' }>
  | Readonly<{ status: 'refused'; message: string }>;

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
const typeNameOf = (
  protocolContext: ProtocolBuilderProtocolContext,
  subject: CodebookSubject,
): string => {
  // Read off the node or edge definition rather than through the shared
  // subject reader, because ego has no name to read and the union says so.
  const definition =
    subject.entity === 'ego'
      ? undefined
      : protocolContext.codebook[subject.entity]?.[subject.type];
  return definition?.name ?? subjectType(subject) ?? '';
};

/**
 * The node or edge type a subject names, for comparing one reading of the
 * stage's subject against a later one. Ego has no type and this section never
 * sees one.
 */
const subjectType = (
  subject: CodebookSubject | undefined,
): string | undefined =>
  subject === undefined || subject.entity === 'ego' ? undefined : subject.type;

/** The authoritative section document this subject's attributes live in. */
const codebookDocumentFor = (
  protocolContext: ProtocolBuilderProtocolContext,
  subject: CodebookSubject,
) =>
  subject.entity === 'ego'
    ? protocolContext.codebook.ego
    : protocolContext.codebook[subject.entity]?.[subject.type];

/**
 * What this section was pointed at when a codebook round trip was asked for.
 *
 * Both writes this section makes are answered by the host after a delay the
 * researcher can act inside — the attribute picker stays live while an answer
 * is on its way, and so does the type picker above it — and both then apply
 * their answer to that picker: one selects the attribute it created, the other
 * says the attribute the picker names now has to be answered.
 */
type QuickAddTarget = Readonly<{
  subject: CodebookSubject;
  /** The attribute the stage filled in when the request went out. */
  fillsIn: string | undefined;
}>;

/** Where a round trip's answer belongs by the time it arrives. */
type AnswerLands = 'here' | 'onAnotherType' | 'besideAnotherAttribute';

/**
 * The one reading of "does this answer still belong where it was asked from?",
 * written once because it is asked twice: when an answer ARRIVES, to decide
 * what to do with it, and on every render afterwards, to decide whether what
 * was said about it is still true of the draft on screen.
 */
const answerLandsIn = (
  subjectStillCollected: boolean,
  fillsInNow: string | undefined,
  fillsInWhenAsked: string | undefined,
): AnswerLands => {
  if (!subjectStillCollected) return 'onAnotherType';
  return fillsInNow === fillsInWhenAsked ? 'here' : 'besideAnotherAttribute';
};

/**
 * Reads, when a round trip ANSWERS, whether it still belongs where it was
 * asked from.
 *
 * The write itself is never undone: it landed in the codebook of the type the
 * request named, which is the type the stage was about when the researcher
 * asked for it. Only what happens HERE is in question, and there are two ways
 * to get it wrong — an answer written into a picker the researcher has since
 * re-answered replaces a newer, deliberate choice with an older one, and an
 * answer that finds the section moved on and says nothing leaves a change to
 * the whole protocol that nobody was told about.
 *
 * A getter over refs rather than values, because the answer is needed AFTER an
 * await, inside a closure made before it: read as values they would be what
 * the section held when the button was pressed, which is the one thing already
 * known. `useSubjectStillCollected` is the package's own reading of the first
 * half; the second asks the same question of the field the answer would be
 * written into.
 */
function useWhereTheAnswerLands(
  subject: CodebookSubject | undefined,
  fillsIn: string | undefined,
): (asked: QuickAddTarget) => AnswerLands {
  const subjectStillCollected = useSubjectStillCollected(subject);
  const live = useRef(fillsIn);
  live.current = fillsIn;
  return useCallback(
    (asked) =>
      answerLandsIn(
        subjectStillCollected(asked.subject),
        live.current,
        asked.fillsIn,
      ),
    [subjectStillCollected],
  );
}

/**
 * A codebook write this section made, and what it has left to say about it.
 *
 * Both notices this section shows are about a write that LANDED and was not
 * applied where it was asked from — an attribute created while the researcher
 * was choosing another one, a rule added to an attribute the stage has since
 * moved off. Each names the attribute it is about, under the name it had when
 * it was asked about, because the picker is about something else now.
 */
type LandedAnswer = Readonly<{
  /** The subject the request was addressed to. */
  subject: CodebookSubject;
  /** The attribute the answer is about. */
  variableId: string;
  /** Its name when it was asked about, which is what the notice says. */
  variableName: string;
  /** Where the answer belonged at the moment it arrived. */
  landedAs: AnswerLands;
}>;

/**
 * What this section still has to say about an answer that has landed, read
 * against the draft on screen rather than against the one it was asked from.
 *
 * Held rather than derived from scratch, because the sentence names something
 * the row no longer does. Re-read rather than merely held, because a sentence
 * about where an answer went stops being true the moment the researcher moves
 * the row: told that an attribute "is not the attribute this stage fills in
 * any more", they select it, and the notice went on saying so against a picker
 * showing that very attribute.
 *
 * Forgotten the first time that reading CHANGES, rather than re-worded. A
 * researcher who has moved the row since the answer landed has answered the
 * question the notice asked — the created attribute is selected, the required
 * one is filled in again, the type is back — and this section has nothing left
 * to add. It is also what stops a notice from RETURNING: re-worded, a row
 * moved off the created attribute a second time would raise the same "not
 * selected" sentence about a choice the researcher had already made twice.
 */
function useLandedAnswer(
  subject: CodebookSubject | undefined,
  fillsIn: string | undefined,
): Readonly<{
  /** The answer whose notice is still true, or nothing. */
  standing: LandedAnswer | undefined;
  record: (answer: LandedAnswer) => void;
  forget: () => void;
}> {
  const subjectStillCollected = useSubjectStillCollected(subject);
  const [landed, setLanded] = useState<LandedAnswer | undefined>(undefined);
  const moved =
    landed !== undefined &&
    answerLandsIn(
      subjectStillCollected(landed.subject),
      fillsIn,
      // The row named the attribute the answer is about exactly when the
      // answer belongs `here`, whichever write asked for it: the create's
      // answer IS its variable id, and the require's was asked about it.
      landed.variableId,
    ) !== landed.landedAs;
  const forget = useCallback(() => {
    setLanded(undefined);
  }, []);
  // Dropped for good rather than only hidden, so nothing can raise it again.
  // The reading above is what the render below is guarded by, so no stale
  // sentence is drawn in the frame before this runs.
  useEffect(() => {
    if (moved) forget();
  }, [forget, moved]);
  const record = useCallback((answer: LandedAnswer) => {
    setLanded(answer);
  }, []);
  return { standing: moved ? undefined : landed, record, forget };
}

const VariablePicker = VariablePickerControl as ComponentType<
  Record<string, unknown>
>;

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
  const { protocolContext, identity } = useStageEditorForm();
  const subject = useStageSubject('node');
  const waiting = subject === undefined;
  const committed = useStageValue(QUICK_ADD);
  const currentValue = typeof committed === 'string' ? committed : undefined;

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
    return excludeUnvalidatedUses(roleMap, subject, pool, currentValue);
  }, [currentValue, protocolContext, roleMap, subject]);

  return (
    <BuilderSection
      title={intl.formatMessage(messages.title)}
      description={
        subject === undefined
          ? intl.formatMessage(messages.waitingDescription)
          : intl.formatMessage(messages.description, {
              typeName: typeNameOf(protocolContext, subject),
            })
      }
      disabled={waiting}
    >
      <ProtocolField<typeof VariablePicker>
        name={QUICK_ADD}
        component={VariablePicker}
        label={intl.formatMessage(messages.fieldLabel)}
        hint={intl.formatMessage(messages.fieldHint)}
        options={options}
        emptyMessage={intl.formatMessage(messages.noTextAttribute)}
        required={CHOOSE_AN_ATTRIBUTE}
      />
      <QuickAddAnswerRequirement variableId={currentValue} />
      <NewQuickAddAttribute fillsIn={currentValue} />
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
 * the protocol uses it, so adding one is the researcher's decision. (The whole
 * editor is a `<form>` of its own — see `CodebookVariableValidationEditor` —
 * and every section here already renders inside the stage's form, so it cannot
 * be mounted where Architect mounts it. Its rules for one attribute are edited
 * from the codebook surface, which is where that form has a page of its own.)
 */
function QuickAddAnswerRequirement({
  variableId,
}: Readonly<{ variableId: string | undefined }>) {
  const intl = useAppIntl();
  const subject = useStageSubject('node');
  const { protocolContext } = useStageEditorForm();
  const requireAnswer = useRequireCodebookAnswer(subject);
  const answerLands = useWhereTheAnswerLands(subject, variableId);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  /**
   * The requirement this session added, for as long as this section has
   * anything to say about it.
   *
   * Held rather than read off the codebook, so the confirmation belongs to the
   * researcher's own act rather than appearing against every attribute that
   * happens to arrive already required — and re-read against the picker on
   * every render, so which of the two things it says is decided by where the
   * attribute stands now.
   */
  const { standing, record } = useLandedAnswer(subject, variableId);

  // Accepting destroys the control that was pressed — the offer is about an
  // attribute that can be left empty, and it no longer can — so focus goes to
  // the picker the offer was about. `resolveFieldErrorTarget` is the package's
  // one answer to "which control does this field name?", tiers and all; asking
  // it here rather than reaching for a selector keeps that answer in one place.
  // In an effect, so the field is asked for after the commit that removed the
  // button. Only where the answer landed here: a researcher who has moved the
  // picker on has chosen where they are, and taking focus back to it would
  // undo their own gesture. Once per answer, because a record is a new object
  // and a researcher returning to the attribute later forgets it rather than
  // re-recording it.
  useEffect(() => {
    if (standing?.landedAs !== 'here') return;
    resolveFieldErrorTarget(QUICK_ADD)?.focus();
  }, [standing]);

  const variable =
    subject === undefined || variableId === undefined
      ? undefined
      : variablesForSubject(protocolContext, subject)[variableId];
  const alreadyRequired = validationOf(variable).required === true;

  const accept = async () => {
    if (subject === undefined || variable === undefined) return;
    if (variableId === undefined) return;
    const asked: QuickAddTarget = { subject, fillsIn: variableId };
    const variableName = variable.name;
    setBusy(true);
    try {
      const outcome = await requireAnswer(variableId);
      if (outcome.status === 'refused') {
        setProblem(outcome.message);
        return;
      }
      setProblem(undefined);
      // The rule was added to the attribute the request named, wherever this
      // stage has got to since. Recorded against the name it was asked about,
      // because the picker may be about something else now — and read back
      // against the picker on every render from here, because the researcher
      // may come back to it.
      record({
        subject,
        variableId,
        variableName,
        landedAs: answerLands(asked),
      });
    } finally {
      // In a `finally` because the button is disabled while this is true: an
      // offer that ended in a throw would otherwise leave the researcher
      // looking at a control that never comes back, with no way to try again.
      // Same guard, and the same reason, as `CreatableVariablePickerControl`.
      setBusy(false);
    }
  };

  /**
   * What this session has to say about a requirement it added, or nothing.
   *
   * The in-place confirmation is said only to the researcher who just asked
   * for it, and only once the codebook shows it — it must not appear against
   * every attribute that happens to arrive already required. The elsewhere
   * confirmation is not gated the same way: it is about an attribute this
   * picker is not showing, so the codebook cannot be read for it here.
   */
  const said =
    standing === undefined
      ? undefined
      : standing.landedAs === 'here'
        ? alreadyRequired
          ? intl.formatMessage(messages.nowRequired)
          : undefined
        : intl.formatMessage(messages.nowRequiredElsewhere, {
            variableName: standing.variableName,
          });

  return (
    <>
      {/* A dangling reference has its own message on the picker above, and a
          requirement offered against an attribute that is not there would be a
          second, worse explanation of the same thing. With no type chosen
          there is no attribute to be offered anything about either. Written
          inline so the offer's own sentence can name the type it is about. */}
      {subject !== undefined && variable !== undefined && !alreadyRequired && (
        <Alert variant="warning" className="my-7">
          <AlertTitle>
            {intl.formatMessage(messages.canBeEmptyTitle)}
          </AlertTitle>
          <AlertDescription>
            <p className="m-0">
              {intl.formatMessage(messages.canBeEmptyDescription, {
                typeName: typeNameOf(protocolContext, subject),
              })}
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
          presentational for the same reason `NewQuickAddAttribute`'s is: its
          success variant is a `role="status"` of its own, and a second polite
          region inserted into this one is the double announcement the wrapper
          exists to avoid. */}
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
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
    </>
  );
}

/**
 * Adds "must be answered" to an attribute's own rules, as a compound edit.
 *
 * The rules belong to the codebook variable rather than to the stage that
 * references it, so this is a codebook write asked for from a stage editor —
 * the same compound route as inventing an attribute, and for the same reason.
 * The attribute's other rules are carried through: this adds a requirement, it
 * does not replace the researcher's rules with the one the role needs.
 */
function useRequireCodebookAnswer(subject: CodebookSubject | undefined) {
  const { controller, protocolContext } = useStageEditorForm();
  const intl = useAppIntl();

  return useCallback(
    async (variableId: string): Promise<RequireAnswerOutcome> => {
      const definition =
        subject === undefined
          ? undefined
          : codebookDocumentFor(protocolContext, subject);
      if (subject === undefined || definition === undefined) {
        return {
          status: 'refused',
          message: intl.formatMessage(messages.missingType),
        };
      }
      let request;
      try {
        request = buildUpdateVariableRequest({
          requestId: uuid(),
          description: intl.formatMessage(messages.requireAnswerDescription),
          subject,
          authoritativeDocument: { ...definition },
          variableId,
          draft: {
            // The attribute's other rules are carried through: this ADDS the
            // one the role needs, it does not replace the researcher's.
            validation: {
              ...validationOf(
                variablesForSubject(protocolContext, subject)[variableId],
              ),
              ...QUICK_ADD_VALIDATION,
            },
          },
          replaceProperties: ['validation'],
        });
      } catch (error: unknown) {
        return {
          status: 'refused',
          message:
            error instanceof Error && error.message !== ''
              ? error.message
              : intl.formatMessage(messages.refusedUnchanged),
        };
      }

      // Awaited inside a `try` for the reason `useCreateCodebookVariable`
      // gives: a session that has stopped accepting changes refuses the
      // request by throwing rather than answering, and this hook promises an
      // outcome. A rejection escaping it left the caller marked busy for good.
      let result;
      try {
        result = await controller.requestCompoundEdit(request);
      } catch {
        return {
          status: 'refused',
          message: intl.formatMessage(messages.refusedUnchanged),
        };
      }
      return result.status === 'applied'
        ? { status: 'required' }
        : {
            status: 'refused',
            message: compoundFailureMessage({ kind: 'result', result }, intl),
          };
    },
    [controller, intl, protocolContext, subject],
  );
}

/**
 * Adds a text attribute for quick add to fill in, and selects it.
 *
 * Beside the picker rather than inside it: the picker is a shared control that
 * chooses from what exists, and creating a codebook attribute is a different,
 * compound edit — the codebook write and the stage that references it must land
 * together or not at all. Selecting the result is the point: a researcher who
 * has just said what they want it called should not then have to find it.
 *
 * Selected only if the section is still pointed where the create was asked
 * from. A compound edit is a round trip to the host, and the researcher can
 * act inside it — that is `useWhereTheAnswerLands`, which both of this
 * section's writes read. Changing the node type leaves the attribute on the
 * type the request named, so filling the picker in with it afterwards left
 * `quickAdd` naming an attribute the new type does not have: a reference that
 * cannot be saved. Choosing a different attribute in the picker is a newer,
 * deliberate answer to the very question this create was going to answer, and
 * overwriting it replaced what the researcher chose with what they had asked
 * for a moment earlier. Either way the attribute exists, so where it went is
 * reported rather than done.
 */
function NewQuickAddAttribute({
  fillsIn,
}: Readonly<{ fillsIn: string | undefined }>) {
  const intl = useAppIntl();
  const { storeApi } = useStageEditorForm();
  const subject = useStageSubject('node');
  const createVariable = useCreateCodebookVariable(subject);
  const answerLands = useWhereTheAnswerLands(subject, fillsIn);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  /**
   * The attribute that was created and then not selected, held for as long as
   * the notice about it is true of the picker.
   *
   * The submitted name rather than whatever the box holds now: the notice is
   * about the attribute that was created, and the box is empty by the time it
   * appears. Same shape as `CreatableVariablePickerControl`'s
   * "created but not selected" notice, which answers the same question.
   */
  const { standing, record, forget } = useLandedAnswer(subject, fillsIn);

  const create = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setProblem(intl.formatMessage(messages.nameTheAttribute));
      return;
    }
    // Nothing below this component is rendered without a subject, and the
    // create the hook makes refuses one anyway — so this is the shape of that
    // fact rather than a case. Read before the await and compared after it:
    // `answerLands` holds the section's own reading of both halves, and the
    // notice is anchored to the same subject.
    if (subject === undefined) return;
    const asked: QuickAddTarget = { subject, fillsIn };
    setBusy(true);
    try {
      const outcome = await createVariable({
        name: trimmed,
        type: QUICK_ADD_TYPE,
        component: 'Text',
        validation: QUICK_ADD_VALIDATION,
      });
      if (outcome.status === 'refused') {
        setProblem(outcome.message);
        return;
      }
      setProblem(undefined);
      // The codebook holds it now, whatever becomes of it here, and asking for
      // the same name a second time is refused for a duplicate the researcher
      // did not choose to ask for — so the box empties on both answers below.
      setName('');
      const lands = answerLands(asked);
      if (lands !== 'here') {
        record({
          subject,
          variableId: outcome.variableId,
          variableName: trimmed,
          landedAs: lands,
        });
        return;
      }
      forget();
      // Written into the form rather than dispatched to the session: the
      // picker above is a registered field, and a command that went round it
      // would be overwritten by whatever the control still held when the
      // stage saved.
      storeApi.getState().setFieldValue(QUICK_ADD, outcome.variableId);
    } finally {
      // In a `finally` because the button is disabled while this is true: a
      // create that ended in a throw would otherwise leave the researcher
      // looking at a Create button that never comes back, with no way to try
      // again. Same guard, and the same reason, as
      // `CreatableVariablePickerControl`.
      setBusy(false);
    }
  }, [
    answerLands,
    createVariable,
    fillsIn,
    forget,
    intl,
    name,
    record,
    storeApi,
    subject,
  ]);

  /**
   * What this section still has to say about the attribute it created, or
   * nothing. `here` is the case where it IS selected, and the picker showing
   * it says that better than a sentence could.
   */
  const said =
    standing === undefined || standing.landedAs === 'here'
      ? undefined
      : intl.formatMessage(
          standing.landedAs === 'onAnotherType'
            ? messages.createdOnAnotherType
            : messages.createdNotSelected,
          { variableName: standing.variableName },
        );

  if (subject === undefined) return null;

  return (
    <>
      {/*
        Unconnected on purpose: this box is not part of the stage. It names an
        attribute to add to the codebook, and what the stage saves is the id
        the codebook hands back — a registered field would put the typed name
        into the stage document.
      */}
      <UnconnectedField<typeof InputField>
        name="newQuickAddAttribute"
        component={InputField}
        label={intl.formatMessage(messages.newAttributeLabel)}
        hint={intl.formatMessage(messages.newAttributeHint)}
        placeholder={intl.formatMessage(messages.newAttributePlaceholder)}
        value={name}
        // Held with the button while the write is in flight. The create
        // submits the name as it was when it was pressed, so a name typed
        // while the answer was on its way was erased by a success and
        // contradicted by a refusal — every sentence here is about the
        // submitted name, and held, the box is always exactly what the answer
        // is about. `CreatableVariablePickerControl` holds its own for the
        // same reason.
        disabled={busy}
        // Enter here means "create the attribute", and it has to be said so.
        // This box is inside the stage's own `<form>`, whose default button is
        // the host's Save — associated by `form=` and therefore the form's
        // default button wherever the host renders it — so the browser's
        // implicit submission saved and closed the editor instead, creating
        // nothing and taking the typed name with it.
        onKeyDown={(event) => {
          // A key pressed to compose a character is not a key press.
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          event.preventDefault();
          void create();
        }}
        onChange={(next: unknown) => {
          // The notice is about the create that has just happened; naming
          // another attribute is the start of a different one.
          forget();
          setName(typeof next === 'string' ? next : '');
        }}
      />
      <Button type="button" onClick={() => void create()} disabled={busy}>
        {intl.formatMessage(messages.createAttribute)}
      </Button>
      {/* Always mounted, so a screen reader is watching this region before the
          notice appears: a live region added to the page at the same moment as
          its own content is not reliably announced. The `Alert` inside it is
          presentational for the same reason — its `info` variant is a
          `role="status"` of its own, and a second polite region inserted into
          this one is the double announcement this wrapper exists to avoid. */}
      <div role="status" aria-live="polite">
        {said !== undefined && (
          <Alert variant="info" role="presentation" className="my-7">
            <AlertDescription>{said}</AlertDescription>
          </Alert>
        )}
      </div>
      {problem !== undefined && (
        <Alert variant="destructive" className="my-7">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
