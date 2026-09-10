import { get, isNull } from 'es-toolkit/compat';
import type { ReactNode } from 'react';

import {
  defineMessages,
  type IntlShape,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { UnorderedList } from '@codaco/fresco-ui/typography/UnorderedList';
import Markdown from '~/components/Markdown';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import EntityBadge from '../EntityBadge';
import { SummaryValue } from '../helpers';
import MiniTable from '../MiniTable';
import Variable from '../Variable';
const extraMessages = defineMessages({
  sortOrder: {
    id: 'architect.presentation.sortOrder',
    defaultMessage:
      '<property></property> <direction>({directionLabel})</direction>',
    description:
      'Complete presentation message. Preserve authored values; the translator controls spacing and punctuation.',
  },
  ascending: {
    id: 'architect.summary.prompt.ascending',
    defaultMessage: 'ascending',
    description: 'Researcher-facing Architect control or feedback.',
  },
  descending: {
    id: 'architect.summary.prompt.descending',
    defaultMessage: 'descending',
    description: 'Researcher-facing Architect control or feedback.',
  },
  layoutattribute: {
    id: 'architect.summary.prompt.layoutattribute',
    defaultMessage: 'Layout attribute',
    description: 'Researcher-facing Architect control or feedback.',
  },
  attribute: {
    id: 'architect.summary.prompt.attribute',
    defaultMessage: 'Attribute',
    description: 'Researcher-facing Architect control or feedback.',
  },
  createsedge: {
    id: 'architect.summary.prompt.createsedge',
    defaultMessage: 'Creates edge',
    description: 'Researcher-facing Architect control or feedback.',
  },
  edgeStrengthAttribute: {
    id: 'architect.summary.prompt.edgeStrengthAttribute',
    defaultMessage: 'Edge Strength Attribute',
    description: 'Researcher-facing Architect control or feedback.',
  },
  allowhighlighting: {
    id: 'architect.summary.prompt.allowhighlighting',
    defaultMessage: 'Allow highlighting',
    description: 'Researcher-facing Architect control or feedback.',
  },
  highlightattribute: {
    id: 'architect.summary.prompt.highlightattribute',
    defaultMessage: 'Highlight attribute',
    description: 'Researcher-facing Architect control or feedback.',
  },
  negativeOptionLabel: {
    id: 'architect.summary.prompt.negativeOptionLabel',
    defaultMessage: 'Negative Option Label',
    description: 'Researcher-facing Architect control or feedback.',
  },
  sortbyproperty: {
    id: 'architect.summary.prompt.sortbyproperty',
    defaultMessage: 'Sort by property',
    description: 'Researcher-facing Architect control or feedback.',
  },
  binsortorder: {
    id: 'architect.summary.prompt.binsortorder',
    defaultMessage: 'Bin sort order',
    description: 'Researcher-facing Architect control or feedback.',
  },
  bucketsortorder: {
    id: 'architect.summary.prompt.bucketsortorder',
    defaultMessage: 'Bucket sort order',
    description: 'Researcher-facing Architect control or feedback.',
  },
  otherattribute: {
    id: 'architect.summary.prompt.otherattribute',
    defaultMessage: 'Other attribute',
    description: 'Researcher-facing Architect control or feedback.',
  },
  otherattributeprompt: {
    id: 'architect.summary.prompt.otherattributeprompt',
    defaultMessage: 'Other attribute prompt',
    description: 'Researcher-facing Architect control or feedback.',
  },
  otheroptionlabel: {
    id: 'architect.summary.prompt.otheroptionlabel',
    defaultMessage: 'Other option label',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

const directionLabel = (direction: string, intl: IntlShape) =>
  intl.formatMessage(
    direction === 'desc' ? extraMessages.descending : extraMessages.ascending,
  );

type SortOrderProps = {
  rules: Array<{
    property: string;
    direction: string;
  }>;
};

const SortOrder = ({ rules }: SortOrderProps) => {
  const intl = useAppIntl();
  if (!rules) return null;

  const result = rules.map(({ property, direction }) => (
    <li key={property}>
      {intl.formatMessage(extraMessages.sortOrder, {
        property: () =>
          property === '*' ? property : <Variable id={property} />,
        direction: (children) => <small>{children}</small>,
        directionLabel: directionLabel(direction, intl),
      })}
    </li>
  ));
  return <UnorderedList>{result}</UnorderedList>;
};

const attributes: Array<
  [string, MessageDescriptor, (val: unknown) => ReactNode]
> = [
  [
    'layout.layoutVariable',
    extraMessages.layoutattribute,
    (id: unknown) => <Variable id={String(id)} />,
  ],
  [
    'variable',
    extraMessages.attribute,
    (id: unknown) => <Variable id={String(id)} />,
  ],
  [
    'edges.create',
    extraMessages.createsedge,
    (type: unknown) => (
      <EntityBadge entity="edge" type={String(type)} tiny link />
    ),
  ],
  [
    'createEdge',
    extraMessages.createsedge,
    (type: unknown) => (
      <EntityBadge entity="edge" type={String(type)} tiny link />
    ),
  ],
  [
    'edgeVariable',
    extraMessages.edgeStrengthAttribute,
    (id: unknown) => <Variable id={String(id)} />,
  ],
  [
    'highlight.allowHighlighting',
    extraMessages.allowhighlighting,
    (allow: unknown) => <SummaryValue value={allow} />,
  ],
  [
    'highlight.variable',
    extraMessages.highlightattribute,
    (id: unknown) => <Variable id={String(id)} />,
  ],
  [
    'negativeLabel',
    extraMessages.negativeOptionLabel,
    (text: unknown) => String(text),
  ],
  [
    'sortOrder',
    extraMessages.sortbyproperty,
    (rules: unknown) => <SortOrder rules={rules as SortOrderProps['rules']} />,
  ],
  [
    'binSortOrder',
    extraMessages.binsortorder,
    (rules: unknown) => <SortOrder rules={rules as SortOrderProps['rules']} />,
  ],
  [
    'bucketSortOrder',
    extraMessages.bucketsortorder,
    (rules: unknown) => <SortOrder rules={rules as SortOrderProps['rules']} />,
  ],
  [
    'otherVariable',
    extraMessages.otherattribute,
    (id: unknown) => <Variable id={String(id)} />,
  ],
  [
    'otherVariablePrompt',
    extraMessages.otherattributeprompt,
    (text: unknown) => String(text),
  ],
  [
    'otherOptionLabel',
    extraMessages.otheroptionlabel,
    (text: unknown) => String(text),
  ],
];
const reduceAttribute =
  (prompt: Record<string, unknown>, intl: IntlShape) =>
  (
    acc: ReactNode[][],
    [path, label, renderer]: [
      string,
      MessageDescriptor,
      (val: unknown) => ReactNode,
    ],
  ) => {
    const value = get(prompt, path, null);
    if (isNull(value)) {
      return acc;
    }
    return [...acc, [intl.formatMessage(label), renderer(value)]];
  };

type PromptProps = {
  text: string;
  additionalAttributes?: Array<{
    variable: string;
    value: unknown;
  }>;
  edges?: {
    create?: string;
  } | null;
  variable?: string | null;
  layout?: {
    layoutVariable?: string;
  } | null;
  createEdge?: string | null;
  edgeVariable?: string | null;
  [key: string]: unknown;
};

const Prompt = ({
  text,
  additionalAttributes = [],
  ...prompt
}: PromptProps) => {
  const intl = useAppIntl();
  const attributeRows = attributes.reduce(
    reduceAttribute(prompt, intl),
    [] as ReactNode[][],
  );

  const additionalAttributeRows: ReactNode[][] = additionalAttributes.map(
    ({ variable: variableId, value }) => [
      <Variable key={variableId} id={variableId} />,
      <span key={`val-${variableId}`}>{<SummaryValue value={value} />}</span>,
    ],
  );

  return (
    <div className="break-inside-avoid">
      <Markdown label={text} />
      {attributeRows.length > 0 && <MiniTable rotated rows={attributeRows} />}
      {additionalAttributes.length > 0 && (
        <MiniTable
          rows={[
            [
              intl.formatMessage(summaryMessages.attribute),
              intl.formatMessage(summaryMessages.value),
            ],
            ...additionalAttributeRows,
          ]}
        />
      )}
    </div>
  );
};

export default Prompt;
