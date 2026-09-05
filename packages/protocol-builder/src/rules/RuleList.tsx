import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import ArrayField, {
  ArrayFieldDragHandle,
  stripManagedProperties,
  type ArrayFieldEditorProps,
  type ArrayFieldItemProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import type { Codebook } from '@codaco/protocol-validation';

import type { RuleDraft } from './rule.ts';
import { describeRule } from './ruleDescription.ts';
import RuleEditorDialog, { type RuleTypeOption } from './RuleEditorDialog.tsx';
import RulePreview from './RulePreview.tsx';

/**
 * The rule a row holds, without the list's own bookkeeping — which fresco-ui
 * owns and strips, so a key it adds later cannot reach a saved protocol.
 *
 * A row still being added has no target yet, and every reader here treats an
 * empty target as "not a rule": the row renders nothing and the editor opens
 * on the Entity control.
 */
const asRule = (item: Record<string, unknown> | undefined): RuleDraft => {
  const rule = stripManagedProperties(item);
  return { ...rule, type: typeof rule.type === 'string' ? rule.type : '' };
};

type RuleListItemProps = ArrayFieldItemProps<RuleDraft> &
  Readonly<{ codebook: Readonly<Codebook> }>;

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
}: RuleListItemProps) {
  const rule = asRule(item);
  const textId = useId();
  const editActionId = useId();
  const deleteActionId = useId();
  const interactionDisabled = disabled || readOnly;
  const description = useMemo(
    () => describeRule({ rule, codebook }),
    [codebook, rule],
  );

  // External editors own the active row while their dialog is open. Hiding it
  // matches every other dialog-edited list and gives the shared layout
  // animation a single source and destination rather than two copies.
  if (isBeingEdited || rule.type === '') return null;

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
              A rule the codebook can no longer account for is reported on the
              row itself, where the researcher can act on it, rather than only
              as a field-level error that names a position in a list.
            */}
            {description.problems
              .filter(
                (problem) =>
                  problem.code === 'missingAttribute' ||
                  problem.code === 'missingEntityType',
              )
              .map((problem) => (
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

type RuleEditorSession = Readonly<{
  /** Bumped per session; the `key` that gives each one a fresh field store. */
  id: number;
  /** Preserved while closing so Motion can project the dialog back to its row. */
  sourceId: string;
  isNewItem: boolean;
  seed: RuleDraft;
  open: boolean;
}>;

type RuleListEditorProps = ArrayFieldEditorProps<RuleDraft> &
  Readonly<{ ruleTypes: readonly RuleTypeOption[] }>;

function RuleListEditor({
  item,
  isNewItem,
  onSave,
  onCancel,
  getEditorTrigger,
  ruleTypes,
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
      return {
        id: (previous?.id ?? 0) + 1,
        sourceId: item._internalId,
        isNewItem,
        seed: asRule(item),
        open: true,
      };
    });
  }, [isNewItem, item]);

  if (session === null) return null;

  return (
    <RuleEditorDialog
      key={session.id}
      open={item !== undefined && session.open}
      seed={session.seed}
      ruleTypes={ruleTypes}
      onSave={(rule) => onSave?.(rule)}
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
 */
const getRuleId = (rule: RuleDraft) => rule.id;

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
  addButtonLabel,
  onChange,
  hasError = false,
  disabled = false,
  readOnly = false,
}: RuleListProps) {
  // Bound here rather than through a context: the item and editor components
  // are identified by reference, so rebuilding them every render would remount
  // every row. Memoised on exactly what they close over.
  const itemComponent = useMemo(
    () =>
      function BoundRuleListItem(props: ArrayFieldItemProps<RuleDraft>) {
        return <RuleListItem {...props} codebook={codebook} />;
      },
    [codebook],
  );

  const editorComponent = useMemo(
    () =>
      function BoundRuleListEditor(props: ArrayFieldEditorProps<RuleDraft>) {
        return <RuleListEditor {...props} ruleTypes={ruleTypes} />;
      },
    [ruleTypes],
  );

  return (
    <ArrayField<RuleDraft>
      value={[...rules]}
      onChange={(nextRules) => onChange(nextRules ?? [])}
      getId={getRuleId}
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
