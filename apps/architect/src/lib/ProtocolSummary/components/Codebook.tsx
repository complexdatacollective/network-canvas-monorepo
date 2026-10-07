import { toPairs } from 'es-toolkit/compat';
import { useContext } from 'react';

import type { LocalizedString } from '@codaco/protocol-validation';

import Entity from './Entity';
import SummaryContext from './SummaryContext';

type NodeOrEdgeType = {
  color?: string;
  icon?: string;
  name: string;
  label: LocalizedString;
  variables?: Record<string, unknown>;
};

const Codebook = () => {
  const { protocol } = useContext(SummaryContext);
  const codebook = protocol.codebook as {
    node?: Record<string, NodeOrEdgeType>;
    edge?: Record<string, NodeOrEdgeType>;
    ego?: { variables?: Record<string, unknown> };
  };

  const nodes = toPairs(codebook.node ?? {});
  const edges = toPairs(codebook.edge ?? {});

  return (
    <div>
      {codebook.ego && (
        <Entity entity="ego" variables={codebook.ego.variables} />
      )}
      {nodes.map(([id, node]) => (
        <Entity
          key={id}
          entity="node"
          type={id}
          label={node.label}
          variables={node.variables}
        />
      ))}
      {edges.map(([id, edge]) => (
        <Entity
          key={id}
          entity="edge"
          type={id}
          label={edge.label}
          variables={edge.variables}
        />
      ))}
    </div>
  );
};

export default Codebook;
