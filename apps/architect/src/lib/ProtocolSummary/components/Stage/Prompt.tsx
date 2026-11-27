import { get, isNull } from 'es-toolkit/compat';
import type { ReactNode } from 'react';

import {
  defineMessages,
  type IntlShape,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { UnorderedList } from '@codaco/fresco-ui/typography/UnorderedList';
import type { LocalizedString } from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import EntityBadge from '../EntityBadge';
import { SummaryValue } from '../helpers';
import MiniTable from '../MiniTable';
import { SummaryMarkdown } from '../SummaryText';
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
    description:
      'Value in the sort order list of a prompt in the printable protocol summary, shown in brackets after a property: items are sorted from lowest to highest.',
  },
  descending: {
    id: 'architect.summary.prompt.descending',
    defaultMessage: 'descending',
    description:
      'Value in the sort order list of a prompt in the printable protocol summary, shown in brackets after a property: items are sorted from highest to lowest.',
  },
  attribute: {
    id: 'architect.summary.prompt.attribute',
    defaultMessage: 'Attribute',
    description:
      "Row label in a prompt's table in the printable protocol summary; its value is the codebook variable that the prompt records.",
  },
  createsedge: {
    id: 'architect.summary.prompt.createsedge',
    defaultMessage: 'Creates edge',
    description:
      "Row label in a prompt's table in the printable protocol summary; its value is the edge type the prompt creates when participants connect two nodes.",
  },
  edgeStrengthAttribute: {
    id: 'architect.summary.prompt.edgeStrengthAttribute',
    defaultMessage: 'Edge Strength Attribute',
    description:
      "Row label in a prompt's table in the printable protocol summary; its value is the edge variable that records the strength of a connection.",
  },
  task: {
    id: 'architect.summary.prompt.task',
    defaultMessage: 'Task',
    description:
      "Row label in a Sociogram prompt's table in the printable protocol summary; its value is the task the prompt sets participants: positioning, highlighting or connecting nodes. The researcher reads it in Architect, and so does anyone the researcher gives the printed summary to.",
  },
  taskLayout: {
    id: 'architect.summary.prompt.taskLayout',
    defaultMessage: 'Position nodes',
    description:
      "Value of the Task row in a Sociogram prompt's table in the printable protocol summary: participants drag nodes to place them on the canvas. The researcher reads it in Architect, and so does anyone the researcher gives the printed summary to.",
  },
  taskHighlight: {
    id: 'architect.summary.prompt.taskHighlight',
    defaultMessage: 'Highlight nodes',
    description:
      "Value of the Task row in a Sociogram prompt's table in the printable protocol summary: participants tap nodes to set a Boolean attribute. The researcher reads it in Architect, and so does anyone the researcher gives the printed summary to.",
  },
  taskConnect: {
    id: 'architect.summary.prompt.taskConnect',
    defaultMessage: 'Connect nodes',
    description:
      "Value of the Task row in a Sociogram prompt's table in the printable protocol summary: participants tap two nodes to create an edge between them. The researcher reads it in Architect, and so does anyone the researcher gives the printed summary to.",
  },
  highlightattribute: {
    id: 'architect.summary.prompt.highlightattribute',
    defaultMessage: 'Highlight attribute',
    description:
      "Row label in a Sociogram prompt's table in the printable protocol summary; its value is a node type and the Boolean variable set when a participant highlights a node of that type. The table has one such row for each node type the prompt highlights. The researcher reads it in Architect, and so does anyone the researcher gives the printed summary to.",
  },
  negativeOptionLabel: {
    id: 'architect.summary.prompt.negativeOptionLabel',
    defaultMessage: 'Negative Option Label',
    description:
      "Row label in a prompt's table in the printable protocol summary; its value is the text of the answer button that means none of the options apply.",
  },
  sortbyproperty: {
    id: 'architect.summary.prompt.sortbyproperty',
    defaultMessage: 'Sort by property',
    description:
      "Row label in a prompt's table in the printable protocol summary; its value lists the properties used to sort the nodes shown to participants.",
  },
  binsortorder: {
    id: 'architect.summary.prompt.binsortorder',
    defaultMessage: 'Bin sort order',
    description:
      "Row label in a prompt's table in the printable protocol summary; its value lists how nodes are sorted within each bin of an ordinal bin stage.",
  },
  bucketsortorder: {
    id: 'architect.summary.prompt.bucketsortorder',
    defaultMessage: 'Bucket sort order',
    description:
      "Row label in a prompt's table in the printable protocol summary; its value lists how nodes are sorted in the bucket of nodes not yet placed.",
  },
  otherattribute: {
    id: 'architect.summary.prompt.otherattribute',
    defaultMessage: 'Other attribute',
    description:
      'Row label in a prompt\'s table in the printable protocol summary; its value is the variable that stores the text a participant types for an "other" answer.',
  },
  otherattributeprompt: {
    id: 'architect.summary.prompt.otherattributeprompt',
    defaultMessage: 'Other attribute prompt',
    description:
      'Row label in a prompt\'s table in the printable protocol summary; its value is the question shown to participants when they choose the "other" answer.',
  },
  otheroptionlabel: {
    id: 'architect.summary.prompt.otheroptionlabel',
    defaultMessage: 'Other option label',
    description:
      'Row label in a prompt\'s table in the printable protocol summary; its value is the text of the "other" answer option.',
  },
});

const directionLabel = (direction: string, intl: IntlShape) =>
  intl.formatMessage(
    direction === 'desc' ? extraMessages.descending : extraMessages.ascending,
  );

// Rich-text tag renderers are built at module scope so no JSX-returning
// function is defined inside a render body. `renderProperty` is a factory
// because the tag it fills is per-rule, and the message's `<property>` tag is
// authored empty — the rule's property supplies the content.
const renderProperty = (property: string) => () =>
  property === '*' ? property : <Variable id={property} />;

const renderSmall = (chunks: ReactNode[]) => <small>{chunks}</small>;

const isLocalizedString = (value: unknown): value is LocalizedString =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((text) => typeof text === 'string');

const renderLocalizedText = (text: unknown) =>
  isLocalizedString(text) ? <SummaryMarkdown value={text} /> : null;

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
        property: renderProperty(property),
        direction: renderSmall,
        directionLabel: directionLabel(direction, intl),
      })}
    </li>
  ));
  return <UnorderedList>{result}</UnorderedList>;
};

const isSortOrderRules = (value: unknown): value is SortOrderProps['rules'] =>
  Array.isArray(value) &&
  value.every(
    (rule) =>
      typeof rule === 'object' &&
      rule !== null &&
      'property' in rule &&
      typeof rule.property === 'string' &&
      'direction' in rule &&
      typeof rule.direction === 'string',
  );

const renderSortOrder = (rules: unknown) =>
  isSortOrderRules(rules) ? <SortOrder rules={rules} /> : null;

const attributes: Array<
  [string, MessageDescriptor, (val: unknown) => ReactNode]
> = [
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
  ['negativeLabel', extraMessages.negativeOptionLabel, renderLocalizedText],
  ['sortOrder', extraMessages.sortbyproperty, renderSortOrder],
  ['binSortOrder', extraMessages.binsortorder, renderSortOrder],
  ['bucketSortOrder', extraMessages.bucketsortorder, renderSortOrder],
  [
    'otherVariable',
    extraMessages.otherattribute,
    (id: unknown) => <Variable id={String(id)} />,
  ],
  [
    'otherVariablePrompt',
    extraMessages.otherattributeprompt,
    renderLocalizedText,
  ],
  ['otherOptionLabel', extraMessages.otheroptionlabel, renderLocalizedText],
];
const taskMessages: Record<string, MessageDescriptor> = {
  layout: extraMessages.taskLayout,
  highlight: extraMessages.taskHighlight,
  connect: extraMessages.taskConnect,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One row for each node type a highlight task marks, with its attribute. */
const highlightRows = (highlight: unknown, intl: IntlShape): ReactNode[][] =>
  Array.isArray(highlight)
    ? highlight.flatMap((entry: unknown) =>
        isRecord(entry) &&
        typeof entry.type === 'string' &&
        typeof entry.variable === 'string'
          ? [
              [
                intl.formatMessage(extraMessages.highlightattribute),
                <span
                  key={`${entry.type}-${entry.variable}`}
                  className="inline-flex items-center gap-2"
                >
                  <EntityBadge entity="node" type={entry.type} tiny link />
                  <Variable id={entry.variable} />
                </span>,
              ],
            ]
          : [],
      )
    : [];

const taskRows = (task: unknown, intl: IntlShape): ReactNode[][] => {
  const message = typeof task === 'string' ? taskMessages[task] : undefined;
  return message === undefined
    ? []
    : [[intl.formatMessage(extraMessages.task), intl.formatMessage(message)]];
};

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
  text: LocalizedString;
  additionalAttributes?: Array<{
    variable: string;
    value: unknown;
  }>;
  edges?: {
    create?: string;
  } | null;
  variable?: string | null;
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
  const attributeRows = [
    ...taskRows(prompt.task, intl),
    ...attributes.reduce(reduceAttribute(prompt, intl), [] as ReactNode[][]),
    ...highlightRows(prompt.highlight, intl),
  ];

  const additionalAttributeRows: ReactNode[][] = additionalAttributes.map(
    ({ variable: variableId, value }) => [
      <Variable key={variableId} id={variableId} />,
      <span key={`val-${variableId}`}>{<SummaryValue value={value} />}</span>,
    ],
  );

  return (
    <div className="break-inside-avoid">
      <SummaryMarkdown value={text} />
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
