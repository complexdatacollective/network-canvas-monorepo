import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import ArrayField, {
  ArrayFieldDragHandle,
  stripManagedProperties,
  type ArrayFieldEditorProps,
  type ArrayFieldItemProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import type { Codebook } from '@codaco/protocol-validation';

import type { RuleDraft } from './rule.ts';
import type { RuleTargetType } from './ruleCodebook.ts';
import { describeRule, duplicateRuleIds } from './ruleDescription.ts';
import RuleEditorDialog, { type RuleTypeOption } from './RuleEditorDialog.tsx';
import RulePreview from './RulePreview.tsx';

/**
 * The rule a row holds, without the list's own bookkeeping — which fresco-ui
 * owns and strips, so a key it adds later cannot reach a saved protocol.
 *
 * A target that is not a string is read as no target at all, which is what
 * `describeRule` reports and what opens the editor on the Entity control. It
 * is not a reason to hide the row: a stored rule can arrive without a target,
 * and the row is the only way to reach the editor that could give it one.
 */
const asRule = (item: Record<string, unknown> | undefined): RuleDraft => {
  const rule = stripManagedProperties(item);
  return { ...rule, type: typeof rule.type === 'string' ? rule.type : '' };
};

type RuleListItemProps = ArrayFieldItemProps<RuleDraft> &
  Readonly<{
    codebook: Readonly<Codebook>;
    allowedTargets: readonly RuleTargetType[];
    duplicateIds: ReadonlySet<string>;
  }>;

function RuleListItem({
  item,
  index,
  itemCount,
  isBeingEdited,
  isSortable,
  dragControls,
  onEdit,
  onDelete,
  onMove,
  editTriggerRef,
  disabled,
  readOnly,
  codebook,
  allowedTargets,
  duplicateIds,
}: RuleListItemProps) {
  const rule = asRule(item);
  const textId = useId();
  const editActionId = useId();
  const deleteActionId = useId();
  const interactionDisabled = disabled || readOnly;
  const description = useMemo(
    () =>
      describeRule({ rule, codebook, targets: allowedTargets, duplicateIds }),
    [allowedTargets, codebook, duplicateIds, rule],
  );

  // External editors own the active row while their dialog is open. Hiding it
  // matches every other dialog-edited list and gives the shared layout
  // animation a single source and destination rather than two copies.
  //
  // The row a rule with no readable target renders is NOT hidden with it. A
  // half-added row is already covered — it exists only while its dialog is
  // open, and is dropped whole when that dialog is cancelled — so the only
  // rows this used to hide were stored ones, from a protocol authored
  // elsewhere or merged from a collaborator's edit. `ruleSetIssues` reports
  // those and the field tells the researcher to open rule N, and nothing here
  // opens a row by position: the row was the only way in, and hiding it left
  // the whole rule set unrepairable except by deleting every rule in it.
  if (isBeingEdited) return null;

  return (
    <>
      {/*
        Both controls act on this one rule, so both are named from the rule's
        sentence instead of repeating one generic name down the list. The
        action words remain hidden because `aria-labelledby` can compose them
        with the visible preview without duplicating content visually.
      */}
      <span id={editActionId} hidden>
        Edit rule:
      </span>
      <span id={deleteActionId} hidden>
        Delete rule:
      </span>
      <div className="@container w-full">
        <div className="flex w-full min-w-0 flex-col gap-3 @min-[34rem]:flex-row @min-[34rem]:items-center">
          {/*
            The list owns reordering; the row owns where the handle sits. The
            handle carries its own arrow-key equivalent, so the order of a rule
            set is changeable without a pointer.
          */}
          {isSortable && (
            <ArrayFieldDragHandle
              dragControls={dragControls}
              index={index}
              itemCount={itemCount}
              onMove={onMove}
              disabled={interactionDisabled}
              className="shrink-0 self-start @min-[34rem]:self-center"
            />
          )}
          <div className="min-w-0 flex-1">
            <RulePreview id={textId} description={description} />
            {/*
              Everything wrong with a rule is reported on the row itself, where
              the researcher can act on it, rather than only as a field-level
              error that names a position in a list. Every problem, not a
              chosen few: the row and the rule set's own field validation read
              the same list, so a rule the field refuses is exactly a rule the
              row marks.
            */}
            {description.problems.map((problem) => (
              <p
                key={problem.code}
                className="text-destructive text-sm"
                data-rule-problem={problem.code}
              >
                {problem.message}
              </p>
            ))}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-3">
            <IconButton
              ref={editTriggerRef}
              icon={<Pencil />}
              aria-labelledby={`${editActionId} ${textId}`}
              color="dynamic"
              variant="default"
              className="shrink-0 text-current"
              disabled={interactionDisabled}
              onClick={onEdit}
            />
            <IconButton
              icon={<Trash2 />}
              aria-labelledby={`${deleteActionId} ${textId}`}
              color="destructive"
              variant="default"
              className="shrink-0"
              disabled={interactionDisabled}
              onClick={onDelete}
            />
          </div>
        </div>
      </div>
    </>
  );
}

const SAVE_UNAVAILABLE_MESSAGE =
  'These rules are no longer editable, so this rule cannot be saved. Copy anything you want to keep, then close the editor.';

type RuleEditorSession = Readonly<{
  /** Bumped per session; the `key` that gives each one a fresh field store. */
  id: number;
  /** Preserved while closing so Motion can project the dialog back to its row. */
  sourceId: string;
  isNewItem: boolean;
  seed: RuleDraft;
  /** Read when the session opened, like the seed it belongs to. */
  idIsShared: boolean;
  open: boolean;
}>;

type RuleListEditorProps = ArrayFieldEditorProps<RuleDraft> &
  Readonly<{
    ruleTypes: readonly RuleTypeOption[];
    allowedTargets: readonly RuleTargetType[];
    duplicateIds: ReadonlySet<string>;
  }>;

function RuleListEditor({
  item,
  isNewItem,
  onSave,
  onCancel,
  getEditorTrigger,
  ruleTypes,
  allowedTargets,
  duplicateIds,
}: RuleListEditorProps) {
  const [session, setSession] = useState<RuleEditorSession | null>(null);

  // The list keeps one editor component mounted across sessions. Every newly
  // opened row — including reopening the same row after a cancelled edit —
  // gets its own session id, and so its own field store: Fresco has no
  // whole-form reinitialise, and a reused store would resurrect work the
  // researcher explicitly discarded.
  useEffect(() => {
    if (!item) {
      setSession((previous) =>
        previous ? { ...previous, open: false } : previous,
      );
      return;
    }

    setSession((previous) => {
      if (previous?.open === true && previous.sourceId === item._internalId) {
        return previous;
      }
      const seed = asRule(item);
      return {
        id: (previous?.id ?? 0) + 1,
        sourceId: item._internalId,
        isNewItem,
        seed,
        idIsShared: typeof seed.id === 'string' && duplicateIds.has(seed.id),
        open: true,
      };
    });
  }, [duplicateIds, isNewItem, item]);

  if (session === null) return null;

  return (
    <RuleEditorDialog
      key={session.id}
      open={item !== undefined && session.open}
      seed={session.seed}
      ruleTypes={ruleTypes}
      allowedTargets={allowedTargets}
      idIsShared={session.idIsShared}
      // `ArrayField` withdraws its save handler when the list stops being
      // editable, and this dialog may already be open when that happens.
      // Turning that absence into a call that does nothing told the researcher
      // their rule had been saved while the list never committed it and never
      // left editing — so the draft was lost and the editor stuck open.
      // Refusing keeps both the dialog and the draft, and says why.
      onSave={(rule) =>
        onSave === undefined
          ? { formErrors: [SAVE_UNAVAILABLE_MESSAGE] }
          : onSave(rule)
      }
      onCancel={onCancel}
      finalFocus={getEditorTrigger}
      {...(session.isNewItem ? {} : { layoutId: session.sourceId })}
    />
  );
}

export type RuleListProps = Readonly<{
  rules: readonly RuleDraft[];
  codebook: Readonly<Codebook>;
  ruleTypes: readonly RuleTypeOption[];
  /**
   * What a rule in this set may be about, which is narrower than what a rule
   * can BE: a rule the set cannot hold is marked on its own row rather than
   * left for the protocol schema to refuse.
   */
  allowedTargets: readonly RuleTargetType[];
  addButtonLabel: string;
  onChange: (rules: RuleDraft[]) => void;
  hasError?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
}>;

const createEmptyRule = (): Partial<RuleDraft> => ({});

/**
 * A rule's identity is its own id, so a row keeps its place through an add, a
 * delete and a reorder, and the editor a row opens is the editor for THAT
 * rule rather than for whatever is currently at that index.
 *
 * Only an id no other rule in this set holds. `ArrayField` derives one
 * internal id per row from this and then finds, updates and REMOVES by that
 * id: two rows answering with the same value are one row to it, so deleting
 * either deleted both and editing the second edited and displayed the first.
 * Answering `undefined` hands those rows back to `ArrayField`'s own per-object
 * identity, which is what every list without a `getId` uses and is unique by
 * construction. An id that is not a string answers `undefined` for the same
 * reason: the protocol schema requires a string, the row is already reported
 * as having none, and two rules holding the same non-string would collide
 * exactly as two rules holding the same string do.
 *
 * The alternative — writing a fresh id onto the second rule as it is read —
 * was rejected: it edits a stored protocol nobody asked to edit, and it does
 * it silently, resolving the very thing the researcher has to be told about.
 * The duplicate is reported on both rows instead (`duplicateId`), and the id
 * is only rewritten by the editor, on a rule the researcher opened and saved.
 */
const ruleRowId =
  (duplicateIds: ReadonlySet<string>) =>
  (rule: RuleDraft): string | undefined =>
    typeof rule.id === 'string' && !duplicateIds.has(rule.id)
      ? rule.id
      : undefined;

const NO_DUPLICATE_IDS: ReadonlySet<string> = new Set<string>();

/**
 * The ids more than one rule in this set is filed under, held to one identity
 * for as long as the answer itself does not change.
 *
 * The field above rebuilds its `rules` array on every render, so a set derived
 * straight from it would be a new object every time — and the item and editor
 * components below are identified by reference, so a new object in their
 * closure would remount every row on every keystroke elsewhere in the stage.
 * Recomputed during render and kept when nothing changed, which is the same
 * shape `ArrayField`'s own external-value sync uses.
 */
function useDuplicateRuleIds(rules: readonly RuleDraft[]): ReadonlySet<string> {
  const held = useRef<ReadonlySet<string>>(NO_DUPLICATE_IDS);
  const current = duplicateRuleIds(rules);
  const unchanged =
    current.size === held.current.size &&
    [...current].every((id) => held.current.has(id));
  if (!unchanged) held.current = current;
  return held.current;
}

/**
 * The shared editable-list presentation for skip-logic and network-filter
 * rules.
 *
 * Fresco's `ArrayField` owns row identity, list semantics, reordering with a
 * keyboard equivalent, focus return, deletion, animation and the standard add
 * affordance; this adapter supplies only the rule-specific preview and editor.
 */
export default function RuleList({
  rules,
  codebook,
  ruleTypes,
  allowedTargets,
  addButtonLabel,
  onChange,
  hasError = false,
  disabled = false,
  readOnly = false,
}: RuleListProps) {
  const duplicateIds = useDuplicateRuleIds(rules);

  // Bound here rather than through a context: the item and editor components
  // are identified by reference, so rebuilding them every render would remount
  // every row. Memoised on exactly what they close over.
  const itemComponent = useMemo(
    () =>
      function BoundRuleListItem(props: ArrayFieldItemProps<RuleDraft>) {
        return (
          <RuleListItem
            {...props}
            codebook={codebook}
            allowedTargets={allowedTargets}
            duplicateIds={duplicateIds}
          />
        );
      },
    [allowedTargets, codebook, duplicateIds],
  );

  const editorComponent = useMemo(
    () =>
      function BoundRuleListEditor(props: ArrayFieldEditorProps<RuleDraft>) {
        return (
          <RuleListEditor
            {...props}
            ruleTypes={ruleTypes}
            allowedTargets={allowedTargets}
            duplicateIds={duplicateIds}
          />
        );
      },
    [allowedTargets, duplicateIds, ruleTypes],
  );

  const getId = useMemo(() => ruleRowId(duplicateIds), [duplicateIds]);

  return (
    <ArrayField<RuleDraft>
      value={[...rules]}
      onChange={(nextRules) => onChange(nextRules ?? [])}
      getId={getId}
      itemTemplate={createEmptyRule}
      itemComponent={itemComponent}
      editorComponent={editorComponent}
      addButtonLabel={addButtonLabel}
      emptyStateMessage="No rules have been created yet."
      itemClasses="elevation-low"
      sortable
      disabled={disabled}
      readOnly={readOnly}
      aria-invalid={hasError}
    />
  );
}
