import { type ComponentType, useCallback, useMemo, useState } from 'react';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

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
import { variablesForSubject } from '../protocol-context.ts';
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

const VariablePicker = VariablePickerControl as ComponentType<
  Record<string, unknown>
>;

export type QuickAddCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  /** Said instead of `description` while the section is waiting on a subject. */
  waitingDescription: string;
  fieldLabel: string;
  fieldHint: string;
}>;

const DEFAULT_COPY: QuickAddCopy = {
  sectionTitle: 'Quick add',
  description:
    'Choose the attribute the participant fills in when they add someone with a single box.',
  waitingDescription:
    'Choose what this stage works with before setting up quick add.',
  fieldLabel: 'Attribute filled in',
  fieldHint:
    'What the participant types goes here. Use the attribute holding a person’s name unless you have a reason not to — the interview labels people by it.',
};

export type QuickAddSectionProps = Readonly<{
  copy?: Partial<QuickAddCopy>;
}>;

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
export default function QuickAddSection({ copy }: QuickAddSectionProps = {}) {
  const words = { ...DEFAULT_COPY, ...copy };
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
      <NewQuickAddAttribute />
    </BuilderSection>
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
