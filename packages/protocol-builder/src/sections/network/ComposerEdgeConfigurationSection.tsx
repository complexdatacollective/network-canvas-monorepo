import { createElement, useId, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
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
import { useLostEdgeTypes } from './lostEdgeTypes.ts';
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
 * Whether this entry's form asks the participant anything.
 *
 * Read as tolerantly as the entry itself: a form is whatever the protocol
 * holds, and only a list with something in it is a form the researcher would
 * miss.
 */
const asksAnything = (entry: EdgeEntry): boolean => {
  const form = entry.form;
  if (typeof form !== 'object' || form === null) return false;
  const fields = Reflect.get(form, 'fields');
  return Array.isArray(fields) && fields.length > 0;
};

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
    /**
     * Shown in place of the list when there is nothing to tick at all —
     * neither a codebook type nor an entry naming one the codebook has lost.
     */
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
  const intl = useAppIntl();
  const { confirm } = useDialog();
  const entries = readEntries(value);
  const checked = entries.map((entry) => entry.subject.type);
  /**
   * The types this stage draws that the codebook does not define.
   *
   * The list renders from the CODEBOOK and the ticks from the value, so a type
   * a collaborator deletes stopped being a choice while its entry stayed in
   * `edges` — where the interview would ask for a kind of connection that does
   * not exist and nothing on screen could remove it. Kept and shown, by the
   * same seam and in the same words the sociogram's prompt editor uses.
   */
  const knownTypes = useMemo(
    () => new Set(options.map((option) => option.value)),
    [options],
  );
  const lostTypes = useLostEdgeTypes(checked, knownTypes);
  const choices = useMemo(
    () => [
      ...checkboxOptions(options),
      ...lostTypes.map((type) => ({
        value: type,
        label: intl.formatMessage(networkCanvasMessages.promptMissingEdgeType, {
          edgeTypeId: type,
        }),
      })),
    ],
    [intl, lostTypes, options],
  );

  // Said only when there is nothing to show at all. A protocol whose last
  // connection type has been deleted still has this stage's dangling entries
  // to offer, and replacing them with "there are none" would leave the
  // researcher no way to take them out.
  if (choices.length === 0) {
    return (
      <Paragraph id={id} margin="none" emphasis="muted" className={className}>
        {emptyMessage}
      </Paragraph>
    );
  }

  const applyTypes = (types: readonly string[]) => {
    // An emptied list is spelled the way the protocol schema spells "this
    // stage draws no connections": the key is not there. An empty array
    // would say something else — a configured capability holding nothing.
    const nextEntries = entriesForTypes(entries, types, uuid);
    onChange?.(nextEntries.length === 0 ? undefined : nextEntries);
  };

  /**
   * The types the researcher has just asked for, once they have agreed to what
   * unticking costs.
   *
   * Unticking a connection type removes its whole ENTRY, and the entry carries
   * the questions asked about that kind of connection: rechecking the type
   * builds a fresh empty one, so a form dropped here cannot be got back without
   * abandoning the entire stage edit. Asked before the value moves, like every
   * other question this package puts before a loss, and asked only about the
   * entries that would actually lose something — an entry with no form is not a
   * decision worth interrupting.
   *
   * One question per entry losing a form, answered in turn: a refused one keeps
   * its type where it was in the list, rather than being appended somewhere the
   * researcher did not put it.
   */
  const requestTypes = (types: readonly string[]) => {
    const losing = entries.filter(
      (entry) => !types.includes(entry.subject.type) && asksAnything(entry),
    );
    if (losing.length === 0) {
      applyTypes(types);
      return;
    }
    void (async () => {
      const kept = new Set<string>();
      for (const entry of losing) {
        const typeName =
          options.find((option) => option.value === entry.subject.type)
            ?.label ?? entry.subject.type;
        const confirmed = await confirm({
          title: intl.formatMessage(
            networkCanvasMessages.edgeFormDiscardTitle,
            { typeName },
          ),
          description: intl.formatMessage(
            networkCanvasMessages.edgeFormDiscardDescription,
          ),
          confirmLabel: intl.formatMessage(
            networkCanvasMessages.edgeFormDiscardConfirm,
          ),
          cancelLabel: intl.formatMessage(commonMessages.cancel),
          intent: 'warning',
          onConfirm: () => undefined,
        });
        if (confirmed !== true) kept.add(entry.subject.type);
      }
      applyTypes([
        ...entries
          .map((entry) => entry.subject.type)
          .filter((type) => types.includes(type) || kept.has(type)),
        ...types.filter(
          (type) => !entries.some((entry) => entry.subject.type === type),
        ),
      ]);
    })();
  };

  return (
    <CheckboxGroupField
      id={id}
      name={name}
      className={className}
      options={choices}
      value={checked}
      onChange={(next) => {
        requestTypes((next ?? []).map(String));
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

/**
 * The entries with one entry's `form` replaced, or removed when it is empty.
 *
 * Addressed by the connection TYPE, which is the only identity the schema
 * guarantees is unique: `edges` is refined for duplicate types and says nothing
 * about entry ids, so a protocol authored elsewhere or migrated can hold two
 * entries carrying the same `id`. Matched on that, one form's edit landed on
 * both of them — the second connection type was given the first's questions,
 * which name attributes it does not have, and the stage could then not be
 * saved at all.
 *
 * The duplicate id itself is left exactly as it arrived rather than repaired:
 * it is valid, nothing here reads it any more, and rewriting an id the
 * researcher never chose would change a protocol they did not ask this editor
 * to touch.
 */
const withEdgeForm = (
  entries: readonly EdgeEntry[],
  type: string,
  fields: readonly Record<string, unknown>[],
): EdgeEntry[] =>
  entries.map((entry) => {
    if (entry.subject.type !== type) return entry;
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
            // The type rather than the entry's id: two entries may carry the
            // same id, and a duplicate React key makes their UI identity
            // unstable — the list this renders would hand one type's open
            // dialog to the other.
            key={entry.subject.type}
            entry={entry}
            typeName={typeName}
            onChange={(fields) =>
              setStageFieldValue(
                EDGES_FIELD,
                withEdgeForm(entries, entry.subject.type, fields ?? []),
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
        // Named by the type for the reason the key is: an id two entries share
        // would give two lists the same form ids.
        name={`edges-${entry.subject.type}-form`}
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
  /**
   * Whether the create is with the host right now, which is a fact this host
   * has for itself: the editor owns the draft and this owns request execution,
   * so the request passes through here on its way out and its answer on the way
   * back.
   */
  const [submitting, setSubmitting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /**
   * Every type name the protocol already carries, of BOTH kinds.
   *
   * Node and edge types share one namespace — `CodebookSchema` refuses a
   * protocol that reuses a name across the two maps, and `SubjectSection`'s own
   * create dialog has always judged a new type against both. Judged against the
   * edge names alone, a connection could be given a node type's name here: the
   * editor would accept it and the refusal would arrive from the schema after
   * the researcher had finished the dialog, with no name-field error to act on.
   * The confusable pair is the worse half — the editor folds case and Unicode
   * form together, so what reaches the codebook is two types nobody reading it
   * could tell apart.
   *
   * Read map by map rather than by a computed key: the codebook's two maps hold
   * different definition types, and one indexed by a union is a union of maps
   * nothing can be read out of without narrowing it again.
   */
  const codebook = controller.snapshot.protocolContext.codebook;
  const existingEntityNames = useMemo(
    () =>
      [
        ...Object.values(codebook.node ?? {}),
        ...Object.values(codebook.edge ?? {}),
      ].map((definition) => definition.name),
    [codebook],
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
          // A request in flight refuses every way out, because the dialog is
          // about to show what the host made of it. Escape, a press outside and
          // the close button all arrive at `closeDialog`, so refusing there
          // covers all three — and `dismissible` takes the close button away
          // rather than leaving a control on screen that does nothing.
          // Dismissed mid-flight, the handler awaiting the request stays alive
          // and a success arriving afterwards still ticks the new type on this
          // stage: a connection type the researcher would watch appear for a
          // create they had closed.
          dismissible={!submitting}
          closeDialog={() => {
            if (submitting) return;
            setSession(null);
          }}
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
            onSubmit={async (request) => {
              setSubmitting(true);
              try {
                return await controller.requestCompoundEdit(request);
              } finally {
                setSubmitting(false);
              }
            }}
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
