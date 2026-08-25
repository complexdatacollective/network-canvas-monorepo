import { get, isNil } from 'es-toolkit/compat';
import { Fragment, type CSSProperties, type ReactNode } from 'react';

import Icon from '@codaco/fresco-ui/Icon';
import Node, { NodeColors, type NodeShape } from '@codaco/fresco-ui/Node';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import type { ColorReference, VariableType } from '@codaco/protocol-validation';
import { VariablePill } from '~/components/VariablePill';
import { resolveProtocolColor } from '~/utils/resolveProtocolColor';

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
  EXCLUDES: isEgo ? 'that excludes' : 'excludes',
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

const formatValue = (value: string | number | boolean): string | number =>
  typeof value === 'boolean' ? (value ? 'true' : 'false') : value;

type JoinProps = {
  value?: string;
};

/**
 * The printable-summary separator between two rules, reading how they combine
 * ("and"/"or"). The editable rule list keeps this information in its Rule
 * Matching field instead of repeating it between cards.
 */
export const Join = ({ value = '' }: JoinProps) => (
  <div className="w-full py-5 text-center text-current/70 uppercase italic">
    {value.toLowerCase()}
  </div>
);

/*
 * A rule reads as one sentence. Its entity chips are presentational because
 * this is a preview, not another set of controls inside the editable-list row.
 *
 * Every part below is rendered by BOTH layouts. They used to be written out
 * once per layout, and the copies had already diverged: the printable
 * summary's attribute pill lost the text that says what kind of attribute it
 * is, leaving a coloured chip with nothing to read.
 */

const RuleSubject = ({ children }: { children: ReactNode }) => (
  <span data-rule-part="subject" className="inline">
    {children}
  </span>
);

const RulePredicate = ({ children }: { children: ReactNode }) => (
  <span data-rule-part="predicate" className="inline">
    {children}
  </span>
);

const RulePresence = ({ children }: { children: ReactNode }) => (
  <span data-rule-part="subject" className="inline whitespace-nowrap">
    {children}
  </span>
);

type OperatorProps = {
  value?: string;
  isEgo?: boolean;
};

const Operator = ({ value = '', isEgo = false }: OperatorProps) => (
  <span data-rule-part="operator">
    {get(operatorsAsText(isEgo), value, value.toLowerCase())}
  </span>
);

type TypeOperatorProps = {
  value?: string;
};

const TypeOperator = ({ value = '' }: TypeOperatorProps) => (
  <span data-rule-part="operator">
    {get(typeOperatorsAsText, value, value.toLowerCase())}
  </span>
);

/**
 * Whether the operand on screen is authored prose rather than the literal
 * string the interview compares.
 *
 * It is prose for exactly one shape of attribute: `getRuleDisplayOptions`
 * substitutes the LABEL the researcher wrote for the stored option value of a
 * categorical or ordinal variable, and those labels are Markdown everywhere
 * else they are shown. Every other operand is compared verbatim by the
 * interview runtime — a `contains` value is explicitly a regular expression
 * (see `RuleEditor`'s hint) — and Markdown eats the very characters that make
 * it one: `.*abc.*` reads back as `.abc.`, `^_id_[0-9]+$` as `^id[0-9]+$`.
 * Rendering it that way states a rule the protocol does not hold, in the
 * builder and in the archived protocol summary alike.
 */
const isAuthoredLabel = (variableType: VariableType | undefined) =>
  variableType === 'categorical' || variableType === 'ordinal';

type ValueProps = {
  value?: string | number | boolean | Array<string | number>;
  plain?: boolean;
  markdown?: boolean;
};

type ValueTokenProps = {
  plain: boolean;
  markdown: boolean;
  value: string | number | boolean;
};

const valueTokenClassName = (plain: boolean) =>
  plain
    ? 'max-w-full min-w-0 wrap-break-word whitespace-normal'
    : 'border-sea-green max-w-full min-w-0 rounded-sm border-2 border-dashed box-decoration-clone px-2 py-1 wrap-break-word whitespace-normal';

const ValueToken = ({ plain, markdown, value }: ValueTokenProps) => {
  const text = String(formatValue(value));

  if (!markdown) {
    return (
      <span className={valueTokenClassName(plain)} data-rule-part="value">
        {text}
      </span>
    );
  }

  return (
    <RenderMarkdown
      render={
        <span className={valueTokenClassName(plain)} data-rule-part="value" />
      }
    >
      {text}
    </RenderMarkdown>
  );
};

const Value = ({ value = '', plain = false, markdown = false }: ValueProps) => {
  const values = Array.isArray(value) ? value : [value];

  return values.map((item, index) => (
    <Fragment key={`${typeof item}-${String(item)}-${index}`}>
      {index > 0 && ', '}
      <ValueToken plain={plain} markdown={markdown} value={item} />
    </Fragment>
  ));
};

type CopyProps = {
  children?: string;
};

const Copy = ({ children = '' }: CopyProps) => <span>{children}</span>;

const EgoEntity = () => (
  <strong data-rule-entity="ego" className="font-bold">
    Ego
  </strong>
);

type RuleEntityProps = {
  type: string;
  color: ColorReference;
  shape?: NodeShape;
  label: string;
};

type ProtocolIconStyle = CSSProperties & {
  '--icon-tone-primary': string;
  '--icon-tone-secondary': string;
};

const RuleEntity = ({ type, color, shape, label }: RuleEntityProps) => {
  const iconStyle: ProtocolIconStyle = {
    '--icon-tone-primary': resolveProtocolColor(color, { dark: true }),
    '--icon-tone-secondary': resolveProtocolColor(color),
  };
  const nodeColor =
    NodeColors.find((candidate) => candidate === color) ?? NodeColors[0];

  return (
    <span className="inline" data-rule-entity={type}>
      <span
        className="mr-2 inline-flex size-8 items-center justify-center align-middle"
        data-rule-entity-glyph={type}
        aria-hidden
      >
        {type === 'edge' ? (
          <Icon name="links" className="size-7" style={iconStyle} />
        ) : (
          <Node
            label=""
            color={nodeColor}
            shape={shape}
            size="xxs"
            presentational
          />
        )}
      </span>
      <strong className="font-bold wrap-break-word">{label}</strong>
    </span>
  );
};

/** What an attribute of unknown type is described as. */
const DEFAULT_ATTRIBUTE_TYPE: VariableType = 'text';

type AttributePillProps = {
  label: string;
  type?: VariableType;
};

/**
 * The attribute a rule compares.
 *
 * `VariablePill` conveys the attribute's type through colour and an icon
 * alone, so the wrapper says it in words. That wrapper belongs to this one
 * component — when each layout owned its own copy, the printable summary's
 * went missing and its pill read as a bare name.
 */
const AttributePill = ({ label, type }: AttributePillProps) => (
  <span
    className="inline-flex max-w-full align-middle"
    aria-label={`${type ?? DEFAULT_ATTRIBUTE_TYPE} attribute ${label}`}
  >
    <VariablePill label={label} type={type ?? DEFAULT_ATTRIBUTE_TYPE} />
  </span>
);

/**
 * A rule as three slots — who, how, and what — plus whether the summary can
 * lay it out in its three columns.
 *
 * `value` is absent for a presence rule, which is a two-part sentence
 * ("person exists") and reads as one unbroken phrase.
 */
type RuleSentence = {
  subject: ReactNode;
  operator: ReactNode;
  value?: ReactNode;
  columns: boolean;
};

const describeRule = (
  type: string,
  options: PreviewTextOptions,
  fillPill: boolean,
): RuleSentence => {
  const isEgo = type === 'ego';
  const entity = isEgo ? (
    <EgoEntity />
  ) : (
    <RuleEntity
      type={type}
      color={
        options.typeColor ??
        (type === 'edge' ? 'edge-color-seq-1' : 'node-color-seq-1')
      }
      shape={options.typeShape}
      label={options.typeLabel ?? ''}
    />
  );

  // A presence rule names no attribute at all.
  if (!isEgo && isNil(options.attribute)) {
    return {
      subject: entity,
      operator: <TypeOperator value={options.operator} />,
      columns: false,
    };
  }

  // Attribute-presence operators take no operand. The attribute is still a
  // codebook variable, so it uses the same typed pill as value-bearing rules.
  if (!isEgo && isNil(options.value)) {
    return {
      subject: entity,
      operator: <Operator value={options.operator} />,
      value: (
        <AttributePill
          label={options.attribute ?? ''}
          type={options.variableType}
        />
      ),
      columns: false,
    };
  }

  return {
    subject: (
      <>
        {entity} <Copy>{isEgo ? 'has' : 'where'}</Copy>{' '}
        <AttributePill
          label={options.attribute ?? ''}
          type={options.variableType}
        />
      </>
    ),
    operator: <Operator value={options.operator} isEgo={isEgo} />,
    value: (
      <Value
        value={options.value}
        plain={fillPill}
        markdown={isAuthoredLabel(options.variableType)}
      />
    ),
    columns: true,
  };
};

const PreviewText = ({
  type,
  options,
  variant = 'default',
}: PreviewTextProps) => {
  const isSummary = variant === 'summary';
  const { subject, operator, value, columns } = describeRule(
    type,
    options,
    isSummary,
  );

  if (isSummary) {
    // The printable summary aligns rules under one another, so a rule with all
    // three parts takes the three columns. A two-part rule has nothing to put
    // in the third and reads better as a run of phrases.
    return columns ? (
      <div className="grid w-full grid-cols-[minmax(16rem,2fr)_minmax(8rem,1fr)_minmax(0,2fr)] items-center gap-6">
        <div className="flex min-w-0 items-center gap-3">{subject}</div>
        {operator}
        {/*
          One cell, however many operands are in it. A multi-select rule
          renders one token per selected option with ", " between them, and as
          direct children of the grid every one of those — the bare separator
          text included — became a grid item of its own and wrapped the tail of
          the list onto a second row under the entity column.
        */}
        <div className="min-w-0">{value}</div>
      </div>
    ) : (
      <>
        {subject}
        {operator}
        {value}
      </>
    );
  }

  if (value === undefined) {
    return (
      <RulePresence>
        {subject} {operator}
      </RulePresence>
    );
  }

  return (
    <>
      <RuleSubject>{subject}</RuleSubject>{' '}
      <RulePredicate>
        {operator} {value}
      </RulePredicate>
    </>
  );
};

export type PreviewTextOptions = {
  attribute?: string;
  operator?: string;
  type?: string;
  value?: string | number | boolean | Array<string | number>;
  /**
   * The schema's own variable-type union, not a hand-copy of it. The union was
   * written out four times as an unchecked assertion, which is what hid the
   * codebook lookup defaulting to `'string'` — a type the schema has never
   * had, and which the pill rendered with the fallback colour and icon.
   */
  variableType?: VariableType;
  typeColor?: ColorReference;
  typeShape?: NodeShape;
  typeLabel?: string;
};

type PreviewTextProps = {
  type: string;
  options: PreviewTextOptions;
  variant?: 'default' | 'summary';
};

export default PreviewText;
