import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import { Section } from '~/components/EditorLayout';
import { Button } from '~/lib/legacy-ui/components';
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

  const [search, setSearch] = useState('');
  const [unusedOnly, setUnusedOnly] = useState(false);

  const filterEntities = useMemo(() => {
    const term = search.trim().toLowerCase();
    return <T extends { name: string; inUse: boolean }>(
      items: readonly T[],
    ): readonly T[] =>
      items.filter((item) => {
        if (unusedOnly && item.inUse) {
          return false;
        }
        if (term && !item.name.toLowerCase().includes(term)) {
          return false;
        }
        return true;
      });
  }, [search, unusedOnly]);

  const filteredNodes = useMemo(
    () => filterEntities(nodes),
    [filterEntities, nodes],
  );
  const filteredEdges = useMemo(
    () => filterEntities(edges),
    [filterEntities, edges],
  );

  return (
    <div className="my-(--space-xl)">
      <div className="mb-(--space-lg) flex flex-wrap items-center gap-(--space-md)">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search node and edge types by name…"
          aria-label="Search node and edge types by name"
          className="border-divider bg-surface-2 flex-1 rounded border px-(--space-md) py-(--space-xs)"
        />
        <label className="flex items-center gap-(--space-xs)">
          <input
            type="checkbox"
            checked={unusedOnly}
            onChange={(event) => setUnusedOnly(event.target.checked)}
            aria-label="Show unused entities only"
          />
          <span>Unused only</span>
        </label>
      </div>

      {!hasAnyContent && (
        <div className="bg-surface-2 border-divider mb-(--space-lg) rounded border p-(--space-lg)">
          <p className="text-muted-foreground text-center">
            There are currently no types or variables defined in this protocol.
            Use the buttons below to create your first node or edge type, or add
            ego variables.
          </p>
        </div>
      )}

      <div className="mb-(--space-lg)">
        <h2 className="mt-0 mb-(--space-md)">Ego</h2>
        <Section layout="vertical" required={false}>
          <EgoType />
        </Section>
      </div>

      <div className="mb-(--space-lg)">
        <div className="mb-(--space-md) flex items-center gap-(--space-md)">
          <h2 className="my-0">Node Types ({nodes.length})</h2>
          <Button
            color="sea-green"
            size="small"
            icon={<Plus />}
            onClick={() => onEditEntity?.('node')}
          >
            Create node type
          </Button>
        </div>
        {nodes.length === 0 ? (
          <p className="text-muted-foreground">No node types yet.</p>
        ) : (
          filteredNodes.map((node) => (
            <EntityType
              key={node.type}
              entity={node.entity}
              type={node.type}
              inUse={node.inUse}
              usage={[...node.usage]}
              onEditEntity={onEditEntity}
            />
          ))
        )}
      </div>

      <div className="mb-(--space-lg)">
        <div className="mb-(--space-md) flex items-center gap-(--space-md)">
          <h2 className="my-0">Edge Types ({edges.length})</h2>
          <Button
            color="sea-green"
            size="small"
            icon={<Plus />}
            onClick={() => onEditEntity?.('edge')}
          >
            Create edge type
          </Button>
        </div>
        {edges.length === 0 ? (
          <p className="text-muted-foreground">No edge types yet.</p>
        ) : (
          filteredEdges.map((edge) => (
            <EntityType
              key={edge.type}
              entity={edge.entity}
              type={edge.type}
              inUse={edge.inUse}
              usage={[...edge.usage]}
              onEditEntity={onEditEntity}
            />
          ))
        )}
      </div>

      {processedNetworkAssets.length > 0 && (
        <div className="mb-(--space-lg)">
          <h2 className="mt-0 mb-(--space-md)">
            Network Assets ({processedNetworkAssets.length})
          </h2>
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
