import { useCallback, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import Surface from '@codaco/fresco-ui/layout/Surface';
import type { EdgeTopology, Stage } from '@codaco/protocol-validation';
import { HiddenFieldValue } from '~/components/sections/Form/withFieldsHandlers';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageFormContext } from '~/components/StageEditor/stageFormContext';
import {
  useSetStageValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import { useStageFormValues } from '~/components/StageEditor/useStageFormValues';
import { conflictsForStage } from '~/components/Synthetic/conflicts';
import {
  formatEdgeTopology,
  formatResponseBurden,
  formatSyntheticCount,
  type SyntheticDistribution,
} from '~/components/Synthetic/summaries';
import { SyntheticFeasibilityAnnouncer } from '~/components/Synthetic/SyntheticFeasibilityAnnouncer';
import { SyntheticNumberField } from '~/components/Synthetic/SyntheticNumberField';
import { SyntheticSection } from '~/components/Synthetic/SyntheticSection';
import { numericWindowOf } from '~/components/Synthetic/useNumericDraft';
import { useSyntheticFeasibility } from '~/hooks/useSyntheticFeasibility';
import { getProtocol } from '~/selectors/protocol';
import { getActiveProtocolScope } from '~/utils/activeProtocolScope';
import { cx } from '~/utils/cva';

import { buildProtocolWithStage } from '../../StageEditor/buildProtocolWithStage';
import { DistributionEditor } from './DistributionEditor';
import {
  type DistributionFamily,
  DISTRIBUTION_FAMILIES,
  distributionCandidates,
} from './distributions';
import {
  isSyntheticAuthored,
  resolveStageSynthetic,
  type StageDraft,
  stageCountWindow,
  stageCreatesEdges,
  stageSyntheticSupport,
  type SyntheticChange,
  syntheticBlockForChange,
  type SyntheticIssue,
  topologyMetricWindow,
} from './stageSynthetic';

/**
 * The stage editor's "Synthetic data" section: every generation parameter the
 * stage's own schema admits, authored so that a value the schema would refuse
 * cannot be produced (spec, "Surfaces §1").
 *
 * Three things hold this to the schema rather than to a copy of it:
 *
 *  - WHICH controls render is asked of the stage schema per stage
 *    (`stageSyntheticSupport`), so the factory table in
 *    `schemas/8/stages/*` is never restated here;
 *  - WHAT the collapsed row says is the resolved parse of the draft
 *    (`resolveStageSynthetic`), so a summary can never disagree with what a
 *    run would do;
 *  - WHETHER an edit lands is the schema's answer to the candidate block
 *    (`syntheticBlockForChange`), so the beta variance rule, the ordered
 *    bounds, the population ceiling and the behaviours window are all
 *    enforced without one of them being written down twice.
 *
 * The block itself is ONE registered field. Every other shape the descriptor
 * can take — a count that changes family, a topology that changes metric —
 * would otherwise register and unregister leaves as the author works, and
 * `getFormValues()` reports registered fields only: a leaf that disappeared
 * mid-edit would be a key silently dropped on save. Registered outside the
 * disclosure for the same reason, so a collapsed section still carries what
 * the researcher authored.
 */

const SECTION_TITLE = 'Synthetic data';

const NODE_COUNT_LEGEND = 'Number of nodes created';
const NODE_COUNT_HINT =
  'How many nodes this stage creates when a synthetic interview is generated.';
const TOPOLOGY_LEGEND = 'Edge topology';
const TOPOLOGY_METRIC_LABEL = 'Topology measure';
const TOPOLOGY_HINT =
  'How densely this stage links the people in the network when a synthetic interview is generated.';
const RESPONSE_BURDEN_LABEL = 'Response burden';
const RESPONSE_BURDEN_HINT =
  'How much of the participant’s attention this stage costs, relative to the other stages. Higher values make a synthetic participant more likely to drop out later in the interview.';
const NO_EDGE_PROMPT_SUMMARY = 'Edges: none created by this stage';
const NO_EDGE_PROMPT_TITLE = 'This stage creates no edges';
const NO_EDGE_PROMPT_DESCRIPTION =
  'Edge topology decides how densely a stage links people together, so it is only editable once a prompt on this stage creates an edge.';
const NO_DATA_SUMMARY = 'Creates no data';
const CONFLICT_TITLE = 'Synthetic data cannot be generated for this stage';
const REFUSAL_TITLE = 'That change was not saved';
const SUMMARY_SEPARATOR = ' · ';

const METRIC_LABELS: Record<EdgeTopology['metric'], string> = {
  density: 'Density',
  meanDegree: 'Mean degree',
};

/**
 * Both metrics the schema defines, in the order they are offered.
 * `METRIC_LABELS` above is exhaustive over the schema's own metric union, so a
 * metric added there fails the typecheck until it is named; this list is the
 * order a researcher meets them in.
 */
const TOPOLOGY_METRICS = [
  'density',
  'meanDegree',
] as const satisfies readonly EdgeTopology['metric'][];

/**
 * A response burden has no direction — it is a rate summed across the stages a
 * participant has completed — so its floor is zero and it has no ceiling. The
 * shape of the quantity, not a bound copied from the schema.
 */
const BURDEN_WINDOW = numericWindowOf({
  min: 0,
  max: Number.POSITIVE_INFINITY,
});

/** A placeholder id for the resolution parse; no protocol is built from it. */
const DRAFT_STAGE_ID = 'synthetic-draft-stage';

/** Refusals pathed under one parameter, re-pathed relative to it. */
const issuesUnder = (
  issues: readonly SyntheticIssue[],
  key: string,
): SyntheticIssue[] =>
  issues
    .filter((issue) => issue.path[0] === key)
    .map((issue) => ({ ...issue, path: issue.path.slice(1) }));

/**
 * Refusals about the descriptor as a whole rather than about any one
 * parameter — a composer block declaring neither a count nor a topology, say.
 * No field can carry these, so the section renders them itself; without that
 * they would be refusals nothing on screen accounts for.
 */
const unscopedIssues = (issues: readonly SyntheticIssue[]): SyntheticIssue[] =>
  issues.filter((issue) => issue.path.length === 0);

/** The offered families, current one first, for a metric or family switch. */
const familiesFrom = (
  current: DistributionFamily,
): readonly DistributionFamily[] => [
  current,
  ...DISTRIBUTION_FAMILIES.filter((family) => family !== current),
];

type TopologyEditorProps = {
  topology: EdgeTopology;
  issues: readonly SyntheticIssue[];
  onCandidates: (candidates: Record<string, unknown>[]) => void;
};

/**
 * The metric a topology is expressed in, and the distribution over it.
 *
 * Changing the metric changes what the numbers MEAN — a proportion of the
 * available pairs, or ties per person — and each metric admits its own set of
 * families. So the switch offers the current family first and then every
 * other, and the schema takes the first that fits: a beta density carried onto
 * a mean degree, which has no beta, lands on the next family rather than on a
 * refusal the author cannot act on.
 */
const TopologyEditor = ({
  topology,
  issues,
  onCandidates,
}: TopologyEditorProps) => {
  const window = topologyMetricWindow(topology.metric);
  const current: SyntheticDistribution = topology.distribution;

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{TOPOLOGY_LEGEND}</legend>
      <UnconnectedField
        name="synthetic.topology.metric"
        label={TOPOLOGY_METRIC_LABEL}
        hint={TOPOLOGY_HINT}
        component={StyledSelectField}
        value={topology.metric}
        options={TOPOLOGY_METRICS.map((metric) => ({
          value: metric,
          label: METRIC_LABELS[metric],
        }))}
        onChange={(next: string | number | undefined) => {
          const metric = TOPOLOGY_METRICS.find((option) => option === next);
          if (metric === undefined || metric === topology.metric) return;
          const nextWindow = topologyMetricWindow(metric);
          onCandidates(
            familiesFrom(current.distribution)
              .flatMap((family) =>
                distributionCandidates(family, current, nextWindow),
              )
              .map((distribution) => ({ metric, distribution })),
          );
        }}
      />
      <DistributionEditor
        name="synthetic.topology.distribution"
        legend={TOPOLOGY_LEGEND}
        distribution={current}
        window={window}
        families={familiesFrom(current.distribution)}
        // A refusal about the topology AS A WHOLE (rather than about one of
        // its parameters) has no field of its own, so it travels down to the
        // distribution editor's declaration-level notice — titled with this
        // legend, which is what it is about.
        issues={[
          ...issuesUnder(issues, 'distribution'),
          ...unscopedIssues(issues),
        ]}
        onCandidates={(candidates) =>
          onCandidates(
            candidates.map((distribution) => ({
              metric: topology.metric,
              distribution,
            })),
          )
        }
      />
    </fieldset>
  );
};

const SyntheticData = ({
  interfaceType,
  stagePosition,
}: StageEditorSectionProps) => {
  const { committedStage, stageId } = useStageFormContext();
  const values = useStageFormValues();
  const setStageValue = useSetStageValue();
  const initialSynthetic = useStageInitialValue<FieldValue>('synthetic');
  const protocol = useSelector(getProtocol);
  const [refusals, setRefusals] = useState<readonly SyntheticIssue[]>([]);

  /**
   * The stage as it stands: the committed stage with the form's own values
   * over it.
   *
   * The form's values alone are not the stage. `getFormValues()` reports
   * REGISTERED fields, and a section whose fields are unmounted — a collapsed
   * Min/max alters, a Sociogram prompt list the researcher has not opened —
   * registers nothing. Reading values alone would therefore lose the very
   * siblings the schema resolves against: the behaviours window a count is
   * bounded by, and the prompts that say whether this stage creates edges at
   * all. Merging in the committed stage is the same resolution order
   * `useStageFormValue` documents, and the registered `synthetic` still wins
   * over the committed one — including when it has been reset to `undefined`.
   */
  const draft = useMemo<StageDraft>(
    () => ({
      ...(committedStage as unknown as Record<string, unknown> | null),
      ...values,
      id: committedStage?.id ?? DRAFT_STAGE_ID,
      type: interfaceType,
    }),
    [values, committedStage, interfaceType],
  );

  const support = useMemo(() => stageSyntheticSupport(draft), [draft]);
  const resolved = useMemo(() => resolveStageSynthetic(draft), [draft]);
  const countWindow = useMemo(() => stageCountWindow(draft), [draft]);
  const createsEdges = useMemo(() => stageCreatesEdges(draft), [draft]);
  const authored = isSyntheticAuthored(draft);

  const showCount = support.supportsCount && resolved.count !== undefined;
  const showTopology =
    support.supportsTopology && resolved.topology !== undefined && createsEdges;
  const topologyWindow = useMemo(
    () =>
      resolved.topology === undefined
        ? undefined
        : topologyMetricWindow(resolved.topology.metric),
    [resolved.topology],
  );

  /**
   * The whole protocol as it stands, with this stage's working copy in place:
   * the same shape preview launches, so the feasibility verdict describes what
   * a run of these edits would meet.
   */
  const feasibilityDocument = useMemo(() => {
    if (!protocol) return null;
    // Form values are a stage's shape without its type, which the schema
    // decides on rather than this component: the parse inside the feasibility
    // hook is what says whether the draft is a stage at all. The builder mints
    // an id for an inserted stage, so the placeholder never reaches the
    // document a new stage is analysed in.
    return buildProtocolWithStage(
      protocol,
      draft as unknown as Stage,
      stageId,
      stagePosition,
    );
  }, [protocol, draft, stageId, stagePosition]);

  const feasibility = useSyntheticFeasibility({
    document: feasibilityDocument,
    protocolId: getActiveProtocolScope(),
  });

  /**
   * The id the analysis knows this stage by.
   *
   * A saved stage is analysed under its own. A stage not yet saved is INSERTED
   * into the analysed document by `buildProtocolWithStage`, which mints an id
   * for it — so the id the engine will put on this stage's conflicts is read
   * back off the document that was analysed rather than guessed at.
   */
  const analysedStageId = useMemo(() => {
    if (stageId !== null) return stageId;
    if (feasibilityDocument === null) return undefined;
    const inserted = stagePosition ?? feasibilityDocument.stages.length - 1;
    return feasibilityDocument.stages[inserted]?.id;
  }, [feasibilityDocument, stageId, stagePosition]);

  const stageConflicts = useMemo(
    () => conflictsForStage(feasibility.conflicts, analysedStageId),
    [feasibility.conflicts, analysedStageId],
  );

  /**
   * Write the first candidate the schema accepts, and nothing at all when it
   * accepts none — the refusals it gave for the last candidate are rendered
   * beside the control instead, in the schema's own words.
   */
  const commit = useCallback(
    (changes: readonly SyntheticChange[]) => {
      let lastIssues: readonly SyntheticIssue[] = [];
      for (const change of changes) {
        const { block, issues } = syntheticBlockForChange(draft, change);
        if (issues.length === 0) {
          setRefusals([]);
          setStageValue('synthetic', block);
          return;
        }
        lastIssues = issues;
      }
      setRefusals(lastIssues);
    },
    [draft, setStageValue],
  );

  const handleReset = useCallback(() => {
    setRefusals([]);
    setStageValue('synthetic', undefined);
  }, [setStageValue]);

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (!support.generatesData) parts.push(NO_DATA_SUMMARY);
    if (showCount && resolved.count) {
      parts.push(
        `Nodes: ${formatSyntheticCount(resolved.count, { window: countWindow })}`,
      );
    }
    if (support.supportsTopology && !createsEdges) {
      parts.push(NO_EDGE_PROMPT_SUMMARY);
    } else if (showTopology && resolved.topology) {
      parts.push(
        `Edges: ${formatEdgeTopology(resolved.topology, topologyWindow ? { window: topologyWindow } : {})}`,
      );
    }
    if (resolved.responseBurden !== undefined) {
      parts.push(`Burden: ${formatResponseBurden(resolved.responseBurden)}`);
    }
    return parts.join(SUMMARY_SEPARATOR);
  }, [
    support,
    showCount,
    showTopology,
    createsEdges,
    resolved,
    countWindow,
    topologyWindow,
  ]);

  return (
    <Surface
      as="section"
      noContainer
      spacing="none"
      shadow="sm"
      data-name={SECTION_TITLE}
      className={cx(
        'relative mb-4 flex w-full max-w-7xl min-w-0 flex-col gap-5 overflow-visible! p-6',
      )}
    >
      {/*
        The one registration for the stage's whole descriptor. Outside the
        disclosure so a collapsed section still carries the authored block into
        `getFormValues()` — and so the block survives a family or metric change
        that would otherwise unregister a leaf.
      */}
      <HiddenFieldValue name="synthetic" initialValue={initialSynthetic} />
      <SyntheticFeasibilityAnnouncer feasibility={feasibility} />
      {/*
        Above the disclosure, not inside it: the section is collapsed by
        default (spec rule 4), and a refusal a researcher has to expand a row
        to discover is a refusal they will meet at save time instead. The
        wording is the engine's own, verbatim (spec rule 3).
      */}
      {stageConflicts.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>{CONFLICT_TITLE}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc ps-5">
              {stageConflicts.map((conflict) => (
                <li key={`${conflict.rules.join()}-${conflict.reason}`}>
                  {conflict.reason}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <SyntheticSection
        title={SECTION_TITLE}
        summary={summary}
        authored={authored}
        onReset={handleReset}
      >
        <div className="flex min-w-0 flex-col gap-6">
          {unscopedIssues(refusals).length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>{REFUSAL_TITLE}</AlertTitle>
              <AlertDescription>
                <ul className="list-disc ps-5">
                  {unscopedIssues(refusals).map((issue) => (
                    <li key={issue.message}>{issue.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {showCount && resolved.count && (
            <DistributionEditor
              name="synthetic.count"
              legend={NODE_COUNT_LEGEND}
              distribution={resolved.count}
              window={countWindow}
              families={familiesFrom(resolved.count.distribution)}
              hint={NODE_COUNT_HINT}
              integral
              issues={issuesUnder(refusals, 'count')}
              onCandidates={(candidates) =>
                commit(candidates.map((count) => ({ count })))
              }
            />
          )}

          {support.supportsTopology && !createsEdges && (
            <Alert variant="info">
              <AlertTitle>{NO_EDGE_PROMPT_TITLE}</AlertTitle>
              <AlertDescription>{NO_EDGE_PROMPT_DESCRIPTION}</AlertDescription>
            </Alert>
          )}

          {showTopology && resolved.topology && (
            <TopologyEditor
              topology={resolved.topology}
              issues={issuesUnder(refusals, 'topology')}
              onCandidates={(candidates) =>
                commit(candidates.map((topology) => ({ topology })))
              }
            />
          )}

          <SyntheticNumberField
            name="synthetic.responseBurden"
            label={RESPONSE_BURDEN_LABEL}
            hint={RESPONSE_BURDEN_HINT}
            value={resolved.responseBurden}
            window={BURDEN_WINDOW}
            errors={issuesUnder(refusals, 'responseBurden').map(
              (issue) => issue.message,
            )}
            onCommit={(responseBurden) => {
              // Not `clearable`: every stage resolves a burden, so there is
              // no unstated one for an empty box to mean.
              if (responseBurden === undefined) return;
              commit([{ responseBurden }]);
            }}
          />
        </div>
      </SyntheticSection>
    </Surface>
  );
};

export default SyntheticData;
