import { createElement, useId, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import {
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import CodebookEntityEditor from '../../codebook/components/CodebookEntityEditor.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import BuilderSection from '../BuilderSection.tsx';
import { NEW_ENTITY_DRAFT } from '../SubjectSection.tsx';
import { type EdgeTypeOption, useEdgeTypeOptions } from './codebookOptions.ts';
import ComposerFormFieldsList from './ComposerFormFieldsList.tsx';
import { useSetStageFieldValue } from './CreateVariableAction.tsx';
import { networkCanvasMessages } from './networkCanvasMessages.ts';
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

/** One field of a connection's form, as tolerantly as a stored one arrives. */
const isFormFieldRow = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

/**
 * The connections this canvas lets the participant draw, and what it asks
 * about each of them.
 *
 * The stage's `edges` and nothing else. The types come from the editor's own
 * protocol context, so a connection type a collaborator adds or renames while
 * the editor is open appears here without this section asking for it, and a
 * researcher who needs a type the protocol does not have yet can create one
 * without leaving the stage.
 *
 * An entry carries a form as well as a type, and the two are authored one
 * after the other: tick the kinds of connection, then say what each of them
 * records. Both write the same `edges` value — see `EdgeTypeForms` for why the
 * forms are not fields of their own.
 */
export default function ComposerEdgeConfigurationSection() {
  const intl = useAppIntl();
  const options = useEdgeTypeOptions();

  return (
    <BuilderSection
      title={intl.formatMessage(networkCanvasMessages.composerEdgeTitle)}
      description={intl.formatMessage(
        networkCanvasMessages.composerEdgeDescription,
      )}
    >
      <ProtocolField<typeof EdgeTypesField>
        name={EDGES_FIELD}
        component={EdgeTypesField}
        label={intl.formatMessage(networkCanvasMessages.composerEdgeFieldLabel)}
        hint={intl.formatMessage(networkCanvasMessages.composerEdgeFieldHint)}
        options={options}
        emptyMessage={intl.formatMessage(
          networkCanvasMessages.composerEdgeEmpty,
        )}
      />
      <CreateEdgeType />
      <EdgeTypeForms />
    </BuilderSection>
  );
}

/** The entries with one entry's `form` replaced, or removed when it is empty. */
const withEdgeForm = (
  entries: readonly EdgeEntry[],
  entryId: string,
  fields: readonly Record<string, unknown>[],
): EdgeEntry[] =>
  entries.map((entry) => {
    if (entry.id !== entryId) return entry;
    if (fields.length === 0) {
      // A form with no fields is spelled by the key not being there. An empty
      // one would say something else — a configured form holding nothing —
      // which is not what the researcher did.
      const { form: _form, ...rest } = entry;
      return rest;
    }
    const existing = entry.form;
    const form =
      typeof existing === 'object' && existing !== null ? existing : {};
    return { ...entry, form: { ...form, fields } };
  });

/**
 * The attributes the participant fills in for each kind of connection.
 *
 * One list per ticked connection type, because each writes the attributes of
 * its OWN edge type: a form field on a "knows" connection may not record
 * something only a "family" connection has.
 *
 * Deliberately not a form field per entry. `edges` is one value with one field
 * registered for it — that is what stops an unticked type's configuration from
 * resurrecting itself out of a dormant `edges[2].form` on the next save — so
 * these lists write back through the same value the tick list does, exactly as
 * any other list nested inside a row.
 */
function EdgeTypeForms() {
  const intl = useAppIntl();
  const entries = readEntries(useStageValue(EDGES_FIELD));
  const options = useEdgeTypeOptions();
  const setStageFieldValue = useSetStageFieldValue();

  if (entries.length === 0) return null;

  return (
    <BuilderSection
      title={intl.formatMessage(networkCanvasMessages.edgeFormsTitle)}
      description={intl.formatMessage(
        networkCanvasMessages.edgeFormsDescription,
      )}
    >
      {entries.map((entry) => {
        const typeName =
          options.find((option) => option.value === entry.subject.type)
            ?.label ?? entry.subject.type;
        return (
          <EdgeTypeForm
            key={entry.id}
            entry={entry}
            typeName={typeName}
            onChange={(fields) =>
              setStageFieldValue(
                EDGES_FIELD,
                withEdgeForm(entries, entry.id, fields ?? []),
              )
            }
          />
        );
      })}
    </BuilderSection>
  );
}

/** One connection type's form, named by the type it belongs to. */
function EdgeTypeForm({
  entry,
  typeName,
  onChange,
}: Readonly<{
  entry: EdgeEntry;
  typeName: string;
  onChange: (fields: Record<string, unknown>[] | undefined) => void;
}>) {
  const intl = useAppIntl();
  const headingId = useId();
  // One connection type inside the section that lists them all, so this
  // heading counts from that section's own rather than from the page. Written
  // out as an `h4` it was a PEER of the section containing it — which reads,
  // to anyone moving through the outline, as though the section had ended and
  // each connection type were another part of the stage.
  const enclosingHeadingLevel = useEnclosingHeadingLevel();
  const headingTag =
    enclosingHeadingLevel === null
      ? 'h4'
      : headingTagBelow(enclosingHeadingLevel);
  const form = entry.form;
  const fields =
    typeof form === 'object' && form !== null
      ? Reflect.get(form, 'fields')
      : undefined;

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className="flex flex-col gap-4"
    >
      <Heading
        level="h4"
        id={headingId}
        margin="none"
        // The element only — `level` still carries the type treatment.
        {...(headingTag === 'h4' ? {} : { render: createElement(headingTag) })}
      >
        {intl.formatMessage(networkCanvasMessages.edgeFormHeading, {
          typeName,
        })}
      </Heading>
      <Paragraph margin="none" emphasis="muted">
        {intl.formatMessage(networkCanvasMessages.edgeFormFieldsHint)}
      </Paragraph>
      <ComposerFormFieldsList
        name={`edges-${entry.id}-form`}
        subject={entry.subject}
        value={Array.isArray(fields) ? fields.filter(isFormFieldRow) : []}
        onChange={onChange}
        addButtonLabel={intl.formatMessage(
          networkCanvasMessages.edgeFormAddLabel,
          { typeName },
        )}
        addTitle={intl.formatMessage(networkCanvasMessages.edgeFormAddTitle, {
          typeName,
        })}
        editorTitle={intl.formatMessage(
          networkCanvasMessages.edgeFormEditTitle,
          { typeName },
        )}
        itemLabel={networkCanvasMessages.edgeFormFieldNoun}
        emptyStateMessage={intl.formatMessage(
          networkCanvasMessages.edgeFormEmptyState,
        )}
      />
    </div>
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
function CreateEdgeType() {
  const intl = useAppIntl();
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
        {intl.formatMessage(networkCanvasMessages.createEdgeTypeLabel)}
      </Button>
      {session !== null && (
        <Dialog
          open
          title={intl.formatMessage(networkCanvasMessages.createEdgeTypeLabel)}
          size="readable"
          closeDialog={() => setSession(null)}
          finalFocus={() => triggerRef.current}
        >
          <CodebookEntityEditor
            mode="create"
            sessionKey={session.key}
            createRequestId={() => uuid()}
            description={intl.formatMessage(
              networkCanvasMessages.createEdgeTypeDescription,
            )}
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
