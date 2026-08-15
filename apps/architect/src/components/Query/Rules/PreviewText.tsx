import { get, isArray, isNil, join } from 'es-toolkit/compat';
import type { CSSProperties } from 'react';

import Node, { type NodeShape } from '@codaco/fresco-ui/Node';
import { VariablePill } from '~/components/VariablePill';

import PreviewEdge from '../../sections/fields/EntitySelectField/PreviewEdge';
import PreviewNode from '../../sections/fields/EntitySelectField/PreviewNode';

// Ego is rendered as a one-off platinum node — not a real codebook color
const EGO_NODE_STYLE: CSSProperties = {
  ['--base' as string]: 'oklch(var(--platinum))',
};

const SUMMARY_EGO_NODE_STYLE: CSSProperties = {
  ['--base' as string]: 'oklch(var(--cyber-grape))',
};

const operatorsAsText = (isEgo: boolean) => ({
  EXISTS: 'where',
  NOT_EXISTS: 'without',
  EXACTLY: isEgo ? 'that is exactly equal to' : 'is exactly equal to',
  NOT: isEgo ? 'that is not' : 'is not',
  GREATER_THAN: isEgo ? 'that is greater than' : 'is greater than',
  GREATER_THAN_OR_EQUAL: isEgo
    ? 'that is greater than or equal to'
    : 'is greater than or equal to',
  LESS_THAN: isEgo ? 'that is less than' : 'is less than',
  LESS_THAN_OR_EQUAL: isEgo
    ? 'that is less than or equal to'
    : 'is less than or equal to',
  CONTAINS: isEgo ? 'that contains' : 'contains',
  DOES_NOT_CONTAIN: isEgo ? 'that does not contain' : 'does not contain',
  INCLUDES: isEgo ? 'that includes' : 'includes',
  NOT_INCLUDES: isEgo ? 'that does not include' : 'does not include',
  OPTIONS_GREATER_THAN: isEgo
    ? 'that has selected options greater than'
    : 'has selected options greater than',
  OPTIONS_LESS_THAN: isEgo
    ? 'that has selected options less than'
    : 'has selected options less than',
  OPTIONS_EQUALS: isEgo
    ? 'that has selected options equal to'
    : 'has selected options equal to',
  OPTIONS_NOT_EQUALS: isEgo
    ? 'that has selected options not equal to'
    : 'has selected options not equal to',
});

const typeOperatorsAsText = {
  EXISTS: 'exists',
  NOT_EXISTS: 'does not exist',
};

const formatValue = (
  value: string | number | boolean | Array<string | number>,
): string | number | boolean => {
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'object': {
      if (isArray(value)) {
        return join(value, ', ');
      }
      return value;
    }
    default:
      return value;
  }
};

type JoinProps = {
  value?: string;
  variant?: 'default' | 'summary';
};

/**
 * The separator between two rules, reading how they combine ("and"/"or").
 *
 * A labelled divider — a rule either side of the word. This was a
 * `<fieldset>`/`<legend>`, borrowed for the way a legend cuts a gap in the
 * border, which announced a form group containing no controls to every screen
 * reader, once per join. The geometry is unchanged: the line runs along the
 * top of the word, with the same gap around it and the same space beneath.
 */
export const Join = ({ value = '', variant = 'default' }: JoinProps) =>
  variant === 'summary' ? (
    <div className="w-full py-5 text-center text-current/70 uppercase italic">
      {value.toLowerCase()}
    </div>
  ) : (
    <span className="flex w-full items-start pb-10">
      <span className="border-platinum h-0 flex-1 border-t-4" />
      <span className="text-platinum-dark px-5 uppercase italic">
        {value.toLowerCase()}
      </span>
      <span className="border-platinum h-0 flex-1 border-t-4" />
    </span>
  );

/*
 * A rule reads as one sentence, and the whole card is the button that opens it
 * for editing — so every part below is phrasing content. A `<div>` inside a
 * `<button>` is invalid HTML, and the entity chips are drawn `presentational`
 * for the same reason: a control inside a control is invalid and gives
 * assistive technology a second, dead target.
 */

type VariableProps = {
  children?: React.ReactNode;
};

const Variable = ({ children = '' }: VariableProps) => <span>{children}</span>;

type OperatorProps = {
  value?: string;
  isEgo?: boolean;
};

const Operator = ({ value = '', isEgo = false }: OperatorProps) => (
  <span>{get(operatorsAsText(isEgo), value, value.toLowerCase())}</span>
);

type TypeOperatorProps = {
  value?: string;
};

const TypeOperator = ({ value = '' }: TypeOperatorProps) => (
  <span>{get(typeOperatorsAsText, value, value.toLowerCase())}</span>
);

type ValueProps = {
  value?: string | number | boolean | Array<string | number>;
  plain?: boolean;
};

const Value = ({ value = '', plain = false }: ValueProps) => {
  const formattedValue = formatValue(value);
  return (
    <span
      className={
        plain
          ? 'font-semibold'
          : 'border-rules-assert mx-1 -mb-0.75 border-b-[3px] border-dotted font-semibold'
      }
    >
      {formattedValue}
    </span>
  );
};

type CopyProps = {
  children?: string;
};

const Copy = ({ children = '' }: CopyProps) => <span>{children}</span>;

type RuleEntityProps = {
  type: string;
  color: string;
  shape?: NodeShape;
  label: string;
};

const RuleEntity = ({ type, color, shape, label }: RuleEntityProps) =>
  type === 'edge' ? (
    <PreviewEdge color={color} label={label} surface={2} />
  ) : (
    <PreviewNode
      color={color}
      shape={shape}
      label={label}
      size="xs"
      presentational
    />
  );

const PreviewText = ({
  type,
  options,
  variant = 'default',
}: PreviewTextProps) => {
  const isSummary = variant === 'summary';

  if (type === 'ego') {
    if (isSummary) {
      return (
        <div className="grid w-full grid-cols-[minmax(16rem,2fr)_minmax(8rem,1fr)_minmax(0,2fr)] items-center gap-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Node
              label="Ego"
              color="custom"
              size="xxs"
              className="shrink-0"
              style={SUMMARY_EGO_NODE_STYLE}
              presentational
            />
            <Copy>has</Copy>
            <VariablePill
              label={options.attribute ?? ''}
              type={
                (options.variableType as
                  | 'number'
                  | 'text'
                  | 'boolean'
                  | 'ordinal'
                  | 'categorical'
                  | 'scalar'
                  | 'datetime'
                  | 'layout'
                  | 'location') ?? 'text'
              }
              minWidth="0"
              width="100%"
            />
          </div>
          <Operator value={options.operator} isEgo />
          <Value value={options.value} plain />
        </div>
      );
    }

    return (
      <>
        <Node
          label="Ego"
          color="custom"
          size="xs"
          className="text-surface-2-contrast"
          style={EGO_NODE_STYLE}
          presentational
        />
        <Copy>has</Copy>
        <VariablePill
          label={options.attribute ?? ''}
          type={
            (options.variableType as
              | 'number'
              | 'text'
              | 'boolean'
              | 'ordinal'
              | 'categorical'
              | 'scalar'
              | 'datetime'
              | 'layout'
              | 'location') ?? 'text'
          }
        />
        <Operator value={options.operator} isEgo />
        <Value value={options.value} />
      </>
    );
  }

  if (isNil(options.attribute)) {
    return (
      <>
        <RuleEntity
          type={type}
          color={options.typeColor ?? ''}
          shape={options.typeShape}
          label={options.typeLabel ?? ''}
        />
        <TypeOperator value={options.operator} />
      </>
    );
  }
  if (isNil(options.value)) {
    return (
      <>
        <RuleEntity
          type={type}
          color={options.typeColor ?? ''}
          shape={options.typeShape}
          label={options.typeLabel ?? ''}
        />
        <Operator value={options.operator} />
        <Variable>{options.attribute}</Variable>
      </>
    );
  }

  if (isSummary) {
    return (
      <div className="grid w-full grid-cols-[minmax(16rem,2fr)_minmax(8rem,1fr)_minmax(0,2fr)] items-center gap-6">
        <div className="flex min-w-0 items-center gap-3">
          <RuleEntity
            type={type}
            color={options.typeColor ?? ''}
            shape={options.typeShape}
            label={options.typeLabel ?? ''}
          />
          <Copy>where</Copy>
          <VariablePill
            label={options.attribute ?? ''}
            type={
              (options.variableType as
                | 'number'
                | 'text'
                | 'boolean'
                | 'ordinal'
                | 'categorical'
                | 'scalar'
                | 'datetime'
                | 'layout'
                | 'location') ?? 'text'
            }
            minWidth="0"
            width="100%"
          />
        </div>
        <Operator value={options.operator} />
        <Value value={options.value} plain />
      </div>
    );
  }

  return (
    <>
      <RuleEntity
        type={type}
        color={options.typeColor ?? ''}
        shape={options.typeShape}
        label={options.typeLabel ?? ''}
      />
      <Copy>where</Copy>
      <VariablePill
        label={options.attribute ?? ''}
        type={
          (options.variableType as
            | 'number'
            | 'text'
            | 'boolean'
            | 'ordinal'
            | 'categorical'
            | 'scalar'
            | 'datetime'
            | 'layout'
            | 'location') ?? 'text'
        }
      />
      <Operator value={options.operator} />
      <Value value={options.value} />
    </>
  );
};

type PreviewTextOptions = {
  attribute?: string;
  operator?: string;
  type?: string;
  value?: string | number | boolean | Array<string | number>;
  variableType?: string;
  typeColor?: string;
  typeShape?: NodeShape;
  typeLabel?: string;
};

type PreviewTextProps = {
  type: string;
  options: PreviewTextOptions;
  variant?: 'default' | 'summary';
};

export default PreviewText;
