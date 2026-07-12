import type { ComponentType } from 'react';
import { compose } from 'react-recompose';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import RichTextField from '~/components/Form/Fields/RichText/Field';
import ValidatedField from '~/components/Form/ValidatedField';
import NewVariableWindow, {
  type Entity,
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import Options from '~/components/Options';
import PromptText from '~/components/sections/PromptText';
import { getFieldId } from '~/utils/issues';

import VariablePicker from '../../Form/Fields/VariablePicker/VariablePicker';
import BinSortOrderSection from '../BinSortOrderSection';
import BucketSortOrderSection from '../BucketSortOrderSection';
import { getSortOrderOptionGetter } from './optionGetters';
import withVariableHandlers from './withVariableHandlers';
import withVariableOptions from './withVariableOptions';
type VariableOption = {
  label: string;
  value: string;
  type: string;
};
type PromptFieldsProps = {
  changeForm: (form: string, field: string, value: unknown) => void;
  entity: string;
  form: string;
  onCreateOtherVariable: (value: string, field: string) => void;
  optionsForVariableDraft?: Array<Record<string, unknown>>;
  otherVariable?: string;
  type: string;
  variable?: string;
  variableOptions?: VariableOption[];
};
const PromptFields = ({
  changeForm,
  entity,
  form,
  onCreateOtherVariable,
  optionsForVariableDraft = [],
  otherVariable,
  type,
  variable,
  variableOptions = [],
}: PromptFieldsProps) => {
  const newVariableWindowInitialProps = {
    entity: entity as Entity,
    type,
    initialValues: { name: '', type: '' },
  };
  const handleCreatedNewVariable = (...args: unknown[]) => {
    const [id, params] = args as [
      string,
      {
        field: string;
      },
    ];
    changeForm(form, params.field, id);
  };
  const handleToggleOtherVariable = (nextState: boolean) => {
    if (!nextState) {
      changeForm(form, 'otherVariable', null);
      changeForm(form, 'otherVariablePrompt', null);
      changeForm(form, 'otherOptionLabel', null);
    }
    return true;
  };
  const [newVariableWindowProps, openNewVariableWindow] =
    useNewVariableWindowState(
      newVariableWindowInitialProps,
      handleCreatedNewVariable,
    );
  const handleNewVariable = (name: string) =>
    openNewVariableWindow(
      { initialValues: { name, type: 'categorical' } },
      { field: 'variable' },
    );
  const categoricalVariableOptions = variableOptions.filter(
    ({ type: variableType }) => variableType === 'categorical',
  );
  const otherVariableOptions = variableOptions.filter(
    ({ type: variableType }) => variableType === 'text',
  );
  const getOptions = getSortOrderOptionGetter(variableOptions);
  const sortMaxItems = getOptions('property', undefined, []).length;
  const totalOptionsLength =
    optionsForVariableDraft &&
    optionsForVariableDraft.length + (otherVariable ? 1 : 0);
  const showVariableOptionsTip = totalOptionsLength > 8;
  return (
    <>
      <PromptText />
      <Section
        title="Categorical Variable"
        id={getFieldId('variable')}
        layout="vertical"
      >
        <Row>
          <ValidatedField
            name="variable"
            component={VariablePicker}
            validation={{ required: true }}
            componentProps={{
              type,
              entity,
              options: categoricalVariableOptions,
              onCreateOption: handleNewVariable,
              variable,
            }}
          />
        </Row>
        {variable && (
          <Row>
            <Heading level="h4" id={getFieldId('options')}>
              Variable Options
            </Heading>
            <Paragraph>
              Create <strong>up to 8</strong> options for this variable.
            </Paragraph>
            {showVariableOptionsTip && (
              <Alert variant="destructive" className="my-7">
                <AlertTitle>Too many option values</AlertTitle>
                <AlertDescription>
                  The categorical bin interface is designed to use{' '}
                  <strong>up to 8 option values</strong> (including an
                  &quot;other&quot; variable). Using more will create a
                  sub-optimal experience for participants, and might reduce data
                  quality. Consider grouping your variable options and capturing
                  further detail with follow-up questions.
                </AlertDescription>
              </Alert>
            )}
            <Options name="variableOptions" label="Options" />
          </Row>
        )}
      </Section>
      <Section
        disabled={!variable}
        title='Follow-up "Other" Option'
        summary={
          <Paragraph>
            You can optionally create an &quot;other&quot; option that triggers
            a follow-up dialog when nodes are dropped within it, and stores the
            value the participant enters in a designated variable. This feature
            may be useful in order to collect values you might not have listed
            above.
          </Paragraph>
        }
        toggleable
        startExpanded={!!otherVariable}
        handleToggleChange={handleToggleOtherVariable}
        layout="vertical"
      >
        <Row>
          <ValidatedField
            name="otherVariable"
            component={VariablePicker}
            validation={{ required: true }}
            componentProps={{
              entity,
              type,
              options: otherVariableOptions,
              onCreateOption: (value: string) =>
                onCreateOtherVariable(value, 'otherVariable'),
              variable: otherVariable,
            }}
          />
        </Row>
        <Row>
          <ValidatedField
            name="otherOptionLabel"
            component={RichTextField as ComponentType<Record<string, unknown>>}
            validation={{ required: true }}
            componentProps={{
              inline: true,
              placeholder:
                'Enter a label (such as &quot;other&quot;) for this bin...',
              label: 'Label for Bin',
            }}
          />
        </Row>
        <Row>
          <ValidatedField
            name="otherVariablePrompt"
            component={RichTextField as ComponentType<Record<string, unknown>>}
            validation={{ required: true }}
            componentProps={{
              inline: true,
              placeholder:
                'Enter a question prompt to show when the other option is triggered...',
              label: 'Question Prompt for Dialog',
            }}
          />
        </Row>
      </Section>
      <BucketSortOrderSection
        form={form}
        disabled={!variable}
        maxItems={sortMaxItems}
        optionGetter={() => getOptions('property', undefined, [])}
      />
      <BinSortOrderSection
        form={form}
        disabled={!variable}
        maxItems={sortMaxItems}
        optionGetter={() => getOptions('property', undefined, [])}
      />
      <NewVariableWindow
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...newVariableWindowProps}
      />
    </>
  );
};
export default compose<PromptFieldsProps, Record<string, never>>(
  withVariableOptions,
  withVariableHandlers,
)(PromptFields);
