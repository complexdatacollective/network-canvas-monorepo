import { useEffect, useMemo, useRef } from 'react';
import { shallowEqual, useSelector } from 'react-redux';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import Options, {
  completeOptions,
  minTwoOptions,
  type OptionValue,
} from '~/components/Form/arrayFields/Options';
import ColorPicker from '~/components/Form/Fields/ColorPicker';
import NewVariableWindow, {
  type Entity,
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import { getSortOrderOptionGetter } from '~/components/sections/CategoricalBinPrompts/optionGetters';
import PromptText from '~/components/sections/PromptText';
import type { RootState } from '~/ducks/modules/root';
import {
  getVariableOptionsForSubject,
  getVariablesForSubject,
} from '~/selectors/codebook';
import { excludeValidatedUses } from '~/selectors/roleFilters';
import { getFieldId } from '~/utils/issues';

import { VariablePickerControl as VariablePicker } from '../../Form/Fields/VariablePicker/VariablePicker';
import BinSortOrderSection from '../BinSortOrderSection';
import BucketSortOrderSection from '../BucketSortOrderSection';

type SelectOption = {
  label: string;
  value: string;
  type?: string;
};

type SortOrderRow = Record<string, unknown>;

const EMPTY_OPTIONS: SelectOption[] = [];
const EMPTY_VARIABLE_OPTIONS: OptionValue[] = [];

type PromptFieldsProps = {
  entity?: 'node' | 'edge' | 'ego' | null;
  type?: string | null;
  text?: string;
  variable?: string;
  color?: string;
  variableOptions?: OptionValue[];
  bucketSortOrder?: SortOrderRow[];
  binSortOrder?: SortOrderRow[];
};

const PromptFields = ({
  entity = null,
  type = null,
  text,
  variable,
  color,
  variableOptions = EMPTY_VARIABLE_OPTIONS,
  bucketSortOrder,
  binSortOrder,
}: PromptFieldsProps) => {
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const { variable: liveVariable, variableOptions: liveVariableOptions } =
    useFormValue(['variable', 'variableOptions'] as const);
  const currentVariable =
    typeof liveVariable === 'string' ? liveVariable : variable;
  const currentVariableOptions = Array.isArray(liveVariableOptions)
    ? (liveVariableOptions as OptionValue[])
    : variableOptions;

  const subject = useMemo(
    () => (entity ? { entity, type: type ?? undefined } : null),
    [entity, type],
  );

  // Sort keys are read-only references outside the writer-exclusivity rule: a
  // bin may still be bucket/bin-sorted by a form-collected variable that the
  // role-filtered writer pool below drops, so they draw from this RAW pool.
  const sortVariableOptions = useSelector(
    (state: RootState) =>
      subject
        ? (getVariableOptionsForSubject(state, subject) as SelectOption[])
        : EMPTY_OPTIONS,
    shallowEqual,
  );

  // The `variable` picker is an UNVALIDATED writer: drop options a form
  // elsewhere already validates. The current pick is always kept.
  const ordinalVariableOptions = useSelector(
    (state: RootState) =>
      subject
        ? (excludeValidatedUses(
            state,
            subject,
            sortVariableOptions.filter(
              ({ type: variableType }) => variableType === 'ordinal',
            ),
            currentVariable,
          ) as SelectOption[])
        : EMPTY_OPTIONS,
    shallowEqual,
  );

  const optionsForCurrentVariable = useSelector((state: RootState) => {
    if (!subject || !currentVariable) return EMPTY_VARIABLE_OPTIONS;
    const variables = getVariablesForSubject(state, subject);
    const found = variables[currentVariable];
    return found && 'options' in found
      ? ((found.options ?? EMPTY_VARIABLE_OPTIONS) as OptionValue[])
      : EMPTY_VARIABLE_OPTIONS;
  }, shallowEqual);

  // Picking a different variable replaces the draft options with that
  // variable's already-committed ones (the `withVariableOptions` lifecycle
  // this replaces) — but only on an actual change, so opening the dialog on
  // an already-configured prompt doesn't clobber its live draft.
  const previousVariableRef = useRef(currentVariable);
  useEffect(() => {
    if (previousVariableRef.current === currentVariable) return;
    previousVariableRef.current = currentVariable;
    setFieldValue('variableOptions', optionsForCurrentVariable);
  }, [currentVariable, optionsForCurrentVariable, setFieldValue]);

  const getOptions = getSortOrderOptionGetter(sortVariableOptions);
  const sortMaxItems = getOptions('property', undefined, []).length;
  const showVariableOptionsTip = currentVariableOptions.length > 5;

  const newVariableWindowInitialProps = {
    entity: (entity ?? 'node') as Entity,
    type: type ?? '',
    initialValues: { name: '', type: '' },
  };
  const handleCreatedNewVariable = (...args: unknown[]) => {
    const [id, params] = args as [string, { field: string }];
    setFieldValue(params.field, id);
  };
  const [newVariableWindowProps, openNewVariableWindow] =
    useNewVariableWindowState(
      newVariableWindowInitialProps,
      handleCreatedNewVariable,
    );
  const handleNewVariable = (name: string) =>
    openNewVariableWindow(
      { initialValues: { name, type: 'ordinal' } },
      { field: 'variable' },
    );

  return (
    <>
      <PromptText initialValue={text} />
      <Section
        title="Ordinal Variable"
        id={getFieldId('variable')}
        layout="vertical"
      >
        <Row>
          <ArchitectField
            name="variable"
            label="Ordinal variable"
            labelHidden
            component={VariablePicker}
            validation={{ required: true }}
            initialValue={variable}
            entity={entity}
            type={type}
            options={ordinalVariableOptions}
            onCreateOption={handleNewVariable}
          />
        </Row>
      </Section>
      {currentVariable && (
        <Section
          title="Variable Options"
          id={getFieldId('variableOptions')}
          layout="vertical"
        >
          <Row>
            {showVariableOptionsTip && (
              <Alert variant="destructive" className="my-7">
                <AlertTitle>Too many option values</AlertTitle>
                <AlertDescription>
                  The ordinal bin interface is designed to use{' '}
                  <strong>up to 5 option values</strong>. Using more will create
                  a sub-optimal experience for participants, and might reduce
                  data quality.
                </AlertDescription>
              </Alert>
            )}
            <ArchitectArrayField
              name="variableOptions"
              label="Option values"
              hint={
                <>
                  Create <strong>up to 5</strong> options for this variable.
                </>
              }
              component={Options}
              validation={{ minTwoOptions, completeOptions }}
              initialValue={variableOptions}
            />
          </Row>
        </Section>
      )}
      <Section title="Color" id={getFieldId('color')} layout="vertical">
        <Row>
          <ArchitectField
            name="color"
            label="Which color would you like to use for this scale?"
            hint="Interviewer will render each option in your ordinal variable using a color gradient."
            component={ColorPicker}
            validation={{ required: true }}
            initialValue={color}
            palette="ord-color-seq"
            paletteRange={8}
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
