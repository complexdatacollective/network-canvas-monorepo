import { isEqual } from 'es-toolkit/compat';
import { Pencil, Trash2 } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
} from 'react';
import { v4 as uuid } from 'uuid';

import { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import ArrayField, {
  type ArrayFieldEditorProps,
  type ArrayFieldItemProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import { confirmDiscardNestedDraft } from '~/components/DialogForm/confirmDiscardNestedDraft';
import { useNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';

import EditRule from './EditRule';
import RulePreview from './PreviewRule';
import validateRule, { type Rule } from './validateRule';

export type RuleTypeOption = {
  label: string;
  value: 'node' | 'edge' | 'ego';
};

type EditableRule = Rule & Record<string, unknown>;

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

const stripManagedProperties = (
  item: Record<string, unknown> | undefined,
): EditableRule => {
  if (!item) return { type: '' };
  const { _internalId, _draft, ...rule } = item;
  return {
    ...rule,
    type: typeof rule.type === 'string' ? rule.type : '',
  };
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
  const { codebook } = useRuleListContext();
  const rule = stripManagedProperties(item);
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
        Edit rule:
      </span>
      <span id={deleteActionId} hidden>
        Delete rule:
      </span>
      <div className="@container w-full">
        <div className="flex w-full min-w-0 flex-col gap-3 @min-[34rem]:flex-row @min-[34rem]:items-center">
          <div className="min-w-0 flex-1">
            <RulePreview
              id={textId}
              type={rule.type}
              options={rule.options ?? {}}
              codebook={codebook}
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
  sourceId: string | null;
  draft: EditableRule;
  open: boolean;
  seed: EditableRule;
};

const RuleListEditor = ({
  item,
  onSave,
  onCancel,
  getEditorTrigger,
}: ArrayFieldEditorProps<EditableRule>) => {
  const { codebook, ruleTypes } = useRuleListContext();
  const { openDialog } = useDialog();
  const [session, setSession] = useState<RuleEditorSession | null>(null);

  // ArrayField keeps one editor component mounted across sessions. Reset its
  // local draft for every newly opened row, including reopening the same row
  // after a cancelled edit; retaining the previous draft would resurrect work
  // the researcher explicitly discarded.
  useEffect(() => {
    if (!item) {
      setSession((previous) =>
        previous ? { ...previous, open: false, sourceId: null } : previous,
      );
      return;
    }

    setSession((previous) => {
      if (previous?.open && previous.sourceId === item._internalId) {
        return previous;
      }
      const rule = stripManagedProperties(item);
      return {
        sourceId: item._internalId,
        draft: rule,
        open: true,
        seed: rule,
      };
    });
  }, [item]);

  const isDraftDirty = useCallback(
    () => !!session && !isEqual(session.draft, session.seed),
    [session],
  );
  useNestedDraft(!!item && !!session?.open, isDraftDirty);

  const handleCancel = useCallback(() => {
    if (!isDraftDirty()) {
      onCancel();
      return;
    }

    void confirmDiscardNestedDraft(openDialog).then((confirmed) => {
      if (confirmed) onCancel();
      return confirmed;
    });
  }, [isDraftDirty, onCancel, openDialog]);

  const handleSave = useCallback(() => {
    const draft = session?.draft;
    if (!draft || !validateRule(draft)) {
      void openDialog({
        type: 'acknowledge',
        intent: 'warning',
        title: 'Please complete all fields',
        description:
          'To create your rule, all fields are required. Please complete all fields before clicking save, or use cancel to abandon this rule.',
        actions: { primary: { label: 'OK', value: true } },
      });
      return;
    }

    onSave?.({ ...draft, id: draft.id ?? uuid() });
  }, [onSave, openDialog, session?.draft]);

  return (
    <EditRule
      open={!!item && !!session?.open}
      rule={session?.draft}
      ruleTypes={ruleTypes}
      codebook={codebook}
      onChange={(draft) =>
        setSession((previous) =>
          previous
            ? { ...previous, draft: stripManagedProperties(draft) }
            : previous,
        )
      }
      onCancel={handleCancel}
      onSave={handleSave}
      finalFocus={getEditorTrigger}
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
}: PreviewRulesProps) => (
  <RuleListContext.Provider value={{ codebook, ruleTypes }}>
    <ArrayField<EditableRule>
      value={rules as EditableRule[]}
      onChange={(nextRules) => onChange(nextRules ?? [])}
      getId={getRuleId}
      itemTemplate={createEmptyRule}
      itemComponent={RuleListItem}
      editorComponent={RuleListEditor}
      addButtonLabel={addButtonLabel}
      emptyStateMessage="No rules have been created yet."
      itemClasses="elevation-low"
      aria-invalid={hasError}
    />
  </RuleListContext.Provider>
);

export default PreviewRules;
