import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import RichText from '@codaco/protocol-builder/fields/RichTextField';
import ArchitectField from '~/components/Form/ArchitectField';
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';
import type { Entity } from '~/components/NewVariableWindow';
import NewVariableWindow, {
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import { useAppSelector } from '~/ducks/hooks';
import { getVariableOptionsForSubject } from '~/selectors/codebook';
import { getFieldId } from '~/utils/issues';

import { selectSlotPickerOptions } from './slotWiring';
const messages = defineMessages({
  nominationDetails: {
    id: 'architect.sections.familyPedigree.nominationPromptFields.nominationDetails',
    defaultMessage: 'Nomination details',
    description:
      'The title text in components / sections / FamilyPedigree / NominationPromptFields.',
  },
  writeTheQuestionParticipantsWillAnswer: {
    id: 'architect.sections.familyPedigree.nominationPromptFields.writeTheQuestionParticipantsWillAnswer',
    defaultMessage:
      'Write the question participants will answer and choose the boolean attribute that records who they nominate.',
    description:
      'The description text in components / sections / FamilyPedigree / NominationPromptFields.',
  },
  promptText: {
    id: 'architect.sections.familyPedigree.nominationPromptFields.promptText',
    defaultMessage: 'Prompt text',
    description:
      'The label text in components / sections / FamilyPedigree / NominationPromptFields.',
  },
  enterYourPrompt: {
    id: 'architect.sections.familyPedigree.nominationPromptFields.enterYourPrompt',
    defaultMessage: 'Enter your prompt...',
    description:
      'The placeholder text in components / sections / FamilyPedigree / NominationPromptFields.',
  },
  attribute: {
    id: 'architect.sections.familyPedigree.nominationPromptFields.attribute',
    defaultMessage: 'Attribute',
    description:
      'The label text in components / sections / FamilyPedigree / NominationPromptFields.',
  },
  selectTheBooleanAttributeThisPrompt: {
    id: 'architect.sections.familyPedigree.nominationPromptFields.selectTheBooleanAttributeThisPrompt',
    defaultMessage: 'Select the boolean attribute this prompt will update.',
    description:
      'The hint text in components / sections / FamilyPedigree / NominationPromptFields.',
  },
});

type NominationPromptFieldsProps = {
  nodeType?: string;
  /**
   * The row being edited, supplied by DialogArrayField's `item` spread. This
   * dialog mounts its own `FormStoreProvider` (a different store per row), so
   * it cannot resolve its own initial values from stage context — every
   * control seeds its `initialValue` from here instead.
   */
  item?: Record<string, unknown>;
};

const nodeEntity: Entity = 'node';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const NominationPromptFields = ({
  nodeType,
  item,
}: NominationPromptFieldsProps) => {
  const intl = useAppIntl();
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const { variable } = useFormValue(['variable'] as const);
  const variableOptions = useAppSelector((state) =>
    getVariableOptionsForSubject(state, { entity: 'node', type: nodeType }),
  );

  const booleanVariables = variableOptions.filter((v) => v.type === 'boolean');

  // The nomination-toggle picker is an UNVALIDATED writer: drop options a
  // form elsewhere already validates. It also writes through a per-node toggle
  // the participant operates, so it may never name a variable the pedigree
  // itself derives — the ego marker above all, which every completeness check
  // keys off. It fills no interface slot of its own, so no slot is exempt.
  const availableVariables = useAppSelector((state) =>
    selectSlotPickerOptions(state, {
      subject: nodeType ? { entity: 'node', type: nodeType } : null,
      options: booleanVariables,
      currentValue: typeof variable === 'string' ? variable : undefined,
      writerClass: 'unvalidated',
    }),
  );

  const handleCreatedNewVariable = (...args: unknown[]) => {
    const [id, params] = args as [string, { field: string }];
    setFieldValue(params.field, id);
  };

  const [newVariableWindowProps, openNewVariableWindow] =
    useNewVariableWindowState(
      {
        entity: nodeEntity,
        type: nodeType ?? '',
        initialValues: { name: '', type: 'boolean' },
        allowVariableTypes: ['boolean'],
      },
      handleCreatedNewVariable,
    );

  const handleNewVariable = (name: string) =>
    openNewVariableWindow(
      { initialValues: { name, type: 'boolean' } },
      { field: 'variable' },
    );

  return (
    <>
      <Section
        title={intl.formatMessage(messages.nominationDetails)}
        description={intl.formatMessage(
          messages.writeTheQuestionParticipantsWillAnswer,
        )}
      >
        <ArchitectField
          name="text"
          component={RichText}
          singleLine
          label={intl.formatMessage(messages.promptText)}
          placeholder={intl.formatMessage(messages.enterYourPrompt)}
          validation={{ required: true }}
          initialValue={asString(item?.text)}
        />
        <div id={getFieldId('variable')} />
        <ArchitectField
          name="variable"
          component={VariablePickerControl}
          validation={{ required: true }}
          label={intl.formatMessage(messages.attribute)}
          hint={intl.formatMessage(
            messages.selectTheBooleanAttributeThisPrompt,
          )}
          initialValue={asString(item?.variable)}
          entity="node"
          type={nodeType}
          options={availableVariables}
          onCreateOption={handleNewVariable}
        />
      </Section>
      <NewVariableWindow {...newVariableWindowProps} />
    </>
  );
};

export default NominationPromptFields;
