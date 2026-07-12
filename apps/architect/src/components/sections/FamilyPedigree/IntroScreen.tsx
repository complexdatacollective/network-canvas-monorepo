import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { FamilyPedigreeIntroItem } from '@codaco/protocol-validation';
import { Row, Section } from '~/components/EditorLayout';
import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedFieldArray from '~/components/Form/ValidatedFieldArray';
import ItemEditor from '~/components/sections/ContentGrid/ItemEditor';
import ItemPreview from '~/components/sections/ContentGrid/ItemPreview';
import {
  denormalizeType,
  normalizeType,
} from '~/components/sections/ContentGrid/itemTypes';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';
type IntroScreenValue = {
  items: FamilyPedigreeIntroItem[];
} | null;
const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';
const IntroScreen = ({ form }: StageEditorSectionProps) => {
  const dispatch = useAppDispatch();
  const formSelector = formValueSelector(form);
  const introScreen = useSelector(
    (state: RootState) =>
      formSelector(state, 'introScreen') as IntroScreenValue | undefined,
  );
  const isEnabled = introScreen !== null && introScreen !== undefined;
  const handleToggleChange = useCallback(
    async (newState: boolean) => {
      if (newState) {
        dispatch(change(form, 'introScreen', { items: [] }));
        return true;
      }
      dispatch(change(form, 'introScreen', null));
      return true;
    },
    [dispatch, form],
  );
  return (
    <Section
      title="Intro Screen"
      summary={
        <Paragraph>
          Optionally show an introductory screen to participants before the
          family pedigree task begins. Add text and media sections below, and
          drag them to reorder.
        </Paragraph>
      }
      toggleable
      startExpanded={isEnabled}
      handleToggleChange={handleToggleChange}
    >
      <Row>
        <ValidatedFieldArray
          name="introScreen.items"
          label="Content sections"
          component={DialogArrayField}
          validation={{ notEmpty }}
          componentProps={{
            addTitle: 'Edit Section',
            previewComponent: ItemPreview,
            editorFieldsComponent: ItemEditor,
            editorTitle: 'Edit Section',
            itemLabel: 'content section',
            sortable: true,
            normalizeItem: normalizeType as unknown as (
              value: unknown,
            ) => unknown,
            itemSelector: denormalizeType,
            requestedEditFormName: 'editable-list-form',
            emptyStateMessage:
              'No content sections have been created yet. Click "Create new" to add text or media to the intro screen.',
          }}
        />
      </Row>
    </Section>
  );
};
export default IntroScreen;
