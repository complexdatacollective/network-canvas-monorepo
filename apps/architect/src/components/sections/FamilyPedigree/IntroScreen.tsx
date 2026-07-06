import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import type { FamilyPedigreeIntroItem } from '@codaco/protocol-validation';
import EditableList from '~/components/EditableList';
import { Row, Section } from '~/components/EditorLayout';
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

const IntroScreen = ({ form }: StageEditorSectionProps) => {
  const dispatch = useAppDispatch();
  const formSelector = formValueSelector(form);

  const introScreen = useSelector(
    (state: RootState) =>
      formSelector(state, 'introScreen') as IntroScreenValue | undefined,
  );

  const isEnabled = introScreen !== null && introScreen !== undefined;
  const hasItems = !!introScreen?.items?.length;

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
        <p>
          Optionally show an introductory screen to participants before the
          family pedigree task begins. Add text and media sections below, and
          drag them to reorder.
        </p>
      }
      toggleable
      startExpanded={isEnabled}
      handleToggleChange={handleToggleChange}
    >
      <Row>
        <EditableList
          label="Content sections"
          previewComponent={ItemPreview}
          editComponent={ItemEditor}
          title="Edit Section"
          fieldName="introScreen.items"
          form={form}
          normalize={normalizeType as unknown as (value: unknown) => unknown}
          itemSelector={
            denormalizeType as unknown as (
              state: Record<string, unknown>,
              params: { form: string; editField: string },
            ) => unknown
          }
        >
          {!hasItems && (
            <p className="text-current/70 italic">
              No content sections have been created yet. Click &ldquo;Create
              new&rdquo; to add text or media to the intro screen.
            </p>
          )}
        </EditableList>
      </Row>
    </Section>
  );
};

export default IntroScreen;
