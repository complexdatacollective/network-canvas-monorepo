import type { ComponentType } from 'react';
import { Field, type WrappedFieldProps } from 'redux-form';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  DEFAULT_EDGE_TOPOLOGY,
  DEFAULT_NODE_COUNT,
} from '@codaco/protocol-utilities';
import type {
  EdgeSynthetic,
  EdgeTopology,
  NodeSynthetic,
  SyntheticCount,
} from '@codaco/protocol-validation';
import { Section } from '~/components/EditorLayout';

/**
 * The optional population (node) / topology (edge) sections of the entity
 * type editor. Off by default: no `synthetic` property is stored and runtime
 * defaults apply; enabling seeds the controls from the same defaults the
 * generator resolves. The interactive controls are plain controlled
 * components with no form-library dependency — the redux-form `Field` at the
 * bottom of this file is a thin, disposable adapter for the entity dialog's
 * remaining redux-form lifetime.
 */

// Raw field components render only the control; UnconnectedField adds the
// label/hint chrome without any form store. Loosely typed because these are
// controlled adapters, not form-connected fields.
const LooseField = UnconnectedField as ComponentType<Record<string, unknown>>;
const FrescoToggle = ToggleField as ComponentType<Record<string, unknown>>;
const FrescoSelect = NativeSelectField as ComponentType<
  Record<string, unknown>
>;
const FrescoInput = InputField as ComponentType<Record<string, unknown>>;

const toNumber = (raw: unknown): number | undefined => {
  if (raw === '' || raw === null || raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function NumberControl({
  label,
  value,
  onChange,
  min,
  max,
  step = 'any',
}: {
  label: string;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <LooseField
      component={FrescoInput}
      label={label}
      type="number"
      step={step}
      {...(min !== undefined ? { min } : {})}
      {...(max !== undefined ? { max } : {})}
      value={value === undefined ? '' : String(value)}
      onChange={(next: unknown) => onChange(toNumber(next))}
    />
  );
}

// --- Node population -------------------------------------------------------

const COUNT_FAMILY_OPTIONS = [
  { label: 'Uniform', value: 'uniform' },
  { label: 'Normal', value: 'normal' },
  { label: 'Poisson', value: 'poisson' },
  { label: 'Constant', value: 'constant' },
];

/** A complete, sensible starting count when the family changes. */
const seedCount = (family: string): SyntheticCount => {
  switch (family) {
    case 'constant':
      return { distribution: 'constant', value: 8 };
    case 'poisson':
      return { distribution: 'poisson', mean: 5 };
    case 'normal':
      return { distribution: 'normal', mean: 8, sd: 3 };
    default:
      return DEFAULT_NODE_COUNT;
  }
};

function NodeSyntheticControl({
  value,
  onChange,
}: {
  value: NodeSynthetic | undefined;
  onChange: (next: NodeSynthetic | undefined) => void;
}) {
  const count = value?.count;
  const patch = (next: Partial<SyntheticCount>) => {
    if (!count) return;
    onChange({ count: { ...count, ...next } as SyntheticCount });
  };

  return (
    <>
      <LooseField
        component={FrescoToggle}
        label="Configure the population for this node type"
        hint="Off: generated samples use the runtime default (uniform between 1 and 8)."
        value={Boolean(value)}
        onChange={(enabled: unknown) =>
          onChange(enabled ? { count: DEFAULT_NODE_COUNT } : undefined)
        }
      />
      {count && (
        <>
          <LooseField
            component={FrescoSelect}
            label="Count distribution"
            options={COUNT_FAMILY_OPTIONS}
            value={count.distribution}
            onChange={(family: unknown) =>
              onChange({ count: seedCount(String(family)) })
            }
          />
          {count.distribution === 'constant' && (
            <NumberControl
              label="Count"
              value={count.value}
              onChange={(next) => patch({ value: next ?? 0 })}
              min={0}
              step="1"
            />
          )}
          {count.distribution === 'uniform' && (
            <>
              <NumberControl
                label="Minimum"
                value={count.min}
                onChange={(next) => patch({ min: next ?? 0 })}
                min={0}
                step="1"
              />
              <NumberControl
                label="Maximum"
                value={count.max}
                onChange={(next) => patch({ max: next ?? 0 })}
                min={0}
                step="1"
              />
            </>
          )}
          {(count.distribution === 'poisson' ||
            count.distribution === 'normal') && (
            <NumberControl
              label="Mean"
              value={count.mean}
              onChange={(next) => patch({ mean: next ?? 0 })}
              min={0}
            />
          )}
          {count.distribution === 'normal' && (
            <>
              <NumberControl
                label="Standard deviation"
                value={count.sd}
                onChange={(next) => patch({ sd: next ?? 0 })}
                min={0}
              />
              <NumberControl
                label="Minimum"
                value={count.min}
                onChange={(next) => patch({ min: next })}
                min={0}
                step="1"
              />
              <NumberControl
                label="Maximum"
                value={count.max}
                onChange={(next) => patch({ max: next })}
                min={0}
                step="1"
              />
            </>
          )}
        </>
      )}
    </>
  );
}

// --- Edge topology ---------------------------------------------------------

const METRIC_OPTIONS = [
  { label: 'Density (share of possible pairs)', value: 'density' },
  { label: 'Mean degree (average links per node)', value: 'meanDegree' },
];

const TOPOLOGY_FAMILY_OPTIONS = [
  { label: 'Uniform', value: 'uniform' },
  { label: 'Normal', value: 'normal' },
  { label: 'Constant', value: 'constant' },
];

const seedTopology = (metric: string, family: string): EdgeTopology => {
  if (metric === 'meanDegree') {
    switch (family) {
      case 'constant':
        return {
          metric: 'meanDegree',
          distribution: { distribution: 'constant', value: 2 },
        };
      case 'normal':
        return {
          metric: 'meanDegree',
          distribution: { distribution: 'normal', mean: 3, sd: 1, min: 0 },
        };
      default:
        return {
          metric: 'meanDegree',
          distribution: { distribution: 'uniform', min: 1, max: 4 },
        };
    }
  }
  switch (family) {
    case 'constant':
      return {
        metric: 'density',
        distribution: { distribution: 'constant', value: 0.4 },
      };
    case 'normal':
      return {
        metric: 'density',
        distribution: { distribution: 'normal', mean: 0.4, sd: 0.1 },
      };
    default:
      return DEFAULT_EDGE_TOPOLOGY;
  }
};

function EdgeSyntheticControl({
  value,
  onChange,
}: {
  value: EdgeSynthetic | undefined;
  onChange: (next: EdgeSynthetic | undefined) => void;
}) {
  const topology = value?.topology;
  const distribution = topology?.distribution;
  const isDensity = topology?.metric === 'density';
  const patch = (next: Record<string, number | undefined>) => {
    if (!topology) return;
    onChange({
      topology: {
        ...topology,
        distribution: { ...topology.distribution, ...next },
      } as EdgeTopology,
    });
  };

  return (
    <>
      <LooseField
        component={FrescoToggle}
        label="Configure the topology for this edge type"
        hint="Off: generated samples use the runtime default (density between 0.3 and 0.5)."
        value={Boolean(value)}
        onChange={(enabled: unknown) =>
          onChange(enabled ? { topology: DEFAULT_EDGE_TOPOLOGY } : undefined)
        }
      />
      {topology && distribution && (
        <>
          <LooseField
            component={FrescoSelect}
            label="Metric"
            options={METRIC_OPTIONS}
            value={topology.metric}
            onChange={(metric: unknown) =>
              onChange({
                topology: seedTopology(
                  String(metric),
                  distribution.distribution,
                ),
              })
            }
          />
          <LooseField
            component={FrescoSelect}
            label="Distribution"
            options={TOPOLOGY_FAMILY_OPTIONS}
            value={distribution.distribution}
            onChange={(family: unknown) =>
              onChange({
                topology: seedTopology(topology.metric, String(family)),
              })
            }
          />
          {distribution.distribution === 'constant' && (
            <NumberControl
              label={isDensity ? 'Density' : 'Mean degree'}
              value={distribution.value}
              onChange={(next) => patch({ value: next ?? 0 })}
              min={0}
              {...(isDensity ? { max: 1, step: '0.01' } : {})}
            />
          )}
          {distribution.distribution === 'uniform' && (
            <>
              <NumberControl
                label="Minimum"
                value={distribution.min}
                onChange={(next) => patch({ min: next })}
                min={0}
                {...(isDensity ? { max: 1, step: '0.01' } : {})}
              />
              <NumberControl
                label="Maximum"
                value={distribution.max}
                onChange={(next) => patch({ max: next })}
                min={0}
                {...(isDensity ? { max: 1, step: '0.01' } : {})}
              />
            </>
          )}
          {distribution.distribution === 'normal' && (
            <>
              <NumberControl
                label="Mean"
                value={distribution.mean}
                onChange={(next) => patch({ mean: next ?? 0 })}
                min={0}
                {...(isDensity ? { max: 1, step: '0.01' } : {})}
              />
              <NumberControl
                label="Standard deviation"
                value={distribution.sd}
                onChange={(next) => patch({ sd: next ?? 0 })}
                min={0}
              />
              {/*
                A truncated normal's bounds are optional in the schema but they
                are not optional to the DRAW: unrendered, they went on
                constraining every generated preview while the author could
                neither see nor remove them — and `patch` spreads the existing
                distribution, so they survived every other edit and vanished
                only on a distribution change, silently.
              */}
              <NumberControl
                label="Minimum"
                value={distribution.min}
                onChange={(next) => patch({ min: next })}
                min={0}
                {...(isDensity ? { max: 1, step: '0.01' } : {})}
              />
              <NumberControl
                label="Maximum"
                value={distribution.max}
                onChange={(next) => patch({ max: next })}
                min={0}
                {...(isDensity ? { max: 1, step: '0.01' } : {})}
              />
            </>
          )}
        </>
      )}
    </>
  );
}

// --- Redux-form adapter (disposable) ---------------------------------------

function NodeSyntheticReduxAdapter({ input }: WrappedFieldProps) {
  return (
    <NodeSyntheticControl
      value={(input.value || undefined) as NodeSynthetic | undefined}
      onChange={(next) => input.onChange(next ?? null)}
    />
  );
}

function EdgeSyntheticReduxAdapter({ input }: WrappedFieldProps) {
  return (
    <EdgeSyntheticControl
      value={(input.value || undefined) as EdgeSynthetic | undefined}
      onChange={(next) => input.onChange(next ?? null)}
    />
  );
}

export default function SyntheticTypeSection({ entity }: { entity: string }) {
  if (entity !== 'node' && entity !== 'edge') return null;
  return (
    <Section
      title={entity === 'node' ? 'Population' : 'Topology'}
      layout="vertical"
      summary={
        <Paragraph>
          {entity === 'node'
            ? 'Describe how many of this node type generated preview and sample data should contain. This never affects real interviews.'
            : 'Describe how connected this edge type should be in generated preview and sample data. This never affects real interviews.'}
        </Paragraph>
      }
    >
      <Field
        name="synthetic"
        component={
          entity === 'node'
            ? NodeSyntheticReduxAdapter
            : EdgeSyntheticReduxAdapter
        }
      />
    </Section>
  );
}
