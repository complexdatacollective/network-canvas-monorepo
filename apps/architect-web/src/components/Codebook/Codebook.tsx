import { useSelector } from 'react-redux';

import { Section } from '~/components/EditorLayout';
import { getCodebook } from '~/selectors/protocol';

import EgoType from './EgoType';
import EntityType from './EntityType';
import ExternalEntity from './ExternalEntity';
import { useCodebookData } from './useCodebookData';

type CodebookProps = {
  onEditEntity?: (entity: string, type?: string) => void;
};

const Codebook = ({ onEditEntity }: CodebookProps) => {
  const codebook = useSelector(getCodebook);
  const {
    nodes,
    edges,
    processedNetworkAssets,
    hasEgoVariables,
    hasNodes,
    hasEdges,
    hasNetworkAssets,
  } = useCodebookData(codebook);

  const hasAnyContent =
    hasEgoVariables || hasNodes || hasEdges || hasNetworkAssets;

  return (
    <div className="my-(--space-xl)">
      {!hasAnyContent && (
        <div className="bg-surface-2 border-divider rounded border p-(--space-lg)">
          <p className="text-muted-foreground text-center">
            There are currently no types or variables defined in this protocol.
            When you have created some interview stages, the types and variables
            will be shown here.
          </p>
        </div>
      )}

      {hasEgoVariables && (
        <div className="mb-(--space-lg)">
          <h2 className="mt-0 mb-(--space-md)">Ego</h2>
          <Section layout="vertical" required={false}>
            <EgoType />
          </Section>
        </div>
      )}

      {hasNodes && (
        <div className="mb-(--space-lg)">
          <h2 className="mt-0 mb-(--space-md)">Node Types</h2>
          {nodes.map((node) => (
            <EntityType
              key={node.type}
              entity={node.entity}
              type={node.type}
              inUse={node.inUse}
              usage={[...node.usage]}
              onEditEntity={onEditEntity}
            />
          ))}
        </div>
      )}

      {hasEdges && (
        <div className="mb-(--space-lg)">
          <h2 className="mt-0 mb-(--space-md)">Edge Types</h2>
          {edges.map((edge) => (
            <EntityType
              key={edge.type}
              entity={edge.entity}
              type={edge.type}
              inUse={edge.inUse}
              usage={[...edge.usage]}
              onEditEntity={onEditEntity}
            />
          ))}
        </div>
      )}

      {hasNetworkAssets && (
        <div className="mb-(--space-lg)">
          <h2 className="mt-0 mb-(--space-md)">Network Assets</h2>
          {processedNetworkAssets.map((networkAsset) => (
            <ExternalEntity
              key={networkAsset.id}
              id={networkAsset.id}
              name={networkAsset.name}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Codebook;
