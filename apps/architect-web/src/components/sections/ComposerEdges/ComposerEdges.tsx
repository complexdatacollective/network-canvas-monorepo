import { v4 as uuid } from 'uuid';

import EditableList from '~/components/EditableList';
import { Section } from '~/components/EditorLayout';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import EdgeFields from './EdgeFields';
import EdgePreview from './EdgePreview';

const ComposerEdges = ({ form }: StageEditorSectionProps) => (
  <Section
    title="Edges"
    summary={
      <p>
        Add the edge types participants can draw between nodes, and configure
        the attributes collected for each type.
      </p>
    }
  >
    <EditableList
      fieldName="edges"
      form={form}
      title="Edit Edge"
      editComponent={EdgeFields}
      previewComponent={EdgePreview}
      template={() => ({ id: uuid() })}
    />
  </Section>
);

export default ComposerEdges;
