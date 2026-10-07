'use client';

import {
  MousePointer2,
  Scan,
  Unlink,
  Waypoints,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSelector } from 'react-redux';
import { v4 as uuid } from 'uuid';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Node from '@codaco/fresco-ui/Node';
import {
  SegmentedToolbar,
  ToolbarButton,
  ToolbarIconButton,
  ToolbarSeparator,
  ToolbarToggleGroup,
} from '@codaco/fresco-ui/SegmentedToolbar';
import type { FramingId } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  isFamilyPedigreeStageMetadata,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import Prompts from '../../components/Prompts/Prompts';
import { usePrompts } from '../../components/Prompts/usePrompts';
import { useCurrentStep } from '../../contexts/CurrentStepContext';
import useBeforeNext from '../../hooks/useBeforeNext';
import { useNodeMeasurement } from '../../hooks/useNodeMeasurement';
import useReadyForNextStage from '../../hooks/useReadyForNextStage';
import { useStageSelector } from '../../hooks/useStageSelector';
import {
  getEdgeColorForType,
  getNetworkEdges,
  getNetworkNodes,
  getNodeColorSelector,
  getStageMetadata,
  resolveNodeShape,
} from '../../selectors/session';
import { getCodebook } from '../../store/modules/protocol';
import {
  addEdge,
  addNode,
  deleteEdge,
  deleteNode,
  updateEdge,
  updateNode,
  updateStageMetadata,
} from '../../store/modules/session';
import { useAppDispatch } from '../../store/store';
import type { StageProps } from '../../types';
import {
  type CompletenessItem,
  evaluateCompleteness,
  RELATIVES_NOT_RECORDED,
  relativesToAskAbout,
} from './completeness';
import AddRelativeMenu from './components/AddRelativeMenu';
import CompletenessTracker from './components/CompletenessTracker';
import ConnectMenu, { type ConnectPair } from './components/ConnectMenu';
import ConnectorPreview from './components/ConnectorPreview';
import FramingControl from './components/FramingControl';
import PersonDrawer from './components/PersonDrawer';
import PersonForm, {
  type PersonDraft,
  type PersonFormMode,
  type PersonFormResult,
} from './components/PersonForm';
import PersonNode from './components/PersonNode';
import { formatPersonLabel, labelFamily } from './kinship';
import { messages } from './messages';
import {
  areConnected,
  type Connection,
  missingDetailsFor,
  type PedigreeConfig,
  pedigreeConfigFromStage,
  planAddRelative,
  planConnection,
  type PlannedLink,
  planRemovePerson,
  readFamily,
  type Family,
  type Person,
  type Relation,
} from './model';
import PedigreeLayout from './pedigree-layout/components/PedigreeLayout';
import type { PedigreeLink } from './pedigree-layout/types';
import {
  ARROW_DIRECTIONS,
  nearestInDirection,
  type Point,
} from './spatialNavigation';
import { usePanZoom, useZoomLimits, type View } from './usePanZoom';

/**
 * What selecting a person does: open their details (with their add menu on
 * hover or focus), or pick them as one of two people to connect, or to
 * disconnect.
 */
// The toolbar rises in a moment after the stage appears, and the choice of
// words, when the participant has it to make, opens once the toolbar is in.
const TOOLBAR_ENTRANCE_DELAY = 300;
const FRAMING_OPEN_DELAY = 1200;

type Tool = 'pointer' | 'connect' | 'disconnect';
const TOOLS: readonly string[] = ['pointer', 'connect', 'disconnect'];
const isTool = (value: unknown): value is Tool =>
  typeof value === 'string' && TOOLS.includes(value);

type PanelState = {
  open: boolean;
  /** Changes for every opening, so the form starts fresh. */
  key: string;
  mode: PersonFormMode;
  /** Adding: ids for the new person (first) and any unnamed parents their
   * relationship needs, fixed for the opening so the person drawn while the
   * form is filled in is the one added. */
  ids: string[];
} | null;

/** The attributes recording a link. */
const linkAttributesFor = (config: PedigreeConfig, link: PlannedLink) => ({
  [config.kindAttribute]: [link.kind],
  ...(link.kind === 'partner'
    ? { [config.currentPartnerAttribute]: link.isCurrentPartner ?? true }
    : {
        [config.gestationalCarrierAttribute]:
          link.isGestationalCarrier ?? false,
      }),
});

/** Everything to create to add a relative, under the panel's ids. */
const planAddition = (
  family: Family,
  config: PedigreeConfig,
  anchorId: string,
  ids: readonly string[],
  details: PersonDraft['details'],
  request: PersonDraft['request'],
) => {
  let next = 1;
  return planAddRelative({
    family,
    anchorId,
    newPersonId: ids[0] ?? uuid(),
    details,
    request,
    createId: () => ids[next++] ?? uuid(),
    sexAttribute: config.sexAssignedAtBirthAttribute,
  });
};

const FamilyPedigree = ({ stage }: StageProps<'FamilyPedigree'>) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { currentStep } = useCurrentStep();
  const { confirm } = useDialog();
  const formId = useId();

  const config = useMemo(() => pedigreeConfigFromStage(stage), [stage]);
  const formFields = useMemo(() => stage.form?.fields ?? [], [stage.form]);

  // The stage's first prompt builds the family. Each prompt after it asks who
  // in the family something applies to: selecting a person marks them, and
  // selecting them again unmarks them. The family itself cannot be changed
  // while one is showing.
  const { prompt, prompts } = usePrompts();
  const nomination = stage.nominationPrompts?.find(
    (candidate) => candidate.id === prompt.id,
  );
  const isNominated = (person: Person) =>
    nomination !== undefined &&
    person.attributes[nomination.attribute] === true;
  // A prompt limited to one sex at birth leaves out people recorded as the
  // other; anyone whose sex at birth is not known either way can be chosen.
  const canNominate = (person: Person) => {
    const only = nomination?.onlyForSexAssignedAtBirth;
    const sex = person.sexAssignedAtBirth;
    return !only || (sex !== 'female' && sex !== 'male') || sex === only;
  };

  const nodes = useStageSelector(getNetworkNodes);
  const edges = useStageSelector(getNetworkEdges);
  const family = useMemo(
    () => readFamily(nodes, edges, config),
    [nodes, edges, config],
  );

  // The person being added is drawn in the family from the moment the panel
  // opens, as the form stands, and only recorded when the participant adds
  // them. `shown` is the family drawn; everything else reads `family`.
  const [draft, setDraft] = useState<
    (PersonDraft & { anchorId: string; ids: string[] }) | null
  >(null);
  const shown = useMemo(() => {
    if (!draft) return family;
    const plan = planAddition(
      family,
      config,
      draft.anchorId,
      draft.ids,
      draft.details,
      draft.request,
    );
    // While the addition is being recorded, part of it is already real.
    const draftNodes: NcNode[] = plan.people
      .filter((person) => !family.byId.has(person.id))
      .map((person) => ({
        [entityPrimaryKeyProperty]: person.id,
        type: config.personType,
        [entityAttributesProperty]: person.details,
      }));
    const draftEdges: NcEdge[] = plan.links
      .filter(
        (link) =>
          !family.links.some(
            (existing) =>
              existing.source === link.source &&
              existing.target === link.target,
          ),
      )
      .map((link, index) => ({
        [entityPrimaryKeyProperty]: `draft-${index}`,
        type: config.relationshipType,
        from: link.source,
        to: link.target,
        [entityAttributesProperty]: linkAttributesFor(config, link),
      }));
    return readFamily(
      [...nodes, ...draftNodes],
      [...edges, ...draftEdges],
      config,
    );
  }, [draft, family, nodes, edges, config]);
  const nodeColor = useStageSelector(getNodeColorSelector);
  // Connectors, and the preview of a new one, take the codebook's colour for
  // the relationship type ('edge-color-seq-N' is the CSS variable --edge-N).
  const edgeColorSelector = useMemo(
    () => getEdgeColorForType(config.relationshipType),
    [config.relationshipType],
  );
  const edgeColorName = useSelector(edgeColorSelector);
  const edgeColor = `var(--edge-${edgeColorName.replace('edge-color-seq-', '')})`;
  const codebook = useSelector(getCodebook);
  // A person's symbol is the person type's shape in the codebook, which the
  // researcher may map to one of their attributes, such as gender identity
  // or sex assigned at birth.
  const shapeDefinition = codebook.node?.[config.personType]?.shape;

  // The gender identity question offers the attribute's own options, with
  // the labels the researcher gave them.
  const genderIdentityAttribute = config.genderIdentity?.attribute;
  const genderIdentityOptions = useMemo(() => {
    if (genderIdentityAttribute === undefined) return [];
    const definition =
      codebook.node?.[config.personType]?.variables?.[genderIdentityAttribute];
    return definition?.type === 'categorical' ? definition.options : [];
  }, [codebook, config.personType, genderIdentityAttribute]);

  const requiredFormVariables = useMemo(() => {
    const variables = codebook.node?.[config.personType]?.variables ?? {};
    return formFields
      .map((field) => field.variable)
      .filter((variable) => {
        const definition = variables[variable];
        return (
          definition !== undefined &&
          'validation' in definition &&
          definition.validation?.required === true
        );
      });
  }, [codebook, config.personType, formFields]);

  // The details a person must have given: the name only when the codebook
  // requires the name attribute, and gender identity only where the stage
  // asks it.
  const nameRequired = useMemo(() => {
    const definition =
      codebook.node?.[config.personType]?.variables?.[config.nameAttribute];
    return (
      definition !== undefined &&
      'validation' in definition &&
      definition.validation?.required === true
    );
  }, [codebook, config.personType, config.nameAttribute]);
  const detailsConfig = useMemo(
    () => ({ genderIdentity: config.genderIdentity, nameRequired }),
    [config.genderIdentity, nameRequired],
  );

  // The participant is always on the canvas: create them on first visit.
  const creatingEgo = useRef(false);
  useEffect(() => {
    if (family.egoId || creatingEgo.current) return;
    creatingEgo.current = true;
    void dispatch(
      addNode({
        type: config.personType,
        attributeData: { [config.egoAttribute]: true },
        modelData: { [entityPrimaryKeyProperty]: uuid() },
        currentStep,
      }),
    );
  }, [family.egoId, dispatch, config, currentStep]);

  // The add menu and the details panel are separate. The menu shows around
  // the person the mouse is over, or else the person keyboard focus is on (or
  // in their menu); the selected person has their details open in the panel.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // The person the family's single tab stop returns to.
  const [lastFocusedId, setLastFocusedId] = useState<string | null>(null);
  // On a first visit — the participant alone on the canvas — the add menu is
  // showing around them from the outset.
  const initialFocusChecked = useRef(false);
  useEffect(() => {
    if (!family.egoId || initialFocusChecked.current) return;
    initialFocusChecked.current = true;
    if (family.people.length === 1) setFocusedId(family.egoId);
  }, [family.egoId, family.people.length]);

  const [panel, setPanel] = useState<PanelState>(null);
  // The person whose details are open, or who is being added.
  const selectedId = !panel?.open
    ? null
    : panel.mode.kind === 'edit'
      ? panel.mode.person.id
      : (panel.ids[0] ?? null);

  // The connect tool links two people already shown, and the disconnect tool
  // takes such a link away: the first person selected waits (`linkingId`)
  // for the second, and then a menu asks how the pair are related, or a
  // confirmation whether to remove their connection.
  const [tool, setTool] = useState<Tool>('pointer');
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [chosenPair, setChosenPair] = useState<ConnectPair | null>(null);
  // Why the last selection was refused, shown in place of the instruction.
  const [connectNotice, setConnectNotice] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const panZoom = usePanZoom({ viewportRef, contentRef });
  const zoomLimits = useZoomLimits(panZoom.scale);
  const promptRef = useRef<HTMLDivElement>(null);
  const toolbarAreaRef = useRef<HTMLDivElement>(null);
  // The whole family, clear of the prompt above and the toolbar below.
  // How far in from each edge of the canvas the prompt and the toolbar leave
  // it clear.
  const clearInsets = useCallback(() => {
    const viewport = viewportRef.current;
    const toolbarTop = toolbarAreaRef.current?.getBoundingClientRect().top;
    const viewportBottom = viewport?.getBoundingClientRect().bottom;
    return {
      top: promptRef.current?.offsetHeight ?? 0,
      bottom:
        toolbarTop === undefined || viewportBottom === undefined
          ? 32
          : viewportBottom - toolbarTop + 16,
      left: 32,
      right: 32,
    };
  }, []);
  const showWholeFamily = useCallback(
    ({ animated = true }: { animated?: boolean } = {}) => {
      const layout = contentRef.current?.firstElementChild;
      if (!(layout instanceof HTMLElement)) return;
      panZoom.fitToView(layout, clearInsets(), { animated });
    },
    [panZoom, clearInsets],
  );

  // No menu while the panel is open: it would offer to add to someone else
  // mid-way through describing this person. Nor while connecting or
  // disconnecting people.
  const menuPersonId =
    panel?.open || tool !== 'pointer' || nomination
      ? null
      : (hoveredId ?? focusedId);
  const menuPerson = menuPersonId ? family.byId.get(menuPersonId) : undefined;
  const [announcement, setAnnouncement] = useState('');

  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const setNodeRef = useCallback(
    (personId: string) => (element: HTMLButtonElement | null) => {
      if (element) nodeRefs.current.set(personId, element);
      else nodeRefs.current.delete(personId);
    },
    [],
  );

  // A person is shown by name, or by how they are related to the participant
  // when their name is not known, in the words of the stage's framing. A
  // stage may leave the framing to the participant, who can change it from
  // the toolbar at any time. The choice is open when the stage loads until
  // they have made it, and until then the words that assume no gender are
  // used.
  const stageMetadata = useStageSelector(getStageMetadata);
  const chosenFraming = isFamilyPedigreeStageMetadata(stageMetadata)
    ? stageMetadata.framing
    : undefined;
  const framingSetting = stage.framing ?? 'gendered';
  const participantFraming = framingSetting === 'participantPreference';
  // Opened a moment after the stage loads, once the toolbar is in, so the
  // participant sees the rest of the interface first.
  const [framingOpen, setFramingOpen] = useState(false);
  const askFramingOnLoad = useRef(
    participantFraming && chosenFraming === undefined,
  );
  useEffect(() => {
    if (!askFramingOnLoad.current) return;
    const timer = setTimeout(() => setFramingOpen(true), FRAMING_OPEN_DELAY);
    return () => clearTimeout(timer);
  }, []);
  const reduceMotion = useReducedMotion();
  const framing =
    framingSetting === 'participantPreference'
      ? (chosenFraming ?? 'gamete')
      : framingSetting;
  const chooseFraming = useCallback(
    (chosen: FramingId) => {
      dispatch(
        updateStageMetadata({ currentStep, metadata: { framing: chosen } }),
      );
    },
    [dispatch, currentStep],
  );
  const labels = useMemo(() => labelFamily(shown, framing), [shown, framing]);
  const displayName = useCallback(
    (personId: string) => {
      const label = labels.get(personId);
      return label
        ? formatPersonLabel(label, intl)
        : intl.formatMessage(messages.familyMember);
    },
    [labels, intl],
  );

  // Announce an addition once the new person is in the family, so they can be
  // described by how they are related when they have no name.
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  useEffect(() => {
    if (!justAddedId || !family.byId.has(justAddedId)) return;
    setAnnouncement(
      intl.formatMessage(messages.addedAnnouncement, {
        name: displayName(justAddedId),
      }),
    );
    setJustAddedId(null);
  }, [justAddedId, family.byId, displayName, intl]);

  const links: PedigreeLink[] = useMemo(
    () =>
      shown.links.map((link) => ({
        source: link.source,
        target: link.target,
        kind: link.kind,
        isActive: link.isCurrentPartner,
        isGestationalCarrier: link.isGestationalCarrier,
      })),
    [shown.links],
  );
  const nodeIds = useMemo(
    () => shown.people.map((person) => person.id),
    [shown.people],
  );
  const nodeNames = useMemo(
    () => new Map(shown.people.map((person) => [person.id, person.name ?? ''])),
    [shown.people],
  );

  const { nodeWidth, nodeHeight, measurementContainer } = useNodeMeasurement({
    component: <Node size="sm" />,
  });

  // Each prompt opens on the whole family, once the participant's symbol is
  // laid out. The stage's first appears there at once; moving between
  // prompts glides to it.
  const fittedForPrompt = useRef<string | null>(null);
  useEffect(() => {
    if (fittedForPrompt.current === prompt.id) return;
    if (!family.egoId || nodeWidth === 0) return;
    if (!nodeRefs.current.has(family.egoId)) return;
    const first = fittedForPrompt.current === null;
    fittedForPrompt.current = prompt.id;
    showWholeFamily({ animated: !first });
  });
  const nominating = nomination !== undefined;

  // Adding someone can move everyone else in the layout. The person in
  // question (the one selected, focused, or else the participant) stays where
  // they are on screen, and the family moves around them.
  const heldPosition = useRef<{ id: string; x: number; y: number } | null>(
    null,
  );
  useLayoutEffect(() => {
    const id = selectedId ?? focusedId ?? family.egoId;
    const element = id ? nodeRefs.current.get(id) : undefined;
    if (!id || !element) {
      heldPosition.current = null;
      return;
    }
    const previous = heldPosition.current;
    if (previous?.id === id) panZoom.holdInPlace(element, previous);
    heldPosition.current = { id, ...panZoom.contentPositionOf(element) };
  });

  // The person selected moves to the middle of the part of the screen the
  // side panel leaves uncovered. Someone being added, and the panel itself,
  // are drawn a moment after the panel opens, so this waits for both.
  useEffect(() => {
    if (!selectedId) return;
    let frame = 0;
    let framesLeft = 30;
    const centre = () => {
      const element = nodeRefs.current.get(selectedId);
      const drawer = drawerRef.current;
      if ((!element || !drawer) && framesLeft-- > 0) {
        frame = requestAnimationFrame(centre);
        return;
      }
      if (!element) return;
      // A panel as wide as the screen leaves nothing beside it, so the
      // person is centred on the whole canvas.
      const visibleRight = window.innerWidth - (drawer?.offsetWidth ?? 0);
      const canvasLeft = viewportRef.current?.getBoundingClientRect().left ?? 0;
      panZoom.centreOn(element, {
        visibleRight:
          visibleRight - canvasLeft > 160 ? visibleRight : undefined,
      });
    };
    frame = requestAnimationFrame(centre);
    return () => cancelAnimationFrame(frame);
  }, [selectedId, panZoom]);

  // Closing the panel puts the view back as it was when the panel opened:
  // the same zoom, with the person it was opened from where they were on
  // screen. (While it is open, the panel holds pointer input away from the
  // canvas, so nothing else has moved it.) An addition grows the family
  // around that person; if the one added would be out of sight, the view
  // moves just far enough to show them.
  const viewBeforePanel = useRef<{
    view: View;
    anchorId: string;
    anchorAt: Point;
    subjectId: string;
  } | null>(null);
  const rememberView = (anchorId: string, subjectId: string) => {
    if (panel?.open) return;
    const anchor = nodeRefs.current.get(anchorId);
    viewBeforePanel.current = anchor
      ? {
          view: panZoom.view(),
          anchorId,
          anchorAt: panZoom.contentPositionOf(anchor),
          subjectId,
        }
      : null;
  };
  useEffect(() => {
    if (selectedId) return;
    const before = viewBeforePanel.current;
    viewBeforePanel.current = null;
    const viewport = viewportRef.current;
    if (!before || !viewport) return;
    const { scale } = before.view;
    let { x, y } = before.view;
    const anchor = nodeRefs.current.get(before.anchorId);
    if (anchor) {
      const now = panZoom.contentPositionOf(anchor);
      x += (before.anchorAt.x - now.x) * scale;
      y += (before.anchorAt.y - now.y) * scale;
    }
    const subject = nodeRefs.current.get(before.subjectId);
    if (subject && subject !== anchor) {
      const at = panZoom.contentPositionOf(subject);
      const halfWidth = (subject.offsetWidth / 2) * scale;
      const halfHeight = (subject.offsetHeight / 2) * scale;
      const insets = clearInsets();
      const left = insets.left + halfWidth;
      const right = viewport.clientWidth - insets.right - halfWidth;
      const top = insets.top + halfHeight;
      const bottom = viewport.clientHeight - insets.bottom - halfHeight;
      const screenX = x + at.x * scale;
      const screenY = y + at.y * scale;
      if (screenX < left) x += left - screenX;
      else if (screenX > right) x -= screenX - right;
      if (screenY < top) y += top - screenY;
      else if (screenY > bottom) y -= screenY - bottom;
    }
    panZoom.goTo({ x, y, scale });
  }, [selectedId, panZoom, clearInsets]);

  const openAddPanel = (relation: Relation, anchor: Person) => {
    // The new person, and up to two unnamed parents for a sibling.
    const ids = [uuid(), uuid(), uuid()];
    rememberView(anchor.id, ids[0] ?? anchor.id);
    setPanel({
      open: true,
      key: uuid(),
      mode: { kind: 'add', relation, anchor },
      ids,
    });
  };

  const openAdd = (relation: Relation) => {
    if (menuPerson) openAddPanel(relation, menuPerson);
  };

  // How far the family is from what the researcher requires (or recommends)
  // before the participant continues.
  const completeness = stage.completeness;
  const progress = useMemo(
    () =>
      completeness
        ? evaluateCompleteness(
            family,
            completeness.scope,
            (person) =>
              missingDetailsFor(person, requiredFormVariables, detailsConfig)
                .length > 0,
          )
        : null,
    [family, completeness, requiredFormVariables, detailsConfig],
  );
  const [trackerOpen, setTrackerOpen] = useState(false);

  // Reaching a nomination prompt puts away whatever was under way in
  // building the family.
  useEffect(() => {
    if (!nominating) return;
    setDraft(null);
    setPanel((current) => (current ? { ...current, open: false } : null));
    setTool('pointer');
    setLinkingId(null);
    setChosenPair(null);
    setConnectNotice(null);
    setHoveredId(null);
    setFocusedId(null);
    setTrackerOpen(false);
  }, [nominating]);

  // A complete checklist tells the interview the stage is ready, which marks
  // the Next button.
  const { updateReady } = useReadyForNextStage();
  const checklistComplete = progress !== null && progress.items.length === 0;
  useEffect(() => {
    updateReady(checklistComplete);
  }, [updateReady, checklistComplete]);

  // Next is held back, with the list of what is still needed shown, until
  // the family is complete. A recommendation lets the participant through on
  // pressing Next again with the list already open.
  // (Pressing Next closes the list, as a press outside it, before this runs;
  // so a recommendation remembers that it has been shown instead.)
  const shownBeforeNext = useRef(false);
  useBeforeNext((direction) => {
    if (direction !== 'forwards' || !progress || !completeness) return true;
    // Only the family's own prompt asks for it to be complete.
    if (nomination) return true;
    if (progress.items.length === 0) return true;
    if (completeness.enforcement === 'recommended' && shownBeforeNext.current) {
      return true;
    }
    shownBeforeNext.current = true;
    setTrackerOpen(true);
    return false;
  });

  // Each item in the list leads to where it is resolved: adding the missing
  // parent, or the person's details, which ask about their siblings and
  // children.
  // Answering from the list that a person has no siblings or children
  // records it as the details panel's question would. "Don't know" is
  // answered in the panel.
  const handleTrackerAnswer = async (item: CompletenessItem) => {
    const attribute = config.relativesNotRecordedAttribute;
    const person = family.byId.get(item.personId);
    if (!attribute || !person) return;
    if (item.kind !== 'siblings' && item.kind !== 'children') return;
    const group = RELATIVES_NOT_RECORDED[item.kind];
    const recorded = person.relativesNotRecorded.filter(
      (value) => value !== group.none && value !== group.unknown,
    );
    await dispatch(
      updateNode({
        nodeId: person.id,
        attributePatch: {
          set: { [attribute]: [...recorded, group.none] },
          unset: [],
        },
        currentStep,
      }),
    );
    setAnnouncement(
      intl.formatMessage(
        item.kind === 'siblings'
          ? messages.siblingsAnsweredAnnouncement
          : messages.childrenAnsweredAnnouncement,
        {
          isYou: person.isEgo ? 'true' : 'false',
          name: displayName(person.id),
        },
      ),
    );
  };

  const handleTrackerItem = (item: CompletenessItem) => {
    const person = family.byId.get(item.personId);
    if (!person) return;
    chooseTool('pointer');
    if (item.kind === 'parents') {
      openAddPanel('parent', person);
    } else {
      openEdit(person.id);
    }
  };

  const openEdit = (personId: string) => {
    const person = family.byId.get(personId);
    if (!person) return;
    rememberView(personId, personId);
    setPanel({
      open: true,
      key: uuid(),
      mode: {
        kind: 'edit',
        person,
        missing: missingDetailsFor(
          person,
          requiredFormVariables,
          detailsConfig,
        ),
      },
      ids: [],
    });
  };

  const closePanel = () =>
    setPanel((current) => (current ? { ...current, open: false } : null));

  // Cancelling (or dismissing the panel) takes away the person being added.
  const cancelPanel = () => {
    setDraft(null);
    closePanel();
  };

  const handleDraftChange = (next: PersonDraft) => {
    if (!panel?.open || panel.mode.kind !== 'add') return;
    setDraft({ ...next, anchorId: panel.mode.anchor.id, ids: panel.ids });
  };

  // Keyboard focus shows the menu; focus from a click (or returned there by
  // the panel after a click) does not, so for a mouse user the menu follows
  // the pointer alone.
  const handleFocusPerson = (personId: string, event: React.FocusEvent) => {
    setLastFocusedId(personId);
    if (
      event.target instanceof Element &&
      event.target.matches(':focus-visible')
    ) {
      setFocusedId(personId);
      // The canvas does not scroll; keyboard focus pans to the person.
      const element = nodeRefs.current.get(personId);
      if (element) panZoom.bringIntoView(element);
    }
  };

  // The mouse shows a person's menu while it is over them. Leaving waits a
  // moment, so the pointer can cross the gap between the person and a button.
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(hoverLeaveTimer.current), []);
  const handlePersonPointerEnter = (
    personId: string,
    event: React.PointerEvent,
  ) => {
    if (event.pointerType !== 'mouse') return;
    clearTimeout(hoverLeaveTimer.current);
    setHoveredId(personId);
  };
  const handlePersonPointerLeave = (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    clearTimeout(hoverLeaveTimer.current);
    // The connector line lets go of a person at once; the add menu waits.
    if (tool !== 'pointer') setHoveredId(null);
    else hoverLeaveTimer.current = setTimeout(() => setHoveredId(null), 300);
  };

  // A touch screen has no hover, so a tap leaves the person's menu showing
  // once their details panel closes.
  const lastPointerType = useRef<string | null>(null);

  // Selecting a person (click, tap, Enter or Space) opens their details. The
  // panel returns focus to them when it closes.
  const handleActivate = (personId: string) => {
    if (nomination) {
      setLastFocusedId(personId);
      const person = family.byId.get(personId);
      if (!person || !canNominate(person)) return;
      void dispatch(
        updateNode({
          nodeId: personId,
          attributePatch: {
            set: { [nomination.attribute]: !isNominated(person) },
            unset: [],
          },
          currentStep,
        }),
      );
      return;
    }
    if (tool !== 'pointer') {
      handlePairSelect(personId);
      return;
    }
    setLastFocusedId(personId);
    if (lastPointerType.current === 'touch') setFocusedId(personId);
    lastPointerType.current = null;
    openEdit(personId);
  };

  // Roving focus: the family is a single tab stop, and the arrow keys move
  // between people by where they sit in the tree.
  // Someone a nomination prompt cannot apply to cannot be focused, so is
  // never the tab stop.
  const tabStopId = [
    lastFocusedId,
    family.egoId,
    ...family.people.map((person) => person.id),
  ].find((id) => {
    const person = id ? family.byId.get(id) : undefined;
    return person !== undefined && (!nomination || canNominate(person));
  });

  const handleNodeKeyDown = (
    personId: string,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    const direction = ARROW_DIRECTIONS[event.key];
    if (!direction) return;
    event.preventDefault();
    const centreOf = (element: HTMLElement): Point => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    const current = nodeRefs.current.get(personId);
    if (!current) return;
    const candidates = new Map<string, Point>();
    for (const [id, element] of nodeRefs.current) {
      if (id !== personId && !element.disabled) {
        candidates.set(id, centreOf(element));
      }
    }
    const next = nearestInDirection(centreOf(current), candidates, direction);
    if (next) nodeRefs.current.get(next)?.focus();
  };

  // Clicking anywhere on the stage but a person hides the add menu. The side
  // panel is portalled out of the stage's DOM, so its clicks (which still
  // bubble here through React) are ignored.
  const handleStagePointerDown = (event: React.PointerEvent) => {
    const { target, currentTarget } = event;
    if (
      target instanceof Element &&
      currentTarget.contains(target) &&
      !target.closest('[data-testid="pedigree-person"]')
    ) {
      setFocusedId(null);
      setHoveredId(null);
      setLinkingId(null);
      setConnectNotice(null);
    }
  };

  // Focus leaving the family for the rest of the page (Tab past the canvas)
  // hides the add menu. Focus moving into the side panel keeps it for when
  // the panel closes; focus moving to nothing (a click on a non-focusable
  // area) is left to the pointer handler above.
  const handleCanvasBlur = (event: React.FocusEvent) => {
    const next = event.relatedTarget;
    if (
      next instanceof Element &&
      !event.currentTarget.contains(next) &&
      !next.closest('[data-testid="pedigree-person-panel"]')
    ) {
      setFocusedId(null);
    }
  };

  const linkAttributes = (link: PlannedLink) => linkAttributesFor(config, link);

  const addLink = (link: PlannedLink) =>
    dispatch(
      addEdge({
        from: link.source,
        to: link.target,
        type: config.relationshipType,
        attributeData: linkAttributes(link),
        currentStep,
      }),
    ).unwrap();

  // Recording a sibling or child replaces any earlier answer that there are
  // none, or that the participant didn't know.
  const clearRelativesAnswers = async (
    personIds: readonly string[],
    relatives: 'siblings' | 'children',
  ) => {
    const notRecordedAttribute = config.relativesNotRecordedAttribute;
    if (!notRecordedAttribute) return;
    const group = RELATIVES_NOT_RECORDED[relatives];
    const answers: readonly string[] = [group.none, group.unknown];
    for (const personId of personIds) {
      const recorded = family.byId.get(personId)?.relativesNotRecorded ?? [];
      if (!recorded.some((value) => answers.includes(value))) continue;
      await dispatch(
        updateNode({
          nodeId: personId,
          attributePatch: {
            set: {
              [notRecordedAttribute]: recorded.filter(
                (value) => !answers.includes(value),
              ),
            },
            unset: [],
          },
          currentStep,
        }),
      );
    }
  };

  const handleSubmit = async (result: PersonFormResult) => {
    if (!panel) return;
    const { mode } = panel;
    closePanel();

    if (mode.kind === 'edit') {
      await dispatch(
        updateNode({
          nodeId: mode.person.id,
          attributePatch: {
            set: result.set,
            unset: result.unset.filter((variable) => !(variable in result.set)),
          },
          currentStep,
        }),
      );

      for (const update of result.linkUpdates ?? []) {
        await dispatch(
          updateEdge({
            edgeId: update.linkId,
            attributePatch: {
              set: {
                [config.kindAttribute]: [update.kind],
                ...(update.kind === 'partner'
                  ? {
                      [config.currentPartnerAttribute]: update.isCurrentPartner,
                    }
                  : {
                      [config.gestationalCarrierAttribute]:
                        update.isGestationalCarrier,
                    }),
              },
              unset: [],
            },
          }),
        );
      }
      setAnnouncement(intl.formatMessage(messages.savedAnnouncement));
      return;
    }

    if (!result.request) {
      setDraft(null);
      return;
    }
    const plan = planAddition(
      family,
      config,
      mode.anchor.id,
      panel.ids,
      result.set,
      result.request,
    );
    const newPersonId = plan.people[0]?.id ?? '';
    for (const person of plan.people) {
      await dispatch(
        addNode({
          type: config.personType,
          attributeData: person.details,
          modelData: { [entityPrimaryKeyProperty]: person.id },
          currentStep,
        }),
      ).unwrap();
    }
    for (const link of plan.links) await addLink(link);
    const request = result.request;
    if (request.relation === 'sibling') {
      await clearRelativesAnswers([mode.anchor.id], 'siblings');
    } else if (request.relation === 'child') {
      const otherParent =
        request.otherParent && request.otherParent !== 'unknown'
          ? [request.otherParent]
          : [];
      await clearRelativesAnswers([mode.anchor.id, ...otherParent], 'children');
    }
    // Recorded: the people drawn are now the family's own.
    setDraft(null);
    setJustAddedId(newPersonId);
  };

  const chooseTool = (next: Tool) => {
    setTool(next);
    setLinkingId(null);
    setConnectNotice(null);
    setChosenPair(null);
    setHoveredId(null);
    setFocusedId(null);
  };

  // Two people in a sentence, the participant first, as "you and …".
  const pairArgs = (a: string, b: string) => {
    const isYou = (id: string) => family.byId.get(id)?.isEgo === true;
    const [first, second] = isYou(b) ? [b, a] : [a, b];
    return {
      firstIsYou: isYou(first) ? 'true' : 'false',
      first: displayName(first),
      second: displayName(second),
    };
  };

  const refuse = (notice: string) => {
    setConnectNotice(notice);
    setAnnouncement(notice);
  };

  const handlePairSelect = (personId: string) => {
    setLastFocusedId(personId);
    setConnectNotice(null);
    if (chosenPair) return;
    if (!linkingId) {
      setLinkingId(personId);
      setAnnouncement(
        intl.formatMessage(
          tool === 'connect'
            ? messages.connectHintLinking
            : messages.disconnectHintLinking,
          {
            isYou: family.byId.get(personId)?.isEgo ? 'true' : 'false',
            name: displayName(personId),
          },
        ),
      );
      return;
    }
    if (linkingId === personId) {
      // Selecting the first person again lets them go.
      setLinkingId(null);
      return;
    }
    // A pair has one link at most; when the second person cannot be chosen,
    // the first stays selected.
    const connected = areConnected(family, linkingId, personId);
    if (tool === 'connect' && connected) {
      refuse(
        intl.formatMessage(
          messages.connectAlreadyConnected,
          pairArgs(linkingId, personId),
        ),
      );
      return;
    }
    if (tool === 'disconnect' && !connected) {
      refuse(
        intl.formatMessage(
          messages.disconnectNotConnected,
          pairArgs(linkingId, personId),
        ),
      );
      return;
    }
    setChosenPair({ firstId: linkingId, secondId: personId });
    if (tool === 'disconnect') void handleDisconnect(linkingId, personId);
  };

  const endConnecting = () => {
    setChosenPair(null);
    setLinkingId(null);
  };

  const handleConnect = async (connection: Connection, description: string) => {
    endConnecting();
    await addLink(planConnection(connection));
    if (connection.kind === 'parent') {
      const { parentId, childId } = connection;
      await clearRelativesAnswers([parentId], 'children');
      // The parent's other children are now the child's siblings.
      const hasOtherChildren = family.links.some(
        (link) =>
          link.kind !== 'partner' &&
          link.source === parentId &&
          link.target !== childId,
      );
      if (hasOtherChildren) await clearRelativesAnswers([childId], 'siblings');
    }
    setAnnouncement(description);
  };

  const handleDisconnect = async (firstId: string, secondId: string) => {
    const args = pairArgs(firstId, secondId);
    await confirm({
      title: intl.formatMessage(messages.disconnectConfirmTitle, args),
      description: intl.formatMessage(messages.disconnectConfirmDescription),
      confirmLabel: intl.formatMessage(messages.disconnectConfirm),
      intent: 'destructive',
      onConfirm: () => {
        for (const link of family.links) {
          if (
            (link.source === firstId && link.target === secondId) ||
            (link.source === secondId && link.target === firstId)
          ) {
            dispatch(deleteEdge(link.id));
          }
        }
        setAnnouncement(
          intl.formatMessage(messages.disconnectedAnnouncement, args),
        );
      },
    });
    endConnecting();
  };

  const handleRemove = async (personId: string) => {
    const name = displayName(personId);
    // Close the panel first: its focus trap would otherwise hold focus away
    // from the confirmation.
    closePanel();
    await confirm({
      title: intl.formatMessage(messages.removeConfirmTitle, { name }),
      description: intl.formatMessage(messages.removeConfirmDescription),
      confirmLabel: intl.formatMessage(messages.remove),
      intent: 'destructive',
      onConfirm: () => {
        for (const linkId of planRemovePerson(family, personId).linkIds) {
          dispatch(deleteEdge(linkId));
        }
        dispatch(deleteNode(personId));
        if (focusedId === personId) setFocusedId(null);
        setAnnouncement(
          intl.formatMessage(messages.removedAnnouncement, { name }),
        );
      },
    });
  };

  // Escape in the add menu returns focus to its person; Escape on the person
  // hides the menu.
  const handleCanvasKeyDown = (event: React.KeyboardEvent) => {
    // + and − zoom about the middle of the canvas.
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        panZoom.zoomBy(0.5);
        return;
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        panZoom.zoomBy(-0.5);
        return;
      }
    }
    if (event.key === 'Escape' && linkingId) {
      event.preventDefault();
      setLinkingId(null);
      return;
    }
    if (event.key !== 'Escape' || !focusedId) return;
    event.preventDefault();
    const node = nodeRefs.current.get(focusedId);
    if (node && document.activeElement !== node) node.focus();
    else setFocusedId(null);
  };

  const panelTitle = (() => {
    if (!panel) return '';
    const { mode } = panel;
    const subject = mode.kind === 'add' ? mode.anchor : mode.person;
    const args = {
      isYou: subject.isEgo ? 'true' : 'false',
      name: displayName(subject.id),
    };
    if (mode.kind === 'edit')
      return intl.formatMessage(messages.editTitle, args);
    const titles = {
      parent: messages.addParentTitle,
      sibling: messages.addSiblingTitle,
      partner: messages.addPartnerTitle,
      child: messages.addChildTitle,
    };
    return intl.formatMessage(titles[mode.relation], args);
  })();

  const editedPerson = panel?.mode.kind === 'edit' ? panel.mode.person : null;

  const panelMode = panel?.mode;
  const panelSubject =
    panelMode?.kind === 'add'
      ? panelMode.anchor
      : panelMode?.kind === 'edit'
        ? panelMode.person
        : undefined;
  const returnFocusId = panelSubject?.id ?? tabStopId;

  // The preview line runs from the first person selected to the second once
  // chosen, or else to the person the mouse or keyboard focus is on.
  const connectorFrom = linkingId
    ? (nodeRefs.current.get(linkingId) ?? null)
    : null;
  // Connecting, someone already connected to the first person is not a
  // target, and the line keeps following the mouse past them; disconnecting,
  // only they are.
  const isConnectTarget = (id: string | null): id is string =>
    id !== null &&
    linkingId !== null &&
    id !== linkingId &&
    areConnected(family, linkingId, id) === (tool === 'disconnect');
  const connectorTargetId =
    chosenPair?.secondId ??
    [hoveredId, focusedId].find(isConnectTarget) ??
    null;
  const connectorTo = connectorTargetId
    ? (nodeRefs.current.get(connectorTargetId) ?? null)
    : null;

  return (
    // The canvas fills the whole stage, edge to edge, without the padding
    // other stages have; the prompt floats over its top, on a fade so people
    // passing beneath it stay legible.
    <div
      className="relative flex h-full w-full flex-col"
      onPointerDown={handleStagePointerDown}
    >
      <div
        ref={promptRef}
        className="from-background via-background/80 pointer-events-none absolute inset-x-0 top-0 z-10 bg-linear-to-b to-transparent px-4 pt-4 pb-10"
      >
        <Prompts prompts={prompts} currentPromptId={prompt.id} />
      </div>
      {measurementContainer}
      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        {/* Drag to pan, wheel or pinch to zoom. Clipped rather than
            scrollable, so focusing someone off screen pans to them instead
            of scrolling. */}
        <div
          ref={viewportRef}
          role="region"
          aria-label={intl.formatMessage(messages.canvasLabel)}
          className="relative min-h-0 w-full flex-1 cursor-grab touch-none overflow-clip select-none"
          onKeyDown={handleCanvasKeyDown}
          onBlur={handleCanvasBlur}
          data-testid="pedigree-canvas"
        >
          {connectorFrom && tool === 'connect' && (
            <ConnectorPreview
              container={viewportRef}
              transform={panZoom}
              from={connectorFrom}
              to={connectorTo}
              color={edgeColor}
            />
          )}
          <motion.div
            ref={contentRef}
            className="absolute top-0 left-0 w-max p-40"
            style={{
              x: panZoom.x,
              y: panZoom.y,
              scale: panZoom.scale,
              transformOrigin: '0 0',
            }}
          >
            <PedigreeLayout
              nodeIds={nodeIds}
              edgeColor={edgeColor}
              links={links}
              nodeNames={nodeNames}
              nodeWidth={nodeWidth}
              nodeHeight={nodeHeight}
              // Room around each person for the add menu that appears beside,
              // above and below them.
              rowGapRatio={1.4}
              columnGapRatio={1.4}
              renderNode={(personId) => {
                const person = shown.byId.get(personId);
                if (!person) return null;
                const hasMenu = personId === menuPersonId;
                return (
                  <PersonNode
                    person={person}
                    label={displayName(personId)}
                    color={nodeColor}
                    shape={
                      shapeDefinition
                        ? resolveNodeShape(shapeDefinition, person.attributes)
                        : 'circle'
                    }
                    selected={
                      nomination ? isNominated(person) : personId === selectedId
                    }
                    disabled={nomination ? !canNominate(person) : false}
                    linking={
                      tool !== 'pointer' &&
                      (personId === linkingId || personId === connectorTargetId)
                    }
                    menuOpen={hasMenu}
                    // The person being added has not been asked yet.
                    hasMissingDetails={
                      !nomination &&
                      family.byId.has(personId) &&
                      missingDetailsFor(
                        person,
                        requiredFormVariables,
                        detailsConfig,
                      ).length > 0
                    }
                    adopted={shown.links.some(
                      (link) =>
                        link.kind === 'adoptive' && link.target === personId,
                    )}

                    onActivate={() => handleActivate(personId)}
                    tabIndex={personId === tabStopId ? 0 : -1}
                    onFocus={(event) => handleFocusPerson(personId, event)}
                    onKeyDown={(event) => handleNodeKeyDown(personId, event)}
                    onPointerEnter={(event) =>
                      handlePersonPointerEnter(personId, event)
                    }
                    onPointerLeave={handlePersonPointerLeave}
                    onPointerDown={(event) => {
                      lastPointerType.current = event.pointerType;
                    }}
                    nodeRef={setNodeRef(personId)}
                  >
                    {hasMenu && (
                      <AddRelativeMenu
                        isYou={person.isEgo}
                        name={displayName(personId)}
                        onAdd={openAdd}
                      />
                    )}
                  </PersonNode>
                );
              }}
            />
          </motion.div>
        </div>
        <div
          ref={toolbarAreaRef}
          className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2 px-4"
        >
          {tool !== 'pointer' && (
            <p
              className="text-sm opacity-80"
              data-testid="pedigree-connect-hint"
            >
              {connectNotice ??
                (linkingId
                  ? intl.formatMessage(
                      tool === 'connect'
                        ? messages.connectHintLinking
                        : messages.disconnectHintLinking,
                      {
                        isYou: family.byId.get(linkingId)?.isEgo
                          ? 'true'
                          : 'false',
                        name: displayName(linkingId),
                      },
                    )
                  : intl.formatMessage(
                      tool === 'connect'
                        ? messages.connectHint
                        : messages.disconnectHint,
                    ))}
            </p>
          )}
          {/* Rises into place when the stage first loads. */}
          <motion.div
            // No wider than the stage, so a toolbar that does not fit scrolls.
            className="max-w-full min-w-0"
            initial={reduceMotion ? false : { y: '150%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            // A heavy spring, damped just short of settling straight, so it
            // lands with a slight rebound; the fade does not bounce.
            transition={{
              y: {
                type: 'spring',
                mass: 1.4,
                stiffness: 170,
                damping: 20,
                delay: TOOLBAR_ENTRANCE_DELAY / 1000,
              },
              opacity: {
                duration: 0.25,
                delay: TOOLBAR_ENTRANCE_DELAY / 1000,
              },
            }}
          >
            <SegmentedToolbar
              aria-label={intl.formatMessage(messages.toolsLabel)}
              size="lg"
              className="pointer-events-auto"
            >
              {/* Answering a nomination prompt, selecting is all there is. */}
              {!nomination && (
                <ToolbarToggleGroup
                  aria-label={intl.formatMessage(messages.toolGroupLabel)}
                  value={[tool]}
                  onValueChange={(value) => {
                    const next = value[0];
                    if (isTool(next)) chooseTool(next);
                  }}
                >
                  <ToolbarButton
                    className="flex-col gap-0.5 px-5 text-xs [&>.lucide]:h-5"
                    value="pointer"
                    icon={<MousePointer2 />}
                    data-testid="pedigree-tool-pointer"
                  >
                    {intl.formatMessage(messages.pointerTool)}
                  </ToolbarButton>
                  <ToolbarButton
                    className="flex-col gap-0.5 px-5 text-xs [&>.lucide]:h-5"
                    value="connect"
                    icon={<Waypoints />}
                    data-testid="pedigree-tool-connect"
                  >
                    {intl.formatMessage(messages.connectTool)}
                  </ToolbarButton>
                  <ToolbarButton
                    className="flex-col gap-0.5 px-5 text-xs [&>.lucide]:h-5"
                    value="disconnect"
                    icon={<Unlink />}
                    data-testid="pedigree-tool-disconnect"
                  >
                    {intl.formatMessage(messages.disconnectTool)}
                  </ToolbarButton>
                </ToolbarToggleGroup>
              )}
              {!nomination && participantFraming && <ToolbarSeparator />}
              {participantFraming && (
                <FramingControl
                  value={chosenFraming}
                  onChange={chooseFraming}
                  open={framingOpen}
                  onOpenChange={setFramingOpen}
                />
              )}
              {(!nomination || participantFraming) && <ToolbarSeparator />}
              <ToolbarIconButton
                aria-label={intl.formatMessage(messages.zoomOut)}
                icon={<ZoomOut />}
                disabled={zoomLimits.atMin}
                onClick={() => panZoom.zoomBy(-0.5)}
                data-testid="pedigree-zoom-out"
              />
              <ToolbarIconButton
                aria-label={intl.formatMessage(messages.zoomIn)}
                icon={<ZoomIn />}
                disabled={zoomLimits.atMax}
                onClick={() => panZoom.zoomBy(0.5)}
                data-testid="pedigree-zoom-in"
              />
              <ToolbarIconButton
                aria-label={intl.formatMessage(messages.showWholeFamily)}
                icon={<Scan />}
                onClick={() => showWholeFamily()}
                data-testid="pedigree-zoom-fit"
              />
              {progress && completeness && !nomination && <ToolbarSeparator />}
              {progress && completeness && !nomination && (
                <CompletenessTracker
                  progress={progress}
                  enforcement={completeness.enforcement}
                  open={trackerOpen}
                  onOpenChange={setTrackerOpen}
                  family={family}
                  displayName={displayName}
                  onItemSelect={handleTrackerItem}
                  onItemAnswer={
                    config.relativesNotRecordedAttribute
                      ? (item) => void handleTrackerAnswer(item)
                      : undefined
                  }
                />
              )}
            </SegmentedToolbar>
          </motion.div>
        </div>
      </div>
      <ConnectMenu
        pair={tool === 'connect' ? chosenPair : null}
        family={family}
        displayName={displayName}
        anchor={
          chosenPair
            ? (nodeRefs.current.get(chosenPair.secondId) ?? null)
            : null
        }
        onConnect={(connection, description) =>
          void handleConnect(connection, description)
        }
        onClose={endConnecting}
      />
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <PersonDrawer
        popupRef={drawerRef}
        open={panel?.open ?? false}
        formKey={panel?.key ?? 'closed'}
        onClose={cancelPanel}
        onClosed={() => setPanel(null)}
        returnFocus={() =>
          returnFocusId ? (nodeRefs.current.get(returnFocusId) ?? null) : null
        }
        title={panelTitle}
        footer={
          <>
            {editedPerson && !editedPerson.isEgo && (
              <Button
                type="button"
                variant="text"
                color="destructive"
                className="mr-auto"
                onClick={() => void handleRemove(editedPerson.id)}
              >
                <AppMessage message={messages.remove} />
              </Button>
            )}
            <Button type="button" variant="text" onClick={cancelPanel}>
              <AppMessage message={messages.cancel} />
            </Button>
            <SubmitButton form={formId}>
              <AppMessage
                message={
                  panel?.mode.kind === 'edit' ? messages.save : messages.add
                }
              />
            </SubmitButton>
          </>
        }
      >
        {panel && (
          <PersonForm
            key={panel.key}
            formId={formId}
            mode={panel.mode}
            family={family}
            config={config}
            framing={framing}
            genderIdentityOptions={genderIdentityOptions}
            formFields={formFields}
            displayName={displayName}
            askAbout={
              panel.mode.kind === 'edit' && progress
                ? {
                    ...relativesToAskAbout(
                      family,
                      progress,
                      panel.mode.person.id,
                    ),
                    required: completeness?.enforcement === 'required',
                  }
                : undefined
            }
            onDraftChange={handleDraftChange}
            onSubmit={(result) => void handleSubmit(result)}
          />
        )}
      </PersonDrawer>
    </div>
  );
};

export default FamilyPedigree;
