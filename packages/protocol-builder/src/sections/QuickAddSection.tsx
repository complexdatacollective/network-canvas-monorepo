import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { v4 as uuid } from 'uuid';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { resolveFieldErrorTarget } from '@codaco/fresco-ui/form/utils/focusFirstError';

import { compoundFailureMessage } from '../codebook/compoundFailureCopy.ts';
import { buildUpdateVariableRequest } from '../codebook/editing.ts';
import { useCreateCodebookVariable } from '../codebook/useCodebookVariableEdits.ts';
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

const MISSING_TYPE =
  'This type is no longer in the codebook, so its attributes cannot be changed.';

const REFUSED_UNCHANGED =
  'This attribute could not be changed, so nothing was changed. Try again.';

const NOW_REQUIRED =
  'This attribute now has to be answered, everywhere the protocol uses it.';

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

/** The authoritative section document this subject's attributes live in. */
const codebookDocumentFor = (
  protocolContext: ProtocolBuilderProtocolContext,
  subject: CodebookSubject,
) =>
  subject.entity === 'ego'
    ? protocolContext.codebook.ego
    : protocolContext.codebook[subject.entity]?.[subject.type];

const VariablePicker = VariablePickerControl as ComponentType<
  Record<string, unknown>
>;

/**
 * The words this section says, in English until it is localised — at which
 * point each comment below becomes the `description` a translator reads.
 *
 * Nothing overrides them: a `copy` prop is a string a host hands in, which
 * extraction never sees and a translator therefore never gets
 * (`__tests__/hostCopyOverrides.test.ts`).
 */
const words = {
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: 'Quick add',
  description:
    'Choose the attribute the participant fills in when they add someone with a single box.',
  /** Said instead of `description` while the section is waiting on a subject. */
  waitingDescription:
    'Choose what this stage works with before setting up quick add.',
  fieldLabel: 'Attribute filled in',
  fieldHint:
    'What the participant types goes here. Use the attribute holding a person’s name unless you have a reason not to — the interview labels people by it.',
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
      title={words.sectionTitle}
      description={waiting ? words.waitingDescription : words.description}
      disabled={waiting}
    >
      <ProtocolField<typeof VariablePicker>
        name={QUICK_ADD}
        component={VariablePicker}
        label={words.fieldLabel}
        hint={words.fieldHint}
        options={options}
        emptyMessage="This type has no text attribute quick add could fill in. Create one below."
        required="Choose the attribute quick add fills in."
      />
      <QuickAddAnswerRequirement variableId={currentValue} />
      <NewQuickAddAttribute />
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
  const subject = useStageSubject('node');
  const { protocolContext } = useStageEditorForm();
  const requireAnswer = useRequireCodebookAnswer(subject);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // Which attribute this session made required, so the confirmation belongs to
  // the researcher's own act rather than appearing against every attribute
  // that happens to arrive already required.
  const [requiredHere, setRequiredHere] = useState<string | undefined>(
    undefined,
  );

  // Accepting destroys the control that was pressed — the offer is about an
  // attribute that can be left empty, and it no longer can — so focus goes to
  // the picker the offer was about. `resolveFieldErrorTarget` is the package's
  // one answer to "which control does this field name?", tiers and all; asking
  // it here rather than reaching for a selector keeps that answer in one place.
  // In an effect, so the field is asked for after the commit that removed the
  // button.
  useEffect(() => {
    if (requiredHere === undefined) return;
    resolveFieldErrorTarget(QUICK_ADD)?.focus();
  }, [requiredHere]);

  const variable =
    subject === undefined || variableId === undefined
      ? undefined
      : variablesForSubject(protocolContext, subject)[variableId];
  const alreadyRequired = validationOf(variable).required === true;

  // A dangling reference has its own message on the picker above, and a
  // requirement offered against an attribute that is not there would be a
  // second, worse explanation of the same thing.
  if (variable === undefined || variableId === undefined) return null;

  if (alreadyRequired) {
    // Said only to the researcher who just asked for it. Focus has moved to a
    // control that says nothing about what changed, so this is the whole of
    // what they are told — and `Alert`'s success variant carries `role=
    // "status"`, which is how it reaches a screen reader without interrupting.
    return requiredHere === variableId ? (
      <Alert variant="success" className="my-7">
        <AlertDescription>{NOW_REQUIRED}</AlertDescription>
      </Alert>
    ) : null;
  }

  const accept = async () => {
    setBusy(true);
    const outcome = await requireAnswer(variableId);
    setBusy(false);
    if (outcome.status === 'refused') {
      setProblem(outcome.message);
      return;
    }
    setProblem(undefined);
    setRequiredHere(variableId);
  };

  return (
    <Alert variant="warning" className="my-7">
      <AlertTitle>This attribute can be left empty</AlertTitle>
      <AlertDescription>
        <p className="m-0">
          What the participant types here is the only thing they gave, so a
          person added without it has no name. Requiring an answer changes the
          attribute everywhere the protocol uses it.
        </p>
        <Button
          // Never a submit: this control sits inside the stage's own form.
          type="button"
          className="mt-4"
          disabled={busy}
          onClick={() => void accept()}
        >
          Require an answer
        </Button>
        {problem !== undefined && <p className="mt-4 mb-0">{problem}</p>}
      </AlertDescription>
    </Alert>
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
        return { status: 'refused', message: MISSING_TYPE };
      }
      let request;
      try {
        request = buildUpdateVariableRequest({
          requestId: uuid(),
          description: 'Require an answer for the quick-add attribute',
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
              : REFUSED_UNCHANGED,
        };
      }

      const result = await controller.requestCompoundEdit(request);
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
 */
function NewQuickAddAttribute() {
  const { storeApi } = useStageEditorForm();
  const subject = useStageSubject('node');
  const createVariable = useCreateCodebookVariable(subject);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const create = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setProblem('Name the attribute quick add should fill in.');
      return;
    }
    setBusy(true);
    const outcome = await createVariable({
      name: trimmed,
      type: QUICK_ADD_TYPE,
      component: 'Text',
      validation: QUICK_ADD_VALIDATION,
    });
    setBusy(false);
    if (outcome.status === 'refused') {
      setProblem(outcome.message);
      return;
    }
    setProblem(undefined);
    setName('');
    // Written into the form rather than dispatched to the session: the picker
    // above is a registered field, and a command that went round it would be
    // overwritten by whatever the control still held when the stage saved.
    storeApi.getState().setFieldValue(QUICK_ADD, outcome.variableId);
  }, [createVariable, name, storeApi]);

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
        label="Create a new attribute"
        hint="Adds a text attribute to this type’s codebook and fills it in here."
        placeholder="name"
        value={name}
        onChange={(next: unknown) =>
          setName(typeof next === 'string' ? next : '')
        }
      />
      <Button type="button" onClick={() => void create()} disabled={busy}>
        Create the attribute
      </Button>
      {problem !== undefined && (
        <Alert variant="destructive" className="my-7">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
