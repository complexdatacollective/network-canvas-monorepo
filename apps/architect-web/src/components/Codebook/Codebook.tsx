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

const dividerClasses =
  'border-divider mt-(--space-md) mb-(--space-lg) border-t-[0.2rem]';

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
          <h2 className="my-0">Ego</h2>
          <div className={dividerClasses} />
          <Section layout="vertical" required={false}>
            <EgoType />
          </Section>
        </div>
      )}

      {hasNodes && (
        <div className="mb-(--space-lg)">
          <h2 className="my-0">Node Types</h2>
          <div className={dividerClasses} />
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
          <h2 className="my-0">Edge Types</h2>
          <div className={dividerClasses} />
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
          <h2 className="my-0">Network Assets</h2>
          <div className={dividerClasses} />
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
