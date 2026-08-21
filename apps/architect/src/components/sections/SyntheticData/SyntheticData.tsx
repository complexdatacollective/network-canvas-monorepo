import { useCallback, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { v1 as uuid } from 'uuid';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import Surface from '@codaco/fresco-ui/layout/Surface';
import {
  type EdgeTopology,
  type Stage,
  stageValuesSynthetic,
  SyntheticCountSchema,
} from '@codaco/protocol-validation';
import { HiddenFieldValue } from '~/components/sections/Form/withFieldsHandlers';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageFormContext } from '~/components/StageEditor/stageFormContext';
import {
  useSetStageValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import { useStageFormValues } from '~/components/StageEditor/useStageFormValues';
import { conflictsForStage } from '~/components/Synthetic/conflicts';
import { describeFieldWindow } from '~/components/Synthetic/schemaIntrospection';
import { stageCreatesEdges } from '~/components/Synthetic/stageEdges';
import {
  formatEdgeTopology,
  formatResponseBurden,
  formatSyntheticCount,
} from '~/components/Synthetic/summaries';
import { SyntheticFeasibilityAnnouncer } from '~/components/Synthetic/SyntheticFeasibilityAnnouncer';
import { SyntheticNumberField } from '~/components/Synthetic/SyntheticNumberField';
import { SyntheticSection } from '~/components/Synthetic/SyntheticSection';
import type { NumericWindow } from '~/components/Synthetic/useNumericDraft';
import { useSyntheticFeasibility } from '~/hooks/useSyntheticFeasibility';
import { getProtocol } from '~/selectors/protocol';
import { getActiveProtocolScope } from '~/utils/activeProtocolScope';
import { cx } from '~/utils/cva';

import { buildProtocolWithStage } from '../../StageEditor/buildProtocolWithStage';
import {
  STAGE_SECTION_SYNTHETIC,
  stageSectionMarker,
} from '../../StageEditor/deepLink';
import { withStageIdentity } from '../../StageEditor/withStageIdentity';
import { DistributionEditor } from './DistributionEditor';
import {
  defaultTopologyForMetric,
  isSyntheticAuthored,
  resolveStageSynthetic,
  type StageDraft,
  stageCountWindow,
  stageSyntheticEditorValues,
  stageSyntheticSupport,
  type SyntheticChange,
  syntheticBlockForChange,
  type SyntheticIssue,
  topologyDistributionSchema,
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
const NO_NODE_COUNT_SUMMARY = 'Nodes: none created by this stage';
const NO_EDGE_PROMPT_TITLE = 'This stage creates no edges';
const NO_EDGE_PROMPT_DESCRIPTION =
  'Edge topology decides how densely a stage links people together, so it is only editable once this stage has something that creates an edge.';
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

const OPEN_WINDOW: NumericWindow = {
  exclusiveMin: false,
  exclusiveMax: false,
  integer: false,
};

/**
 * The window a response burden may take, read off the descriptor every stage
 * type carries it on. A rate rather than a probability — it is summed across
 * the stages a participant has completed — so the schema leaves it open above,
 * and this reads that rather than restating it.
 */
const BURDEN_WINDOW: NumericWindow =
  describeFieldWindow(stageValuesSynthetic('Information'), [
    'responseBurden',
  ]) ?? OPEN_WINDOW;

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

type TopologyEditorProps = {
  topology: EdgeTopology;
  issues: readonly SyntheticIssue[];
  onCandidates: (candidates: Record<string, unknown>[]) => void;
};

/**
 * The metric a topology is expressed in, and the distribution over it.
 *
 * Changing the metric changes what the numbers MEAN — a proportion of the
 * available pairs, or ties per person — so the parameters do not travel with
 * it. A density of 0.5 reused as a mean degree of 0.5 is half the pairs in the
 * network turned into three ties per person, silently, on a control that gave
 * no sign of having changed anything but its units. The new metric starts at
 * its own schema default instead (see `defaultTopologyForMetric`), which is
 * where an unstated topology of that metric already sits.
 */
const TopologyEditor = ({
  topology,
  issues,
  onCandidates,
}: TopologyEditorProps) => {
  const window = topologyMetricWindow(topology.metric);

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
          onCandidates([defaultTopologyForMetric(metric)]);
        }}
      />
      <DistributionEditor
        name="synthetic.topology.distribution"
        legend={TOPOLOGY_LEGEND}
        distribution={topology.distribution}
        window={window}
        schema={topologyDistributionSchema(topology.metric)}
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
   * over it — built by `withStageIdentity`, the same shape a save commits and
   * a preview launches.
   *
   * Deliberately NOT the committed stage with values merged over it. A key
   * absent from `getFormValues()` is a key the researcher REMOVED (a section
   * toggled off), and a merge cannot tell that from a key the form never held:
   * this section would go on resolving a count inside limits the save is about
   * to drop, and — since the same draft is what the live analysis runs against
   * — reporting a verdict about a protocol nobody can save. The two keys no
   * field could ever carry are the identity, which is put back below.
   */
  const draft = useMemo<StageDraft>(
    () => ({
      ...(withStageIdentity(values as unknown as Stage, committedStage, {
        // Both keys are read as form-owned here. The block is: this section
        // registers it, so its own value is authoritative — including when a
        // reset has removed it. Skip logic is, because nothing this section
        // computes can see it — no stage parameter resolves against it and the
        // engine's analysis reads none — so carrying it in would add a key to
        // the analysed stage for no question it could answer. (Asking the
        // interface registry which sections it renders would close an import
        // cycle: the registry is built FROM the section list this file is in.)
        skipLogic: true,
        synthetic: true,
      }) as unknown as Record<string, unknown>),
      id: committedStage?.id ?? DRAFT_STAGE_ID,
      type: interfaceType,
    }),
    [values, committedStage, interfaceType],
  );

  const support = useMemo(() => stageSyntheticSupport(draft), [draft]);
  const resolved = useMemo(() => resolveStageSynthetic(draft), [draft]);
  /**
   * What the CONTROLS show. A composer's block may state one half and leave
   * the other out, which means "none of those" to a run — and `resolved` says
   * so — but the editor still has to offer the missing half, or the only way
   * back to it would be resetting the whole block.
   */
  const editing = useMemo(() => stageSyntheticEditorValues(draft), [draft]);
  const countWindow = useMemo(() => stageCountWindow(draft), [draft]);
  const createsEdges = useMemo(() => stageCreatesEdges(draft), [draft]);
  const authored = isSyntheticAuthored(draft);

  const showCount = support.supportsCount && editing.count !== undefined;
  const showTopology =
    support.supportsTopology && editing.topology !== undefined && createsEdges;
  const topologyWindow = useMemo(
    () =>
      resolved.topology === undefined
        ? undefined
        : topologyMetricWindow(resolved.topology.metric),
    [resolved.topology],
  );

  /**
   * The id a stage that has not been saved yet is analysed under.
   *
   * `buildProtocolWithStage` mints a fresh one on every call, so an unsaved
   * stage was a different stage to the engine on every recompute: the verdict
   * in hand named an id the newest document no longer had, and this section's
   * own conflicts blinked out between debounce cycles. Minted once for the
   * editing session instead — `useState`'s initialiser, so React cannot
   * discard it the way it may discard a memo — and written over the builder's.
   */
  const [draftStageId] = useState(() => uuid());

  /**
   * The whole protocol as it stands, with this stage's working copy in place:
   * the same shape preview launches, so the feasibility verdict describes what
   * a run of these edits would meet.
   */
  const feasibilityDocument = useMemo(() => {
    if (!protocol) return null;
    // Form values are a stage's shape without its type, which the schema
    // decides on rather than this component: the parse inside the feasibility
    // hook is what says whether the draft is a stage at all.
    const document = buildProtocolWithStage(
      protocol,
      draft as unknown as Stage,
      stageId,
      stagePosition,
    );
    if (stageId !== null) return document;

    const inserted = stagePosition ?? protocol.stages.length;
    return {
      ...document,
      stages: document.stages.map((stage, index) =>
        index === inserted ? { ...stage, id: draftStageId } : stage,
      ),
    };
  }, [protocol, draft, stageId, stagePosition, draftStageId]);

  const feasibility = useSyntheticFeasibility({
    document: feasibilityDocument,
    protocolId: getActiveProtocolScope(),
  });

  /**
   * The id the analysis knows this stage by: its own where it has been saved,
   * and the session's stable draft id where it has not.
   */
  const analysedStageId = stageId ?? draftStageId;

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

  /**
   * The collapsed row: what a run of this stage would actually do.
   *
   * Built from the RESOLVED parameters rather than from the ones the controls
   * are showing, so the two can differ in exactly one place — a composer whose
   * block states one half — and there the summary says the truth ("creates no
   * nodes") while the control offers the way out of it.
   */
  const summary = useMemo(() => {
    const parts: string[] = [];
    if (!support.generatesData) parts.push(NO_DATA_SUMMARY);
    if (support.supportsCount) {
      parts.push(
        resolved.count === undefined
          ? NO_NODE_COUNT_SUMMARY
          : `Nodes: ${formatSyntheticCount(resolved.count, { window: countWindow })}`,
      );
    }
    if (support.supportsTopology) {
      parts.push(
        !createsEdges || resolved.topology === undefined
          ? NO_EDGE_PROMPT_SUMMARY
          : `Edges: ${formatEdgeTopology(resolved.topology, topologyWindow ? { window: topologyWindow } : {})}`,
      );
    }
    if (resolved.responseBurden !== undefined) {
      parts.push(`Burden: ${formatResponseBurden(resolved.responseBurden)}`);
    }
    return parts.join(SUMMARY_SEPARATOR);
  }, [support, createsEdges, resolved, countWindow, topologyWindow]);

  return (
    <Surface
      as="section"
      noContainer
      spacing="none"
      shadow="sm"
      data-name={SECTION_TITLE}
      // Where a `?section=synthetic` link lands (see `StageEditor/deepLink`),
      // so the overview's stage rows can open the editor at the very
      // parameters they are describing.
      {...stageSectionMarker(STAGE_SECTION_SYNTHETIC)}
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

          {showCount && editing.count && (
            <DistributionEditor
              name="synthetic.count"
              legend={NODE_COUNT_LEGEND}
              distribution={editing.count}
              window={countWindow}
              schema={SyntheticCountSchema}
              hint={NODE_COUNT_HINT}
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

          {showTopology && editing.topology && (
            <TopologyEditor
              topology={editing.topology}
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
