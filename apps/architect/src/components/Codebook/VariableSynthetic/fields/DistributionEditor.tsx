import { useMemo } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import type { SyntheticWindow } from '~/components/Synthetic/summaries';
import { SyntheticNumberField } from '~/components/Synthetic/SyntheticNumberField';
import { withinWindow } from '~/components/Synthetic/useNumericDraft';

import { parameterWindow, seedParameterValue } from '../parameterWindows';
import {
  describeDistributions,
  type SyntheticDistributionSpec,
} from '../schemaIntrospection';

/**
 * The value-distribution half of a variable's synthetic block: which family
 * draws its values, and the parameters that family carries.
 *
 * Both come from the schema handed in — `describeDistributions` reads the
 * families and every parameter's window out of it — so the select can never
 * offer a family the schema does not admit, and a field can never accept a
 * number outside the window the schema states for it.
 *
 * Every proposal goes through `isAdmissible` before it is committed, which
 * parses the whole variable rather than checking a rule of its own. Switching
 * family therefore cannot land on a combination the schema refuses.
 */

/** How each distribution family is named to a researcher. */
const FAMILY_LABELS: Record<string, string> = {
  beta: 'Beta',
  constant: 'Always the same value',
  lognormal: 'Log-normal',
  normal: 'Normal',
  poisson: 'Poisson',
  uniform: 'Uniform',
};

/** How each parameter is named to a researcher. */
const PARAMETER_LABELS: Record<string, string> = {
  max: 'Highest value',
  mean: 'Mean',
  min: 'Lowest value',
  sd: 'Standard deviation',
  sdDays: 'Standard deviation (days)',
  value: 'Value',
};

/** The option that returns the distribution to whatever the schema resolves. */
const DEFAULT_FAMILY_VALUE = '';
const DEFAULT_FAMILY_LABEL = 'Use the default';

const familyLabel = (family: string) => FAMILY_LABELS[family] ?? family;
const parameterLabel = (key: string) => PARAMETER_LABELS[key] ?? key;

export type SyntheticBlockDraft = Record<string, unknown>;

export type DistributionEditorProps = {
  /** The variable type's synthetic schema — the source of every choice here. */
  schema: unknown;
  /** Prefix for each control's field name, unique within the surface. */
  namePrefix: string;
  label: string;
  /** The block as it currently stands, or `undefined` while unauthored. */
  synthetic: SyntheticBlockDraft | undefined;
  /** The window a VALUE of this variable falls in, from its own rules. */
  valueWindow: SyntheticWindow;
  /** Whether the schema would accept the variable carrying this block. */
  isAdmissible: (next: SyntheticBlockDraft | undefined) => boolean;
  onChange: (next: SyntheticBlockDraft | undefined) => void;
  disabled?: boolean;
};

/** Every key any family of this schema uses, so the rest can be preserved. */
const parameterKeysOf = (specs: SyntheticDistributionSpec[]): Set<string> => {
  const keys = new Set<string>();
  for (const spec of specs) {
    for (const parameter of spec.parameters) keys.add(parameter.key);
  }
  return keys;
};

export function DistributionEditor({
  schema,
  namePrefix,
  label,
  synthetic,
  valueWindow,
  isAdmissible,
  onChange,
  disabled = false,
}: DistributionEditorProps) {
  const specs = useMemo(() => describeDistributions(schema), [schema]);
  const current =
    typeof synthetic?.distribution === 'string'
      ? synthetic.distribution
      : DEFAULT_FAMILY_VALUE;
  const spec = specs.find((candidate) => candidate.family === current);

  const options = useMemo(
    () => [
      { value: DEFAULT_FAMILY_VALUE, label: DEFAULT_FAMILY_LABEL },
      ...specs.map((candidate) => ({
        value: candidate.family,
        label: familyLabel(candidate.family),
      })),
    ],
    [specs],
  );

  const handleFamilyChange = (next: string | number | undefined) => {
    const family = String(next ?? DEFAULT_FAMILY_VALUE);
    const parameterKeys = parameterKeysOf(specs);
    // Whatever the block says that is not part of the distribution — the
    // missingness, a weights table — outlives the choice of family.
    const preserved: SyntheticBlockDraft = {};
    for (const [key, value] of Object.entries(synthetic ?? {})) {
      if (key === 'distribution' || parameterKeys.has(key)) continue;
      preserved[key] = value;
    }

    if (family === DEFAULT_FAMILY_VALUE) {
      const proposal =
        Object.keys(preserved).length === 0 ? undefined : preserved;
      if (isAdmissible(proposal)) onChange(proposal);
      return;
    }

    const nextSpec = specs.find((candidate) => candidate.family === family);
    if (!nextSpec) return;

    const proposal: SyntheticBlockDraft = {
      ...preserved,
      distribution: family,
    };
    for (const parameter of nextSpec.parameters) {
      const window = parameterWindow(parameter, valueWindow);
      const carried = synthetic?.[parameter.key];
      if (typeof carried === 'number' && withinWindow(carried, window)) {
        proposal[parameter.key] = carried;
        continue;
      }
      // An optional parameter simply stays unstated; a required one has to
      // arrive with a value the window admits.
      if (!parameter.optional) {
        proposal[parameter.key] = seedParameterValue(window);
      }
    }

    if (isAdmissible(proposal)) onChange(proposal);
  };

  const handleParameterCommit = (key: string, value: number | undefined) => {
    const proposal: SyntheticBlockDraft = { ...synthetic };
    if (value === undefined) {
      delete proposal[key];
    } else {
      proposal[key] = value;
    }
    if (isAdmissible(proposal)) onChange(proposal);
  };

  return (
    <>
      <UnconnectedField
        name={`${namePrefix}.distribution`}
        label={label}
        component={NativeSelectField}
        options={options}
        value={current}
        onChange={handleFamilyChange}
        disabled={disabled}
      />
      {spec?.parameters.map((parameter) => {
        const window = parameterWindow(parameter, valueWindow);
        const carried = synthetic?.[parameter.key];
        return (
          <SyntheticNumberField
            key={parameter.key}
            name={`${namePrefix}.${parameter.key}`}
            label={parameterLabel(parameter.key)}
            value={typeof carried === 'number' ? carried : undefined}
            window={window}
            clearable={parameter.optional}
            disabled={disabled}
            onCommit={(value) => handleParameterCommit(parameter.key, value)}
          />
        );
      })}
    </>
  );
}
