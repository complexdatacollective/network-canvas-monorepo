import { Plus, Search } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import CheckboxField from '@codaco/fresco-ui/form/fields/Checkbox';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Section from '@codaco/fresco-ui/Section';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { getCodebook } from '~/selectors/protocol';

import EgoType from './EgoType';
import EntityType from './EntityType';
import ExternalEntity from './ExternalEntity';
import { useCodebookData } from './useCodebookData';
const messages = defineMessages({
  searchTheCodebookByName: {
    id: 'architect.codebook.codebook.searchTheCodebookByName',
    defaultMessage: 'Search the codebook by name',
    description: 'The label text in components / Codebook / Codebook.',
  },
  searchTypesAndAttributesByName: {
    id: 'architect.codebook.codebook.searchTypesAndAttributesByName',
    defaultMessage: 'Search types and attributes by name...',
    description: 'The placeholder text in components / Codebook / Codebook.',
  },
  showUnusedOnly: {
    id: 'architect.codebook.codebook.showUnusedOnly',
    defaultMessage: 'Show unused only',
    description: 'Visible text in components / Codebook / Codebook.',
  },
  thereAreCurrentlyNoTypesOr: {
    id: 'architect.codebook.codebook.thereAreCurrentlyNoTypesOr',
    defaultMessage:
      'There are currently no types or attributes defined in this protocol. Use the buttons below to create your first node or edge type, or add ego attributes.',
    description: 'Visible text in components / Codebook / Codebook.',
  },
  ego: {
    id: 'architect.codebook.codebook.ego',
    defaultMessage: 'Ego',
    description: 'Visible text in components / Codebook / Codebook.',
  },
  egoAttributes: {
    id: 'architect.codebook.codebook.egoAttributes',
    defaultMessage: 'Ego attributes',
    description: 'The title text in components / Codebook / Codebook.',
  },
  reviewTheAttributesCollectedAboutThe: {
    id: 'architect.codebook.codebook.reviewTheAttributesCollectedAboutThe',
    defaultMessage: 'Review the attributes collected about the participant.',
    description: 'The description text in components / Codebook / Codebook.',
  },
  nodeTypes: {
    id: 'architect.codebook.codebook.nodeTypes',
    defaultMessage: 'Node Types ({value1})',
    description: 'Visible text in components / Codebook / Codebook.',
  },
  createNodeType: {
    id: 'architect.codebook.codebook.createNodeType',
    defaultMessage: 'Create node type',
    description: 'Visible text in components / Codebook / Codebook.',
  },
  noNodeTypesYet: {
    id: 'architect.codebook.codebook.noNodeTypesYet',
    defaultMessage: 'No node types yet.',
    description: 'Visible text in components / Codebook / Codebook.',
  },
  edgeTypes: {
    id: 'architect.codebook.codebook.edgeTypes',
    defaultMessage: 'Edge Types ({value1})',
    description: 'Visible text in components / Codebook / Codebook.',
  },
  createEdgeType: {
    id: 'architect.codebook.codebook.createEdgeType',
    defaultMessage: 'Create edge type',
    description: 'Visible text in components / Codebook / Codebook.',
  },
  noEdgeTypesYet: {
    id: 'architect.codebook.codebook.noEdgeTypesYet',
    defaultMessage: 'No edge types yet.',
    description: 'Visible text in components / Codebook / Codebook.',
  },
  networkAssets: {
    id: 'architect.codebook.codebook.networkAssets',
    defaultMessage: 'Network Assets ({value1})',
    description: 'Visible text in components / Codebook / Codebook.',
  },
});

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
  const intl = useAppIntl();
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

  return (
    <div className="my-10">
      <Surface className="mb-14" spacing="sm" shadow="sm">
        <div className="flex flex-wrap items-end gap-5">
          <Form
            onSubmit={() => ({ success: true })}
            className="min-w-72 flex-1 [&>.group]:mb-0!"
          >
            <CodebookSearchObserver onChange={setSearch} />
            <Field
              name="search"
              label={intl.formatMessage(messages.searchTheCodebookByName)}
              component={InputField}
              initialValue=""
              type="search"
              placeholder={intl.formatMessage(
                messages.searchTypesAndAttributesByName,
              )}
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
              {intl.formatMessage(messages.showUnusedOnly)}
            </label>
          </div>
        </div>
      </Surface>

      {!hasAnyContent && (
        <div className="bg-surface-2 border-outline mb-7 rounded border p-7">
          <Paragraph className="text-center text-current/70">
            {intl.formatMessage(messages.thereAreCurrentlyNoTypesOr)}
          </Paragraph>
        </div>
      )}

      <div className="mb-14">
        <Heading level="h2" margin="none" className="mb-5!">
          {intl.formatMessage(messages.ego)}
        </Heading>
        <Section
          title={intl.formatMessage(messages.egoAttributes)}
          description={intl.formatMessage(
            messages.reviewTheAttributesCollectedAboutThe,
          )}
        >
          <EgoType search={search} unusedOnly={unusedOnly} />
        </Section>
      </div>

      <div className="mb-14">
        <div className="mb-5 flex items-center gap-5">
          <Heading level="h2" margin="none">
            {intl.formatMessage(messages.nodeTypes, { value1: nodes.length })}
          </Heading>
          <Button
            color="primary"
            size="sm"
            icon={<Plus />}
            onClick={() => onEditEntity?.('node')}
          >
            {intl.formatMessage(messages.createNodeType)}
          </Button>
        </div>
        {nodes.length === 0 ? (
          <Paragraph className="text-current/70">
            {intl.formatMessage(messages.noNodeTypesYet)}
          </Paragraph>
        ) : (
          <div>
            {nodes.map((node) => (
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
            ))}
          </div>
        )}
      </div>

      <div className="mb-14">
        <div className="mb-5 flex items-center gap-5">
          <Heading level="h2" margin="none">
            {intl.formatMessage(messages.edgeTypes, { value1: edges.length })}
          </Heading>
          <Button
            color="primary"
            size="sm"
            icon={<Plus />}
            onClick={() => onEditEntity?.('edge')}
          >
            {intl.formatMessage(messages.createEdgeType)}
          </Button>
        </div>
        {edges.length === 0 ? (
          <Paragraph className="text-current/70">
            {intl.formatMessage(messages.noEdgeTypesYet)}
          </Paragraph>
        ) : (
          <div>
            {edges.map((edge) => (
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
            ))}
          </div>
        )}
      </div>

      {processedNetworkAssets.length > 0 && (
        <div className="mb-14">
          <Heading level="h2" margin="none" className="mb-5">
            {intl.formatMessage(messages.networkAssets, {
              value1: processedNetworkAssets.length,
            })}
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
