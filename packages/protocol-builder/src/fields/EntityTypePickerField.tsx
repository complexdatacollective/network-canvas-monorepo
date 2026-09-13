import { Plus } from 'lucide-react';
import {
  type CSSProperties,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { v4 as uuid } from 'uuid';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import Icon from '@codaco/fresco-ui/Icon';
import Node, {
  NodeColors,
  type NodeColorSequence,
} from '@codaco/fresco-ui/Node';
import { cx } from '@codaco/fresco-ui/utils/cva';
import {
  type ColorReference,
  EdgeColorSequence,
  NodeColorSequence as NodeColorReferences,
  type NodeShape,
  NodeShapes,
  type StageSubject,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { parseSectionId } from '@codaco/studio-sync/taxonomy';

import CodebookEntityEditor from '../codebook/components/CodebookEntityEditor.tsx';
import type { CodebookEntityDraft } from '../codebook/editing.ts';
import { useCodebookSectionDocument } from '../codebook/useCodebookVariableEdits.ts';
import {
  useCodebookSectionWrite,
  useCreateCodebookEntity,
} from '../codebook/writes.ts';
import { READ_ONLY_MESSAGE } from '../form/readOnlyRefusal.ts';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { protocolColor } from '../protocolColor.ts';
import {
  codebookLabel,
  DEFAULT_EDGE_COLOR,
  DEFAULT_NODE_COLOR,
  type RuleEntityTarget,
  type RuleEntityTypeOption,
} from '../rules/ruleCodebook.ts';
import { useEntityTypes, type EntityTypeSummary } from '../state/hooks.ts';
import { useProtocolContext } from '../state/protocolContext.ts';

/**
 * What the researcher is asked before a change that costs them something.
 *
 * Whole strings rather than a noun dropped into a frame, like every other word
 * a type picker uses: "the node type" and "the edge type" do not differ only in
 * the noun in every language.
 */
export type EntityTypeChangeConfirmation = Readonly<{
  title: string;
  description: string;
  confirmLabel: string;
}>;

/**
 * The type a confirmed change would land on.
 *
 * Carried into the question rather than left with the caller, because it is
 * what the answer has to be judged against: the confirmation is awaited, and
 * the codebook the question was asked about is not necessarily the one the
 * change lands in.
 */
export type EntityTypeChangeTarget = Readonly<{
  entityType: RuleEntityTarget;
  typeId: string;
}>;

export type EntityTypePickerFieldProps = CreateFormFieldProps<
  string,
  'div',
  {
    entityType: RuleEntityTarget;
    /**
     * What to ask before a pick that costs the stage what it is carrying, or
     * `undefined` to let the pick through without asking.
     *
     * A function, because it is asked at the moment of the change: the answer
     * depends on what the stage is carrying, and a control re-rendering on
     * every keystroke to keep it current is one re-rendering for a question
     * nobody has asked yet. The same reason `useDiscardDraftGuard` takes
     * `hasDraft` as one.
     */
    confirmChange?: () => EntityTypeChangeConfirmation | undefined;
    /**
     * Why this stage's type may not be changed at all, or `undefined` while it
     * may.
     *
     * A whole sentence, because it is the only thing the researcher is given
     * to act on: what depends on this type, and what to do about it. Refusing
     * is stronger than confirming and is asked first — a change nothing can
     * undo the consequences of is not one to offer with a warning.
     */
    blockChangeReason?: string;
    /**
     * Whether the researcher may make a type here, and change the one the
     * stage holds.
     *
     * On, because that is what choosing a type from a codebook has always
     * meant in Architect (`EntitySelectField`'s own `allowCreation`, likewise
     * default on): a researcher who opens a stage editor before the codebook
     * has the type it is about would otherwise have to leave, make it, and
     * come back — and on a fresh protocol there is nothing to come back TO,
     * because every type picker is empty.
     *
     * Off for a caller that must not offer either. Architect's one such caller
     * is the rule builder, whose picker sits inside a dialog inside a dialog,
     * and where inventing a type to write a rule about is a study nobody
     * described: the rule is about what the protocol already collects.
     */
    allowCodebookEditing?: boolean;
  }
>;

const asNodeColor = (color: ColorReference): NodeColorSequence =>
  NodeColors.find((candidate) => candidate === color) ?? 'node-color-seq-1';

const asNodeShape = (shape: string | undefined): NodeShape | undefined =>
  NodeShapes.find((candidate) => candidate === shape);

/**
 * The colour a chip is drawn in, from what the type is stored with.
 *
 * Narrowed against the sequence this kind of type may use, so a reference the
 * palette does not hold draws the default rather than nothing at all — the
 * chip is how the researcher recognises the type, and a chip with no colour is
 * harder to read than one whose colour is wrong.
 */
const asEntityColor = (
  color: string | undefined,
  entityType: RuleEntityTarget,
): ColorReference =>
  entityType === 'edge'
    ? (EdgeColorSequence.find((candidate) => candidate === color) ??
      DEFAULT_EDGE_COLOR)
    : (NodeColorReferences.find((candidate) => candidate === color) ??
      DEFAULT_NODE_COLOR);

/**
 * One chip, from the state layer's reading of one codebook type.
 *
 * The colour and shape are the type's own, defaulted where the schema allows
 * them to be absent: a chip is a drawing of the thing the researcher will see
 * in an interview, so it is drawn even for a type that has not been given a
 * look yet.
 */
const typeOption = (
  summary: EntityTypeSummary,
  entityType: RuleEntityTarget,
): RuleEntityTypeOption => ({
  value: summary.id,
  label: codebookLabel(summary.name, summary.id),
  color: asEntityColor(summary.color, entityType),
  ...(entityType === 'edge'
    ? {}
    : { shape: asNodeShape(summary.shape) ?? 'circle' }),
});

/**
 * Empty-state copy, written out per entity kind.
 *
 * `entityType` is an internal token, never display copy: interpolating it
 * produced "No node types" beside "Choose an node type…" once before. Each
 * sentence is whole, so a translator moves it rather than reassembling it.
 */
const EMPTY_MESSAGES = defineMessages({
  node: {
    id: 'protocolBuilder.entitySelect.nodeEmptyState',
    defaultMessage: 'No node types currently defined',
    description:
      'Shown in place of the chips when a researcher is asked to choose a node type and the protocol’s codebook defines none. A node type is a kind of network member the study records, such as a person or a place.',
  },
  edge: {
    id: 'protocolBuilder.entitySelect.edgeEmptyState',
    defaultMessage: 'No edge types currently defined',
    description:
      'Shown in place of the chips when a researcher is asked to choose an edge type and the protocol’s codebook defines none. An edge type is a kind of relationship between two network members, such as a friendship.',
  },
}) satisfies Record<RuleEntityTarget, MessageDescriptor>;

/**
 * What the group of chips is called when the surrounding field supplies no
 * label of its own — the accessible name a screen reader announces for the
 * whole choice, not a heading anybody sees.
 */
const GROUP_LABELS = defineMessages({
  node: {
    id: 'protocolBuilder.entitySelect.nodeGroupLabel',
    defaultMessage: 'Node type options',
    description:
      'Accessible name of the group of chips a researcher picks a node type from. A node type is a kind of network member the study records, such as a person or a place.',
  },
  edge: {
    id: 'protocolBuilder.entitySelect.edgeGroupLabel',
    defaultMessage: 'Edge type options',
    description:
      'Accessible name of the group of chips a researcher picks an edge type from. An edge type is a kind of relationship between two network members, such as a friendship.',
  },
}) satisfies Record<RuleEntityTarget, MessageDescriptor>;

/**
 * What making a type from inside a stage is called — Architect's own words
 * (`EntitySelectField`'s `createNewType`), written out per entity kind for the
 * reason `EMPTY_MESSAGES` gives.
 *
 * Also the title of the dialog it opens: what the researcher pressed is what
 * the thing they are now looking at is called.
 */
const CREATE_LABELS = defineMessages({
  node: {
    id: 'protocolBuilder.entitySelect.nodeCreateLabel',
    defaultMessage: 'Create new node type',
    description:
      'Button that opens an editor for inventing a kind of network member without leaving the stage being configured. Also the title of the dialog it opens. A node type is a kind of network member the study records, such as a person or a place.',
  },
  edge: {
    id: 'protocolBuilder.entitySelect.edgeCreateLabel',
    defaultMessage: 'Create new edge type',
    description:
      'Button that opens an editor for inventing a kind of relationship without leaving the stage being configured. Also the title of the dialog it opens. An edge type is a kind of relationship between two network members, such as a friendship.',
  },
}) satisfies Record<RuleEntityTarget, MessageDescriptor>;

/**
 * What changing the held type's own definition is called, written out per
 * entity kind for the reason `EMPTY_MESSAGES` gives.
 *
 * "This" rather than the type's name: the button is beside the chip that shows
 * which one it is, and a name dropped into a frame is a sentence no translator
 * saw whole.
 */
const EDIT_LABELS = defineMessages({
  node: {
    id: 'protocolBuilder.entitySelect.nodeEditLabel',
    defaultMessage: 'Edit this node type',
    description:
      'Button that opens an editor for the kind of network member a stage is already configured for, so its name, colour, shape or icon can be changed without leaving the stage. Also the title of the dialog it opens.',
  },
  edge: {
    id: 'protocolBuilder.entitySelect.edgeEditLabel',
    defaultMessage: 'Edit this edge type',
    description:
      'Button that opens an editor for the kind of relationship a stage is already configured for, so its name or colour can be changed without leaving the stage. Also the title of the dialog it opens.',
  },
}) satisfies Record<RuleEntityTarget, MessageDescriptor>;

/**
 * What a refused change is called, written out per entity kind for the reason
 * `EMPTY_MESSAGES` gives: `entityType` is an internal token, never display
 * copy.
 */
const BLOCKED_TITLES = defineMessages({
  node: {
    id: 'protocolBuilder.entitySelect.nodeChangeBlockedTitle',
    defaultMessage: 'Cannot change node type',
    description:
      'Title of the message shown when a researcher tries to change the node type of a stage something else in the protocol depends on, and the change is refused. A node type is a kind of network member the study records, such as a person or a place.',
  },
  edge: {
    id: 'protocolBuilder.entitySelect.edgeChangeBlockedTitle',
    defaultMessage: 'Cannot change edge type',
    description:
      'Title of the message shown when a researcher tries to change the edge type of a stage something else in the protocol depends on, and the change is refused. An edge type is a kind of relationship between two network members, such as a friendship.',
  },
}) satisfies Record<RuleEntityTarget, MessageDescriptor>;

const messages = defineMessages({
  /**
   * Names a type the researcher — or a collaborator — has since deleted.
   *
   * A stored id the codebook no longer describes is kept and shown rather than
   * quietly left out: a group of chips with none of them selected reads as a
   * question nobody has answered, while the rule underneath is still pointed
   * at the deleted type and saves back that way. The same treatment
   * `VariablePickerControl` gives a deleted attribute, for the same reason.
   */
  missingOptionLabel: {
    id: 'protocolBuilder.entitySelect.missingOptionLabel',
    defaultMessage: '{typeId} — this type is no longer in the codebook',
    description:
      'Name of the one chip standing for a node or edge type the protocol’s codebook no longer defines. typeId is the raw stored identifier of that type — there is no name left to show, because the definition it would have come from has been deleted. The codebook is the protocol’s definition of the node types, edge types and attributes a study records.',
  },
  missingType: {
    id: 'protocolBuilder.entitySelect.missingType',
    defaultMessage:
      'This type is no longer in the codebook. Choose another one.',
    description:
      'Shown when the node or edge type a researcher’s choice names has been deleted from the protocol’s codebook, so the choice has to be made again: under the chips when it is the stored choice, and in the message refusing a confirmed change whose target was deleted while the question was open.',
  },
});

/**
 * What a change onto a type that has since been deleted is called, written out
 * per entity kind for the reason `EMPTY_MESSAGES` gives: `entityType` is an
 * internal token, never display copy.
 */
const DELETED_TARGET_TITLES = defineMessages({
  node: {
    id: 'protocolBuilder.entitySelect.nodeChangeTargetDeletedTitle',
    defaultMessage: 'That node type has been deleted',
    description:
      'Title of the message shown when a researcher confirms a change of a stage’s node type and the type they chose has been deleted from the codebook in the meantime, so the change is refused. A node type is a kind of network member the study records, such as a person or a place.',
  },
  edge: {
    id: 'protocolBuilder.entitySelect.edgeChangeTargetDeletedTitle',
    defaultMessage: 'That edge type has been deleted',
    description:
      'Title of the message shown when a researcher confirms a change of a stage’s edge type and the type they chose has been deleted from the codebook in the meantime, so the change is refused. An edge type is a kind of relationship between two network members, such as a friendship.',
  },
}) satisfies Record<RuleEntityTarget, MessageDescriptor>;

/**
 * Whether this stage may be written to at all, and the one place that says so
 * when it may not.
 *
 * Every way a confirmed type change is applied goes through here. A read-only
 * stage takes neither the change nor the reset it causes, and a picker showing
 * the new type over the old type's attributes is a pedigree nobody authored and
 * one no save could produce.
 *
 * It is SAID, in the form's own error region and in the shell's own words: a
 * researcher who has just answered a question is owed an answer, and this is
 * the same sentence a refused save or a refused list write gives them.
 *
 * `controlUneditable` is the caller's own reading of itself, for the one part
 * of this the form cannot see: a picker whose props have stopped accepting
 * input. Everything a control derives that from — `FieldsDisabled` closing
 * every field of a read-only editor, the control's own `readOnly` — is a
 * render away from the closure that resumes, so it is read live.
 */
function useRefuseUneditableChange(): (controlUneditable?: boolean) => boolean {
  const { readOnly, reportRefusedWrite } = useStageEditorForm();
  const liveReadOnly = useRef(readOnly);
  liveReadOnly.current = readOnly;

  return useCallback(
    (controlUneditable = false) => {
      if (!liveReadOnly.current && !controlUneditable) return false;
      reportRefusedWrite(READ_ONLY_MESSAGE);
      return true;
    },
    [reportRefusedWrite],
  );
}

/**
 * Asks the question a type change raises, and answers whether the change may
 * go ahead.
 *
 * Shared, because this control is not the only way a researcher moves a
 * stage's type: creating a type from inside the stage and selecting it on it
 * moves it too, and costs the stage exactly the same prompts, form, panels and
 * filter. One definition of the question, so the two cannot ask different ones
 * — or so that one of them cannot quietly stop asking.
 *
 * `undefined` is "nothing to lose", and goes ahead without a dialog: a
 * question about nothing is one a researcher learns to dismiss without
 * reading. The dismissal is the provider's own plain "Cancel", which is what
 * this question wants — backing out of a change that has not happened yet
 * needs no words of its own.
 *
 * A "yes" is answered on the codebook as it stands WHEN IT IS GIVEN, not the
 * one the question was put against. The question is awaited, and a collaborator
 * can delete the very type the researcher chose while they are reading it —
 * the picker's latest render has already dropped that type from its chips, and
 * applying the captured choice anyway would leave the stage pointed at a type
 * the codebook no longer describes, which is a protocol the host refuses to
 * save. So it is refused here, once, for every way a confirmed type change is
 * applied.
 *
 * And on whether the stage may be written to at all, in the same place and for
 * the same reason: every way a confirmed type change is applied goes through
 * here.
 */
function useConfirmEntityTypeChange(): (
  question: EntityTypeChangeConfirmation | undefined,
  target: EntityTypeChangeTarget,
) => Promise<boolean> {
  const { confirm, openDialog } = useDialog();
  const intl = useAppIntl();
  const nodeTypes = useEntityTypes('node');
  const edgeTypes = useEntityTypes('edge');
  const refuseUneditableChange = useRefuseUneditableChange();
  /**
   * The types the answer is judged against, kept live.
   *
   * A ref rather than the render's own value, for the reason the recheck
   * exists at all: what resumes when the question is answered is a closure
   * from the render that put it. The same seam the picker's refusal is read
   * through. Both kinds, because the target's kind is not known until the
   * question is answered.
   */
  const liveTypes = useRef({ node: nodeTypes, edge: edgeTypes });
  liveTypes.current = { node: nodeTypes, edge: edgeTypes };

  return useCallback(
    async (question, target) => {
      if (question === undefined) return true;
      const confirmed = await confirm({
        title: question.title,
        description: question.description,
        confirmLabel: question.confirmLabel,
        intent: 'warning',
        onConfirm: () => undefined,
      });
      if (confirmed !== true) return false;

      // Read-only first. Whether the type the change lands on is still in the
      // codebook is a question about a write that may happen at all, and this
      // one is not: a read-only stage takes nothing, so there is nothing to
      // judge a target against.
      if (refuseUneditableChange()) return false;

      const stillDefined = liveTypes.current[target.entityType].some(
        (summary) => summary.id === target.typeId,
      );
      if (stillDefined) return true;

      void openDialog({
        type: 'acknowledge',
        intent: 'warning',
        title: intl.formatMessage(DELETED_TARGET_TITLES[target.entityType]),
        description: intl.formatMessage(messages.missingType),
        actions: {
          primary: {
            label: intl.formatMessage(commonMessages.continue),
            value: true,
          },
        },
      });
      return false;
    },
    [confirm, intl, openDialog, refuseUneditableChange],
  );
}

/** Custom properties the edge chip tints itself through. */
type EdgeChipStyle = CSSProperties & {
  '--edge-color'?: string;
  '--icon-tone-primary'?: string;
  '--icon-tone-secondary'?: string;
};

function EdgeChip({
  label,
  color,
  selected,
}: Readonly<{ label: string; color: ColorReference; selected: boolean }>) {
  const chipStyle: EdgeChipStyle = { '--edge-color': protocolColor(color) };
  const iconStyle: EdgeChipStyle = {
    '--icon-tone-primary': protocolColor(color, { dark: true }),
    '--icon-tone-secondary': protocolColor(color),
  };

  return (
    <span
      className={cx(
        'bg-surface-2 text-surface-2-contrast relative flex flex-row items-center rounded-full border-4 px-5 py-2.5',
        selected ? 'border-(--edge-color)' : 'border-transparent',
      )}
      style={chipStyle}
    >
      <Icon name="links" className="mr-2.5 size-6" style={iconStyle} />
      {label}
    </span>
  );
}

function EntityOption({
  option,
  entityType,
  groupName,
  checked,
  disabled,
  readOnly,
  onSelect,
}: Readonly<{
  option: RuleEntityTypeOption;
  entityType: RuleEntityTarget;
  groupName: string;
  checked: boolean;
  disabled: boolean;
  readOnly: boolean;
  onSelect: () => void;
}>) {
  return (
    // A native radio inside its own label. The browser then owns the group's
    // roving arrow-key behaviour, the checked state it reports, and the
    // click-the-label affordance — none of which has to be re-implemented for
    // the chip to be the visible control.
    <label
      className={cx(
        'inline-flex cursor-pointer rounded-full',
        (disabled || readOnly) && 'cursor-default',
        disabled && 'opacity-50',
        readOnly && 'opacity-70',
      )}
    >
      <input
        type="radio"
        className="peer sr-only"
        name={groupName}
        value={option.value}
        // The type's own name, stated on the control rather than left to be
        // computed from the chip beside it: the chip is a drawing of a node or
        // an edge, and what a screen reader recovers from its layers is not
        // something this option's name should depend on.
        aria-label={option.label}
        checked={checked}
        disabled={disabled}
        aria-disabled={readOnly || undefined}
        onChange={() => {
          if (disabled || readOnly) return;
          onSelect();
        }}
      />
      <span className="peer-focus-visible:outline-primary rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4">
        {entityType === 'edge' ? (
          <EdgeChip
            label={option.label}
            color={option.color}
            selected={checked}
          />
        ) : (
          <Node
            label={option.label}
            color={asNodeColor(option.color)}
            shape={option.shape}
            size="sm"
            selected={checked}
            presentational
          />
        )}
      </span>
    </label>
  );
}

/**
 * A brand-new type the researcher only has to name.
 *
 * Every property the schema requires is pre-filled, because the point of
 * creating a type from inside a stage is to get back to configuring the stage:
 * the colour, shape and icon are all editable afterwards — from the codebook,
 * or from this same control's own edit dialog.
 *
 * The colour is the next one along the palette, counting the types the
 * codebook already holds — two types drawn in the same colour are two a
 * participant cannot tell apart on a canvas, and picking one out of a palette
 * is not what creating a type from inside a stage is for. It wraps once the
 * palette runs out, which is the point at which no distinct colour is left to
 * give.
 */
export function newEntityDraft(
  entity: RuleEntityTarget,
  existingTypes: number,
): CodebookEntityDraft {
  if (entity === 'edge') {
    const palette = EdgeColorSequence;
    return {
      name: '',
      color: palette[existingTypes % palette.length] ?? palette[0],
    };
  }
  const palette = NodeColorReferences;
  return {
    name: '',
    color: palette[existingTypes % palette.length] ?? palette[0],
    shape: { default: 'circle' },
    // The icon an interface draws on the control that adds one of these. A
    // node type is a member of the network, and this is the one every
    // interface has always shown for one.
    icon: 'add-a-person',
  };
}

/**
 * One opening of the codebook's entity editor from inside this control.
 *
 * The key is what resets the editor's draft, and it is minted per opening
 * rather than per type: reopening the same type after backing out of it is a
 * new question, and an editor that kept the abandoned draft would answer the
 * old one. `typeId` is the id the create RESERVES so the editor has a subject
 * to be about; the id the stage ends up naming is the host's, read off the
 * write.
 */
type EditorSession = Readonly<{
  key: string;
  typeId: string;
  mode: 'create' | 'edit';
  /**
   * The section the edit opened against, kept for the case where it goes.
   *
   * A collaborator deleting the type takes the document away under a
   * researcher who is mid-edit; what they have on screen is still their own
   * work, so it stays, and the save is refused for the reason it is actually
   * refused — there is nowhere left to write it. The same rule
   * `AttributeCodebookControls` follows for an attribute deleted under an open
   * editor.
   */
  openedDocument?: SectionDoc;
}>;

/**
 * Making a node or edge type, and changing the one this control holds.
 *
 * Inside the field rather than beside it, which is Josh's instruction and
 * Architect's own shape (`EntitySelectField` renders its create button and
 * `NewTypeDialog` within the field): a researcher looking for a type that does
 * not exist is looking at exactly this control, and three sections had grown a
 * button of their own to say so while the other five said nothing at all.
 *
 * The type is written to the codebook on its own, under that section's lock,
 * and the stage is pointed at it afterwards as an ordinary unsaved change.
 * Deliberately two acts rather than one: a host keeps the stored protocol
 * valid, and a stage just pointed at a brand-new type has no prompts, no form
 * and no panels for it — an invalid stage, which a host is right to refuse.
 * So the type lands, the stage points at it locally, and the researcher
 * configures it before saving.
 *
 * Which is why the SELECTION goes through the picker's own `select`: it moves
 * the stage exactly as pressing a chip does and costs the stage exactly the
 * same, so it is refused and confirmed by the same rules — a researcher who
 * made a type to use somewhere else, or who realises what it would cost while
 * reading the question, keeps the stage they had and the type they made.
 */
function EntityTypeCodebookControls({
  entityType,
  heldType,
  disabled,
  readOnly,
  select,
}: Readonly<{
  entityType: RuleEntityTarget;
  /** The type the stage holds and the codebook still defines, if any. */
  heldType?: string;
  disabled: boolean;
  readOnly: boolean;
  /** The picker's own pick, with everything it asks before it lets one through. */
  select: (typeId: string) => Promise<void>;
}>) {
  const intl = useAppIntl();
  const codebook = useProtocolContext().codebook;
  const createEntity = useCreateCodebookEntity();
  const writeSection = useCodebookSectionWrite();
  const [session, setSession] = useState<EditorSession | null>(null);
  /**
   * Whether the write is with the host right now, which is a fact this host
   * has for itself: the editor owns the draft and this owns request execution,
   * so the request passes through here on its way out and its answer on the
   * way back.
   */
  const [submitting, setSubmitting] = useState(false);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);

  const editing = session?.mode === 'edit' ? session : undefined;
  const editedSubject =
    editing === undefined
      ? undefined
      : ({ entity: entityType, type: editing.typeId } as const);
  const liveDocument = useCodebookSectionDocument(editedSubject);
  const editedDocument = liveDocument ?? editing?.openedDocument;
  const heldDocument = useCodebookSectionDocument(
    heldType === undefined
      ? undefined
      : ({ entity: entityType, type: heldType } as const),
  );

  /**
   * Every type name the protocol already carries, of BOTH kinds, minus the one
   * being edited.
   *
   * Node and edge types share one namespace — `CodebookSchema` refuses a
   * protocol that reuses a name across the two maps — so a type judged against
   * its own kind alone could be given the other kind's name, and the refusal
   * would arrive from the schema after the researcher had finished the dialog,
   * with no name field to act on. Its own name is left out, or an edit that
   * changes nothing but the colour would be refused for colliding with itself.
   *
   * Read map by map rather than by a computed key: the codebook's two maps
   * hold different definition types, and one indexed by a union is a union of
   * maps nothing can be read out of without narrowing it again.
   */
  const existingEntityNames = useMemo(() => {
    const edited = editing?.typeId;
    return [
      ...Object.entries(codebook.node ?? {}),
      ...Object.entries(codebook.edge ?? {}),
    ].flatMap(([typeId, definition]) =>
      typeId === edited ? [] : [definition.name],
    );
  }, [codebook, editing?.typeId]);

  const createLabel = intl.formatMessage(CREATE_LABELS[entityType]);
  const editLabel = intl.formatMessage(EDIT_LABELS[entityType]);

  /*
    The triggers go when editing does, because an act nobody may start is not
    on offer. An editor already OPEN stays: the name the researcher is typing
    exists nowhere else, and unmounting it with the trigger would throw that
    away without a word — to report something `CodebookEntityEditor` says for
    itself once its save is refused. It takes `readOnly` for exactly this, and
    it is the rule the row dialogs already follow.
  */
  const offerTriggers = !readOnly && !disabled;

  return (
    <>
      {offerTriggers && (
        <div className="flex flex-row flex-wrap items-start gap-3">
          <Button
            ref={createTrigger}
            type="button"
            color="primary"
            size="sm"
            icon={<Plus aria-hidden="true" />}
            onClick={() =>
              setSession({ key: uuid(), typeId: uuid(), mode: 'create' })
            }
          >
            {createLabel}
          </Button>
          {/* Only for a type that is still there to edit. A stored id the
              codebook no longer describes is shown as the current choice so
              the researcher can see what they have to repair — there is
              nothing behind it for an editor to open. */}
          {heldType !== undefined && heldDocument !== undefined && (
            <Button
              ref={editTrigger}
              type="button"
              color="primary"
              size="sm"
              onClick={() =>
                setSession({
                  key: uuid(),
                  typeId: heldType,
                  mode: 'edit',
                  openedDocument: heldDocument,
                })
              }
            >
              {editLabel}
            </Button>
          )}
        </div>
      )}
      {session !== null && (
        <Dialog
          open
          title={session.mode === 'create' ? createLabel : editLabel}
          size="readable"
          // A request in flight refuses every way out, because the dialog is
          // about to show what the host made of it. Escape, a press outside
          // and the close button all arrive at `closeDialog`, so refusing
          // there covers all three — and `dismissible` takes the close button
          // away rather than leaving a control on screen that does nothing.
          // Dismissed mid-flight, the handler awaiting the request stays alive
          // and a success arriving afterwards still selects the new type on
          // the stage: the researcher would watch everything describing the
          // old type disappear, for a type they never saw arrive.
          dismissible={!submitting}
          closeDialog={() => {
            if (submitting) return;
            setSession(null);
          }}
          finalFocus={() =>
            session.mode === 'create'
              ? createTrigger.current
              : editTrigger.current
          }
        >
          {session.mode === 'create' ? (
            <CodebookEntityEditor
              mode="create"
              sessionKey={session.key}
              subject={{ entity: entityType, type: session.typeId }}
              initialDraft={newEntityDraft(
                entityType,
                Object.keys(codebook[entityType] ?? {}).length,
              )}
              readOnly={readOnly}
              existingEntityNames={existingEntityNames}
              onSubmit={async (document) => {
                setSubmitting(true);
                try {
                  return await createEntity(entityType, document);
                } finally {
                  setSubmitting(false);
                }
              }}
              onApplied={(outcome) => {
                // The id the HOST minted, read off the write: it is the host's
                // to issue, and the stage has to name the type it created.
                const ref = parseSectionId(outcome.sectionId);
                if (
                  ref.kind !== 'codebookNode' &&
                  ref.kind !== 'codebookEdge'
                ) {
                  setSession(null);
                  return;
                }
                // Asked while this dialog is still open, and it closes on
                // either answer: the type has been created and there is
                // nothing left to do in here, and the dialog outliving the
                // question is what keeps focus on a live control — the
                // confirm returns focus to the Save it was raised from, and
                // this dialog then returns it to its own trigger.
                void select(ref.typeId).finally(() => setSession(null));
              }}
              onCancel={() => setSession(null)}
            />
          ) : (
            editedDocument !== undefined && (
              <CodebookEntityEditor
                mode="update"
                sessionKey={session.key}
                subject={{ entity: entityType, type: session.typeId }}
                initialDraft={editedDocument}
                authoritativeDocument={editedDocument}
                readOnly={readOnly}
                existingEntityNames={existingEntityNames}
                onSubmit={async (document) => {
                  setSubmitting(true);
                  try {
                    return await writeSection(
                      { entity: entityType, type: session.typeId },
                      () => document,
                    );
                  } finally {
                    setSubmitting(false);
                  }
                }}
                onApplied={() => setSession(null)}
                onCancel={() => setSession(null)}
              />
            )
          )}
        </Dialog>
      )}
    </>
  );
}

/**
 * Picks one node or edge type from the protocol's codebook.
 *
 * The types are subscribed to here, in the control that reads them, so a
 * section mounting this never carries a codebook prop, a selector, or a stage
 * path — and a type a collaborator adds or deletes while the editor is open
 * appears or disappears here without the section doing anything.
 *
 * Making a type, and changing the one the stage holds, are offered here too —
 * see `EntityTypeCodebookControls`. `allowCodebookEditing` withdraws both for
 * a caller that must not offer them.
 *
 * Whether a change may happen, and what it costs, are the SECTION's to decide:
 * it passes `blockChangeReason` and `confirmChange`. What this control owns is
 * when the question is put — before the value moves, so nothing has to be put
 * back — and that the answer is re-judged against the protocol as it stands
 * when it arrives.
 *
 * Labelling belongs to the surrounding field; pass `label`/`hint` to the
 * `Field` that renders this.
 */
export default function EntityTypePickerField({
  id,
  name,
  entityType,
  value,
  onChange,
  onBlur,
  onFocus,
  confirmChange,
  blockChangeReason,
  allowCodebookEditing = true,
  disabled = false,
  readOnly: readOnlyProp = false,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: EntityTypePickerFieldProps) {
  const { readOnly: sessionReadOnly } = useStageEditorForm();
  const intl = useAppIntl();
  const { openDialog } = useDialog();
  const confirmEntityTypeChange = useConfirmEntityTypeChange();
  const refuseUneditableChange = useRefuseUneditableChange();
  const readOnly = readOnlyProp || sessionReadOnly;
  const generatedGroupName = useId();
  const groupName = name ?? generatedGroupName;

  /**
   * A pick, held back until the researcher has agreed to what it costs.
   *
   * Asked HERE, before the value moves, rather than by whatever watches it
   * afterwards: a watcher would have to put the picker back, and would be
   * asking about a change the researcher can already see on screen. The shape
   * Architect has always used (`NodeType`'s `promptBeforeChange`).
   *
   * Asked whatever the picker is currently showing. "The stage has no type
   * yet" is not the same as "the stage has nothing to lose": a filter written
   * before the type was picked is thrown away by the first choice exactly as
   * it is by a later change, and a guard keyed on the value would let that one
   * through in silence. `confirmChange` is where the loss is judged, and it
   * already returns nothing to ask when there is nothing to lose.
   */
  /**
   * What a refusal is judged against, kept live.
   *
   * Asked once before the question is put and again after it is answered, and
   * the second reading has to be the CURRENT one: a confirmation is awaited,
   * so the handler that resumes is a closure from the render that put the
   * question. Read from that closure, a dependency a collaborator created
   * while the researcher was reading the question — a narrative pedigree
   * pointed at this stage, say — would be invisible, and the confirmed change
   * would go through against a refusal the latest render is already showing.
   * The same seam the pedigree's own slot gate reads its live inputs through.
   *
   * Whether this control accepts input at all is read the same way and for the
   * same reason. A field of a read-only editor arrives `disabled`
   * (`FieldsDisabled` decides that for every field, so no section has to), and a
   * section can withdraw its own list while the question stands: the chips the
   * researcher is answering about are already out of reach behind the dialog,
   * and the closure resuming under them must not write what they can no longer
   * choose.
   */
  const judgeAgainst = useRef({ blockChangeReason, value, readOnly, disabled });
  judgeAgainst.current = { blockChangeReason, value, readOnly, disabled };

  const refuseBlockedChange = (nextType: string): boolean => {
    const { blockChangeReason: reason, value: current } = judgeAgainst.current;
    if (
      reason === undefined ||
      current === undefined ||
      current === '' ||
      nextType === current
    ) {
      return false;
    }
    void openDialog({
      type: 'acknowledge',
      intent: 'warning',
      title: intl.formatMessage(BLOCKED_TITLES[entityType]),
      description: reason,
      actions: {
        primary: {
          label: intl.formatMessage(commonMessages.continue),
          value: true,
        },
      },
    });
    return true;
  };

  /**
   * One pick, wherever it came from.
   *
   * A promise rather than a fire-and-forget, because a type created from
   * inside this control is selected through here too, and the dialog it was
   * created in has to stay open until the question this raises is answered.
   */
  const select = async (nextType: string): Promise<void> => {
    // Refused before it is confirmed: a change that may not happen at all is
    // not one to ask about, and asking first would offer the researcher a
    // choice the next dialog takes back.
    if (refuseBlockedChange(nextType)) return;
    const question = confirmChange?.();
    if (question === undefined) {
      onChange?.(nextType);
      return;
    }
    // The target is handed over with the question, so the shared confirm
    // refuses a "yes" whose type a collaborator has deleted in the meantime
    // — and refuses it wherever a confirmed type change is applied, not only
    // here.
    if (
      !(await confirmEntityTypeChange(question, {
        entityType,
        typeId: nextType,
      }))
    )
      return;
    // And on this control as it stands now. The stage's own read-only is
    // answered inside the confirm above, for every caller of it; what is
    // left here is this picker's reading of itself, which a section can
    // withdraw on its own.
    const live = judgeAgainst.current;
    if (refuseUneditableChange(live.readOnly || live.disabled)) return;
    // Asked AGAIN, on the protocol as it stands now. The researcher has
    // agreed to what this change costs their stage, which is a different
    // question from whether it may happen at all — and the answer to the
    // second one can have changed while they were reading the first.
    if (refuseBlockedChange(nextType)) return;
    onChange?.(nextType);
  };

  // The types themselves rather than the whole protocol: this control needs
  // each type's name and look and nothing else, so an edit inside a stage is
  // not a reason to redraw the chips.
  const summaries = useEntityTypes(entityType);
  const codebookOptions = useMemo(
    () => summaries.map((summary) => typeOption(summary, entityType)),
    [entityType, summaries],
  );

  const isMissing =
    value !== undefined &&
    value !== '' &&
    !codebookOptions.some((option) => option.value === value);

  const options = useMemo(
    () =>
      isMissing && value !== undefined
        ? [
            ...codebookOptions,
            {
              value,
              label: intl.formatMessage(messages.missingOptionLabel, {
                typeId: value,
              }),
              color:
                entityType === 'edge' ? DEFAULT_EDGE_COLOR : DEFAULT_NODE_COLOR,
            },
          ]
        : codebookOptions,
    [codebookOptions, entityType, intl, isMissing, value],
  );

  return (
    <div
      data-name={name}
      onBlur={onBlur}
      onFocus={onFocus}
      className={cx('flex w-full flex-col items-start gap-4', className)}
    >
      <fieldset
        id={id}
        role="radiogroup"
        aria-label={
          ariaLabelledBy === undefined
            ? intl.formatMessage(GROUP_LABELS[entityType])
            : undefined
        }
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
        aria-readonly={readOnly || undefined}
        disabled={disabled}
        className={cx(
          'bg-input text-input-contrast flex w-full min-w-0 flex-col items-start rounded border-2 p-4',
          ariaInvalid === true && 'border-destructive',
          disabled && 'opacity-50',
        )}
      >
        {options.length === 0 ? (
          <p className="w-full py-6 text-center text-sm text-current/70 italic">
            {intl.formatMessage(EMPTY_MESSAGES[entityType])}
          </p>
        ) : (
          <div className="flex flex-row flex-wrap justify-start gap-3">
            {options.map((option) => (
              <EntityOption
                key={option.value}
                option={option}
                entityType={entityType}
                groupName={groupName}
                checked={value === option.value}
                // The dangling reference is shown as the current choice, not
                // offered as one: it names nothing the interview could match,
                // so it cannot be chosen again once it has been replaced.
                disabled={disabled || (isMissing && value === option.value)}
                readOnly={readOnly}
                onSelect={() => void select(option.value)}
              />
            ))}
          </div>
        )}
      </fieldset>
      {isMissing && (
        <p className="text-destructive text-sm">
          {intl.formatMessage(messages.missingType)}
        </p>
      )}
      {allowCodebookEditing && (
        <EntityTypeCodebookControls
          entityType={entityType}
          {...(value === undefined || value === '' || isMissing
            ? {}
            : { heldType: value })}
          disabled={disabled}
          readOnly={readOnly}
          select={select}
        />
      )}
    </div>
  );
}

/**
 * The node and edge members of the subject union.
 *
 * An ego subject carries no type, so it has nothing for this control to pick;
 * a stage whose subject is ego says so by having no subject section at all.
 */
export type EntitySubject = Extract<StageSubject, { type: string }>;

/**
 * The subject a picked type stands for, or nothing at all.
 *
 * Written out per entity rather than assembled from `entityType`: the subject
 * union discriminates on `entity`, and a computed discriminant would only be a
 * subject after a cast.
 *
 * A picker that hands back nothing leaves the stage with NO subject, never
 * with a subject whose type is empty. The schema has one spelling for absent —
 * the key is not there — and `{entity: 'node', type: ''}` is a configured
 * subject pointing at a type that does not exist, which every section reading
 * the subject would believe in.
 */
export function entitySubject(
  entityType: EntitySubject['entity'],
  typeId: string | undefined,
): EntitySubject | undefined {
  if (typeId === undefined || typeId === '') return undefined;
  return entityType === 'node'
    ? { entity: 'node', type: typeId }
    : { entity: 'edge', type: typeId };
}

export type EntitySubjectPickerFieldProps = CreateFormFieldProps<
  EntitySubject,
  'div',
  {
    entityType: EntitySubject['entity'];
    /** See `EntityTypePickerFieldProps`. */
    confirmChange?: () => EntityTypeChangeConfirmation | undefined;
  }
>;

/**
 * A stage's `subject`, picked from the protocol's own codebook.
 *
 * The schema stores the subject as `{entity, type}` while the picker speaks
 * bare type ids, and the Fresco form store has no `format`/`parse` seam of its
 * own — so this is where the two are bridged, once, rather than in every
 * section that owns a subject.
 */
export function EntitySubjectPickerField({
  value,
  onChange,
  entityType,
  ...props
}: EntitySubjectPickerFieldProps) {
  return (
    <EntityTypePickerField
      {...props}
      entityType={entityType}
      value={value?.type}
      onChange={(nextType) => onChange?.(entitySubject(entityType, nextType))}
    />
  );
}
