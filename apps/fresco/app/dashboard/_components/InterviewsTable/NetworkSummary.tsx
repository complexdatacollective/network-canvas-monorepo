import type { CSSProperties } from 'react';

import Node, { type NodeColorSequence } from '@codaco/fresco-ui/Node';
import type { GetInterviewsQuery } from '~/queries/interviews';

// TODO: Move to shared-consts or protocol-validation
type EdgeColorSequence =
  | 'edge-color-seq-1'
  | 'edge-color-seq-2'
  | 'edge-color-seq-3'
  | 'edge-color-seq-4'
  | 'edge-color-seq-5'
  | 'edge-color-seq-6'
  | 'edge-color-seq-7'
  | 'edge-color-seq-8'
  | 'edge-color-seq-9';

type EdgeSummaryProps = {
  color: EdgeColorSequence;
  count: number;
  typeName: string;
};

type EdgeGlyphStyle = CSSProperties & {
  '--fill': string;
  '--fill-dark': string;
};

function EdgeSummary({ color, count, typeName }: EdgeSummaryProps) {
  const edgeColorNumber = color.slice('edge-color-seq-'.length);
  const edgeColorVariable = `var(--edge-${edgeColorNumber})`;
  const edgeColorStyle: EdgeGlyphStyle = {
    '--fill': edgeColorVariable,
    '--fill-dark': `oklch(from ${edgeColorVariable} calc(l - var(--dark-mod)) c h)`,
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex size-8 items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 60 60"
          width="24"
          height="24"
          style={edgeColorStyle}
        >
          <g id="Links">
            <circle cx="49" cy="11" r="11" className="fill-(--fill-dark)" />
            <circle cx="49" cy="49" r="11" className="fill-(--fill-dark)" />
            <circle cx="11" cy="30" r="11" className="fill-(--fill-dark)" />
            <rect
              x="25.3"
              y="20.59"
              width="4"
              height="37.64"
              transform="translate(-20.48 43.35) rotate(-60)"
              className="fill-(--fill-dark)"
            />
            <rect
              x="8.48"
              y="18.59"
              width="37.64"
              height="4"
              transform="translate(-6.64 16.41) rotate(-29.99)"
              className="fill-(--fill-dark)"
            />
            <path
              d="M3.22,22.22,18.78,37.78A11,11,0,1,1,3.22,22.22Z"
              className="fill-(--fill)"
            />
            <path
              d="M41.22,3.22,56.78,18.78A11,11,0,1,1,41.22,3.22Z"
              className="fill-(--fill)"
            />
            <path
              d="M41.22,41.22,56.78,56.78A11,11,0,1,1,41.22,41.22Z"
              className="fill-(--fill)"
            />
          </g>
        </svg>
      </div>
      <span className="pt-1 text-xs">
        {typeName} ({count})
      </span>
    </div>
  );
}

const NetworkSummary = ({
  network,
}: {
  network: GetInterviewsQuery[number]['network'];
}) => {
  const nodeSummaries = network.nodes.map(
    ({ type: nodeType, count, name, color }) => (
      <div className="flex flex-col items-center" key={nodeType}>
        <Node
          size="xxs"
          color={color as NodeColorSequence}
          label={count.toLocaleString()}
        />
        <span className="pt-1 text-xs">{name}</span>
      </div>
    ),
  );

  const edgeSummaries = network.edges
    .map(({ type: edgeType, count, name, color }) => {
      if (!color) return null;

      return (
        <EdgeSummary
          key={edgeType}
          color={color as EdgeColorSequence}
          count={count}
          typeName={name}
        />
      );
    })
    .filter(Boolean);

  if (nodeSummaries.length === 0 && edgeSummaries.length === 0) {
    return <div className="text-xs">No nodes or edges</div>;
  }

  return (
    <div className="flex gap-2 py-2">
      {nodeSummaries}
      {edgeSummaries}
    </div>
  );
};

export default NetworkSummary;
