'use client';

import { createSelector } from '@reduxjs/toolkit';
import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSelector } from 'react-redux';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import Icon from '@codaco/fresco-ui/Icon';
import Node, { type NodeShape } from '@codaco/fresco-ui/Node';
import { ResizableFlexPanel } from '@codaco/fresco-ui/ResizableFlexPanel';
import { SegmentedToolbar } from '@codaco/fresco-ui/SegmentedToolbar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { NodeColorReference } from '@codaco/protocol-validation';
import { isFamilyPedigreeStageMetadata } from '@codaco/shared-consts';

import { useNodeMeasurement } from '../../../hooks/useNodeMeasurement';
import { useStageSelector } from '../../../hooks/useStageSelector';
import {
  useLocalizedString,
  useOptionalLocalizedText,
  useResolveLocalizedMessage,
  useResolveLocalizedString,
} from '../../../localization/ProtocolLocalizationProvider';
import {
  getActiveSession,
  getEdgeColorForType,
  getNetworkEdges,
  getNetworkNodes,
  resolveNodeShape,
} from '../../../selectors/session';
import { getCodebook, getStages } from '../../../store/modules/protocol';
import type { StageProps } from '../../../types';
import { usePassphrase } from '../../Anonymisation/usePassphrase';
import { useDecryptedNames } from '../../FamilyPedigree/encryptedNames';
import { gameteLookup, inferGametes } from '../../FamilyPedigree/gametes';
import {
  labelEveryone,
  withoutSoftHyphens,
} from '../../FamilyPedigree/generatedLabels';
import { pedigreeConfigFromStage } from '../../FamilyPedigree/model';
import { EDGE_WIDTH } from '../../FamilyPedigree/pedigree-layout/components/EdgeRenderer';
import PedigreeLayout from '../../FamilyPedigree/pedigree-layout/components/PedigreeLayout';
import { dimColor } from '../../FamilyPedigree/pedigree-layout/dimColor';
import type { PedigreeLink } from '../../FamilyPedigree/pedigree-layout/types';
import { pedigreeLinksOf } from '../../FamilyPedigree/pedigreeLinks';
import {
  type PedigreeWords,
  usePedigreeText,
} from '../../FamilyPedigree/pedigreeWords';
import { usePanZoom } from '../../FamilyPedigree/usePanZoom';
import { pedigreeFraming } from '../../pedigree-common/framing';
import { readParticipantsFamily } from '../../pedigree-common/membership';
import {
  focusNeighbourInDirection,
  PedigreeViewport,
  usePedigreeZoomButtons,
} from '../../pedigree-common/PedigreeCanvas';
import { PedigreeSnapshotDocument } from '../export/PedigreeSnapshotDocument';
import { exportSnapshot } from '../export/snapshot';
import { computeStatuses } from '../genetics/computeStatuses';
import { geneticSexResolver } from '../genetics/familyGenetics';
import { buildGeneticGraph } from '../genetics/geneticGraph';
import { affectedSet, getStatusLabel, type Status } from '../genetics/status';
import { computeContributors } from '../highlight';
import { messages } from '../messages';
import ConditionPanel, { type ConditionPanelWords } from './ConditionPanel';
import { Sticker } from './Sticker';

type NarrativeStage = StageProps<'NarrativePedigree'>['stage'];
type Disease = NarrativeStage['diseases'][number];
type ResolvedDisease = Omit<Disease, 'color' | 'label'> & {
  color: string;
  label: string;
};

const NODE_COLOR_VARIABLES = {
  'node-color-seq-1': 'var(--node-1)',
  'node-color-seq-2': 'var(--node-2)',
  'node-color-seq-3': 'var(--node-3)',
  'node-color-seq-4': 'var(--node-4)',
  'node-color-seq-5': 'var(--node-5)',
  'node-color-seq-6': 'var(--node-6)',
  'node-color-seq-7': 'var(--node-7)',
  'node-color-seq-8': 'var(--node-8)',
} as const satisfies Record<NodeColorReference, string>;

export function resolveDiseaseColor(color: NodeColorReference): string {
  return NODE_COLOR_VARIABLES[color];
}

/**
 * The FamilyPedigree stage `sourceStageId` names, and the metadata it
 * recorded (the framing the participant chose, when the stage left it to
 * them). Null when the source is missing or is not a FamilyPedigree: a
 * misconfigured protocol, for which the view explains that the family cannot
 * be found.
 */
function makeSourceSelector(sourceStageId: string) {
  return createSelector(getStages, getActiveSession, (stages, session) => {
    const index = stages.findIndex((stage) => stage.id === sourceStageId);
    const source = stages[index];
    if (!source || source.type !== 'FamilyPedigree') return null;
    const metadata = session?.stageMetadata?.[index];
    return {
      stage: source,
      chosenFraming: isFamilyPedigreeStageMetadata(metadata)
        ? metadata.framing
        : undefined,
    };
  });
}

/** How far in from each edge of the canvas the whole family is fitted. */
const FIT_MARGIN = 32;

type NarrativePedigreeViewProps = {
  stage: NarrativeStage;
};

export default function NarrativePedigreeView({
  stage,
}: NarrativePedigreeViewProps) {
  const intl = useAppIntl();
  const resolve = useResolveLocalizedString();
  const resolveMessage = useResolveLocalizedMessage();
  const stageLabel = useLocalizedString(stage.label).text;
  // The stage's own words (`stage-wording/narrative-pedigree.ts`). The two
  // at-risk rows are held only while the stage shows at-risk statuses.
  const atRiskAffected = useOptionalLocalizedText(
    stage.conditionText.notation.atRiskAffected,
  );
  const atRiskCarrier = useOptionalLocalizedText(
    stage.conditionText.notation.atRiskCarrier,
  );
  const conditionWords: ConditionPanelWords = {
    keyHeading: resolve(stage.keyHeading).text,
    heading: resolve(stage.conditionText.heading).text,
    instruction: resolve(stage.conditionText.instruction).text,
    saveSnapshot: resolve(stage.tooltips.saveSnapshot).text,
    notation: {
      affected: resolve(stage.conditionText.notation.affected).text,
      obligateAffected: resolve(stage.conditionText.notation.obligateAffected)
        .text,
      obligateCarrier: resolve(stage.conditionText.notation.obligateCarrier)
        .text,
      atRiskAffected,
      atRiskCarrier,
      unknown: resolve(stage.conditionText.notation.unknown).text,
    },
  };
  const clearFocusText = resolve(stage.tooltips.clearFocus).text;
  // Architect stores the selected node palette entry as a typed protocol
  // reference. SVG and inline CSS need the corresponding theme variable, so
  // resolve every disease once at the view boundary before it reaches the key,
  // pedigree, dimming, or printable snapshot.
  const diseases = useMemo<ResolvedDisease[]>(
    () =>
      stage.diseases.map((disease) => ({
        ...disease,
        label: resolve(disease.label).text,
        color: resolveDiseaseColor(disease.color),
      })),
    [stage.diseases, resolve],
  );

  const sourceSelector = useMemo(
    () => makeSourceSelector(stage.sourceStageId),
    [stage.sourceStageId],
  );
  const source = useStageSelector(sourceSelector);
  const sourceStage = source?.stage;
  const config = useMemo(
    () => (sourceStage ? pedigreeConfigFromStage(sourceStage) : null),
    [sourceStage],
  );
  // The words the source stage used for anyone it could not name.
  const framing = pedigreeFraming(sourceStage?.framing, source?.chosenFraming);

  const codebook = useSelector(getCodebook);
  const nodes = useStageSelector(getNetworkNodes);
  const edges = useStageSelector(getNetworkEdges);

  // Names stored encrypted are decrypted with the interview's key, as the
  // Family Pedigree decrypts them. Until the passphrase is entered (through
  // the interview's passphrase prompt), and for a name that can never be
  // read, people are shown by how they are related to the participant.
  const { requirePassphrase } = usePassphrase();
  const personVariables = useMemo(
    () => (config ? (codebook.node?.[config.personType]?.variables ?? {}) : {}),
    [codebook, config],
  );
  const encryptNames =
    config !== null &&
    personVariables[config.nameAttribute]?.encrypted === true;
  useEffect(() => {
    if (encryptNames) requirePassphrase();
  }, [encryptNames, requirePassphrase]);
  const decryption = useDecryptedNames({
    nodes,
    nameAttribute: config?.nameAttribute ?? '',
    variables: personVariables,
  });

  // The participant's family as the source stage recorded it: the
  // participant and everyone connected to them by family relationships. The
  // interview network is one shared graph, and later stages can add people of
  // the same type who are not family; they are left out of the layout and the
  // genetics engine alike. When the participant left the source stage, it
  // saved a label as the name of everyone they did not name, so every name is
  // read as given.
  const family = useMemo(() => {
    if (!config) return null;
    return readParticipantsFamily(nodes, edges, config, decryption.names);
  }, [nodes, edges, config, decryption.names]);

  // A person is shown by their name, the participant as "You", and anyone
  // without a name the view can read (an encrypted name awaiting the
  // passphrase) by how they are related to the participant, in the source
  // stage's words. Soft hyphens let long kinship words break inside a symbol.
  const pedigreeText = usePedigreeText();
  const sourceWords = useMemo<PedigreeWords | null>(
    () =>
      sourceStage ? { wording: sourceStage.wording, text: pedigreeText } : null,
    [sourceStage, pedigreeText],
  );
  const labels = useMemo(
    () =>
      family && sourceWords
        ? labelEveryone(family, framing, intl, sourceWords)
        : new Map<string, string>(),
    [family, framing, intl, sourceWords],
  );
  const labelFor = useCallback(
    (personId: string) => labels.get(personId) ?? '',
    [labels],
  );
  const spokenLabelFor = useCallback(
    (personId: string) => withoutSoftHyphens(labelFor(personId)),
    [labelFor],
  );

  // The genetics engine reads sex from sex assigned at birth, and gametes
  // from how the family's recorded sexes pair up (see familyGenetics.ts).
  const genetics = useMemo(() => {
    if (!family) return null;
    const gametes = inferGametes(family);
    const resolveSex = geneticSexResolver(family, gametes);
    return {
      resolveSex,
      graph: buildGeneticGraph(family, resolveSex, gameteLookup(gametes)),
    };
  }, [family]);

  const [selectedDiseaseId, setSelectedDiseaseId] = useState<string | null>(
    null,
  );
  const [focalId, setFocalId] = useState<string | null>(null);
  // While true, the off-screen printable snapshot document is mounted so it can
  // be captured to a PNG (see the capture effect below).
  const [isCapturing, setIsCapturing] = useState(false);

  const snapshotRef = useRef<HTMLDivElement>(null);
  const { nodeWidth, nodeHeight, measurementContainer } = useNodeMeasurement({
    component: <Node size="sm" />,
  });

  // When a disease is selected, show only that disease; otherwise show all.
  const shownDiseases = useMemo<ResolvedDisease[]>(() => {
    if (selectedDiseaseId === null) return diseases;
    const found = diseases.find((d) => d.id === selectedDiseaseId);
    return found !== undefined ? [found] : diseases;
  }, [selectedDiseaseId, diseases]);

  // diseaseId → (personId → status) for every shown disease.
  const statusesByDisease = useMemo(() => {
    const map = new Map<string, Map<string, Status>>();
    if (!genetics || !family) return map;
    for (const disease of shownDiseases) {
      map.set(
        disease.id,
        computeStatuses(
          genetics.graph,
          affectedSet(family.people, disease.attribute),
          disease.inheritancePattern,
          genetics.resolveSex,
        ),
      );
    }
    return map;
  }, [genetics, family, shownDiseases]);

  // Display gate for the at-risk (probabilistic) notation. The genetics engine
  // always emits the at-risk statuses; this transform decides whether they are
  // shown. When the researcher leaves the option off (default), the two at-risk
  // statuses collapse to `unknown`, so no "?" glyphs are drawn anywhere — and
  // because every downstream consumer (stickers, single-condition node,
  // screen-reader summary, aria-live) reads from these displayed maps, the spoken
  // summary never announces a status the participant cannot see. The engine
  // output is left untouched (it still feeds the inheritance-aware focal
  // highlighting below).
  const showAtRiskStatuses = stage.showAtRiskStatuses ?? false;

  const displayedStatusesByDisease = useMemo(() => {
    if (showAtRiskStatuses) return statusesByDisease;
    const map = new Map<string, Map<string, Status>>();
    for (const [diseaseId, statuses] of statusesByDisease) {
      const displayed = new Map<string, Status>();
      for (const [personId, status] of statuses) {
        displayed.set(
          personId,
          status === 'atRiskAffected' || status === 'atRiskCarrier'
            ? 'unknown'
            : status,
        );
      }
      map.set(diseaseId, displayed);
    }
    return map;
  }, [showAtRiskStatuses, statusesByDisease]);

  // Focal highlighting (which relatives contribute to a person's inheritance)
  // is an analytical relationship, not a displayed status — keep it driven by
  // the full engine output so it is unaffected by the display gate. The walk is
  // inheritance-pattern-aware, so it follows each shown disease's true source
  // line (e.g. a son's X-linked allele up the maternal line only).
  const highlight = useMemo(() => {
    if (!genetics) {
      return { nodes: new Set<string>(), edges: new Set<string>() };
    }
    const diseaseContributors = shownDiseases.map((disease) => ({
      pattern: disease.inheritancePattern,
      statuses: statusesByDisease.get(disease.id) ?? new Map<string, Status>(),
    }));
    return computeContributors(
      focalId,
      genetics.graph,
      diseaseContributors,
      genetics.resolveSex,
    );
  }, [genetics, focalId, shownDiseases, statusesByDisease]);

  // The family as the layout reads it, as the Family Pedigree draws it:
  // donors and surrogates on their own lines, separated partnerships broken.
  const layoutLinks = useMemo<PedigreeLink[]>(
    () => (family ? pedigreeLinksOf(family) : []),
    [family],
  );
  const nodeIds = useMemo(
    () => (family?.people ?? []).map((person) => person.id),
    [family],
  );
  const nodeNames = useMemo(
    () =>
      new Map(
        (family?.people ?? []).map((person) => [person.id, person.name ?? '']),
      ),
    [family],
  );

  // Connectors take the codebook's colour for the relationship type, and
  // people their type's colour and shape, as on the Family Pedigree.
  const edgeColorSelector = useMemo(
    () => getEdgeColorForType(config?.relationshipType ?? ''),
    [config?.relationshipType],
  );
  const edgeColorName = useSelector(edgeColorSelector);
  const edgeColor = `var(--edge-${edgeColorName.replace('edge-color-seq-', '')})`;
  const personDefinition = config
    ? codebook.node?.[config.personType]
    : undefined;
  const nodeColor = personDefinition?.color ?? 'node-color-seq-1';
  const shapeDefinition = personDefinition?.shape;

  const shapeFor = (personId: string): NodeShape => {
    const person = family?.byId.get(personId);
    if (!shapeDefinition || !person) return 'circle';
    return resolveNodeShape(shapeDefinition, person.attributes);
  };
  const isAdopted = (personId: string) =>
    (family?.links ?? []).some(
      (link) => link.kind === 'adoptive' && link.target === personId,
    );

  // Plain-text per-person disease-status summary for screen readers. The
  // visual status markers are aria-hidden, so this is the only way a
  // screen-reader user learns who is affected/carrier/at-risk. It mirrors
  // whatever is currently shown (all diseases, or a single selected one) and is
  // announced via aria-describedby on the person. Returns null when there are
  // no diseases to describe.
  const statusSummaryFor = (personId: string): string | null => {
    if (shownDiseases.length === 0) return null;
    const parts = shownDiseases.map((disease) => {
      const status =
        displayedStatusesByDisease.get(disease.id)?.get(personId) ?? 'unknown';
      const statusText = getStatusLabel(status, intl);
      return intl.formatMessage(messages.diseaseStatus, {
        condition: disease.label,
        status: statusText,
      });
    });
    return intl.formatList(parts, { type: 'conjunction' });
  };

  const selectedDisease =
    selectedDiseaseId !== null
      ? shownDiseases.find((d) => d.id === selectedDiseaseId)
      : undefined;
  // Focusing a person highlights who contributes to THEIR inheritance of the
  // SELECTED condition, so it is only meaningful once a condition is chosen
  // from the key. Until then the focal affordance is disabled.
  const focalEnabled = selectedDisease !== undefined;

  // The person's symbol: plain, or — with a condition chosen — the condition's
  // status in standard pedigree notation. Drawn the same on screen and in the
  // printable snapshot.
  const renderSymbol = (personId: string): ReactNode => {
    const shape = shapeFor(personId);
    const label = labelFor(personId);
    const dimmed = !highlight.nodes.has(personId);
    const isSelected = personId === focalId;
    const adopted = isAdopted(personId);

    if (!selectedDisease) {
      return (
        <span className="relative inline-flex">
          {adopted && <AdoptionBrackets />}
          <Node
            presentational
            label={label}
            shape={shape}
            color={nodeColor}
            size="sm"
            selected={isSelected}
          />
        </span>
      );
    }

    // Single-condition symbol: a large white-backed Sticker drawing the
    // selected disease's status in standard pedigree notation, with the label
    // absolutely positioned below so it overflows into the row gap without
    // shifting the symbol's centre within the layout cell (where connectors
    // attach).
    const status =
      displayedStatusesByDisease.get(selectedDisease.id)?.get(personId) ??
      'unknown';
    const color = dimmed
      ? dimColor(selectedDisease.color)
      : selectedDisease.color;
    return (
      <span className="relative inline-flex size-24 items-center justify-center">
        {/* The focal person is marked with a downward arrow above the symbol,
            rather than a glow: the glow washed out the label and, being white,
            did not print. The arrow reads its colour from --np-label-color, so
            it is white on the dark interface and dark ink in the printed
            snapshot (which sets that variable), and it never obscures the label. */}
        {isSelected && (
          <svg
            aria-hidden
            viewBox="0 0 24 16"
            className="absolute top-0 left-1/2 h-4 w-6 -translate-x-1/2"
          >
            <path d="M12 15 L3 3 L21 3 Z" fill="var(--np-label-color, #fff)" />
          </svg>
        )}
        <span className="relative block size-16">
          {adopted && <AdoptionBrackets />}
          <Sticker
            status={status}
            color={color}
            shape={shape}
            size="100%"
            surfaceColor={dimmed ? dimColor('white') : undefined}
            nodeMode="single"
          />
          <span
            aria-hidden
            // Colour via a CSS variable so the printable snapshot document can
            // override it to a dark ink; on screen it falls back to white.
            className="absolute top-full left-1/2 mt-1 w-24 -translate-x-1/2 truncate text-center text-xs"
            style={{ color: 'var(--np-label-color, #fff)' }}
          >
            {withoutSoftHyphens(label)}
          </span>
        </span>
      </span>
    );
  };

  // --- The canvas: pan and zoom, as on the Family Pedigree ---------------
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const panZoom = usePanZoom({ viewportRef, contentRef });

  const personRefs = useRef(new Map<string, HTMLButtonElement>());
  const setPersonRef = useCallback(
    (personId: string) => (element: HTMLButtonElement | null) => {
      if (element) personRefs.current.set(personId, element);
      else personRefs.current.delete(personId);
    },
    [],
  );

  // The whole family, clear of the toolbar below it.
  const showWholeFamily = useCallback(
    ({ animated = true }: { animated?: boolean } = {}) => {
      const layout = contentRef.current?.firstElementChild;
      const viewport = viewportRef.current;
      if (!(layout instanceof HTMLElement) || !viewport) return;
      const toolbarTop = toolbarRef.current?.getBoundingClientRect().top;
      const viewportBottom = viewport.getBoundingClientRect().bottom;
      panZoom.fitToView(
        layout,
        {
          top: FIT_MARGIN,
          left: FIT_MARGIN,
          right: FIT_MARGIN,
          bottom:
            toolbarTop === undefined
              ? FIT_MARGIN
              : Math.max(FIT_MARGIN, viewportBottom - toolbarTop + 16),
        },
        { animated },
      );
    },
    [panZoom],
  );
  const zoomButtons = usePedigreeZoomButtons({
    panZoom,
    onShowWholeFamily: () => showWholeFamily(),
  });

  // The view opens on the whole family, once it is laid out.
  const fitted = useRef(false);
  const egoId = family?.egoId;
  useEffect(() => {
    if (fitted.current || nodeWidth === 0 || !egoId) return;
    if (!personRefs.current.has(egoId)) return;
    fitted.current = true;
    showWholeFamily({ animated: false });
  });

  // Roving focus: the family is a single tab stop, and the arrow keys move
  // between people by where they sit in the tree.
  const [lastFocusedId, setLastFocusedId] = useState<string | null>(null);
  const tabStopId = [lastFocusedId, egoId, ...nodeIds].find(
    (id) => id != null && family?.byId.has(id) === true,
  );

  const handlePersonFocus = (personId: string, event: FocusEvent) => {
    setLastFocusedId(personId);
    // The canvas does not scroll; keyboard focus pans to the person.
    if (
      event.target instanceof Element &&
      event.target.matches(':focus-visible')
    ) {
      const element = personRefs.current.get(personId);
      if (element) panZoom.bringIntoView(element);
    }
  };

  const focusOn = (personId: string) => {
    if (focalEnabled) setFocalId(personId);
  };

  // Escape, or a click on the canvas away from anyone, clears the focal
  // person. (A drag that pans the canvas ends without a click.)
  const handleCanvasKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && focalId !== null) {
      event.preventDefault();
      setFocalId(null);
    }
  };
  const handleCanvasClick = (event: MouseEvent) => {
    if (
      event.target instanceof Element &&
      !event.target.closest('[data-pedigree-member]')
    ) {
      setFocalId(null);
    }
  };

  // A person on the canvas: a button that focuses the view on them once a
  // condition is chosen, named for them and described by their status.
  const renderPerson = (personId: string): ReactNode => {
    const label = spokenLabelFor(personId);
    const dimmed = !highlight.nodes.has(personId);
    const statusSummary = statusSummaryFor(personId);
    const statusSummaryId = statusSummary ? `np-status-${personId}` : undefined;
    return (
      <div className="flex size-full items-center justify-center">
        <button
          ref={setPersonRef(personId)}
          type="button"
          data-pedigree-member="true"
          data-node-id={personId}
          data-dimmed={dimmed ? 'true' : 'false'}
          tabIndex={personId === tabStopId ? 0 : -1}
          aria-label={intl.formatMessage(messages.focusOn, {
            name: label || personId,
          })}
          aria-describedby={statusSummaryId}
          // Disabled (but still announced, with its status, and still a stop
          // for the arrow keys) until a condition is chosen.
          aria-disabled={focalEnabled ? undefined : true}
          aria-pressed={focalEnabled ? personId === focalId : undefined}
          className={cx(
            'focusable inline-flex items-center justify-center rounded-full focus-visible:outline-offset-6',
            focalEnabled ? 'cursor-pointer' : 'cursor-default',
          )}
          onClick={() => focusOn(personId)}
          onFocus={(event) => handlePersonFocus(personId, event)}
          onKeyDown={(event) =>
            focusNeighbourInDirection(personRefs.current, personId, event)
          }
        >
          {statusSummary && (
            <span id={statusSummaryId} className="sr-only">
              {statusSummary}
            </span>
          )}
          {renderSymbol(personId)}
        </button>
      </div>
    );
  };

  const selectedDiseaseLabel = selectedDisease ? selectedDisease.label : null;
  const focalLabel =
    focalId === null ? null : spokenLabelFor(focalId) || focalId;

  // Snapshot heading: the stage label, then the shown condition, then the focal
  // person when one is set — e.g. "Inheritance Pathways: Huntington's Disease —
  // inheritance for Leo".
  const snapshotTitle = useMemo(() => {
    const base = stageLabel;
    if (!selectedDiseaseLabel) return base;
    return focalLabel
      ? resolveMessage(stage.conditionText.snapshotInheritance, {
          title: base,
          condition: selectedDiseaseLabel,
          name: focalLabel,
        }).text
      : resolveMessage(stage.conditionText.snapshotCondition, {
          title: base,
          condition: selectedDiseaseLabel,
        }).text;
  }, [
    stageLabel,
    selectedDiseaseLabel,
    focalLabel,
    stage.conditionText,
    resolveMessage,
  ]);

  const snapshotFilename = useMemo(() => {
    const slug = snapshotTitle
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return `${slug || 'pedigree'}.png`;
  }, [snapshotTitle]);

  // Colour the snapshot's notation key in the shown condition's colour (matching
  // the pedigree), falling back to a vivid node colour for the plain view.
  const snapshotGlyphColour = selectedDisease?.color ?? 'var(--node-1)';

  // Capture the off-screen snapshot document once it has mounted and laid out.
  // PedigreeLayout lays out synchronously from measured dimensions, so a single
  // animation frame after the commit is enough for html-to-image to read it.
  // The document lays out the whole family at natural size, whatever part of
  // it the canvas is showing.
  useEffect(() => {
    if (!isCapturing) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      const element = snapshotRef.current;
      if (cancelled || !element) {
        setIsCapturing(false);
        return;
      }
      void exportSnapshot(element, snapshotFilename).finally(() => {
        if (!cancelled) setIsCapturing(false);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [isCapturing, snapshotFilename]);

  if (!config || !family) {
    // The schema requires the source stage to be a Family Pedigree, so this is
    // a broken protocol. The task error boundary reports it.
    throw new Error('The Narrative Pedigree source stage could not be found.');
  }

  const highlightedNodeIds = focalId !== null ? highlight.nodes : undefined;
  const highlightedEdgeKeys = focalId !== null ? highlight.edges : undefined;

  return (
    <div className="interface relative flex h-full w-full flex-col p-0">
      {measurementContainer}

      {/* Off-screen printable document, mounted only while a snapshot is being
          captured (light theme, whole pedigree at natural size, title + key). */}
      {isCapturing && (
        <PedigreeSnapshotDocument
          ref={snapshotRef}
          title={snapshotTitle}
          nodeIds={nodeIds}
          links={layoutLinks}
          nodeNames={nodeNames}
          edgeColor={edgeColor}
          nodeWidth={nodeWidth}
          nodeHeight={nodeHeight}
          renderNode={renderSymbol}
          highlightedNodeIds={highlightedNodeIds}
          highlightedEdgeKeys={highlightedEdgeKeys}
          glyphColour={snapshotGlyphColour}
          keyShape="circle"
          showAtRiskStatuses={showAtRiskStatuses}
          keyHeading={conditionWords.keyHeading}
          notationWords={conditionWords.notation}
          showKey={selectedDisease !== undefined}
        />
      )}

      {/* Visually-hidden aria-live region for announcing state changes */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        <AppMessage
          message={
            selectedDiseaseId === null
              ? focalId === null
                ? messages.showingAll
                : messages.showingAllFocused
              : focalId === null
                ? messages.showingCondition
                : messages.showingFocused
          }
          values={{
            condition: selectedDiseaseLabel ?? selectedDiseaseId ?? '',
            name: focalLabel ?? '',
          }}
        />
      </div>

      <ResizableFlexPanel
        reverse
        storageKey="np-key-panel"
        defaultBasis={26}
        min={16}
        max={45}
        minSizePx={300}
        className="min-h-0 w-full grow"
        aria-label={intl.formatMessage(messages.resizeKey)}
      >
        {/* Key panel — the resized (first) pane. In `reverse` mode it renders on
            the right edge and holds a fixed pixel minimum (minSizePx), so it
            never collapses; the pedigree pane gives up space instead, and the
            family can be panned and zoomed within it. */}
        <ConditionPanel
          words={conditionWords}
          diseases={diseases}
          selectedDiseaseId={selectedDiseaseId}
          onSelect={(id) => {
            setSelectedDiseaseId(id);
            // Focusing requires a single shown condition; clear it on return to
            // "all conditions" so a stale focal highlight never lingers.
            if (id === null) {
              setFocalId(null);
            }
          }}
          showAtRiskStatuses={showAtRiskStatuses}
          onSnapshot={() => setIsCapturing(true)}
        />

        {/* Pedigree pane — the flex (second) pane, rendered on the left: the
            Family Pedigree's canvas, with its zoom controls below. */}
        <div
          data-narrative-pedigree-view
          className="relative flex min-h-0 min-w-0 grow flex-col overflow-hidden"
        >
          <PedigreeViewport
            viewportRef={viewportRef}
            contentRef={contentRef}
            panZoom={panZoom}
            onKeyDown={handleCanvasKeyDown}
            onClick={handleCanvasClick}
          >
            <PedigreeLayout
              nodeIds={nodeIds}
              links={layoutLinks}
              nodeNames={nodeNames}
              edgeColor={edgeColor}
              nodeWidth={nodeWidth}
              nodeHeight={nodeHeight}
              renderNode={renderPerson}
              highlightedNodeIds={highlightedNodeIds}
              highlightedEdgeKeys={highlightedEdgeKeys}
            />
          </PedigreeViewport>
          <div
            ref={toolbarRef}
            className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2 px-4"
          >
            {focalId !== null && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <IconButton
                      size="sm"
                      variant="default"
                      aria-label={clearFocusText}
                      icon={
                        <Icon
                          name="RotateCcw"
                          aria-hidden="true"
                          className="size-[1em]"
                        />
                      }
                      className="pointer-events-auto"
                      onClick={() => setFocalId(null)}
                    />
                  }
                />
                <TooltipContent>{clearFocusText}</TooltipContent>
              </Tooltip>
            )}
            <SegmentedToolbar
              aria-label={intl.formatMessage(messages.zoomControls)}
              size="lg"
              className="pointer-events-auto max-w-full min-w-0"
            >
              {zoomButtons}
            </SegmentedToolbar>
          </div>
        </div>
      </ResizableFlexPanel>
    </div>
  );
}

/** Adopted: drawn within brackets, as pedigree nomenclature has it (and as the
 * Family Pedigree draws them). */
function AdoptionBrackets() {
  return (['left', 'right'] as const).map((side) => (
    <span
      key={side}
      aria-hidden
      className={cx(
        'pointer-events-none absolute -inset-y-2 w-3 border-solid border-current',
        side === 'left' ? '-left-4' : '-right-4',
      )}
      style={{
        borderTopWidth: EDGE_WIDTH,
        borderBottomWidth: EDGE_WIDTH,
        borderLeftWidth: side === 'left' ? EDGE_WIDTH : 0,
        borderRightWidth: side === 'right' ? EDGE_WIDTH : 0,
      }}
    />
  ));
}
