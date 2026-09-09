import { type CSSProperties, useCallback, useId, useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import Icon from '@codaco/fresco-ui/Icon';
import Node, {
  NodeColors,
  type NodeColorSequence,
} from '@codaco/fresco-ui/Node';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { ColorReference } from '@codaco/protocol-validation';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { protocolColor } from '../protocolColor.ts';
import {
  DEFAULT_EDGE_COLOR,
  DEFAULT_NODE_COLOR,
  type RuleEntityTarget,
  type RuleEntityTypeOption,
  ruleEntityTypeOptions,
} from '../rules/ruleCodebook.ts';

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
 */
export function useConfirmEntityTypeChange(): (
  question: EntityTypeChangeConfirmation | undefined,
) => Promise<boolean> {
  const { confirm } = useDialog();
  return useCallback(
    async (question) => {
      if (question === undefined) return true;
      const confirmed = await confirm({
        title: question.title,
        description: question.description,
        confirmLabel: question.confirmLabel,
        intent: 'warning',
        onConfirm: () => undefined,
      });
      return confirmed === true;
    },
    [confirm],
  );
}

export type EntitySelectFieldProps = CreateFormFieldProps<
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
  }
>;

const asNodeColor = (color: ColorReference): NodeColorSequence =>
  NodeColors.find((candidate) => candidate === color) ?? 'node-color-seq-1';

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
    defaultMessage: 'This protocol has no node types yet.',
    description:
      'Shown in place of the chips when a researcher is asked to choose a node type and the protocol’s codebook defines none. A node type is a kind of network member the study records, such as a person or a place.',
  },
  edge: {
    id: 'protocolBuilder.entitySelect.edgeEmptyState',
    defaultMessage: 'This protocol has no edge types yet.',
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
    defaultMessage: 'Node type',
    description:
      'Accessible name of the group of chips a researcher picks a node type from. A node type is a kind of network member the study records, such as a person or a place.',
  },
  edge: {
    id: 'protocolBuilder.entitySelect.edgeGroupLabel',
    defaultMessage: 'Edge type',
    description:
      'Accessible name of the group of chips a researcher picks an edge type from. An edge type is a kind of relationship between two network members, such as a friendship.',
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
      'Shown under the chips when the node or edge type a researcher’s stored choice names has been deleted from the protocol’s codebook, so the choice has to be made again.',
  },
});

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
 * Picks one node or edge type from the protocol's codebook.
 *
 * The types come from the editor's own protocol context, so a section mounting
 * this never carries a codebook prop, a selector, or a stage path — and a type
 * a collaborator adds or deletes while the editor is open appears or
 * disappears here without the section doing anything.
 *
 * There is deliberately no "create a new type" affordance: creating a codebook
 * entity from inside a rule is a compound edit across two protocol sections,
 * which the package's codebook editors own.
 *
 * Labelling belongs to the surrounding field; pass `label`/`hint` to the
 * `Field` that renders this.
 */
export function EntitySelectControl({
  id,
  name,
  entityType,
  value,
  onChange,
  onBlur,
  onFocus,
  confirmChange,
  disabled = false,
  readOnly: readOnlyProp = false,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: EntitySelectFieldProps) {
  const { protocolContext, readOnly: sessionReadOnly } = useStageEditorForm();
  const intl = useAppIntl();
  const confirmEntityTypeChange = useConfirmEntityTypeChange();
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
  const select = (nextType: string) => {
    const question = confirmChange?.();
    if (question === undefined) {
      onChange?.(nextType);
      return;
    }
    void (async () => {
      if (await confirmEntityTypeChange(question)) onChange?.(nextType);
    })();
  };

  const codebookOptions = useMemo(
    () => ruleEntityTypeOptions(protocolContext.codebook, entityType),
    [entityType, protocolContext.codebook],
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
                onSelect={() => select(option.value)}
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
    </div>
  );
}
