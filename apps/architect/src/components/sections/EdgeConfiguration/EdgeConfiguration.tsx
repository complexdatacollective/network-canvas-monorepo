import { useSelector } from 'react-redux';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import EditableAttributesList from '~/components/EditableAttributesList/EditableAttributesList';
import { Section, Subsection } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { STAGE_FORM_ID } from '~/components/StageEditor/StageForm';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import { getCodebook } from '~/selectors/protocol';

import { useComposerFieldCommit } from '../Form/fieldCommit';
import EdgeTypeMultiSelectField from './EdgeTypeMultiSelect';
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
type EdgeAttributeBlockProps = {
  entity: 'edge';
  type: string;
  fieldName: string;
  editFormName: string;
  title: string;
};
// `useComposerFieldCommit({entity, type})` is called here, with THIS block's
// own edge type — not the stage's own subject — so each edge type's
// attribute list commits into the right codebook entry rather than a shared
// (and wrong) one.
const EdgeAttributeBlock = ({
  entity,
  type,
  fieldName,
  editFormName,
  title,
}: EdgeAttributeBlockProps) => {
  const handleChangeFields = useComposerFieldCommit({ entity, type });

  return (
    <Section title={title} layout="horizontal" required={false}>
      <Subsection
        title="Editable attributes"
        summary="The attributes shown in the side panel when an edge is selected, so they can be edited during the interview. Each attribute pairs a variable with the input control used to collect it."
      >
        <EditableAttributesList
          fieldName={fieldName}
          entity={entity}
          type={type}
          form={STAGE_FORM_ID}
          editFormName={editFormName}
          handleChangeFields={handleChangeFields}
        />
      </Subsection>
    </Section>
  );
};
const resolveEdgeLabel = (
  codebook: ReturnType<typeof getCodebook>,
  type: string,
) => codebook?.edge?.[type]?.name ?? type;
const EdgeConfiguration = (_props: StageEditorSectionProps) => {
  const codebook = useSelector(getCodebook);
  const edges = toEdgeEntries(useStageFormValue<unknown>('edges'));
  const initialEdges = useStageInitialValue<EdgeEntry[]>('edges');
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
          <ArchitectField
            name="edges"
            label="Edge types"
            labelHidden
            component={EdgeTypeMultiSelectField}
            initialValue={initialEdges}
          />
        </Subsection>
      </Section>
      {edges.map((edge, index) => (
        <EdgeAttributeBlock
          key={edge.id}
          entity="edge"
          type={edge.subject.type}
          fieldName={`edges[${index}].form.fields`}
          editFormName={`edge-attr-edit-${edge.subject.type}`}
          title={`Edge Attributes — ${resolveEdgeLabel(codebook, edge.subject.type)}`}
        />
      ))}
    </>
  );
};
export default EdgeConfiguration;
