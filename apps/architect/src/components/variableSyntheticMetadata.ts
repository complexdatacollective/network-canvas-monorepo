import { resolveVariableSynthetic } from '@codaco/protocol-utilities';
import type { Variable } from '@codaco/protocol-validation';

import type { VariableDistributionShape } from './VariableDistributionIcon';

export type VariableSyntheticStatus = {
  details: { label: string; value: string }[];
  label: string;
  shape: VariableDistributionShape;
  isDefault?: boolean;
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
const formatNumber = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
const missingDetail = (missingProbability: number) => ({
  label: 'Missing probability',
  value: formatProbability(missingProbability),
});

export const getVariableSyntheticStatus = (
  variable: Variable,
): VariableSyntheticStatus => {
  const resolved = resolveVariableSynthetic(variable);
  const synthetic = 'synthetic' in variable ? variable.synthetic : undefined;

  switch (resolved.kind) {
    case 'number':
    case 'scalar': {
      const isDefault = !synthetic || !('distribution' in synthetic);
      const distribution = resolved.descriptor.distribution;
      const details: VariableSyntheticStatus['details'] = [];
      if ('value' in resolved.descriptor) {
        details.push({
          label: 'Value',
          value: formatNumber(resolved.descriptor.value),
        });
      }
      if ('mean' in resolved.descriptor) {
        details.push(
          { label: 'Mean', value: formatNumber(resolved.descriptor.mean) },
          {
            label: 'Standard deviation',
            value: formatNumber(resolved.descriptor.sd),
          },
        );
      }
      if (
        'min' in resolved.descriptor &&
        resolved.descriptor.min !== undefined
      ) {
        details.push({
          label: 'Minimum',
          value: formatNumber(resolved.descriptor.min),
        });
      }
      if (
        'max' in resolved.descriptor &&
        resolved.descriptor.max !== undefined
      ) {
        details.push({
          label: 'Maximum',
          value: formatNumber(resolved.descriptor.max),
        });
      }
      details.push(missingDetail(resolved.missingProbability));
      return {
        details,
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
      const details: VariableSyntheticStatus['details'] = [];
      if ('mean' in resolved.descriptor) {
        details.push(
          { label: 'Mean date', value: resolved.descriptor.mean },
          {
            label: 'Standard deviation',
            value: `${formatNumber(resolved.descriptor.sdDays)} days`,
          },
        );
      }
      if (resolved.descriptor.min !== undefined) {
        details.push({
          label: 'Earliest date',
          value: resolved.descriptor.min,
        });
      }
      if (resolved.descriptor.max !== undefined) {
        details.push({ label: 'Latest date', value: resolved.descriptor.max });
      }
      details.push(missingDetail(resolved.missingProbability));
      return {
        details,
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
        details: [
          {
            label: 'Probability of true',
            value: formatProbability(resolved.probabilityTrue),
          },
          {
            label: 'Probability of false',
            value: formatProbability(1 - resolved.probabilityTrue),
          },
          missingDetail(resolved.missingProbability),
        ],
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
      return {
        details: [
          {
            label: 'Option weights',
            value: resolved.weights.map(formatNumber).join(', '),
          },
          missingDetail(resolved.missingProbability),
        ],
        label: `${equalWeights(resolved.weights) ? 'Uniform' : 'Weighted'} option distribution${defaultSuffix(isDefault)}`,
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
      return {
        details: [
          {
            label: 'Option weights',
            value: resolved.weights.map(formatNumber).join(', '),
          },
          {
            label: 'Selection count',
            value: resolved.selectionCounts
              .map(
                ({ count, probability }) =>
                  `${count}: ${formatProbability(probability)}`,
              )
              .join(', '),
          },
          missingDetail(resolved.missingProbability),
        ],
        label: `${equalWeights(resolved.weights) ? 'Uniform' : 'Weighted'} categorical distribution${selectionCountsConfigured ? ' with custom selection counts' : ''}${defaultSuffix(isDefault)}`,
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
        details: [missingDetail(resolved.missingProbability)],
        label: `${TEXT_GENERATOR_LABELS[resolved.generator]} generator${defaultSuffix(isDefault)}`,
        shape: { kind: 'text' },
        isDefault,
      };
    }
    case 'stageOwned':
      return {
        details: [],
        label: 'Synthetic values are managed by interview stages',
        shape: { kind: 'stageOwned' },
      };
  }
};
