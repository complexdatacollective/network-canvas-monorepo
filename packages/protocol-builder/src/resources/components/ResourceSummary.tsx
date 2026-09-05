import type { ReactNode } from 'react';

import { Badge } from '@codaco/fresco-ui/Badge';
import Heading from '@codaco/fresco-ui/typography/Heading';

import type { ResourceInspection } from '../gateway.ts';
import {
  formatByteLength,
  resourceKindLabel,
  resourceStatusLabel,
} from './resourceKinds.ts';

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
  const { descriptor, counts, variableNames, dimensions, durationSeconds } =
    inspection;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Heading level="h4" margin="none">
          {descriptor.name}
        </Heading>
        <Badge variant="outline">{resourceKindLabel(descriptor.kind)}</Badge>
        <Badge>{resourceStatusLabel(descriptor.status)}</Badge>
      </div>
      <dl className="flex flex-col gap-1 text-sm">
        {descriptor.source !== undefined && (
          <Detail term="File">{descriptor.source}</Detail>
        )}
        {descriptor.byteLength !== undefined && (
          <Detail term="Size">{formatByteLength(descriptor.byteLength)}</Detail>
        )}
        {counts !== undefined && (
          <>
            <Detail term="Nodes">{counts.nodes}</Detail>
            <Detail term="Edges">{counts.edges}</Detail>
          </>
        )}
        {variableNames !== undefined && variableNames.length > 0 && (
          <Detail term="Attributes">{variableNames.join(', ')}</Detail>
        )}
        {dimensions !== undefined && (
          <Detail term="Dimensions">
            {`${dimensions.width} × ${dimensions.height} pixels`}
          </Detail>
        )}
        {durationSeconds !== undefined && (
          <Detail term="Duration">{`${Math.round(durationSeconds)} seconds`}</Detail>
        )}
      </dl>
    </div>
  );
}
