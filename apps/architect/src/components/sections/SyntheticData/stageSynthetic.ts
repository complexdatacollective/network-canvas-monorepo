import {
  DEFAULT_EDGE_TOPOLOGY,
  DEFAULT_RESPONSE_BURDEN,
  defaultNodeCount,
  type EdgeTopology,
  EdgeTopologySchema,
  type Stage,
  stageNodeSynthetic,
  stageSchema,
  type SyntheticCount,
  topologyDrawWindow,
  withResolvedSyntheticCount,
} from '@codaco/protocol-validation';
import type { SyntheticWindow } from '~/components/Synthetic/summaries';

/**
 * Everything the stage editor's "Synthetic data" section needs to know about a
 * stage's generation parameters, asked of the SCHEMA rather than restated here
 * (spec governing rule 1).
 *
 * Two questions the section has to answer for a stage it has never seen:
 *
 *  - *which* parameters this stage type admits — the factory table in the spec
 *    (`stageNodeSynthetic`, `stageEdgeSynthetic`, `stageNodeAndEdgeSynthetic`,
 *    `stageValuesSynthetic`, `stageNoDataSynthetic`) is a property of
 *    `schemas/8/stages/*`, not of this app, so it is derived by ASKING the
 *    schema instead of copying the table (see {@link stageSyntheticSupport});
 *  - what the *effective* values are, so a collapsed summary can never disagree
 *    with what generation would do (see {@link resolveStageSynthetic}).
 *
 * Both go through one primitive: parse the draft stage and look at the issues
 * raised inside its `synthetic` descriptor. Every descriptor is a
 * `z.strictObject`, so a key the stage type does not admit comes back as an
 * `unrecognized_keys` issue naming it — a precise, schema-owned answer that
 * survives a stage whose OTHER fields are still mid-edit (an object parse
 * collects issues across keys, so a half-written form does not hide it).
 */

/** A stage as the editor holds it: form values plus the stage's identity. */
export type StageDraft = Record<string, unknown>;

/** One refusal the schema raised inside a stage's `synthetic` descriptor. */
export type SyntheticIssue = {
  /** Path relative to `synthetic`, e.g. `['count', 'mean']`. */
  path: string[];
  /** The schema's own wording, never paraphrased. */
  message: string;
  /** Keys the descriptor refuses outright (an `unrecognized_keys` issue). */
  unrecognisedKeys: string[];
};

/** Which parameters this stage type's descriptor admits. */
export type StageSyntheticSupport = {
  supportsCount: boolean;
  supportsTopology: boolean;
  /** False for a stage whose descriptor declares `generatesData: false`. */
  generatesData: boolean;
};

/** The effective parameters, as the schema resolves them for this draft. */
export type ResolvedStageSynthetic = {
  generatesData: boolean;
  /**
   * `undefined` only for a draft whose `type` is not a stage type the schema
   * knows — an impossible state in the editor, where the type comes from the
   * interface registry, and never a number invented to fill the gap.
   */
  responseBurden: number | undefined;
  count: SyntheticCount | undefined;
  topology: EdgeTopology | undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The authored block, or an empty one — never a fabricated default. */
const authoredSyntheticBlock = (draft: StageDraft): Record<string, unknown> =>
  isRecord(draft.synthetic) ? draft.synthetic : {};

/**
 * Whether the stage carries authored generation parameters (spec rule 4:
 * authored = key present, default = key absent). An empty object is not
 * authoring: the reset affordance removes the key, and both `prune`
 * boundaries strip an empty one anyway.
 */
export const isSyntheticAuthored = (draft: StageDraft): boolean =>
  Object.keys(authoredSyntheticBlock(draft)).length > 0;

/** Drop the keys whose value is `undefined`, so absence stays absence. */
const withoutUndefined = (
  block: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(block).filter(([, value]) => value !== undefined),
  );

/**
 * The issues the schema raises inside this draft's `synthetic` descriptor.
 *
 * Scoped to `synthetic` deliberately: a stage under edit is routinely invalid
 * elsewhere (a form with no title, a prompt list still empty), and none of
 * that says anything about its generation parameters.
 */
export const syntheticIssues = (draft: StageDraft): SyntheticIssue[] => {
  const result = stageSchema.safeParse(draft);
  if (result.success) return [];

  return result.error.issues
    .filter((issue) => issue.path[0] === 'synthetic')
    .map((issue) => ({
      path: issue.path.slice(1).map((segment) => String(segment)),
      message: issue.message,
      unrecognisedKeys:
        issue.code === 'unrecognized_keys' && 'keys' in issue
          ? [...issue.keys]
          : [],
    }));
};

/** The same question, asked of a candidate block rather than the draft's own. */
const issuesForBlock = (
  draft: StageDraft,
  block: Record<string, unknown>,
): SyntheticIssue[] => syntheticIssues({ ...draft, synthetic: block });

/**
 * A probe value for each key, chosen to be valid wherever the key is admitted
 * at all, so a refusal can only ever be "this descriptor has no such key".
 * The count is the schema's smallest admissible population and the topology is
 * the schema's own default, so neither introduces a number of its own.
 */
const PROBE_COUNT: SyntheticCount = { distribution: 'constant', value: 0 };
const PROBE_TOPOLOGY: EdgeTopology = DEFAULT_EDGE_TOPOLOGY;

const recognisesKey = (
  draft: StageDraft,
  key: string,
  value: unknown,
): boolean =>
  !issuesForBlock(draft, {
    ...authoredSyntheticBlock(draft),
    [key]: value,
  }).some((issue) => issue.unrecognisedKeys.includes(key));

/**
 * Which parameters this stage's descriptor admits, and whether it generates
 * anything at all — read off the schema's refusals rather than a table.
 *
 * `generatesData` is asked differently from the other two because the schema
 * says it differently: a non-generating stage still HAS the key, pinned to the
 * literal `false`, so the signal is a value refusal at that key rather than an
 * unrecognised one.
 */
export const stageSyntheticSupport = (
  draft: StageDraft,
): StageSyntheticSupport => ({
  supportsCount: recognisesKey(draft, 'count', PROBE_COUNT),
  supportsTopology: recognisesKey(draft, 'topology', PROBE_TOPOLOGY),
  generatesData: !issuesForBlock(draft, {
    ...authoredSyntheticBlock(draft),
    generatesData: true,
  }).some((issue) => issue.path[0] === 'generatesData'),
});

/**
 * Whether this stage's edges come from a prompt that creates them.
 *
 * A topology says how densely a stage links people, which decides nothing on a
 * stage that creates no edges — a Sociogram whose prompts only DISPLAY them,
 * or a NetworkComposer with no drawable edge types (spec, "Sociogram
 * nuance"). The two shapes are the schema's own: prompt-driven stages name the
 * edge type on the prompt (`createEdge`, or `edges.create` on a Sociogram),
 * and the composer lists its drawable types on the stage.
 *
 * A stage with neither shape is not prompt-gated at all, and says so.
 */
export const stageCreatesEdges = (draft: StageDraft): boolean => {
  if (Array.isArray(draft.prompts)) {
    return draft.prompts.some((prompt) => {
      if (!isRecord(prompt)) return false;
      if (typeof prompt.createEdge === 'string') return true;
      return isRecord(prompt.edges) && typeof prompt.edges.create === 'string';
    });
  }

  if (Array.isArray(draft.edges)) return draft.edges.length > 0;

  return true;
};

const burdenFor = (draft: StageDraft): number | undefined => {
  const type = draft.type;
  if (typeof type !== 'string') return undefined;
  return Object.hasOwn(DEFAULT_RESPONSE_BURDEN, type)
    ? DEFAULT_RESPONSE_BURDEN[type as keyof typeof DEFAULT_RESPONSE_BURDEN]
    : undefined;
};

type BehavioursWindow = { minNodes?: number; maxNodes?: number } | undefined;

const behavioursOf = (draft: StageDraft): BehavioursWindow => {
  const behaviours = isRecord(draft.behaviours) ? draft.behaviours : undefined;
  if (!behaviours) return undefined;
  return {
    ...(typeof behaviours.minNodes === 'number'
      ? { minNodes: behaviours.minNodes }
      : {}),
    ...(typeof behaviours.maxNodes === 'number'
      ? { maxNodes: behaviours.maxNodes }
      : {}),
  };
};

/**
 * The counts this stage can be given, as an inclusive window.
 *
 * Taken from the schema's OWN resolution of an unstated count
 * (`defaultNodeCount`), whose bounds are exactly the floors and ceilings the
 * spec names: `behaviours.minNodes`, `behaviours.maxNodes`, and
 * `MAX_SYNTHETIC_POPULATION`. Reading them off that function is what keeps
 * this window and the one the schema enforces the same window.
 */
export const stageCountWindow = (draft: StageDraft): SyntheticWindow => {
  const resolved = defaultNodeCount(behavioursOf(draft));
  return {
    min: 'min' in resolved && resolved.min !== undefined ? resolved.min : 0,
    max: 'max' in resolved && resolved.max !== undefined ? resolved.max : 0,
  };
};

/**
 * The values a topology metric is defined over, before any declaration narrows
 * them — 0–1 for a density, `>= 0` (open above) for a mean degree.
 *
 * Obtained by asking `topologyDrawWindow` about a declaration that states no
 * bounds of its own, which is precisely its definition of the metric's domain.
 */
export const topologyMetricWindow = (
  metric: EdgeTopology['metric'],
): SyntheticWindow =>
  topologyDrawWindow(
    metric === 'density'
      ? {
          metric: 'density',
          distribution: { distribution: 'constant', value: 0 },
        }
      : {
          metric: 'meanDegree',
          distribution: { distribution: 'constant', value: 0 },
        },
  );

/** A value the schema admits as an edge topology, or `undefined`. */
export const asTopology = (value: unknown): EdgeTopology | undefined => {
  const parsed = EdgeTopologySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

/**
 * A value the schema admits as a stage count, or `undefined`.
 *
 * Validated through a node-creating stage's own descriptor, which is where the
 * count union lives; the stage type it is built for reaches only the burden
 * default, which is discarded here.
 */
const COUNT_RESOLUTION_TYPE = 'NameGenerator' as const;

const countCarrier = stageNodeSynthetic(COUNT_RESOLUTION_TYPE);

export const asCount = (value: unknown): SyntheticCount | undefined => {
  const parsed = countCarrier.safeParse({ count: value });
  return parsed.success ? parsed.data.count : undefined;
};

/**
 * The effective parameters for this draft: what generation would read.
 *
 * The parse is the authority — its prefaults, field defaults and transforms
 * ARE the resolution — so a summary built from it can never disagree with a
 * run (spec, component notes). A stage under edit does not always parse,
 * though, and a summary must not blank out while a researcher is halfway
 * through a prompt; so the fallback resolves the same three values through the
 * schema's own exported resolvers (`withResolvedSyntheticCount`,
 * `DEFAULT_EDGE_TOPOLOGY`, `DEFAULT_RESPONSE_BURDEN`) rather than through
 * numbers of its own.
 */
export const resolveStageSynthetic = (
  draft: StageDraft,
): ResolvedStageSynthetic => {
  const parsed = stageSchema.safeParse(draft);

  if (parsed.success) {
    const synthetic = (parsed.data as Stage).synthetic;
    return {
      generatesData: synthetic.generatesData,
      responseBurden: synthetic.responseBurden,
      count: 'count' in synthetic ? synthetic.count : undefined,
      topology: 'topology' in synthetic ? synthetic.topology : undefined,
    };
  }

  const authored = authoredSyntheticBlock(draft);
  const support = stageSyntheticSupport(draft);
  const responseBurden =
    typeof authored.responseBurden === 'number'
      ? authored.responseBurden
      : burdenFor(draft);

  const authoredCount = asCount(authored.count);
  const behaviours = behavioursOf(draft);
  const count = support.supportsCount
    ? authoredCount === undefined
      ? defaultNodeCount(behaviours)
      : withResolvedSyntheticCount({
          // Any burdened stage type does: the resolver reads it only for the
          // burden it carries through, and that half is discarded here. What
          // is read is the count half, which depends on the behaviours window
          // and the declaration alone.
          type: COUNT_RESOLUTION_TYPE,
          ...(behaviours === undefined ? {} : { behaviours }),
          synthetic: { count: authoredCount, responseBurden: 0 },
        }).synthetic.count
    : undefined;

  return {
    generatesData: support.generatesData,
    responseBurden,
    count,
    topology: support.supportsTopology
      ? (asTopology(authored.topology) ?? DEFAULT_EDGE_TOPOLOGY)
      : undefined,
  };
};

/**
 * One parameter change the section makes to a stage's descriptor.
 *
 * `count` and `topology` are `unknown` on purpose: the editors build candidate
 * declarations and the SCHEMA decides which of them is admissible (see
 * {@link syntheticBlockForChange}). Typing them here would put that decision
 * in the editor, which is the one place the spec forbids it.
 */
export type SyntheticChange = {
  responseBurden?: number;
  count?: unknown;
  topology?: unknown;
};

export type SyntheticWriteResult = {
  /** The block to write, or `undefined` to remove the key entirely. */
  block: Record<string, unknown> | undefined;
  /** Empty when the schema accepts the block; the refusals otherwise. */
  issues: SyntheticIssue[];
};

/**
 * The block to write for one parameter change — minimal where the schema
 * allows it, complete where the schema demands it.
 *
 * "Authored = key present" (spec rule 4) is about the `synthetic` key, not
 * about writing every parameter: an author who only raises a Sociogram's
 * burden should not silently acquire a topology declaration. But some
 * descriptors REQUIRE a companion — a node-creating stage's block must carry a
 * `count`, a non-generating stage's must carry `generatesData: false`, a
 * composer's must declare a count or a topology — and a block missing one is a
 * block the schema refuses.
 *
 * Which is which is not restated here. The minimal block is offered to the
 * schema first; only if the schema refuses it does the complete block — the
 * RESOLVED parameters, with the change applied over them — get built. So a
 * descriptor that gains a required companion later needs no change here.
 */
export const syntheticBlockForChange = (
  draft: StageDraft,
  change: SyntheticChange,
): SyntheticWriteResult => {
  const minimal = withoutUndefined({
    ...authoredSyntheticBlock(draft),
    ...change,
  });
  const minimalIssues = issuesForBlock(draft, minimal);
  if (minimalIssues.length === 0) return { block: minimal, issues: [] };

  const resolved = resolveStageSynthetic(draft);
  const support = stageSyntheticSupport(draft);
  const complete = withoutUndefined({
    // Written only where the schema pins it to `false`; everywhere else the
    // descriptor defaults it, and stating it would be noise in the protocol.
    generatesData: resolved.generatesData ? undefined : false,
    responseBurden: resolved.responseBurden,
    count: support.supportsCount ? resolved.count : undefined,
    topology: support.supportsTopology ? resolved.topology : undefined,
    ...change,
  });

  return { block: complete, issues: issuesForBlock(draft, complete) };
};
