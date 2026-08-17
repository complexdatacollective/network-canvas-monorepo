import { get, isNil } from 'es-toolkit/compat';
import { Fragment, type CSSProperties } from 'react';

import Icon from '@codaco/fresco-ui/Icon';
import Node, { NodeColors, type NodeShape } from '@codaco/fresco-ui/Node';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
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
  variant?: 'default' | 'list' | 'summary';
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
  ) : variant === 'list' ? (
    <span className="flex w-full items-center gap-3 py-2.5 text-sm font-semibold tracking-wide text-current/60 uppercase">
      <span className="h-0 flex-1 border-t border-current/20" />
      <span>{value.toLowerCase()}</span>
      <span className="h-0 flex-1 border-t border-current/20" />
    </span>
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
 * A rule reads as one sentence. Its entity chips are presentational because
 * this is a preview, not another set of controls inside the editable-list row.
 */

type VariableProps = {
  children?: React.ReactNode;
};

const Variable = ({ children = '' }: VariableProps) => <span>{children}</span>;

const RuleSubject = ({ children }: { children: React.ReactNode }) => (
  <span data-rule-part="subject" className="inline">
    {children}
  </span>
);

const RulePredicate = ({ children }: { children: React.ReactNode }) => (
  <span data-rule-part="predicate" className="inline">
    {children}
  </span>
);

const RulePresence = ({ children }: { children: React.ReactNode }) => (
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

type ValueProps = {
  value?: string | number | boolean | Array<string | number>;
  plain?: boolean;
};

type ValueTokenProps = {
  plain: boolean;
  value: string | number | boolean;
};

const ValueToken = ({ plain, value }: ValueTokenProps) => (
  <RenderMarkdown
    render={
      <span
        className={
          plain
            ? 'max-w-full min-w-0 wrap-break-word whitespace-normal'
            : 'border-sea-green max-w-full min-w-0 rounded-sm border-2 border-dashed box-decoration-clone px-2 py-1 wrap-break-word whitespace-normal'
        }
        data-rule-part="value"
      />
    }
  >
    {String(formatValue(value))}
  </RenderMarkdown>
);

const Value = ({ value = '', plain = false }: ValueProps) => {
  const values = Array.isArray(value) ? value : [value];

  return values.map((item, index) => (
    <Fragment key={`${typeof item}-${String(item)}-${index}`}>
      {index > 0 && ', '}
      <ValueToken plain={plain} value={item} />
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
  color: string;
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
            <EgoEntity />
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
        <RuleSubject>
          <EgoEntity /> <Copy>has</Copy>{' '}
          <span
            className="inline-flex max-w-full align-middle"
            aria-label={`${options.variableType ?? 'text'} variable ${options.attribute ?? ''}`}
          >
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
          </span>
        </RuleSubject>{' '}
        <RulePredicate>
          <Operator value={options.operator} isEgo />{' '}
          <Value value={options.value} />
        </RulePredicate>
      </>
    );
  }

  if (isNil(options.attribute)) {
    if (!isSummary) {
      return (
        <RulePresence>
          <RuleEntity
            type={type}
            color={options.typeColor ?? ''}
            shape={options.typeShape}
            label={options.typeLabel ?? ''}
          />{' '}
          <TypeOperator value={options.operator} />
        </RulePresence>
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
        <TypeOperator value={options.operator} />
      </>
    );
  }
  if (isNil(options.value)) {
    if (!isSummary) {
      return (
        <>
          <RuleSubject>
            <RuleEntity
              type={type}
              color={options.typeColor ?? ''}
              shape={options.typeShape}
              label={options.typeLabel ?? ''}
            />
          </RuleSubject>{' '}
          <RulePredicate>
            <Operator value={options.operator} />{' '}
            <Variable>{options.attribute}</Variable>
          </RulePredicate>
        </>
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
      <RuleSubject>
        <RuleEntity
          type={type}
          color={options.typeColor ?? ''}
          shape={options.typeShape}
          label={options.typeLabel ?? ''}
        />{' '}
        <Copy>where</Copy>{' '}
        <span
          className="inline-flex max-w-full align-middle"
          aria-label={`${options.variableType ?? 'text'} variable ${options.attribute ?? ''}`}
        >
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
        </span>
      </RuleSubject>{' '}
      <RulePredicate>
        <Operator value={options.operator} /> <Value value={options.value} />
      </RulePredicate>
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
