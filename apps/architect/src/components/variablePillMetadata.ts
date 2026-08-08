import { resolveVariableSynthetic } from '@codaco/protocol-utilities';
import type {
  Validation,
  ValidationName,
  Variable,
} from '@codaco/protocol-validation';

import type { VariableDistributionShape } from './VariableDistributionIcon';
import type { VariableValidationIconName } from './VariableValidationIcon';

export type VariablePillStatus = {
  key: string;
  label: string;
  icon: VariableValidationIconName;
  isDefault?: boolean;
};

export type VariablePillMetadata = {
  validations: VariablePillStatus[];
  validationSummary: string;
  synthetic: VariablePillSyntheticStatus;
  accessibleText: string;
};

export type VariablePillSyntheticStatus = Omit<VariablePillStatus, 'icon'> & {
  shape: VariableDistributionShape;
};

const unreachable = (_value: never): never => {
  throw new Error('Unhandled VariablePill metadata variant');
};

const VALIDATION_ORDER = [
  'required',
  'requiredAcceptsNull',
  'minLength',
  'maxLength',
  'minValue',
  'maxValue',
  'minSelected',
  'maxSelected',
  'unique',
  'differentFrom',
  'sameAs',
  'greaterThanVariable',
  'lessThanVariable',
  'greaterThanOrEqualToVariable',
  'lessThanOrEqualToVariable',
] as const satisfies readonly ValidationName[];

const isEnabledValidation = (value: Validation[ValidationName]) =>
  typeof value === 'boolean' ? value : value !== undefined;

const validationLabel = (
  name: ValidationName,
  value: Validation[ValidationName],
): string => {
  switch (name) {
    case 'required':
      return 'Required';
    case 'requiredAcceptsNull':
      return 'Required, accepting null';
    case 'minLength':
      return `Minimum length: ${String(value)}`;
    case 'maxLength':
      return `Maximum length: ${String(value)}`;
    case 'minValue':
      return `Minimum value: ${String(value)}`;
    case 'maxValue':
      return `Maximum value: ${String(value)}`;
    case 'minSelected':
      return `Minimum selections: ${String(value)}`;
    case 'maxSelected':
      return `Maximum selections: ${String(value)}`;
    case 'unique':
      return 'Unique value';
    case 'differentFrom':
      return 'Different from another variable';
    case 'sameAs':
      return 'Same as another variable';
    case 'greaterThanVariable':
      return 'Greater than another variable';
    case 'lessThanVariable':
      return 'Less than another variable';
    case 'greaterThanOrEqualToVariable':
      return 'Greater than or equal to another variable';
    case 'lessThanOrEqualToVariable':
      return 'Less than or equal to another variable';
  }

  return unreachable(name);
};

export const getActiveValidationStatuses = (
  variable: Variable,
): VariablePillStatus[] => {
  const validation: Validation | undefined =
    'validation' in variable ? variable.validation : undefined;

  if (!validation) return [];

  return VALIDATION_ORDER.flatMap((name) => {
    const value = validation[name];
    if (!isEnabledValidation(value)) return [];

    return [
      {
        key: name,
        label: validationLabel(name, value),
        icon: name,
      },
    ];
  });
};

const DISTRIBUTION_LABELS = {
  uniform: 'Uniform distribution',
  normal: 'Normal distribution',
  lognormal: 'Log-normal distribution',
  constant: 'Constant value',
  beta: 'Beta distribution',
} as const;

const TEXT_GENERATOR_LABELS = {
  neutralWords: 'Neutral words',
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
} as const;

const defaultSuffix = (isDefault: boolean) => (isDefault ? ' (default)' : '');

const equalWeights = (weights: readonly number[]) =>
  weights.length < 2 || weights.every((weight) => weight === weights[0]);

const formatProbability = (probability: number) =>
  new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(probability);

export const getSyntheticStatus = (
  variable: Variable,
): VariablePillSyntheticStatus => {
  const resolved = resolveVariableSynthetic(variable);
  const synthetic = 'synthetic' in variable ? variable.synthetic : undefined;

  switch (resolved.kind) {
    case 'number':
    case 'scalar': {
      const isDefault = !synthetic || !('distribution' in synthetic);
      const distribution = resolved.descriptor.distribution;
      return {
        key: `synthetic-${distribution}`,
        label: `${DISTRIBUTION_LABELS[distribution]}${defaultSuffix(isDefault)}`,
        shape: {
          kind: 'continuous',
          distribution,
          ...('mean' in resolved.descriptor
            ? { mean: resolved.descriptor.mean, sd: resolved.descriptor.sd }
            : {}),
        },
        isDefault,
      };
    }

    case 'datetime': {
      const isDefault = !synthetic || !('distribution' in synthetic);
      const distribution = resolved.descriptor.distribution;
      return {
        key: `synthetic-${distribution}`,
        label: `${DISTRIBUTION_LABELS[distribution]}${defaultSuffix(isDefault)}`,
        shape: {
          kind: 'continuous',
          distribution,
          ...('sdDays' in resolved.descriptor
            ? { sd: resolved.descriptor.sdDays }
            : {}),
        },
        isDefault,
      };
    }

    case 'boolean': {
      const isDefault =
        !synthetic ||
        !('probabilityTrue' in synthetic) ||
        synthetic.probabilityTrue === undefined;
      return {
        key: 'synthetic-boolean',
        label: `Bernoulli distribution (${formatProbability(resolved.probabilityTrue)} true)${defaultSuffix(isDefault)}`,
        shape: {
          kind: 'boolean',
          probabilityTrue: resolved.probabilityTrue,
        },
        isDefault,
      };
    }

    case 'ordinal': {
      const isDefault =
        !synthetic ||
        !('optionWeights' in synthetic) ||
        synthetic.optionWeights === undefined;
      const distribution = equalWeights(resolved.weights)
        ? 'Uniform option distribution'
        : 'Weighted option distribution';
      return {
        key: 'synthetic-options',
        label: `${distribution}${defaultSuffix(isDefault)}`,
        shape: { kind: 'options', weights: resolved.weights },
        isDefault,
      };
    }

    case 'categorical': {
      const optionWeightsConfigured =
        synthetic !== undefined &&
        'optionWeights' in synthetic &&
        synthetic.optionWeights !== undefined;
      const selectionCountsConfigured =
        synthetic !== undefined &&
        'selectionCount' in synthetic &&
        synthetic.selectionCount !== undefined;
      const isDefault = !optionWeightsConfigured && !selectionCountsConfigured;
      const distribution = equalWeights(resolved.weights)
        ? 'Uniform categorical distribution'
        : 'Weighted categorical distribution';
      const selectionCounts = selectionCountsConfigured
        ? ' with custom selection counts'
        : '';
      return {
        key: 'synthetic-options',
        label: `${distribution}${selectionCounts}${defaultSuffix(isDefault)}`,
        shape: { kind: 'options', weights: resolved.weights },
        isDefault,
      };
    }

    case 'text': {
      const isDefault =
        !synthetic ||
        !('generator' in synthetic) ||
        synthetic.generator === undefined;
      return {
        key: 'synthetic-text-generator',
        label: `${TEXT_GENERATOR_LABELS[resolved.generator]} generator${defaultSuffix(isDefault)}`,
        shape: { kind: 'text' },
        isDefault,
      };
    }

    case 'stageOwned':
      return {
        key: 'synthetic-stage-owned',
        label: 'Synthetic values are managed by interview stages',
        shape: { kind: 'stageOwned' },
      };
  }

  return unreachable(resolved);
};

export const getVariablePillMetadata = (
  variable: Variable,
): VariablePillMetadata => {
  const validations = getActiveValidationStatuses(variable);
  const validationSummary =
    validations.length === 0
      ? 'No validation rules'
      : `Validation: ${validations.map(({ label }) => label).join('; ')}`;
  const synthetic = getSyntheticStatus(variable);

  return {
    validations,
    validationSummary,
    synthetic,
    accessibleText: `${validationSummary}. Synthetic data: ${synthetic.label}.`,
  };
};
