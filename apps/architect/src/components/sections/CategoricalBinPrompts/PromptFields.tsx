import { useEffect, useRef } from 'react';
import { shallowEqual } from 'react-redux';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import Options, {
  optionsValidation,
} from '~/components/Form/arrayFields/Options';
import { useClearValue } from '~/components/Form/clearFieldValue';
import RichTextField from '~/components/Form/Fields/RichText/Field';
import NewVariableWindow, {
  type Entity,
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import PromptText from '~/components/sections/PromptText';
import { useCreateVariable } from '~/components/StageEditor/stageFormHooks';
import { useAppSelector } from '~/ducks/hooks';
import {
  getVariableOptionsForSubject,
  getVariablesForSubject,
} from '~/selectors/codebook';
import {
  excludeUnvalidatedUses,
  excludeValidatedUses,
} from '~/selectors/roleFilters';
import { getFieldId } from '~/utils/issues';

import { VariablePickerControl as VariablePicker } from '../../Form/Fields/VariablePicker/VariablePicker';
import BinSortOrderSection from '../BinSortOrderSection';
import BucketSortOrderSection from '../BucketSortOrderSection';
import CodebookVariableValidationSection from '../CodebookVariableValidationSection';
import { getSortOrderOptionGetter } from './optionGetters';

type VariableOption = {
  label: string;
  value: string;
  type: string;
};

type PromptFieldsProps = {
  entity: 'node' | 'edge' | 'ego';
  type: string | null;
  text?: string;
  variable?: string;
  otherVariable?: string;
  otherOptionLabel?: string;
  otherVariablePrompt?: string;
  variableOptions?: VariableOption[];
  binSortOrder?: Record<string, unknown>[];
  bucketSortOrder?: Record<string, unknown>[];
};

const PromptFields = ({
  entity,
  type,
  text,
  variable,
  otherVariable,
  otherOptionLabel,
  otherVariablePrompt,
  variableOptions = [],
  binSortOrder,
  bucketSortOrder,
}: PromptFieldsProps) => {
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const clearValue = useClearValue();
  const { variable: liveVariable, variableOptions: liveVariableOptions } =
    useFormValue(['variable', 'variableOptions'] as const);
  const currentVariable =
    typeof liveVariable === 'string' ? liveVariable : variable;
  // `otherVariable` is the one field here the researcher can explicitly
  // REMOVE (`handleToggleOtherVariable` clears the trio), so it needs the
  // three-way resolution a plain value read cannot express: registered →
  // dormant → the row's pre-edit prop. A value read collapses "no entry at
  // all" and "an entry holding `undefined`" into the same `undefined`, and
  // falling back to the prop for both revives the variable that was just
  // removed — mounting `CodebookVariableValidationSection`, whose rule
  // changes commit straight to that codebook variable, under a blank picker.
  //
  // The dormant entry's VALUE is what decides, never its existence: a section
  // that becomes `disabled` unmounts these fields WITHOUT clearing them, so a
  // dormant entry also holds a perfectly live variable that must survive.
  const otherVariableEntry = useFormStore(
    (state) =>
      state.fields.get('otherVariable') ??
      state.dormantValues.get('otherVariable'),
  );
  const currentOtherVariable = otherVariableEntry
    ? typeof otherVariableEntry.value === 'string'
      ? otherVariableEntry.value
      : undefined
    : otherVariable;
  const currentVariableOptions = Array.isArray(liveVariableOptions)
    ? (liveVariableOptions as VariableOption[])
    : variableOptions;
  const { createVariable } = useCreateVariable();

  const subject = { entity, type: type ?? undefined };
  // The main `variable` picker is an UNVALIDATED writer: drop options a form
  // elsewhere already validates. CategoricalBin's "other" picker is a
  // VALIDATED writer (its input now honours the referenced variable's
  // codebook validation): drop options an unvalidated writer elsewhere
  // already claims.
  const rawVariableOptions = useAppSelector((state) =>
    getVariableOptionsForSubject(state, subject),
  );
  const optionsForCurrentVariable = useAppSelector((state) => {
    const variables = getVariablesForSubject(state, subject);
    const found = currentVariable ? variables[currentVariable] : undefined;
    return found && 'options' in found ? (found.options ?? []) : [];
  });

  // Picking a different variable replaces the draft options with that
  // variable's already-committed ones — but only on an actual change, so
  // opening the
  // dialog on an already-configured prompt doesn't clobber its live draft.
  const previousVariableRef = useRef(currentVariable);
  useEffect(() => {
    if (previousVariableRef.current === currentVariable) return;
    previousVariableRef.current = currentVariable;
    setFieldValue('variableOptions', optionsForCurrentVariable);
  }, [currentVariable, optionsForCurrentVariable, setFieldValue]);

  // Both exclusions keep the picker's own current pick, so opening an
  // already-configured prompt never loses its variable from the list.
  const categoricalVariableOptions = useAppSelector(
    (state) =>
      excludeValidatedUses(
        state,
        subject,
        rawVariableOptions.filter(
          ({ type: variableType }) => variableType === 'categorical',
        ),
        currentVariable,
      ),
    shallowEqual,
  );
  const otherVariableTextOptions = useAppSelector(
    (state) =>
      excludeUnvalidatedUses(
        state,
        subject,
        rawVariableOptions.filter(
          ({ type: variableType }) => variableType === 'text',
        ),
        currentOtherVariable,
      ),
    shallowEqual,
  );
  const getOptions = getSortOrderOptionGetter(rawVariableOptions);
  const sortMaxItems = getOptions('property', undefined, []).length;
  const totalOptionsLength =
    currentVariableOptions.length + (currentOtherVariable ? 1 : 0);
  const showVariableOptionsTip = totalOptionsLength > 8;

  const newVariableWindowInitialProps = {
    entity: entity as Entity,
    type: type ?? '',
    initialValues: { name: '', type: '' },
  };
  const handleCreatedNewVariable = (...args: unknown[]) => {
    const [id, params] = args as [string, { field: string }];
    setFieldValue(params.field, id);
  };
  // Clearing (rather than relying on unmount) is what tells the save the
  // researcher turned this off: `DialogArrayField`'s `mergeEditedRow` reads
  // the cleared fields' dormant entries and DELETES those keys from the row,
  // instead of letting the pre-edit values survive the merge.
  const handleToggleOtherVariable = (nextState: boolean) => {
    if (!nextState) {
      clearValue('otherVariable');
      clearValue('otherVariablePrompt');
      clearValue('otherOptionLabel');
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
  const handleCreateOtherVariable = async (name: string) => {
    const id = await createVariable(name, 'text');
    if (id) setFieldValue('otherVariable', id);
  };

  return (
    <>
      <PromptText initialValue={text} />
      <Section
        title="Categorical Variable"
        id={getFieldId('variable')}
        layout="vertical"
      >
        <Row>
          <ArchitectField
            name="variable"
            label="Categorical variable"
            labelHidden
            component={VariablePicker}
            validation={{ required: true }}
            initialValue={variable}
            type={type}
            entity={entity}
            options={categoricalVariableOptions}
            onCreateOption={handleNewVariable}
          />
        </Row>
        {currentVariable && (
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
            <ArchitectArrayField
              name="variableOptions"
              label="Options"
              labelHidden
              component={Options}
              validation={optionsValidation}
              initialValue={variableOptions}
            />
          </Row>
        )}
      </Section>
      <Section
        disabled={!currentVariable}
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
        startExpanded={!!currentOtherVariable}
        handleToggleChange={handleToggleOtherVariable}
        layout="vertical"
      >
        <Row>
          <ArchitectField
            name="otherVariable"
            label="Other variable"
            labelHidden
            component={VariablePicker}
            validation={{ required: true }}
            initialValue={otherVariable}
            entity={entity}
            type={type}
            options={otherVariableTextOptions}
            onCreateOption={handleCreateOtherVariable}
          />
        </Row>
        {currentOtherVariable && (
          <CodebookVariableValidationSection
            fieldName="otherVariable"
            entity={entity}
            type={type}
            variableId={currentOtherVariable}
          />
        )}
        <Row>
          <ArchitectField
            name="otherOptionLabel"
            label="Label for Bin"
            component={RichTextField}
            validation={{ required: true }}
            initialValue={otherOptionLabel}
            singleLine
            placeholder='Enter a label (such as "other") for this bin...'
          />
        </Row>
        <Row>
          <ArchitectField
            name="otherVariablePrompt"
            label="Question Prompt for Dialog"
            component={RichTextField}
            validation={{ required: true }}
            initialValue={otherVariablePrompt}
            singleLine
            placeholder="Enter a question prompt to show when the other option is triggered..."
          />
        </Row>
      </Section>
      <BucketSortOrderSection
        disabled={!currentVariable}
        maxItems={sortMaxItems}
        optionGetter={getOptions}
        initialValue={bucketSortOrder}
      />
      <BinSortOrderSection
        disabled={!currentVariable}
        maxItems={sortMaxItems}
        optionGetter={getOptions}
        initialValue={binSortOrder}
      />
      <NewVariableWindow
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...newVariableWindowProps}
      />
    </>
  );
};

export default PromptFields;
