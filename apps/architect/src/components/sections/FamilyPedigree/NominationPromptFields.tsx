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
        title="Nomination details"
        description="Write the question participants will answer and choose the boolean attribute that records who they nominate."
      >
        <ArchitectField
          name="text"
          component={RichText}
          singleLine
          label="Prompt text"
          placeholder="Enter your prompt..."
          validation={{ required: true }}
          initialValue={asString(item?.text)}
        />
        <div id={getFieldId('variable')} />
        <ArchitectField
          name="variable"
          component={VariablePickerControl}
          validation={{ required: true }}
          label="Attribute"
          hint="Select the boolean attribute this prompt will update."
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
