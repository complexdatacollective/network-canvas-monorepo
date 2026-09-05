import { isNil } from 'es-toolkit/compat';
import { Fragment, type CSSProperties, type ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Icon from '@codaco/fresco-ui/Icon';
import Node, { NodeColors, type NodeShape } from '@codaco/fresco-ui/Node';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import type { ColorReference, VariableType } from '@codaco/protocol-validation';
import { VariablePill } from '~/components/VariablePill';
import { VARIABLE_TYPES } from '~/config/variables';
import { formatConfig } from '~/i18n/formatConfig';
import { resolveProtocolColor } from '~/utils/resolveProtocolColor';
const messages = defineMessages({
  ego: {
    id: 'architect.query.rules.previewText.ego',
    defaultMessage: 'Ego',
    description: 'Visible text in components / Query / Rules / PreviewText.',
  },
  attribute: {
    id: 'architect.query.rules.previewText.attribute',
    defaultMessage: '{value1} attribute {label}',
    description:
      'The aria-label text in components / Query / Rules / PreviewText.',
  },
});
const sentenceMessages = defineMessages({
  EXACTLY: {
    id: 'architect.query.sentence.exactly',
    defaultMessage:
      '{target, select, ego {<subject><entity></entity> has <attribute></attribute></subject> <predicate><operator>that is exactly equal to</operator> <operand></operand></predicate>} other {<subject><entity></entity> where <attribute></attribute></subject> <predicate><operator>is exactly equal to</operator> <operand></operand></predicate>}}',
    description:
      'Complete rule-preview sentence. Rich tags preserve entity and attribute chips and the literal authored operand; translate and reorder the whole sentence, keeping all tags.',
  },
  NOT: {
    id: 'architect.query.sentence.not',
    defaultMessage:
      '{target, select, ego {<subject><entity></entity> has <attribute></attribute></subject> <predicate><operator>that is not</operator> <operand></operand></predicate>} other {<subject><entity></entity> where <attribute></attribute></subject> <predicate><operator>is not</operator> <operand></operand></predicate>}}',
    description:
      'Complete rule-preview sentence. Rich tags preserve entity and attribute chips and the literal authored operand; translate and reorder the whole sentence, keeping all tags.',
  },
  GREATER_THAN: {
    id: 'architect.query.sentence.greaterThan',
    defaultMessage:
      '{target, select, ego {<subject><entity></entity> has <attribute></attribute></subject> <predicate><operator>that is greater than</operator> <operand></operand></predicate>} other {<subject><entity></entity> where <attribute></attribute></subject> <predicate><operator>is greater than</operator> <operand></operand></predicate>}}',
    description:
      'Complete rule-preview sentence. Rich tags preserve entity and attribute chips and the literal authored operand; translate and reorder the whole sentence, keeping all tags.',
  },
  GREATER_THAN_OR_EQUAL: {
    id: 'architect.query.sentence.greaterThanOrEqual',
    defaultMessage:
      '{target, select, ego {<subject><entity></entity> has <attribute></attribute></subject> <predicate><operator>that is greater than or equal to</operator> <operand></operand></predicate>} other {<subject><entity></entity> where <attribute></attribute></subject> <predicate><operator>is greater than or equal to</operator> <operand></operand></predicate>}}',
    description:
      'Complete rule-preview sentence. Rich tags preserve entity and attribute chips and the literal authored operand; translate and reorder the whole sentence, keeping all tags.',
  },
  LESS_THAN: {
    id: 'architect.query.sentence.lessThan',
    defaultMessage:
      '{target, select, ego {<subject><entity></entity> has <attribute></attribute></subject> <predicate><operator>that is less than</operator> <operand></operand></predicate>} other {<subject><entity></entity> where <attribute></attribute></subject> <predicate><operator>is less than</operator> <operand></operand></predicate>}}',
    description:
      'Complete rule-preview sentence. Rich tags preserve entity and attribute chips and the literal authored operand; translate and reorder the whole sentence, keeping all tags.',
  },
  LESS_THAN_OR_EQUAL: {
    id: 'architect.query.sentence.lessThanOrEqual',
    defaultMessage:
      '{target, select, ego {<subject><entity></entity> has <attribute></attribute></subject> <predicate><operator>that is less than or equal to</operator> <operand></operand></predicate>} other {<subject><entity></entity> where <attribute></attribute></subject> <predicate><operator>is less than or equal to</operator> <operand></operand></predicate>}}',
    description:
      'Complete rule-preview sentence. Rich tags preserve entity and attribute chips and the literal authored operand; translate and reorder the whole sentence, keeping all tags.',
  },
  CONTAINS: {
    id: 'architect.query.sentence.contains',
    defaultMessage:
      '{target, select, ego {<subject><entity></entity> has <attribute></attribute></subject> <predicate><operator>that contains</operator> <operand></operand></predicate>} other {<subject><entity></entity> where <attribute></attribute></subject> <predicate><operator>contains</operator> <operand></operand></predicate>}}',
    description:
      'Complete rule-preview sentence. Rich tags preserve entity and attribute chips and the literal authored operand; translate and reorder the whole sentence, keeping all tags.',
  },
  DOES_NOT_CONTAIN: {
    id: 'architect.query.sentence.doesNotContain',
    defaultMessage:
      '{target, select, ego {<subject><entity></entity> has <attribute></attribute></subject> <predicate><operator>that does not contain</operator> <operand></operand></predicate>} other {<subject><entity></entity> where <attribute></attribute></subject> <predicate><operator>does not contain</operator> <operand></operand></predicate>}}',
    description:
      'Complete rule-preview sentence. Rich tags preserve entity and attribute chips and the literal authored operand; translate and reorder the whole sentence, keeping all tags.',
  },
  INCLUDES: {
    id: 'architect.query.sentence.includes',
    defaultMessage:
      '{target, select, ego {<subject><entity></entity> has <attribute></attribute></subject> <predicate><operator>that includes</operator> <operand></operand></predicate>} other {<subject><entity></entity> where <attribute></attribute></subject> <predicate><operator>includes</operator> <operand></operand></predicate>}}',
    description:
      'Complete rule-preview sentence. Rich tags preserve entity and attribute chips and the literal authored operand; translate and reorder the whole sentence, keeping all tags.',
  },
  EXCLUDES: {
    id: 'architect.query.sentence.excludes',
    defaultMessage:
      '{target, select, ego {<subject><entity></entity> has <attribute></attribute></subject> <predicate><operator>that excludes</operator> <operand></operand></predicate>} other {<subject><entity></entity> where <attribute></attribute></subject> <predicate><operator>excludes</operator> <operand></operand></predicate>}}',
    description:
      'Complete rule-preview sentence. Rich tags preserve entity and attribute chips and the literal authored operand; translate and reorder the whole sentence, keeping all tags.',
  },
  OPTIONS_GREATER_THAN: {
    id: 'architect.query.sentence.optionsGreaterThan',
    defaultMessage:
      '{target, select, ego {<subject><entity></entity> has <attribute></attribute></subject> <predicate><operator>that has selected options greater than</operator> <operand></operand></predicate>} other {<subject><entity></entity> where <attribute></attribute></subject> <predicate><operator>has selected options greater than</operator> <operand></operand></predicate>}}',
    description:
      'Complete rule-preview sentence. Rich tags preserve entity and attribute chips and the literal authored operand; translate and reorder the whole sentence, keeping all tags.',
  },
  OPTIONS_LESS_THAN: {
    id: 'architect.query.sentence.optionsLessThan',
    defaultMessage:
      '{target, select, ego {<subject><entity></entity> has <attribute></attribute></subject> <predicate><operator>that has selected options less than</operator> <operand></operand></predicate>} other {<subject><entity></entity> where <attribute></attribute></subject> <predicate><operator>has selected options less than</operator> <operand></operand></predicate>}}',
    description:
      'Complete rule-preview sentence. Rich tags preserve entity and attribute chips and the literal authored operand; translate and reorder the whole sentence, keeping all tags.',
  },
  OPTIONS_EQUALS: {
    id: 'architect.query.sentence.optionsEquals',
    defaultMessage:
      '{target, select, ego {<subject><entity></entity> has <attribute></attribute></subject> <predicate><operator>that has selected options equal to</operator> <operand></operand></predicate>} other {<subject><entity></entity> where <attribute></attribute></subject> <predicate><operator>has selected options equal to</operator> <operand></operand></predicate>}}',
    description:
      'Complete rule-preview sentence. Rich tags preserve entity and attribute chips and the literal authored operand; translate and reorder the whole sentence, keeping all tags.',
  },
  OPTIONS_NOT_EQUALS: {
    id: 'architect.query.sentence.optionsNotEquals',
    defaultMessage:
      '{target, select, ego {<subject><entity></entity> has <attribute></attribute></subject> <predicate><operator>that has selected options not equal to</operator> <operand></operand></predicate>} other {<subject><entity></entity> where <attribute></attribute></subject> <predicate><operator>has selected options not equal to</operator> <operand></operand></predicate>}}',
    description:
      'Complete rule-preview sentence. Rich tags preserve entity and attribute chips and the literal authored operand; translate and reorder the whole sentence, keeping all tags.',
  },
  entityPresence: {
    id: 'architect.query.sentence.entityPresence',
    defaultMessage:
      '<subject><entity></entity> <operator>{operatorCode, select, NOT_EXISTS {does not exist} other {exists}}</operator></subject>',
    description:
      'Whole sentence for whether an authored node or edge type exists.',
  },
  attributePresence: {
    id: 'architect.query.sentence.attributePresence',
    defaultMessage:
      '<subject><entity></entity></subject> <operator>{operatorCode, select, NOT_EXISTS {without} other {where}}</operator> <attribute></attribute>',
    description:
      'Whole sentence for whether an entity has an attribute. Entity and attribute tags render authored labels.',
  },
  join: {
    id: 'architect.query.sentence.join',
    defaultMessage: '{join, select, AND {and} OR {or} other {}}',
    description:
      'How adjacent network-filter rules combine. AND and OR are protocol identifiers; translate their displayed labels only.',
  },
  booleanValue: {
    id: 'architect.query.sentence.booleanValue',
    defaultMessage: '{value, select, true {true} other {false}}',
    description:
      'Display of a boolean rule operand; the stored value is unchanged.',
  },
  unknown: {
    id: 'architect.query.sentence.unknown',
    defaultMessage:
      '<subject><entity></entity> <attribute></attribute></subject> <predicate><operator>{operatorCode}</operator> <operand></operand></predicate>',
    description:
      'Fallback for an unknown technical operator; do not alter the operator token.',
  },
});

type JoinProps = {
  value?: string;
};

/**
 * The printable-summary separator between two rules, reading how they combine
 * ("and"/"or"). The editable rule list keeps this information in its Rule
 * Matching field instead of repeating it between cards.
 */
export const Join = ({ value = '' }: JoinProps) => {
  const intl = useAppIntl();
  return (
    <div className="w-full py-5 text-center text-current/70 uppercase italic">
      {intl.formatMessage(sentenceMessages.join, { join: value })}
    </div>
  );
};

/*
 * A rule reads as one sentence. Its entity chips are presentational because
 * this is a preview, not another set of controls inside the editable-list row.
 *
 * Every part below is rendered by BOTH layouts. They used to be written out
 * once per layout, and the copies had already diverged: the printable
 * summary's attribute pill lost the text that says what kind of attribute it
 * is, leaving a coloured chip with nothing to read.
 */

const RuleSubject = ({
  children,
  presence,
}: {
  children: ReactNode;
  presence: boolean;
}) => (
  <span
    data-rule-part="subject"
    className={presence ? 'inline whitespace-nowrap' : 'inline'}
  >
    {children}
  </span>
);

const RulePredicate = ({ children }: { children: ReactNode }) => (
  <span data-rule-part="predicate" className="inline">
    {children}
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
  const intl = useAppIntl();
  const text =
    typeof value === 'boolean'
      ? intl.formatMessage(sentenceMessages.booleanValue, {
          value: String(value),
        })
      : String(value);

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
      {/* Literal list punctuation separates authored values without modifying them. */}
      {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx */}
      {index > 0 && ', '}
      <ValueToken plain={plain} markdown={markdown} value={item} />
    </Fragment>
  ));
};

const EgoEntity = () => {
  const intl = useAppIntl();
  return (
    <strong data-rule-entity="ego" className="font-bold">
      {intl.formatMessage(messages.ego)}
    </strong>
  );
};

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
const AttributePill = ({ label, type }: AttributePillProps) => {
  const intl = useAppIntl();
  return (
    <span
      className="inline-flex max-w-full align-middle"
      aria-label={intl.formatMessage(messages.attribute, {
        value1: formatConfig(
          VARIABLE_TYPES[type ?? DEFAULT_ATTRIBUTE_TYPE],
          intl,
        ).label.toLocaleLowerCase(intl.locale),
        label: label,
      })}
    >
      <VariablePill label={label} type={type ?? DEFAULT_ATTRIBUTE_TYPE} />
    </span>
  );
};

/** One whole ICU sentence owns grammar and ordering in both presentation layouts. */
const PreviewText = ({
  type,
  options,
  variant = 'default',
}: PreviewTextProps) => {
  const intl = useAppIntl();
  const isSummary = variant === 'summary';
  const isEgo = type === 'ego';
  const entityPresence = !isEgo && isNil(options.attribute);
  const attributePresence = !entityPresence && isNil(options.value);
  const operator = options.operator ?? '';
  const descriptor = entityPresence
    ? sentenceMessages.entityPresence
    : attributePresence
      ? sentenceMessages.attributePresence
      : getSentenceMessage(operator);
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
  const sentence = intl.formatMessage(descriptor, {
    target: type,
    operatorCode: operator,
    entity: () => entity,
    attribute: () => (
      <AttributePill
        label={options.attribute ?? ''}
        type={options.variableType}
      />
    ),
    operand: () => (
      <div className={isSummary ? 'min-w-0' : 'inline'}>
        <Value
          value={options.value}
          plain={isSummary}
          markdown={isAuthoredLabel(options.variableType)}
        />
      </div>
    ),
    subject: (children) =>
      isSummary ? (
        <div
          className="flex min-w-0 items-center gap-3"
          data-rule-part="subject"
        >
          {children}
        </div>
      ) : (
        <RuleSubject presence={entityPresence}>{children}</RuleSubject>
      ),
    operator: (children) => <span data-rule-part="operator">{children}</span>,
    predicate: (children) =>
      isSummary ? (
        <Fragment>{children}</Fragment>
      ) : (
        <RulePredicate>{children}</RulePredicate>
      ),
  });
  return isSummary && !entityPresence && !attributePresence ? (
    <div className="grid w-full grid-cols-[minmax(16rem,2fr)_minmax(8rem,1fr)_minmax(0,2fr)] items-center gap-6">
      {sentence}
    </div>
  ) : (
    <span className={entityPresence ? 'inline whitespace-nowrap' : 'inline'}>
      {sentence}
    </span>
  );
};

const getSentenceMessage = (operator: string) => {
  const byOperator: Record<
    string,
    (typeof sentenceMessages)[keyof typeof sentenceMessages] | undefined
  > = sentenceMessages;
  return byOperator[operator] ?? sentenceMessages.unknown;
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
