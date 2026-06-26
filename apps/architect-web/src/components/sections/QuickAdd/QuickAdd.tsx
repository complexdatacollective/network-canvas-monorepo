import { compose } from 'react-recompose';

import { Section } from '~/components/EditorLayout';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import withCreateVariableHandler from '../../enhancers/withCreateVariableHandler';
import withDisabledSubjectRequired from '../../enhancers/withDisabledSubjectRequired';
import withSubject from '../../enhancers/withSubject';
import VariablePicker from '../../Form/Fields/VariablePicker/VariablePicker';
import ValidatedField from '../../Form/ValidatedField';
import Tip from '../../Tip';
import withOptions from './withOptions';
import withQuickAddVariable from './withQuickAddVariable';

type VariableOption = {
  label: string;
  value: string;
  type?: string;
};

type QuickAddProps = StageEditorSectionProps & {
  disabled?: boolean;
  entity: string;
  handleCreateVariable: (
    value: string,
    variableType: string,
    fieldName: string,
  ) => void;
  options?: VariableOption[];
  type?: string | null;
  quickAdd?: string | null;
};

const QuickAdd = ({
  disabled = false,
  entity,
  handleCreateVariable,
  options = [],
  type = null,
  quickAdd = null,
}: QuickAddProps) => {
  if (!type) {
    return null;
  }

  // The Tip nudges the user to store the quick-add value in a variable named
  // "name". Once they've done so, the recommendation is satisfied — hide it.
  const selectedOption = options.find(
    (option) => option.value === quickAdd || option.label === quickAdd,
  );
  const hasNameVariable = selectedOption?.label.toLowerCase() === 'name';

  return (
    <Section
      disabled={disabled}
      group
      title="Quick Add Variable"
      id="issue-form"
      summary={
        <p>
          Choose which variable to use to store the value of the quick add form.
        </p>
      }
    >
      {!hasNameVariable && (
        <Tip type="info">
          <p>
            Use a variable called &quot;name&quot; here, unless you have a good
            reason not to. Interviewer will then automatically use this variable
            as the label for the node in the interview.
          </p>
        </Tip>
      )}
      <ValidatedField
        name="quickAdd"
        component={VariablePicker}
        validation={{ required: true }}
        componentProps={{
          options,
          onCreateOption: (value: string) =>
            handleCreateVariable(value, 'text', 'quickAdd'),
          type,
          entity,
          variable: quickAdd,
        }}
      />
    </Section>
  );
};

export default compose<QuickAddProps, StageEditorSectionProps>(
  withSubject,
  withDisabledSubjectRequired,
  withQuickAddVariable,
  withOptions,
  withCreateVariableHandler,
)(QuickAdd);
