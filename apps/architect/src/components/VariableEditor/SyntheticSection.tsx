import { useMemo } from 'react';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import { SYNTHETIC_TEXT_GENERATORS } from '@codaco/protocol-validation';
import { Section } from '~/components/EditorLayout';

import {
  initialSyntheticValues,
  selectionCountRows,
  SYNTHETIC_ENABLED_FIELD,
  type SyntheticDraftContext,
  syntheticField,
  weightRows,
} from './syntheticDraft';

/**
 * The optional "Synthetic data generation" section of the variable editor.
 *
 * Off by default: nothing is stored and the documented runtime defaults
 * apply. Enabling it initialises every control from the resolved default for
 * this variable's type, so what the researcher first sees is exactly what an
 * undeclared protocol generates with. Turning it off again removes the
 * stored property entirely (the submit handler omits it).
 */

const DISTRIBUTION_OPTIONS: Record<string, { label: string; value: string }[]> =
  {
    number: [
      { label: 'Uniform', value: 'uniform' },
      { label: 'Normal', value: 'normal' },
      { label: 'Log-normal', value: 'lognormal' },
      { label: 'Constant', value: 'constant' },
    ],
    scalar: [
      { label: 'Uniform', value: 'uniform' },
      { label: 'Normal', value: 'normal' },
      { label: 'Beta', value: 'beta' },
      { label: 'Constant', value: 'constant' },
    ],
    datetime: [
      { label: 'Uniform', value: 'uniform' },
      { label: 'Normal', value: 'normal' },
    ],
  };

const GENERATOR_LABELS: Record<string, string> = {
  personName: 'Person name',
  firstName: 'First name',
  lastName: 'Last name',
  placeName: 'Place name',
  organisationName: 'Organisation name',
  occupation: 'Occupation',
  email: 'Email address',
  phoneNumber: 'Phone number',
  streetAddress: 'Street address',
  sentence: 'Sentence',
  paragraph: 'Paragraph',
};

const probabilityFieldProps = {
  component: InputField,
  type: 'number',
  step: '0.01',
  min: 0,
  max: 1,
} as const;

function NumericParameters({
  kind,
  initial,
}: {
  kind: 'number' | 'scalar';
  initial: Record<string, unknown>;
}) {
  const { [syntheticField('distribution')]: distribution } = useFormValue([
    syntheticField('distribution'),
  ] as const);
  const initialFor = (name: string) =>
    String(initial[syntheticField(name)] ?? '');

  if (distribution === 'constant') {
    return (
      <Field
        name={syntheticField('value')}
        label="Value"
        initialValue={initialFor('value')}
        component={InputField}
        type="number"
        step="any"
        required
      />
    );
  }

  const bounded =
    kind === 'scalar'
      ? probabilityFieldProps
      : ({
          component: InputField,
          type: 'number',
          step: 'any',
        } as const);

  return (
    <>
      {distribution !== 'uniform' && (
        <>
          <Field
            name={syntheticField('mean')}
            label="Mean"
            initialValue={initialFor('mean')}
            required
            {...bounded}
          />
          <Field
            name={syntheticField('sd')}
            label="Standard deviation"
            initialValue={initialFor('sd')}
            component={InputField}
            type="number"
            step="any"
            min={0}
            required
          />
        </>
      )}
      {kind === 'number' && (
        <>
          <Field
            name={syntheticField('min')}
            label="Minimum"
            hint="Optional. Values are always kept inside the validation bounds."
            initialValue={initialFor('min')}
            component={InputField}
            type="number"
            step="any"
          />
          <Field
            name={syntheticField('max')}
            label="Maximum"
            hint="Optional."
            initialValue={initialFor('max')}
            component={InputField}
            type="number"
            step="any"
          />
        </>
      )}
    </>
  );
}

function DatetimeParameters({ initial }: { initial: Record<string, unknown> }) {
  const { [syntheticField('distribution')]: distribution } = useFormValue([
    syntheticField('distribution'),
  ] as const);
  const initialFor = (name: string) =>
    String(initial[syntheticField(name)] ?? '');

  return (
    <>
      {distribution === 'normal' && (
        <>
          <Field
            name={syntheticField('mean')}
            label="Mean date"
            hint="A full ISO date (YYYY-MM-DD)."
            initialValue={initialFor('mean')}
            component={InputField}
            required
          />
          <Field
            name={syntheticField('sdDays')}
            label="Standard deviation (days)"
            initialValue={initialFor('sdDays')}
            component={InputField}
            type="number"
            step="any"
            min={0}
            required
          />
        </>
      )}
      <Field
        name={syntheticField('min')}
        label="Earliest date"
        hint="Optional. Uses this variable's date resolution."
        initialValue={initialFor('min')}
        component={InputField}
      />
      <Field
        name={syntheticField('max')}
        label="Latest date"
        hint="Optional. Leave empty to end at the interview date."
        initialValue={initialFor('max')}
        component={InputField}
      />
    </>
  );
}

function WeightTable({ context }: { context: SyntheticDraftContext }) {
  const rows = weightRows(context);
  return (
    <>
      {rows.map((row) => (
        <Field
          key={row.fieldName}
          name={row.fieldName}
          label={row.label}
          initialValue={String(row.initial)}
          component={InputField}
          type="number"
          step="any"
          min={0}
        />
      ))}
    </>
  );
}

function SelectionCountTable({ context }: { context: SyntheticDraftContext }) {
  const rows = selectionCountRows(context);
  return (
    <>
      {rows.map((row) => (
        <Field
          key={row.fieldName}
          name={row.fieldName}
          label={row.label}
          initialValue={String(row.initial)}
          {...probabilityFieldProps}
        />
      ))}
    </>
  );
}

export default function SyntheticSection({
  context,
}: {
  context: SyntheticDraftContext;
}) {
  const initial = useMemo(() => initialSyntheticValues(context), [context]);
  const { [SYNTHETIC_ENABLED_FIELD]: enabled } = useFormValue([
    SYNTHETIC_ENABLED_FIELD,
  ] as const);
  const { type } = context.variable;

  if (type === 'layout' || type === 'location') return null;

  const showMissing = !context.required;
  const distributionOptions = DISTRIBUTION_OPTIONS[type];

  return (
    <Section
      title="Synthetic data generation"
      layout="vertical"
      required={false}
      summary={
        <p>
          Describe the distribution of values this variable should take in
          generated preview and sample data. This never affects real interviews.
        </p>
      }
    >
      <Field
        name={SYNTHETIC_ENABLED_FIELD}
        label="Configure synthetic data for this variable"
        initialValue={Boolean(initial[SYNTHETIC_ENABLED_FIELD])}
        component={ToggleField}
      />
      {!enabled && <p>Runtime defaults will be used for this variable.</p>}
      {Boolean(enabled) && (
        <>
          {distributionOptions && (
            <Field
              name={syntheticField('distribution')}
              label="Distribution"
              initialValue={String(
                initial[syntheticField('distribution')] ?? '',
              )}
              component={NativeSelectField}
              options={distributionOptions}
            />
          )}
          {(type === 'number' || type === 'scalar') && (
            <NumericParameters kind={type} initial={initial} />
          )}
          {type === 'datetime' && <DatetimeParameters initial={initial} />}
          {type === 'boolean' && (
            <Field
              name={syntheticField('probabilityTrue')}
              label="Probability of true"
              initialValue={String(
                initial[syntheticField('probabilityTrue')] ?? '',
              )}
              {...probabilityFieldProps}
            />
          )}
          {type === 'text' && (
            <Field
              name={syntheticField('generator')}
              label="Generator"
              hint="How realistic values are produced for this field."
              initialValue={String(initial[syntheticField('generator')] ?? '')}
              component={NativeSelectField}
              options={[
                { label: 'Neutral words (default)', value: '' },
                ...SYNTHETIC_TEXT_GENERATORS.map((generator) => ({
                  label: GENERATOR_LABELS[generator] ?? generator,
                  value: generator,
                })),
              ]}
            />
          )}
          {(type === 'ordinal' || type === 'categorical') && (
            <WeightTable context={context} />
          )}
          {type === 'categorical' && (
            <>
              <p>
                How many values get selected. Probabilities are normalised to
                sum to 1 when saved; a count of 0 is an answered-but-empty
                selection, not a missing value.
              </p>
              <SelectionCountTable context={context} />
            </>
          )}
          {showMissing && (
            <Field
              name={syntheticField('missingProbability')}
              label="Missing probability"
              hint="Chance this variable is left unanswered (stored as null). Unavailable on required variables."
              initialValue={String(
                initial[syntheticField('missingProbability')] ?? '',
              )}
              {...probabilityFieldProps}
            />
          )}
        </>
      )}
    </Section>
  );
}
