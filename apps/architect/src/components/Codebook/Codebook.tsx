import { Plus, Search } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
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
import { useAppSelector } from '~/ducks/hooks';
import { getActiveProtocolId } from '~/ducks/modules/app';
import { useSyntheticFeasibility } from '~/hooks/useSyntheticFeasibility';
import { getCodebook, getProtocol } from '~/selectors/protocol';

import { codebookEntityMarker, useCodebookDeepLink } from './deepLink';
import EgoType from './EgoType';
import EntityType from './EntityType';
import ExternalEntity from './ExternalEntity';
import { SyntheticVerdict } from './SyntheticVerdict';
import { useCodebookData } from './useCodebookData';

type CodebookProps = {
  onEditEntity?: (entity: string, type?: string) => void;
};

const CodebookSearchObserver = ({
  onChange,
}: {
  onChange: (search: string) => void;
}) => {
  const values = useFormValue(['search'] as const);

  useEffect(() => {
    onChange(typeof values.search === 'string' ? values.search : '');
  }, [onChange, values.search]);

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
  const unusedOnlyId = useId();

  // The whole-protocol synthetic verdict, live against the protocol being
  // edited. It sits above everything because it is a statement about the
  // protocol rather than about any one type: a refusal names the attribute or
  // stage it is about, and every attribute it could name is on this screen.
  const protocol = useAppSelector(getProtocol);
  const protocolId = useAppSelector(getActiveProtocolId);
  const feasibility = useSyntheticFeasibility({
    document: protocol,
    protocolId,
  });

  // After the rows above have rendered, so a link naming one of them can find
  // it. Filters are at their defaults on arrival, so a linked row is present.
  useCodebookDeepLink();

  return (
    <div className="my-10">
      <div className="mb-14">
        <SyntheticVerdict feasibility={feasibility} />
      </div>

      <Surface className="mb-14" spacing="sm" shadow="sm">
        <div className="flex flex-wrap items-end gap-5">
          <Form
            onSubmit={() => ({ success: true })}
            className="min-w-72 flex-1 [&>.group]:mb-0!"
          >
            <CodebookSearchObserver onChange={setSearch} />
            <Field
              name="search"
              label="Search the codebook by name"
              component={InputField}
              initialValue=""
              type="search"
              placeholder="Search types and attributes by name..."
              prefixComponent={<Search aria-hidden className="size-4" />}
            />
          </Form>
          <div className="flex shrink-0 items-center gap-3 pb-2.5">
            <CheckboxField
              id={unusedOnlyId}
              value={unusedOnly}
              onChange={(value) => setUnusedOnly(Boolean(value))}
            />
            <label
              htmlFor={unusedOnlyId}
              className="font-heading cursor-pointer text-base leading-snug font-bold"
            >
              Show unused only
            </label>
          </div>
        </div>
      </Surface>

      {!hasAnyContent && (
        <div className="bg-surface-2 border-outline mb-7 rounded border p-7">
          <Paragraph className="text-muted text-center">
            There are currently no types or attributes defined in this protocol.
            Use the buttons below to create your first node or edge type, or add
            ego attributes.
          </Paragraph>
        </div>
      )}

      <div className="mb-14" {...codebookEntityMarker({ entity: 'ego' })}>
        <Heading level="h2" margin="none" className="mb-5!">
          Ego
        </Heading>
        <Section layout="vertical" required={false}>
          <EgoType search={search} unusedOnly={unusedOnly} />
        </Section>
      </div>

      <div className="mb-14">
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
          <div className="space-y-8">
            {nodes.map((node) => (
              <div
                key={node.type}
                {...codebookEntityMarker({ entity: 'node', type: node.type })}
              >
                <EntityType
                  entity={node.entity}
                  type={node.type}
                  inUse={node.inUse}
                  usage={[...node.usage]}
                  search={search}
                  unusedOnly={unusedOnly}
                  onEditEntity={onEditEntity}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-14">
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
          <div className="space-y-8">
            {edges.map((edge) => (
              <div
                key={edge.type}
                {...codebookEntityMarker({ entity: 'edge', type: edge.type })}
              >
                <EntityType
                  entity={edge.entity}
                  type={edge.type}
                  inUse={edge.inUse}
                  usage={[...edge.usage]}
                  search={search}
                  unusedOnly={unusedOnly}
                  onEditEntity={onEditEntity}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {processedNetworkAssets.length > 0 && (
        <div className="mb-14">
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
