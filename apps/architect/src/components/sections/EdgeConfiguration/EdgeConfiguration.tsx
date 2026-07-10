import { compose } from 'react-recompose';
import { useSelector } from 'react-redux';
import { formValueSelector } from 'redux-form';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import EditableAttributesList from '~/components/EditableAttributesList/EditableAttributesList';
import { Section, Subsection } from '~/components/EditorLayout';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import type { RootState } from '~/ducks/modules/root';
import { getCodebook } from '~/selectors/protocol';

import withComposerFormHandlers from '../Form/withComposerFormHandlers';
import EdgeTypeMultiSelect from './EdgeTypeMultiSelect';
type EdgeEntry = {
  id: string;
  subject: {
    entity: 'edge';
    type: string;
  };
  form?: Record<string, unknown>;
};
const hasStringProp = (value: object, key: string): boolean =>
  typeof Reflect.get(value, key) === 'string';
const isEdgeEntry = (value: unknown): value is EdgeEntry => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!hasStringProp(value, 'id') || !('subject' in value)) {
    return false;
  }
  const { subject } = value;
  return (
    typeof subject === 'object' &&
    subject !== null &&
    Reflect.get(subject, 'entity') === 'edge' &&
    hasStringProp(subject, 'type')
  );
};
const toEdgeEntries = (value: unknown): EdgeEntry[] =>
  Array.isArray(value) ? value.filter(isEdgeEntry) : [];
type EdgeAttributeBlockInnerProps = {
  entity: 'edge';
  type: string;
  form: string;
  fieldName: string;
  editFormName: string;
  title: string;
  handleChangeFields: (field: Record<string, unknown>) => unknown;
};
const EdgeAttributeBlockInner = ({
  entity,
  type,
  form,
  fieldName,
  editFormName,
  title,
  handleChangeFields,
}: EdgeAttributeBlockInnerProps) => (
  <Section title={title} layout="horizontal" required={false}>
    <Subsection
      title="Editable attributes"
      summary="The attributes shown in the side panel when an edge is selected, so they can be edited during the interview. Each attribute pairs a variable with the input control used to collect it."
    >
      <EditableAttributesList
        fieldName={fieldName}
        entity={entity}
        type={type}
        form={form}
        editFormName={editFormName}
        handleChangeFields={handleChangeFields}
      />
    </Subsection>
  </Section>
);
type EdgeAttributeBlockOwnProps = {
  entity: 'edge';
  type: string;
  form: string;
  fieldName: string;
  editFormName: string;
  title: string;
};
// `withComposerFormHandlers` reads props.entity/props.type/props.form to build a
// handler scoped to THAT edge type's codebook entry. Composing it here — with
// entity="edge" and type=<edge type> — yields a correctly edge-scoped
// handleChangeFields per block, so an attribute edit writes into the right edge
// codebook entity rather than a shared (and wrong) one.
const EdgeAttributeBlock = compose<
  EdgeAttributeBlockInnerProps,
  EdgeAttributeBlockOwnProps
>(withComposerFormHandlers)(EdgeAttributeBlockInner);
type EdgeConfigurationProps = StageEditorSectionProps;
const resolveEdgeLabel = (
  codebook: ReturnType<typeof getCodebook>,
  type: string,
) => codebook?.edge?.[type]?.name ?? type;
const EdgeConfigurationInner = ({ form }: EdgeConfigurationProps) => {
  const codebook = useSelector(getCodebook);
  const edges = useSelector((state: RootState) =>
    toEdgeEntries(formValueSelector(form)(state, 'edges')),
  );
  return (
    <>
      <Section
        title="Edge Configuration"
        summary={
          <Paragraph>
            Define the types of connection participants can draw between nodes,
            and the attributes collected for each connection type.
          </Paragraph>
        }
        layout="horizontal"
        required={false}
      >
        <Subsection
          title="Edge types"
          summary="Select the edge types participants can create on the canvas. Each selected type gets its own set of editable attributes below."
        >
          <EdgeTypeMultiSelect form={form} />
        </Subsection>
      </Section>
      {edges.map((edge, index) => (
        <EdgeAttributeBlock
          key={edge.id}
          entity="edge"
          type={edge.subject.type}
          form={form}
          fieldName={`edges[${index}].form.fields`}
          editFormName={`edge-attr-edit-${edge.subject.type}`}
          title={`Edge Attributes — ${resolveEdgeLabel(codebook, edge.subject.type)}`}
        />
      ))}
    </>
  );
};
export default compose<EdgeConfigurationProps, StageEditorSectionProps>()(
  EdgeConfigurationInner,
);
