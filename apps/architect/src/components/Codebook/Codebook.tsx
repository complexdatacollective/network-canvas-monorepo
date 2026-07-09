import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useSelector } from 'react-redux';

import Button from '@codaco/fresco-ui/Button';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { Section } from '~/components/EditorLayout';
import Checkbox from '~/components/Form/Fields/Checkbox';
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

  return (
    <div className="my-10">
      <div className="bg-surface-1 mb-7 flex flex-wrap items-center gap-7 rounded p-6 shadow-md">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search types and variables by name…"
          aria-label="Search the codebook by name"
          className="border-outline bg-surface-2 h-12 flex-1 rounded border px-5 text-lg"
        />
        <Checkbox
          label="Show unused only"
          input={{
            name: 'codebook-unused-only',
            value: unusedOnly,
            onChange: (value) => setUnusedOnly(Boolean(value)),
          }}
        />
      </div>

      {!hasAnyContent && (
        <div className="bg-surface-2 border-outline mb-7 rounded border p-7">
          <p className="text-muted text-center">
            There are currently no types or variables defined in this protocol.
            Use the buttons below to create your first node or edge type, or add
            ego variables.
          </p>
        </div>
      )}

      <div className="mb-7">
        <Heading level="h2" margin="none" className="mb-5">
          Ego
        </Heading>
        <Section layout="vertical" required={false}>
          <EgoType search={search} unusedOnly={unusedOnly} />
        </Section>
      </div>

      <div className="mb-7">
        <div className="mb-5 flex items-center gap-5">
          <Heading level="h2" margin="none">
            Node Types ({nodes.length})
          </Heading>
          <Button
            color="primary"
            size="sm"
            icon={<Plus />}
            onClick={() => onEditEntity?.('node')}
          >
            Create node type
          </Button>
        </div>
        {nodes.length === 0 ? (
          <p className="text-muted">No node types yet.</p>
        ) : (
          nodes.map((node) => (
            <EntityType
              key={node.type}
              entity={node.entity}
              type={node.type}
              inUse={node.inUse}
              usage={[...node.usage]}
              search={search}
              unusedOnly={unusedOnly}
              onEditEntity={onEditEntity}
            />
          ))
        )}
      </div>

      <div className="mb-7">
        <div className="mb-5 flex items-center gap-5">
          <Heading level="h2" margin="none">
            Edge Types ({edges.length})
          </Heading>
          <Button
            color="primary"
            size="sm"
            icon={<Plus />}
            onClick={() => onEditEntity?.('edge')}
          >
            Create edge type
          </Button>
        </div>
        {edges.length === 0 ? (
          <p className="text-muted">No edge types yet.</p>
        ) : (
          edges.map((edge) => (
            <EntityType
              key={edge.type}
              entity={edge.entity}
              type={edge.type}
              inUse={edge.inUse}
              usage={[...edge.usage]}
              search={search}
              unusedOnly={unusedOnly}
              onEditEntity={onEditEntity}
            />
          ))
        )}
      </div>

      {processedNetworkAssets.length > 0 && (
        <div className="mb-7">
          <Heading level="h2" margin="none" className="mb-5">
            Network Assets ({processedNetworkAssets.length})
          </Heading>
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
