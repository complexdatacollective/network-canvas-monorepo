import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import EditableList from '~/components/EditableList';
import { Section } from '~/components/EditorLayout';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useAppDispatch } from '~/ducks/hooks';
import { openDialog } from '~/ducks/modules/dialogs';
import type { RootState } from '~/ducks/store';

import NominationPromptFields from './NominationPromptFields';
import NominationPromptPreview from './NominationPromptPreview';

const NominationPrompts = ({ form }: StageEditorSectionProps) => {
  const dispatch = useAppDispatch();
  const getFormValue = formValueSelector(form);

  const nodeType = useSelector(
    (state: RootState) =>
      getFormValue(state, 'nodeConfig.type') as string | undefined,
  );

  const hasNominationPrompts = useSelector(
    (state: RootState) =>
      getFormValue(state, 'nominationPrompts') as unknown[] | undefined,
  );

  const isDisabled = !nodeType;

  const handleToggleChange = useCallback(
    async (newState: boolean) => {
      if (!hasNominationPrompts?.length || newState) {
        return true;
      }

      const confirm = await dispatch(
        openDialog({
          type: 'Warning',
          title: 'This will clear your nomination prompts',
          message:
            'This will clear your nomination prompts and delete any prompts you have created. Do you want to continue?',
          confirmLabel: 'Clear prompts',
        }),
      ).unwrap();

      if (confirm) {
        dispatch(change(form, 'nominationPrompts', null));
        return true;
      }

      return false;
    },
    [dispatch, form, hasNominationPrompts],
  );

  return (
    <Section
      disabled={isDisabled}
      summary={
        <p>
          Optionally add prompts to collect attribute information about family
          members. Each prompt should ask about a specific condition or trait
          and will store the response in the selected boolean variable.
        </p>
      }
      title="Nomination Prompts"
      toggleable
      startExpanded={!!hasNominationPrompts?.length}
      handleToggleChange={handleToggleChange}
    >
      <EditableList
        previewComponent={NominationPromptPreview}
        editComponent={NominationPromptFields}
        title="Edit Prompt"
        fieldName="nominationPrompts"
        form={form}
        editProps={{ nodeType }}
      />
    </Section>
  );
};

export default NominationPrompts;
