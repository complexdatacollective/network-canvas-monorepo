import { Fragment, type CSSProperties } from 'react';

import Icon from '@codaco/fresco-ui/Icon';
import Node, {
  NodeColors,
  type NodeColorSequence,
} from '@codaco/fresco-ui/Node';
import Pill from '@codaco/fresco-ui/Pill';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { ColorReference } from '@codaco/protocol-validation';

import { protocolColor } from '../protocolColor.ts';
import type {
  RuleDescription,
  RuleDescriptionAttribute,
  RuleDescriptionEntity,
  RuleDescriptionOperand,
} from './ruleDescription.ts';

type ProtocolIconStyle = CSSProperties & {
  '--icon-tone-primary'?: string;
  '--icon-tone-secondary'?: string;
};

const asNodeColor = (color: ColorReference): NodeColorSequence =>
  NodeColors.find((candidate) => candidate === color) ?? 'node-color-seq-1';

/**
 * The entity a rule is about, drawn the way the rest of the builder draws it:
 * a node as a node, an edge as its link glyph, the ego as a word.
 *
 * Presentational throughout — this is a preview of a rule, not another set of
 * controls inside the row that opens the editor.
 */
function RuleEntity({ entity }: { entity: RuleDescriptionEntity }) {
  if (entity.kind === 'ego') {
    return (
      <strong data-rule-entity="ego" className="font-bold">
        {entity.label}
      </strong>
    );
  }

  const iconStyle: ProtocolIconStyle = {
    '--icon-tone-primary': protocolColor(entity.color, { dark: true }),
    '--icon-tone-secondary': protocolColor(entity.color),
  };

  return (
    <span className="inline" data-rule-entity={entity.kind}>
      <span
        className="mr-2 inline-flex size-8 items-center justify-center align-middle"
        data-rule-entity-glyph={entity.kind}
        aria-hidden
      >
        {entity.kind === 'edge' ? (
          <Icon name="links" className="size-7" style={iconStyle} />
        ) : (
          <Node
            label=""
            color={asNodeColor(entity.color)}
            shape={entity.shape}
            size="xxs"
            presentational
          />
        )}
      </span>
      <strong className="font-bold wrap-break-word">{entity.label}</strong>
    </span>
  );
}

/**
 * The attribute a rule compares.
 *
 * The pill conveys the attribute's kind visually; the wrapper says it in
 * words, so assistive technology reads "categorical attribute Age" rather than
 * a bare name. An attribute the codebook no longer has says so instead of
 * naming a type it cannot know.
 */
function RuleAttribute({ attribute }: { attribute: RuleDescriptionAttribute }) {
  // A name followed by a labelled value, rather than a sentence assembled
  // around the type: nothing here has to agree grammatically with a type name.
  const description = attribute.missing
    ? `${attribute.label} (attribute is no longer in the codebook)`
    : `${attribute.label} (attribute type: ${attribute.type ?? 'text'})`;

  return (
    <span
      className="inline-flex max-w-full align-middle"
      aria-label={description}
    >
      <Pill
        variant="outline"
        className={cx(
          'variable-pill max-w-full min-w-0',
          attribute.missing && 'border-destructive text-destructive',
        )}
        data-rule-part="attribute"
        data-attribute-type={attribute.type}
        data-attribute-missing={attribute.missing ? '' : undefined}
      >
        <span className="min-w-0 overflow-hidden text-ellipsis">
          {attribute.label}
        </span>
      </Pill>
    </span>
  );
}

const operandClassName = (plain: boolean) =>
  plain
    ? 'max-w-full min-w-0 wrap-break-word whitespace-normal'
    : 'border-sea-green max-w-full min-w-0 rounded-sm border-2 border-dashed box-decoration-clone px-2 py-1 wrap-break-word whitespace-normal';

function OperandToken({
  value,
  plain,
  markdown,
}: {
  value: string | number;
  plain: boolean;
  markdown: boolean;
}) {
  const text = String(value);

  if (!markdown) {
    return (
      <span className={operandClassName(plain)} data-rule-part="value">
        {text}
      </span>
    );
  }

  return (
    <RenderMarkdown
      render={
        <span className={operandClassName(plain)} data-rule-part="value" />
      }
    >
      {text}
    </RenderMarkdown>
  );
}

function RuleOperand({
  operand,
  plain,
}: {
  operand: RuleDescriptionOperand;
  plain: boolean;
}) {
  return operand.items.map((item, index) => (
    <Fragment key={`${typeof item}-${String(item)}-${index}`}>
      {index > 0 && ', '}
      <OperandToken
        value={item}
        plain={plain}
        markdown={operand.authoredLabels}
      />
    </Fragment>
  ));
}

export type RulePreviewProps = Readonly<{
  id?: string;
  description: RuleDescription;
  /**
   * `summary` lays a rule out in three aligned columns for a printable
   * protocol summary; `default` reads it as one flowing sentence in the
   * editable list.
   */
  variant?: 'default' | 'summary';
}>;

/**
 * A rule, read back as one sentence.
 *
 * Takes an already-resolved description rather than a rule and a codebook, so
 * the resolution has exactly one implementation (`describeRule`) and the
 * editor's list and a host's printable summary cannot drift apart — which is
 * how the summary's attribute chip previously lost the words saying what kind
 * of attribute it was.
 */
export default function RulePreview({
  id,
  description,
  variant = 'default',
}: RulePreviewProps) {
  const { entity, attribute, operator, operand, columns } = description;
  const isSummary = variant === 'summary';
  const isEgo = description.target === 'ego';

  const subject = (
    <>
      {entity !== undefined && <RuleEntity entity={entity} />}
      {attribute !== undefined && (
        <>
          {' '}
          <span>{isEgo ? 'has' : 'where'}</span>{' '}
          <RuleAttribute attribute={attribute} />
        </>
      )}
    </>
  );
  const predicate = <span data-rule-part="operator">{operator.text}</span>;
  const value =
    operand === undefined ? null : (
      <RuleOperand operand={operand} plain={isSummary} />
    );

  if (isSummary) {
    // A three-part rule takes the summary's three columns; a two-part rule has
    // nothing to put in the third and reads better as a run of phrases.
    return columns ? (
      <div
        id={id}
        className="grid w-full grid-cols-[minmax(16rem,2fr)_minmax(8rem,1fr)_minmax(0,2fr)] items-center gap-6"
      >
        <div className="flex min-w-0 items-center gap-3">{subject}</div>
        {predicate}
        {/*
          One cell, however many operands are in it. As direct grid children a
          multi-select rule's tokens — the bare ", " separators included — each
          became a grid item and wrapped the tail of the list under the entity
          column.
        */}
        <div className="min-w-0">{value}</div>
      </div>
    ) : (
      <span id={id}>
        {subject} {predicate} {value}
      </span>
    );
  }

  return (
    <span
      id={id}
      className="block w-full min-w-0 leading-[2.5] text-wrap [&_.variable-pill]:zoom-[0.8]"
    >
      {value === null ? (
        <span data-rule-part="subject" className="inline whitespace-nowrap">
          {subject} {predicate}
        </span>
      ) : (
        <>
          <span data-rule-part="subject" className="inline">
            {subject}
          </span>{' '}
          <span data-rule-part="predicate" className="inline">
            {predicate} {value}
          </span>
        </>
      )}
    </span>
  );
}
