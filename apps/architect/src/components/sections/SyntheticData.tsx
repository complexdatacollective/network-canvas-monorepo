import { type ComponentType, useMemo } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  DEFAULT_EDGE_TOPOLOGY,
  DEFAULT_NODE_COUNT,
  defaultTopologyForStage,
} from '@codaco/protocol-utilities';
import {
  requireCountReachableWithinBehaviours,
  StageEdgeSyntheticSchema,
  StageNodeAndEdgeSyntheticSchema,
  StageNodeSyntheticSchema,
} from '@codaco/protocol-validation';
import type {
  EdgeTopology,
  StageEdgeSynthetic,
  StageNodeAndEdgeSynthetic,
  StageNodeSynthetic,
  SyntheticCount,
} from '@codaco/protocol-validation';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';

/**
 * The optional "Synthetic data" section of a stage editor: how many people the
 * stage produces, how densely it links them, or both.
 *
 * It sits on the STAGE because a count belongs to the asking rather than the
 * asked-about — three name generators over one node type each nominate their
 * own people, and nothing in a protocol says how a single declared population
 * would divide between them.
 *
 * Off by default: no `synthetic` property is stored and runtime defaults
 * apply; enabling seeds the controls from the same defaults the generator
 * resolves. The interactive controls are plain controlled components with no
 * form-library dependency; the section below reads and writes the one
 * `synthetic` path through the stage form hooks.
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
  value: StageNodeSynthetic | undefined;
  onChange: (next: StageNodeSynthetic | undefined) => void;
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
        label="Set how many people this stage adds"
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
              min={count.distribution === 'poisson' ? 0 : undefined}
            />
          )}
          {count.distribution === 'normal' && (
            <NumberControl
              label="Standard deviation"
              value={count.sd}
              onChange={(next) => patch({ sd: next ?? 0 })}
              min={0}
            />
          )}
          {/*
            Truncation bounds belong to EVERY distribution whose schema takes
            them, poisson as much as normal. Rendered for one only, the other's
            bounds went on truncating generated previews while the author could
            neither see nor remove them — `patch` spreads the existing
            descriptor, so they survived each edit and vanished silently on a
            change of distribution.
          */}
          {(count.distribution === 'poisson' ||
            count.distribution === 'normal') && (
            <>
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

// Beta lives on 0-1 by construction, so it describes a density and nothing
// else: mean degree is a count and has no upper bound to sit inside.
const DENSITY_FAMILY_OPTIONS = [
  ...TOPOLOGY_FAMILY_OPTIONS,
  { label: 'Beta', value: 'beta' },
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
    case 'beta':
      // sd² < mean × (1 − mean) is what the schema requires of a beta, so the
      // seed has to satisfy it: 0.15² = 0.0225 against 0.4 × 0.6 = 0.24.
      return {
        metric: 'density',
        distribution: { distribution: 'beta', mean: 0.4, sd: 0.15 },
      };
    default:
      return DEFAULT_EDGE_TOPOLOGY;
  }
};

function EdgeSyntheticControl({
  value,
  onChange,
  interfaceType,
}: {
  value: StageEdgeSynthetic | undefined;
  onChange: (next: StageEdgeSynthetic | undefined) => void;
  interfaceType: string;
}) {
  const topology = value?.topology;
  const distribution = topology?.distribution;
  const isDensity = topology?.metric === 'density';
  const stageDefault = defaultTopologyForStage(interfaceType) as {
    metric: 'density';
    distribution: { distribution: 'uniform'; min?: number; max?: number };
  };
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
        label="Set how densely this stage links the people it can see"
        // The runtime default differs by interface, so the hint and the value
        // the toggle seeds both have to come from this stage's own.
        hint={`Off: generated samples use the runtime default for this stage (density between ${stageDefault.distribution.min ?? 0} and ${stageDefault.distribution.max ?? 1}).`}
        value={Boolean(value)}
        onChange={(enabled: unknown) =>
          onChange(enabled ? { topology: stageDefault } : undefined)
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
            options={
              isDensity ? DENSITY_FAMILY_OPTIONS : TOPOLOGY_FAMILY_OPTIONS
            }
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
          {distribution.distribution === 'beta' && (
            <>
              <NumberControl
                label="Mean"
                value={distribution.mean}
                onChange={(next) => patch({ mean: next ?? 0 })}
                min={0}
                max={1}
                step="0.01"
              />
              <NumberControl
                label="Standard deviation"
                value={distribution.sd}
                onChange={(next) => patch({ sd: next ?? 0 })}
                min={0}
                max={1}
                step="0.01"
              />
            </>
          )}
          {distribution.distribution === 'normal' && (
            <>
              <NumberControl
                label="Mean"
                value={distribution.mean}
                onChange={(next) => patch({ mean: next ?? 0 })}
                {...(isDensity ? { min: 0 } : {})}
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

/** Stage types that size a population, and those that link one. */
const COUNT_STAGES = new Set([
  'NameGenerator',
  'NameGeneratorQuickAdd',
  'NameGeneratorRoster',
  'NetworkComposer',
]);
const TOPOLOGY_STAGES = new Set([
  'Sociogram',
  'DyadCensus',
  'OneToManyDyadCensus',
  'TieStrengthCensus',
  'NetworkComposer',
]);

/**
 * The stage's own synthetic schema, run over the assembled block.
 *
 * The nested controls carry `min`, `max` and `step`, but `StageForm` submits
 * with `noValidate`, so nothing about a fractional count or a density above 1
 * would stop the author pressing Finished Editing — and `StageEditor` consults
 * full protocol validation only to disable Preview, saving regardless. So the
 * one field the block is registered under is where it has to be caught: the
 * value the form holds is exactly what the schema will judge on load, and
 * refusing it here is what keeps a stage from being written into a protocol
 * the schema rejects.
 *
 * Nothing to say about an absent block: the section is off, which the schema
 * allows, and `pruned` is what guarantees an emptied one is absent rather than
 * a shell.
 */
const validateSynthetic =
  (
    showCount: boolean,
    showTopology: boolean,
    behaviours?: { minNodes?: number; maxNodes?: number },
  ) =>
  (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined;
    const schema =
      showCount && showTopology
        ? StageNodeAndEdgeSyntheticSchema
        : showCount
          ? StageNodeSyntheticSchema
          : StageEdgeSyntheticSchema;
    const result = schema.safeParse(value);
    if (result.success) {
      const count = 'count' in result.data ? result.data.count : undefined;
      if (showCount && count) {
        const issues: { message: string }[] = [];
        requireCountReachableWithinBehaviours(
          {
            behaviours,
            synthetic: { count },
          },
          {
            addIssue: (issue: { message: string }) => {
              issues.push(issue);
            },
          } as unknown as Parameters<
            typeof requireCountReachableWithinBehaviours
          >[1],
        );
        if (issues[0]) return issues[0].message;
      }
      return undefined;
    }
    // The first issue, with the path it belongs to, since one field stands for
    // the whole block and the author cannot otherwise tell which control the
    // complaint is about.
    const issue = result.error.issues[0];
    if (issue === undefined) return 'This synthetic data block is not valid';
    const where = issue.path.join(' ');
    return where.length > 0 ? `${where}: ${issue.message}` : issue.message;
  };

/**
 * A block declaring nothing says exactly what no block says, and the schema
 * rejects it — so an emptied section removes the property outright rather than
 * storing a shell the author cannot see.
 */
const pruned = (
  next: StageNodeAndEdgeSynthetic,
): StageNodeAndEdgeSynthetic | undefined => {
  const kept: StageNodeAndEdgeSynthetic = {
    ...(next.count ? { count: next.count } : {}),
    ...(next.topology ? { topology: next.topology } : {}),
  };
  return (kept.count ?? kept.topology) ? kept : undefined;
};

/**
 * The whole `synthetic` block as ONE registered field.
 *
 * It has to be registered rather than written through `useSetStageValue`:
 * `getFormValues()` includes registered fields only, so a bare `setFieldValue`
 * on an unregistered path parks the value in the store's dormant map. The
 * controls would appear to update while finishing the edit dropped every
 * change — and, because the stage update is overwrite-style, merely saving an
 * imported stage would delete metadata it already carried.
 *
 * One opaque field rather than a field per parameter, for the reason the array
 * editors take the same shape: the schema validates the block as a whole, and
 * a half-written descriptor is not a state the protocol can hold.
 */
export const SyntheticField = ({
  value,
  onChange,
  showCount,
  showTopology,
  interfaceType,
}: {
  value?: StageNodeAndEdgeSynthetic;
  onChange?: (next: StageNodeAndEdgeSynthetic | null) => void;
  showCount: boolean;
  showTopology: boolean;
  interfaceType: string;
}) => {
  // `null` rather than `undefined` for a section switched off, so the form
  // records a WRITE rather than an absence. `prune` drops the key on its way
  // into the protocol, which is what keeps "on but empty" — a shape the schema
  // rejects — from ever being stored.
  const emit = (next: StageNodeAndEdgeSynthetic) =>
    onChange?.(pruned(next) ?? null);

  return (
    <>
      {showCount && (
        <NodeSyntheticControl
          value={value?.count ? { count: value.count } : undefined}
          onChange={(node) => emit({ ...value, count: node?.count })}
        />
      )}
      {showTopology && (
        <EdgeSyntheticControl
          value={value?.topology ? { topology: value.topology } : undefined}
          onChange={(edge) => emit({ ...value, topology: edge?.topology })}
          interfaceType={interfaceType}
        />
      )}
    </>
  );
};

export default function SyntheticData({
  interfaceType,
}: StageEditorSectionProps) {
  const showCount = COUNT_STAGES.has(interfaceType);
  const showTopology = TOPOLOGY_STAGES.has(interfaceType);
  // Read from the two LEAF paths rather than the `behaviours` container: no
  // field named `behaviours` is ever registered — `MinMaxAlterLimits` registers
  // `behaviours.minNodes` and `behaviours.maxNodes` — so a container read
  // cannot be resolved from field state, and once that section is toggled off
  // its cleared leaves leave `getFormValues()` entirely. The container read
  // would then fall through to the COMMITTED stage and validate the count
  // against a window the author has just cleared, refusing an edit that is
  // valid. The leaves resolve from their own dormant field state, which
  // records the clearing.
  const minNodes = useStageFormValue<number | null | undefined>(
    'behaviours.minNodes',
  );
  const maxNodes = useStageFormValue<number | null | undefined>(
    'behaviours.maxNodes',
  );
  // Memoised so the field is not handed a new validator identity every render.
  // `null` is folded into absence because the rule skips only a strictly
  // `undefined` limit — the min/max fields' own validators guard against a
  // `null` sitting in either path, and a `null` maximum reaching the rule
  // would compare as a cap of zero and refuse every count there is.
  const validation = useMemo(
    () => ({
      synthetic: validateSynthetic(showCount, showTopology, {
        minNodes: minNodes ?? undefined,
        maxNodes: maxNodes ?? undefined,
      }),
    }),
    [minNodes, maxNodes, showCount, showTopology],
  );
  const initialValue = useStageInitialValue('synthetic') as
    | StageNodeAndEdgeSynthetic
    | undefined;

  // A FamilyPedigree reaches neither set on purpose: a family is a structure
  // rather than a population, so it keeps its own generation logic and nothing
  // in a protocol sizes it.
  if (!showCount && !showTopology) return null;

  return (
    <Section
      title="Synthetic data"
      layout="vertical"
      summary={
        <Paragraph>
          Describe what this stage should produce in generated preview and
          sample data. This never affects real interviews.
        </Paragraph>
      }
    >
      <ArchitectField
        name="synthetic"
        label="Synthetic data"
        labelHidden
        component={SyntheticField}
        initialValue={initialValue}
        showCount={showCount}
        showTopology={showTopology}
        interfaceType={interfaceType}
        validation={validation}
      />
    </Section>
  );
}
