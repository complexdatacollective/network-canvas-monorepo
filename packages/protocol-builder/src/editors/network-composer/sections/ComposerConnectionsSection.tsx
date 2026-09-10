import { useCallback, useMemo } from 'react';
import { v4 as uuid } from 'uuid';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Field from '@codaco/fresco-ui/form/Field/Field';
import ArrayField from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';

import {
  type EntitySubject,
  EntitySubjectPickerField,
} from '../../../fields/EntityTypePickerField.tsx';
import {
  RowDialog,
  RowList,
  RowListItem,
  rowId,
  rowsOf,
  rowTemplate,
  type RowEditorProps,
  type RowListConfig,
  type RowPreviewProps,
  type RowSaveContext,
  type RowSaveOutcome,
  type RowValues,
} from '../../../form/rowDialog.tsx';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { canvasMessages } from '../../../sections/canvas/canvasMessages.ts';
import { asNestedText } from '../../../sections/canvas/rowValues.ts';
import { composerFormFieldMessages } from '../../../sections/form-fields/composerFormFieldMessages.ts';
import { ComposerFormFieldsControl } from '../../../sections/form-fields/ComposerFormFields.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { composerMessages as messages } from './composerMessages.ts';
import CreateConnectionTypeButton from './CreateConnectionTypeButton.tsx';
import { useSetStageValue } from './useSetStageValue.ts';

const EDGES_FIELD = 'edges';
const SUBJECT_FIELD = 'subject';

/** The connection type one entry stands for, however tolerantly it arrived. */
const typeOf = (entry: RowValues): string | undefined =>
  asNestedText(entry[SUBJECT_FIELD], 'type');

/** That type as the subject picker holds it, or nothing for a new entry. */
const subjectOf = (entry: RowValues): EntitySubject | undefined => {
  const type = typeOf(entry);
  return type === undefined ? undefined : { entity: 'edge', type };
};

/** The questions that entry already asks, read as tolerantly as the entry. */
const fieldsOf = (entry: RowValues): RowValues[] => {
  const form = entry.form;
  if (typeof form !== 'object' || form === null) return [];
  return rowsOf(Reflect.get(form, 'fields'));
};

/**
 * The entries with one entry's questions replaced, or with the form removed
 * when it asks nothing.
 *
 * Addressed by the connection TYPE, which is the only identity the schema
 * guarantees is unique: `edges` is refined for duplicate types and says nothing
 * about entry ids, so a protocol authored elsewhere can hold two entries
 * carrying the same `id`, and one form's edit would land on both — giving the
 * second connection type the first's questions, which name attributes it does
 * not have.
 *
 * A form with no fields is spelled by the key not being there. An empty one
 * would say something else — a configured form holding nothing.
 */
const withFormFields = (
  entries: readonly RowValues[],
  type: string,
  fields: readonly RowValues[],
): RowValues[] =>
  entries.map((entry) => {
    if (typeOf(entry) !== type) return entry;
    if (fields.length === 0) {
      const { form: _form, ...rest } = entry;
      return rest;
    }
    const held = entry.form;
    const form = typeof held === 'object' && held !== null ? held : {};
    return { ...entry, form: { ...form, fields: [...fields] } };
  });

/**
 * The connections this canvas lets the participant draw, and what it asks
 * about each of them.
 *
 * The stage's `edges` and nothing else. Each entry is a kind of connection the
 * participant may draw, and it carries more than the type it names: an id of
 * its own, and the questions asked when a connection of that kind is selected.
 * Both belong to the entry, so an entry is created and removed as a whole
 * rather than rebuilt from its type — which is also why removing one is what
 * removes its questions, and why the list asks before it does.
 */
export default function ComposerConnectionsSection() {
  const intl = useAppIntl();
  const held = useStageValue(EDGES_FIELD);
  const entries = useMemo(() => rowsOf(held), [held]);
  const setStageValue = useSetStageValue();

  /**
   * A type created from here is meant for THIS canvas, so it becomes drawable
   * at once rather than being left for the researcher to find in a list that
   * has just grown. The same rule Architect's own composer follows.
   *
   * Nothing to refuse: a type the host has only just minted is not one this
   * stage can already be drawing.
   */
  const drawCreatedType = useCallback(
    (typeId: string) => {
      setStageValue(EDGES_FIELD, [
        ...entries,
        { id: uuid(), subject: { entity: 'edge', type: typeId } },
      ]);
    },
    [entries, setStageValue],
  );

  /**
   * One kind of connection may only be drawable once.
   *
   * The protocol schema refuses duplicate types in `edges` outright, and a
   * second entry for a type would carry questions the interview could never
   * reach — it resolves a selected connection's form by TYPE. Asked of the
   * LIVE rows, so a type freed by an entry just deleted can be chosen at once.
   */
  const rowList = useMemo<RowListConfig>(
    () => ({
      ...CONNECTION_ROWS,
      beforeSave: (row: RowValues, context: RowSaveContext): RowSaveOutcome => {
        const type = typeOf(row);
        if (type === undefined) return { row };
        const taken = entries.some(
          (sibling, index) =>
            index !== context.editIndex && typeOf(sibling) === type,
        );
        return taken
          ? {
              refused: {
                fieldErrors: {
                  [SUBJECT_FIELD]: intl.formatMessage(
                    messages.duplicateConnectionRefusal,
                  ),
                },
              },
            }
          : { row };
      },
    }),
    [entries, intl],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.connectionsTitle)}
      description={intl.formatMessage(messages.connectionsDescription)}
    >
      <RowList config={rowList}>
        <Field<typeof ArrayField<RowValues>>
          name={EDGES_FIELD}
          component={ArrayField}
          label={intl.formatMessage(messages.connectionsLabel)}
          hint={intl.formatMessage(messages.connectionsHint)}
          getId={rowId}
          addButtonLabel={intl.formatMessage(messages.connectionsAddLabel)}
          itemLabel={messages.connectionNoun}
          emptyStateMessage={intl.formatMessage(messages.connectionsEmptyState)}
          itemComponent={RowListItem}
          editorComponent={RowDialog}
          itemTemplate={rowTemplate()}
          sortable
        />
      </RowList>
      <CreateConnectionTypeButton onCreated={drawCreatedType} />
      <ConnectionForms entries={entries} />
    </BuilderSection>
  );
}

/**
 * One kind of connection the participant may draw.
 *
 * The type alone: what the connection RECORDS is asked below the list, because
 * each form is a list of its own and a list inside a row dialog would be a
 * dialog inside a dialog.
 */
function ComposerConnectionFields({ item }: RowEditorProps) {
  const intl = useAppIntl();

  return (
    <Field<typeof EntitySubjectPickerField>
      name={SUBJECT_FIELD}
      component={EntitySubjectPickerField}
      entityType="edge"
      label={intl.formatMessage(messages.connectionTypeLabel)}
      hint={intl.formatMessage(messages.connectionTypeHint)}
      initialValue={subjectOf(item)}
      required={intl.formatMessage(messages.connectionTypeRequired)}
    />
  );
}

/** How one connection type reads in the list when its dialog is closed. */
function ComposerConnectionPreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  const protocolContext = useProtocolContext();
  const type = typeOf(item);
  const definition =
    type === undefined ? undefined : protocolContext.codebook.edge?.[type];

  if (type === undefined) {
    return <span>{intl.formatMessage(messages.connectionUnnamedPreview)}</span>;
  }

  return (
    <Badge>
      {definition?.name ??
        // The type the entry still names and the codebook no longer defines.
        // Shown rather than hidden, for the reason every dangling reference in
        // this package is: the researcher cannot resolve what they cannot see.
        intl.formatMessage(canvasMessages.missingEdgeType, {
          edgeTypeId: type,
        })}
    </Badge>
  );
}

/**
 * The list's renderers, which never change. The section adds the one rule that
 * does: a refusal read from the rows as they stand.
 */
const CONNECTION_ROWS: RowListConfig = {
  Preview: ComposerConnectionPreview,
  Editor: ComposerConnectionFields,
  addTitle: messages.connectionAddTitle,
  editTitle: messages.connectionEditTitle,
  formId: 'composer-connection-type',
  name: EDGES_FIELD,
};

/**
 * The attributes the participant fills in for each kind of connection.
 *
 * One list per entry, because each records the attributes of its OWN edge
 * type: a field on a "knows" connection may not record something only a
 * "family" connection has.
 *
 * Deliberately not a field per entry. `edges` is one value with one field
 * registered for it — which is what stops a removed entry's questions from
 * being replayed into the stage out of a value parked at its old position — so
 * these lists write back through the same value the list above them holds.
 */
function ConnectionForms({
  entries,
}: Readonly<{ entries: readonly RowValues[] }>) {
  const intl = useAppIntl();
  const protocolContext = useProtocolContext();
  const setStageValue = useSetStageValue();

  const writeFields = useCallback(
    (type: string, fields: readonly RowValues[]) => {
      setStageValue(EDGES_FIELD, withFormFields(entries, type, fields));
    },
    [entries, setStageValue],
  );

  if (entries.length === 0) return null;

  return (
    <BuilderSection
      title={intl.formatMessage(messages.connectionFormsTitle)}
      description={intl.formatMessage(messages.connectionFormsDescription)}
    >
      {entries.map((entry) => {
        const type = typeOf(entry);
        if (type === undefined) return null;
        const typeName = protocolContext.codebook.edge?.[type]?.name ?? type;
        return (
          <ComposerFormFieldsControl
            // The type rather than the entry's id: two entries may carry the
            // same id, and a duplicate key would make their identity unstable.
            key={type}
            name={`connection-form-${type}`}
            subject={{ entity: 'edge', type }}
            value={fieldsOf(entry)}
            onChange={(fields) => writeFields(type, fields)}
            label={intl.formatMessage(messages.connectionFormLabel, {
              typeName,
            })}
            hint={intl.formatMessage(messages.connectionFormHint)}
            addButtonLabel={intl.formatMessage(
              messages.connectionFormAddLabel,
              { typeName },
            )}
            emptyStateMessage={intl.formatMessage(
              messages.connectionFormEmptyState,
            )}
            addTitle={composerFormFieldMessages.addSubmitTitle}
            editTitle={composerFormFieldMessages.editTitle}
            formId={`composer-connection-form-field-${type}`}
          />
        );
      })}
    </BuilderSection>
  );
}
