import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';
import type { Entity } from '~/components/NewVariableWindow';
import NewVariableWindow, {
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import PromptText from '~/components/sections/PromptText';
import { useAppSelector } from '~/ducks/hooks';
import { getVariableOptionsForSubject } from '~/selectors/codebook';
import { excludeValidatedUses } from '~/selectors/roleFilters';
import { getFieldId } from '~/utils/issues';

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
  // form elsewhere already validates.
  const subject = { entity: 'node', type: nodeType };
  const availableVariables = useAppSelector((state) =>
    excludeValidatedUses(
      state,
      subject,
      booleanVariables,
      typeof variable === 'string' ? variable : undefined,
    ),
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
      <PromptText initialValue={asString(item?.text)} />
      <Section title="Variable" layout="vertical">
        <Row>
          <div id={getFieldId('variable')} />
          <ArchitectField
            name="variable"
            component={VariablePickerControl}
            validation={{ required: true }}
            label="Variable"
            labelHidden
            initialValue={asString(item?.variable)}
            entity="node"
            type={nodeType}
            options={availableVariables}
            onCreateOption={handleNewVariable}
          />
        </Row>
      </Section>
      <NewVariableWindow {...newVariableWindowProps} />
    </>
  );
};

export default NominationPromptFields;
