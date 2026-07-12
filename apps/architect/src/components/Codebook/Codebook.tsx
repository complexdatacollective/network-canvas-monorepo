import { Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import Button from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import CheckboxField from '@codaco/fresco-ui/form/fields/Checkbox';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import { getCodebook } from '~/selectors/protocol';

import EgoType from './EgoType';
import EntityType from './EntityType';
import ExternalEntity from './ExternalEntity';
import { useCodebookData } from './useCodebookData';

type CodebookProps = {
  onEditEntity?: (entity: string, type?: string) => void;
};

type FilterValues = {
  search: string;
  unusedOnly: boolean;
};

const CodebookFilterObserver = ({
  onChange,
}: {
  onChange: (values: FilterValues) => void;
}) => {
  const values = useFormValue(['search', 'unusedOnly'] as const);

  useEffect(() => {
    onChange({
      search: String(values.search ?? ''),
      unusedOnly: Boolean(values.unusedOnly),
    });
  }, [onChange, values.search, values.unusedOnly]);

  return null;
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
  const handleFilterChange = useCallback((values: FilterValues) => {
    setSearch(values.search);
    setUnusedOnly(values.unusedOnly);
  }, []);

  return (
    <div className="my-10">
      <Surface className="mb-7" spacing="sm" shadow="sm">
        <Form
          onSubmit={() => ({ success: true })}
          className="flex flex-wrap items-center gap-5 [&>.group]:mb-0!"
        >
          <CodebookFilterObserver onChange={handleFilterChange} />
          <div className="min-w-72 flex-1">
            <Field
              name="search"
              label="Search the codebook by name"
              component={InputField}
              initialValue=""
              type="search"
              placeholder="Search types and variables by name..."
              prefixComponent={<Search aria-hidden className="size-4" />}
            />
          </div>
          <Field
            name="unusedOnly"
            label="Show unused only"
            component={CheckboxField}
            initialValue={false}
            inline
          />
        </Form>
      </Surface>

      {!hasAnyContent && (
        <div className="bg-surface-2 border-outline mb-7 rounded border p-7">
          <Paragraph className="text-muted text-center">
            There are currently no types or variables defined in this protocol.
            Use the buttons below to create your first node or edge type, or add
            ego variables.
          </Paragraph>
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
          <Paragraph className="text-muted">No node types yet.</Paragraph>
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
          <Paragraph className="text-muted">No edge types yet.</Paragraph>
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
