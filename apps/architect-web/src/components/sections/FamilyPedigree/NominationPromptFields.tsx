import { useSelector } from 'react-redux';
import { change } from 'redux-form';

import { Row, Section } from '~/components/EditorLayout';
import VariablePicker from '~/components/Form/Fields/VariablePicker/VariablePicker';
import ValidatedField from '~/components/Form/ValidatedField';
import type { Entity } from '~/components/NewVariableWindow';
import NewVariableWindow, {
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import PromptText from '~/components/sections/PromptText';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';
import { getVariableOptionsForSubject } from '~/selectors/codebook';
import { getFieldId } from '~/utils/issues';

type NominationPromptFieldsProps = {
  nodeType?: string;
};

const nodeEntity: Entity = 'node';

const NominationPromptFields = ({ nodeType }: NominationPromptFieldsProps) => {
  const dispatch = useAppDispatch();
  const variableOptions = useSelector((state: RootState) =>
    getVariableOptionsForSubject(state, { entity: 'node', type: nodeType }),
  );

  const booleanVariables = variableOptions.filter((v) => v.type === 'boolean');

  const handleCreatedNewVariable = (...args: unknown[]) => {
    const [id, params] = args as [string, { field: string }];
    dispatch(change('editable-list-form', params.field, id));
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
      <PromptText />
      <Section title="Variable" layout="vertical">
        <Row>
          <div id={getFieldId('variable')} />
          <ValidatedField
            name="variable"
            component={VariablePicker}
            validation={{ required: true }}
            componentProps={{
              entity: 'node',
              type: nodeType,
              options: booleanVariables,
              onCreateOption: handleNewVariable,
            }}
          />
        </Row>
      </Section>
      <NewVariableWindow {...newVariableWindowProps} />
    </>
  );
};

export default NominationPromptFields;
