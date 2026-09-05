import { useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import CodebookEntityEditor from '../../codebook/components/CodebookEntityEditor.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import BuilderSection from '../BuilderSection.tsx';
import { NEW_ENTITY_DRAFT } from '../SubjectSection.tsx';
import { type EdgeTypeOption, useEdgeTypeOptions } from './codebookOptions.ts';
import { useSetStageFieldValue } from './CreateVariableAction.tsx';
import { checkboxOptions } from './rowValues.ts';

const EDGES_FIELD = 'edges';

/**
 * One connection type this stage can draw, as the stage document holds it.
 *
 * The entry is more than the type it names: it carries an id of its own, and
 * it may carry the attribute form shown when one of these connections is
 * selected. Both belong to the entry rather than to the type, so an entry is
 * only ever created or removed here — never rebuilt from its type.
 */
type EdgeEntry = Readonly<{
  id: string;
  subject: Readonly<{ entity: 'edge'; type: string }>;
}> &
  Readonly<Record<string, unknown>>;

const isEdgeEntry = (value: unknown): value is EdgeEntry => {
  if (typeof value !== 'object' || value === null) return false;
  if (typeof Reflect.get(value, 'id') !== 'string') return false;
  const subject = Reflect.get(value, 'subject');
  return (
    typeof subject === 'object' &&
    subject !== null &&
    Reflect.get(subject, 'entity') === 'edge' &&
    typeof Reflect.get(subject, 'type') === 'string'
  );
};

const readEntries = (value: unknown): EdgeEntry[] =>
  Array.isArray(value) ? value.filter(isEdgeEntry) : [];

/**
 * The entries for exactly these types, keeping every entry that survives.
 *
 * An entry that is still ticked is handed back unchanged rather than rebuilt,
 * so its id and its attribute form — neither of which this control renders —
 * are the same ones the researcher configured.
 */
const entriesForTypes = (
  existing: readonly EdgeEntry[],
  types: readonly string[],
  createId: () => string,
): EdgeEntry[] =>
  types.map(
    (type) =>
      existing.find((entry) => entry.subject.type === type) ?? {
        id: createId(),
        subject: { entity: 'edge', type },
      },
  );

type EdgeTypesFieldProps = CreateFormFieldProps<
  Record<string, unknown>[],
  'fieldset',
  {
    options: readonly EdgeTypeOption[];
    /** Shown in place of the list when the protocol defines no edge types. */
    emptyMessage: string;
  }
>;

/**
 * Which connection types this stage draws.
 *
 * Stored as a list of entries and chosen as a set of types, because that is
 * what the researcher is deciding: "this canvas draws friendships and
 * housemates". Unticking a type removes its entry, which is also the only way
 * to remove the attributes configured for it — so the choice is deliberately
 * the whole decision, not a shortcut past one.
 */
function EdgeTypesField({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  options,
  emptyMessage,
  disabled = false,
  readOnly = false,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
}: EdgeTypesFieldProps) {
  const entries = readEntries(value);
  const checked = entries.map((entry) => entry.subject.type);
  const choices = useMemo(() => checkboxOptions(options), [options]);

  if (options.length === 0) {
    return (
      <Paragraph id={id} margin="none" emphasis="muted" className={className}>
        {emptyMessage}
      </Paragraph>
    );
  }

  return (
    <CheckboxGroupField
      id={id}
      name={name}
      className={className}
      options={choices}
      value={checked}
      onChange={(next) => {
        const types = (next ?? []).map(String);
        // An emptied list is spelled the way the protocol schema spells "this
        // stage draws no connections": the key is not there. An empty array
        // would say something else — a configured capability holding nothing.
        const nextEntries = entriesForTypes(entries, types, uuid);
        onChange?.(nextEntries.length === 0 ? undefined : nextEntries);
      }}
      onBlur={onBlur}
      onFocus={onFocus}
      disabled={disabled}
      readOnly={readOnly}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      aria-labelledby={ariaLabelledBy}
    />
  );
}

export type ComposerEdgeConfigurationCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  fieldLabel: string;
  fieldHint: string;
  emptyMessage: string;
  /** Visible text and accessible name of the create control. */
  createLabel: string;
  createDescription: string;
}>;

const DEFAULT_COPY: ComposerEdgeConfigurationCopy = {
  sectionTitle: 'Connections',
  description:
    'Choose the kinds of connection the participant can draw between nodes on this canvas.',
  fieldLabel: 'Connection types',
  fieldHint:
    'The participant can draw a connection of any kind you tick here. Leave them all unticked to build a network of nodes alone.',
  emptyMessage:
    'This protocol has no connection types yet. Create one to let the participant connect nodes.',
  createLabel: 'Create a new connection type',
  createDescription:
    'Create a connection type, and let the participant draw it on this stage',
};

export type ComposerEdgeConfigurationSectionProps = Readonly<{
  copy?: Partial<ComposerEdgeConfigurationCopy>;
}>;

/**
 * The connections this canvas lets the participant draw.
 *
 * The stage's `edges` and nothing else. The types come from the editor's own
 * protocol context, so a connection type a collaborator adds or renames while
 * the editor is open appears here without this section asking for it, and a
 * researcher who needs a type the protocol does not have yet can create one
 * without leaving the stage.
 */
export default function ComposerEdgeConfigurationSection({
  copy,
}: ComposerEdgeConfigurationSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
  const options = useEdgeTypeOptions();

  return (
    <BuilderSection title={words.sectionTitle} description={words.description}>
      <ProtocolField<typeof EdgeTypesField>
        name={EDGES_FIELD}
        component={EdgeTypesField}
        label={words.fieldLabel}
        hint={words.fieldHint}
        options={options}
        emptyMessage={words.emptyMessage}
      />
      <CreateEdgeType words={words} />
    </BuilderSection>
  );
}

/**
 * Creates a connection type and ticks it on this stage.
 *
 * The type is written through the session's compound-edit path — the same one
 * the codebook editors use — so it lands in the protocol atomically and
 * reports the specific lock holder when it cannot. Ticking it afterwards is an
 * ordinary unsaved form change: the type is valid on its own, while the stage
 * around it may not be finished, and a host keeping its stored protocol valid
 * would be right to refuse the pair as one edit.
 */
function CreateEdgeType({
  words,
}: Readonly<{ words: ComposerEdgeConfigurationCopy }>) {
  const { controller, readOnly } = useStageEditorForm();
  const setStageFieldValue = useSetStageFieldValue();
  const entries = readEntries(useStageValue(EDGES_FIELD));
  const [session, setSession] = useState<{
    key: string;
    typeId: string;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const existingEntityNames = useMemo(
    () =>
      Object.values(
        controller.snapshot.protocolContext.codebook.edge ?? {},
      ).map((definition) => definition.name),
    [controller.snapshot.protocolContext.codebook.edge],
  );

  if (readOnly) return null;

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setSession({ key: uuid(), typeId: uuid() })}
      >
        {words.createLabel}
      </Button>
      {session !== null && (
        <Dialog
          open
          title={words.createLabel}
          size="readable"
          closeDialog={() => setSession(null)}
          finalFocus={() => triggerRef.current}
        >
          <CodebookEntityEditor
            mode="create"
            sessionKey={session.key}
            createRequestId={() => uuid()}
            description={words.createDescription}
            subject={{ entity: 'edge', type: session.typeId }}
            initialDraft={NEW_ENTITY_DRAFT.edge}
            existingEntityNames={existingEntityNames}
            onSubmit={(request) => controller.requestCompoundEdit(request)}
            onApplied={() => {
              // Meant for THIS stage, so it is ticked rather than left for the
              // researcher to find in a list that has just grown.
              setStageFieldValue(EDGES_FIELD, [
                ...entries,
                {
                  id: uuid(),
                  subject: { entity: 'edge', type: session.typeId },
                },
              ]);
              setSession(null);
            }}
            onCancel={() => setSession(null)}
          />
        </Dialog>
      )}
    </>
  );
}
