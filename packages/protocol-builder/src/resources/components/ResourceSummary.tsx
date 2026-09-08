import type { ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Heading from '@codaco/fresco-ui/typography/Heading';

import type { ResourceInspection } from '../gateway.ts';
import {
  formatByteLength,
  resourceKindLabel,
  resourceStatusLabel,
} from './resourceKinds.ts';

const messages = defineMessages({
  fileTerm: {
    id: 'protocolBuilder.resourceSummary.fileTerm',
    defaultMessage: 'File',
    description:
      'Label beside the original filename of a resource a researcher imported into their protocol.',
  },
  sizeTerm: {
    id: 'protocolBuilder.resourceSummary.sizeTerm',
    defaultMessage: 'Size',
    description:
      'Label beside how much storage a resource takes, shown as a rounded size such as "1.5 KB".',
  },
  nodesTerm: {
    id: 'protocolBuilder.resourceSummary.nodesTerm',
    defaultMessage: 'Nodes',
    description:
      'Label beside how many nodes an imported roster holds. "Node" is the network-research term for one person or entity in the data.',
  },
  edgesTerm: {
    id: 'protocolBuilder.resourceSummary.edgesTerm',
    defaultMessage: 'Edges',
    description:
      'Label beside how many edges an imported roster holds. "Edge" is the network-research term for a tie between two people or entities.',
  },
  attributesTerm: {
    id: 'protocolBuilder.resourceSummary.attributesTerm',
    defaultMessage: 'Attributes',
    description:
      'Label beside the attribute names an imported roster carries — the data fields the interview will read from it.',
  },
  dimensionsTerm: {
    id: 'protocolBuilder.resourceSummary.dimensionsTerm',
    defaultMessage: 'Dimensions',
    description: 'Label beside the pixel width and height of an image.',
  },
  durationTerm: {
    id: 'protocolBuilder.resourceSummary.durationTerm',
    defaultMessage: 'Duration',
    description: 'Label beside how long an audio or video resource plays for.',
  },
  dimensions: {
    id: 'protocolBuilder.resourceSummary.dimensions',
    defaultMessage: '{width} × {height} pixels',
    description:
      'The pixel size of an image a researcher imported. width and height are exact pixel counts, so they are not grouped.',
  },
  duration: {
    id: 'protocolBuilder.resourceSummary.duration',
    defaultMessage: '{seconds, plural, one {# second} other {# seconds}}',
    description:
      'How long an imported audio or video resource plays for, rounded to whole seconds.',
  },
});

export type ResourceSummaryProps = Readonly<{
  inspection: ResourceInspection;
}>;

type DetailProps = Readonly<{ term: string; children: ReactNode }>;

function Detail({ term, children }: DetailProps) {
  return (
    <div className="flex gap-2">
      <dt className="text-current/70">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/**
 * What the researcher is told about the resource a field holds.
 *
 * Everything shown comes from one `inspect` call, including the facts a data
 * file is chosen on — how many entries it holds and which attributes it
 * carries — which is what Architect's roster browser shows and the only way to
 * tell two similarly named files apart before the interview runs.
 */
export default function ResourceSummary({ inspection }: ResourceSummaryProps) {
  const intl = useAppIntl();
  const { descriptor, counts, variableNames, dimensions, durationSeconds } =
    inspection;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Heading level="h4" margin="none">
          {descriptor.name}
        </Heading>
        <Badge variant="outline">
          {resourceKindLabel(descriptor.kind, intl)}
        </Badge>
        <Badge>{resourceStatusLabel(descriptor.status, intl)}</Badge>
      </div>
      <dl className="flex flex-col gap-1 text-sm">
        {descriptor.source !== undefined && (
          <Detail term={intl.formatMessage(messages.fileTerm)}>
            {descriptor.source}
          </Detail>
        )}
        {descriptor.byteLength !== undefined && (
          <Detail term={intl.formatMessage(messages.sizeTerm)}>
            {formatByteLength(descriptor.byteLength, intl)}
          </Detail>
        )}
        {counts !== undefined && (
          <>
            <Detail term={intl.formatMessage(messages.nodesTerm)}>
              {counts.nodes}
            </Detail>
            <Detail term={intl.formatMessage(messages.edgesTerm)}>
              {counts.edges}
            </Detail>
          </>
        )}
        {variableNames !== undefined && variableNames.length > 0 && (
          <Detail term={intl.formatMessage(messages.attributesTerm)}>
            {variableNames.join(', ')}
          </Detail>
        )}
        {dimensions !== undefined && (
          <Detail term={intl.formatMessage(messages.dimensionsTerm)}>
            {intl.formatMessage(messages.dimensions, {
              width: dimensions.width,
              height: dimensions.height,
            })}
          </Detail>
        )}
        {durationSeconds !== undefined && (
          <Detail term={intl.formatMessage(messages.durationTerm)}>
            {intl.formatMessage(messages.duration, {
              seconds: Math.round(durationSeconds),
            })}
          </Detail>
        )}
      </dl>
    </div>
  );
}
