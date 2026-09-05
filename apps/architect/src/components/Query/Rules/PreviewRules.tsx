import { Pencil, Trash2 } from 'lucide-react';
import { createContext, useContext, useEffect, useId, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import ArrayField, {
  stripManagedProperties,
  type ArrayFieldEditorProps,
  type ArrayFieldItemProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';

import RulePreview from './PreviewRule';
import type { RuleTypeOption } from './ruleCodebook';
import RuleEditor, { type EditableRule } from './RuleEditor';
import type { Rule } from './validateRule';
import { getRuleDisplayOptions } from './withDisplayOptions';
const additionalMessages = defineMessages({
  noRulesHaveBeenCreatedYet: {
    id: 'architect.additional.query.rules.previewRules.noRulesHaveBeenCreatedYet',
    defaultMessage: 'No rules have been created yet.',
    description:
      'The emptyStateMessage text in components / Query / Rules / PreviewRules.',
  },
});
const messages = defineMessages({
  editRule: {
    id: 'architect.query.rules.previewRules.editRule',
    defaultMessage: 'Edit rule:',
    description: 'Visible text in components / Query / Rules / PreviewRules.',
  },
  deleteRule: {
    id: 'architect.query.rules.previewRules.deleteRule',
    defaultMessage: 'Delete rule:',
    description: 'Visible text in components / Query / Rules / PreviewRules.',
  },
});

type RuleListContextValue = {
  codebook: Record<string, unknown>;
  ruleTypes: RuleTypeOption[];
};

const RuleListContext = createContext<RuleListContextValue | null>(null);

const useRuleListContext = () => {
  const context = useContext(RuleListContext);
  if (!context)
    throw new Error('Rule list parts must render inside a rule list.');
  return context;
};

/**
 * The rule a row holds, without the list's own bookkeeping — which fresco-ui
 * owns and strips, so a key it adds later cannot reach a saved protocol.
 *
 * A row still being added has no target yet, and every reader here treats an
 * empty target as "not a rule": the row renders nothing and the editor opens
 * on the Entity control.
 */
const toRule = (item: Record<string, unknown> | undefined): EditableRule => {
  const rule = stripManagedProperties(item);
  return { ...rule, type: typeof rule.type === 'string' ? rule.type : '' };
};

const RuleListItem = ({
  item,
  isBeingEdited,
  onEdit,
  onDelete,
  editTriggerRef,
  disabled,
  readOnly,
}: ArrayFieldItemProps<EditableRule>) => {
  const intl = useAppIntl();
  const { codebook } = useRuleListContext();
  const rule = toRule(item);
  const textId = useId();
  const editActionId = useId();
  const deleteActionId = useId();
  const interactionDisabled = disabled || readOnly;

  // External editors own the active row while their dialog is open. Hiding it
  // matches every other dialog-edited ArrayField and gives the shared layout
  // animation a single source and destination rather than two copies.
  if (isBeingEdited || !rule.type) return null;

  return (
    <>
      {/*
        Both controls act on this one rule, so both are named from the rule's
        sentence instead of repeating one generic name down the list. The
        action words remain hidden because `aria-labelledby` can compose them
        with the visible preview without duplicating content visually.
      */}
      <span id={editActionId} hidden>
        {intl.formatMessage(messages.editRule)}
      </span>
      <span id={deleteActionId} hidden>
        {intl.formatMessage(messages.deleteRule)}
      </span>
      <div className="@container w-full">
        <div className="flex w-full min-w-0 flex-col gap-3 @min-[34rem]:flex-row @min-[34rem]:items-center">
          <div className="min-w-0 flex-1">
            <RulePreview
              id={textId}
              type={rule.type}
              options={getRuleDisplayOptions({
                type: rule.type,
                options: rule.options ?? {},
                codebook,
              })}
            />
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
};

type RuleEditorSession = {
  /** Bumped per session; the `key` that gives each one a fresh field store. */
  id: number;
  /** Preserved while closing so Motion can project the dialog back to its row. */
  sourceId: string;
  isNewItem: boolean;
  seed: EditableRule;
  open: boolean;
};

const RuleListEditor = ({
  item,
  isNewItem,
  onSave,
  onCancel,
  getEditorTrigger,
}: ArrayFieldEditorProps<EditableRule>) => {
  const { codebook, ruleTypes } = useRuleListContext();
  const [session, setSession] = useState<RuleEditorSession | null>(null);

  // ArrayField keeps one editor component mounted across sessions. Every newly
  // opened row — including reopening the same row after a cancelled edit —
  // gets its own session id, and so its own field store: fresco-ui has no
  // whole-form reinitialize, and a reused store would resurrect work the
  // researcher explicitly discarded.
  useEffect(() => {
    if (!item) {
      setSession((previous) =>
        previous ? { ...previous, open: false } : previous,
      );
      return;
    }

    setSession((previous) => {
      if (previous?.open && previous.sourceId === item._internalId) {
        return previous;
      }
      return {
        id: (previous?.id ?? 0) + 1,
        sourceId: item._internalId,
        isNewItem,
        seed: toRule(item),
        open: true,
      };
    });
  }, [isNewItem, item]);

  if (!session) return null;

  return (
    <RuleEditor
      key={session.id}
      open={!!item && session.open}
      seed={session.seed}
      ruleTypes={ruleTypes}
      codebook={codebook}
      onSave={(rule) => onSave?.(rule)}
      onCancel={onCancel}
      finalFocus={getEditorTrigger}
      layoutId={session.isNewItem ? undefined : session.sourceId}
    />
  );
};

type PreviewRulesProps = {
  rules: Rule[];
  codebook: Record<string, unknown>;
  ruleTypes: RuleTypeOption[];
  addButtonLabel: string;
  onChange: (rules: Rule[]) => void;
  hasError?: boolean;
};

const createEmptyRule = (): Partial<EditableRule> => ({});
const getRuleId = (rule: EditableRule) => rule.id;

/**
 * The shared editable-list presentation for skip-logic and network-filter
 * rules. Fresco's ArrayField owns row identity, list semantics, focus return,
 * deletion, animation and the standard add affordance; this adapter supplies
 * only the rule-specific preview and editor.
 */
const PreviewRules = ({
  rules,
  codebook,
  ruleTypes,
  addButtonLabel,
  onChange,
  hasError = false,
}: PreviewRulesProps) => {
  const intl = useAppIntl();
  return (
    <RuleListContext.Provider value={{ codebook, ruleTypes }}>
      <ArrayField<EditableRule>
        value={rules as EditableRule[]}
        onChange={(nextRules) => onChange(nextRules ?? [])}
        getId={getRuleId}
        itemTemplate={createEmptyRule}
        itemComponent={RuleListItem}
        editorComponent={RuleListEditor}
        addButtonLabel={addButtonLabel}
        emptyStateMessage={intl.formatMessage(
          additionalMessages.noRulesHaveBeenCreatedYet,
        )}
        itemClasses="elevation-low"
        aria-invalid={hasError}
      />
    </RuleListContext.Provider>
  );
};

export default PreviewRules;
