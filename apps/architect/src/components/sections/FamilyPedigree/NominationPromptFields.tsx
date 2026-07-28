import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

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
import { excludeValidatedUses } from '~/selectors/roleFilters';
import { getFieldId } from '~/utils/issues';

type NominationPromptFieldsProps = {
  nodeType?: string;
};

const nodeEntity: Entity = 'node';

const EDITABLE_LIST_FORM = 'editable-list-form';

const NominationPromptFields = ({ nodeType }: NominationPromptFieldsProps) => {
  const dispatch = useAppDispatch();
  const variable = useSelector(
    (state: RootState) =>
      formValueSelector(EDITABLE_LIST_FORM)(state, 'variable') as
        | string
        | undefined,
  );
  const variableOptions = useSelector((state: RootState) =>
    getVariableOptionsForSubject(state, { entity: 'node', type: nodeType }),
  );

  const booleanVariables = variableOptions.filter((v) => v.type === 'boolean');

  // The nomination-toggle picker is an UNVALIDATED writer: drop options a
  // form elsewhere already validates.
  const subject = { entity: 'node', type: nodeType };
  const availableVariables = useSelector((state: RootState) =>
    excludeValidatedUses(state, subject, booleanVariables, variable),
  );

  const handleCreatedNewVariable = (...args: unknown[]) => {
    const [id, params] = args as [string, { field: string }];
    dispatch(change(EDITABLE_LIST_FORM, params.field, id));
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
              options: availableVariables,
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
