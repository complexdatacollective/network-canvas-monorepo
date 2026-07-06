import { useSelector } from 'react-redux';
import { formValueSelector } from 'redux-form';

import EditableList from '~/components/EditableList';
import { Row, Section } from '~/components/EditorLayout';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import type { RootState } from '~/ducks/store';

import ItemEditor from './ItemEditor';
import ItemPreview from './ItemPreview';
import { denormalizeType, normalizeType } from './itemTypes';

const ContentGrid = ({ form }: StageEditorSectionProps) => {
  const formSelector = formValueSelector(form);
  const hasItems = useSelector((state: RootState) => {
    const items = formSelector(state, 'items') as unknown[] | undefined;
    return !!items?.length;
  });

  return (
    <Section
      title="Items"
      summary={
        <p>
          Add text, image, video, and audio blocks below, and drag them to
          reorder. Participants can scroll through the screen, so add as many
          blocks as you need. Image and video blocks can be given a display
          size.
        </p>
      }
    >
      <Row>
        <EditableList
          previewComponent={ItemPreview}
          editComponent={ItemEditor}
          title="Edit Item"
          fieldName="items"
          form={form}
          normalize={normalizeType as unknown as (value: unknown) => unknown}
          itemSelector={
            denormalizeType as unknown as (
              state: Record<string, unknown>,
              params: { form: string; editField: string },
            ) => unknown
          }
          editProps={{ allowSize: true }}
        >
          {!hasItems && (
            <p className="text-current/70 italic">
              No items have been created yet. Click &ldquo;Create new&rdquo; to
              add text or media.
            </p>
          )}
        </EditableList>
      </Row>
    </Section>
  );
};

export default ContentGrid;
