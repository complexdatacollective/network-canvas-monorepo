import { type CSSProperties, useId, useMemo } from 'react';

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
  type RuleEntityTarget,
  type RuleEntityTypeOption,
  ruleEntityTypeOptions,
} from '../rules/ruleCodebook.ts';

export type EntitySelectFieldProps = CreateFormFieldProps<
  string,
  'div',
  {
    entityType: RuleEntityTarget;
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
const EMPTY_MESSAGES: Readonly<Record<RuleEntityTarget, string>> =
  Object.freeze({
    node: 'This protocol has no node types yet.',
    edge: 'This protocol has no edge types yet.',
  });

const GROUP_LABELS: Readonly<Record<RuleEntityTarget, string>> = Object.freeze({
  node: 'Node type',
  edge: 'Edge type',
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
  disabled = false,
  readOnly: readOnlyProp = false,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: EntitySelectFieldProps) {
  const { protocolContext, readOnly: sessionReadOnly } = useStageEditorForm();
  const readOnly = readOnlyProp || sessionReadOnly;
  const generatedGroupName = useId();
  const groupName = name ?? generatedGroupName;

  const options = useMemo(
    () => ruleEntityTypeOptions(protocolContext.codebook, entityType),
    [entityType, protocolContext.codebook],
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
          ariaLabelledBy === undefined ? GROUP_LABELS[entityType] : undefined
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
            {EMPTY_MESSAGES[entityType]}
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
                disabled={disabled}
                readOnly={readOnly}
                onSelect={() => onChange?.(option.value)}
              />
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}
