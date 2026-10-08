'use client';

import { MousePointer2, Unlink, Waypoints } from 'lucide-react';
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
import { useSelector, useStore } from 'react-redux';
import { v4 as uuid } from 'uuid';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Node from '@codaco/fresco-ui/Node';
import {
  SegmentedToolbar,
  ToolbarButton,
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

import PassphraseOverlay from '../../components/PassphraseOverlay';
import Prompts from '../../components/Prompts/Prompts';
import { usePrompts } from '../../components/Prompts/usePrompts';
import { useCurrentStep } from '../../contexts/CurrentStepContext';
import useBeforeNext from '../../hooks/useBeforeNext';
import { useNodeMeasurement } from '../../hooks/useNodeMeasurement';
import useReadyForNextStage from '../../hooks/useReadyForNextStage';
import { useStageSelector } from '../../hooks/useStageSelector';
import { useResolvePresentationalText } from '../../localization/ProtocolLocalizationProvider';
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
import { type RootState, useAppDispatch } from '../../store/store';
import type { Direction, StageProps } from '../../types';
import { readOwnProperty, writeOwnProperty } from '../../utils/ownProperty';
import { getDecryptionScope } from '../Anonymisation/decryptionScope';
import { usePassphrase } from '../Anonymisation/usePassphrase';
import { useReportUnreadable } from '../Anonymisation/useReportUnreadable';
import { pedigreeFraming } from '../pedigree-common/framing';
import {
  participantsFamily,
  peopleCutOff,
  planRemovePerson,
} from '../pedigree-common/membership';
import {
  focusNeighbourInDirection,
  PedigreeViewport,
  usePedigreeZoomButtons,
} from '../pedigree-common/PedigreeCanvas';
import {
  answersContradictedBy,
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
import { decryptDetails, useDecryptedNames } from './encryptedNames';
import { generateLabels, labelEveryone, labelWrites } from './generatedLabels';
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
  nameFingerprint,
  nominationAppliesTo,
  nominationsWithdrawnBy,
  readFamily,
  type Family,
  type Person,
  type Relation,
} from './model';
import PedigreeLayout from './pedigree-layout/components/PedigreeLayout';
import type { PedigreeLink } from './pedigree-layout/types';
import { relationshipWrites } from './relationshipToParticipant';
import type { Point } from './spatialNavigation';
import { usePanZoom, type View } from './usePanZoom';

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
  const { currentStep, displayedStep } = useCurrentStep();
  const store = useStore<RootState>();
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
    readOwnProperty(person.attributes, nomination.attribute) === true;
  // A prompt limited to one sex at birth leaves out people recorded as the
  // other; anyone whose sex at birth is not known either way can be chosen.
  const canNominate = (person: Person) =>
    nominationAppliesTo(
      nomination?.onlyForSexAssignedAtBirth,
      person.sexAssignedAtBirth,
    );
  // Someone nominated whom the prompt no longer applies to (their sex at
  // birth was changed elsewhere in the interview) can still be deselected.
  const canSelect = (person: Person) =>
    canNominate(person) || isNominated(person);

  // The stage's own record: the framing the participant chose, when the
  // stage leaves it to them, and who holds a label saved as their name
  // because they were left unnamed.
  const stageMetadata = useStageSelector(getStageMetadata);
  const pedigreeMetadata = isFamilyPedigreeStageMetadata(stageMetadata)
    ? stageMetadata
    : undefined;
  const generatedLabels = useMemo(
    () => pedigreeMetadata?.generatedLabels ?? {},
    [pedigreeMetadata],
  );

  const nodes = useStageSelector(getNetworkNodes);
  const edges = useStageSelector(getNetworkEdges);
  const codebook = useSelector(getCodebook);

  // When the study encrypts the name attribute, names are written with the
  // interview's key and decrypted with it to be shown. Until the passphrase
  // is entered, people are shown by labels, and nothing that could write a
  // name can be done: the participant is asked for it, as other stages with
  // encrypted names ask. When no passphrase can ever open the interview's
  // protected answers, the family stays as it is.
  const {
    unlocked,
    passphraseChosen,
    encryptionUnavailable,
    lockedNotice,
    requirePassphrase,
  } = usePassphrase();
  const reportUnreadable = useReportUnreadable();
  const personVariables = useMemo(
    () => codebook.node?.[config.personType]?.variables ?? {},
    [codebook, config.personType],
  );
  // Every attribute the stage writes from what the participant types — the
  // name and the researcher's own fields — that the study encrypts. Adding
  // or changing someone writes them, so either waits for the passphrase.
  const encryptedAttributes = useMemo(
    () =>
      [
        config.nameAttribute,
        ...formFields.map((field) => field.variable),
      ].filter(
        (variable) =>
          readOwnProperty(personVariables, variable)?.encrypted === true,
      ),
    [personVariables, config.nameAttribute, formFields],
  );
  const encryptDetails = encryptedAttributes.length > 0;
  const encryptNames = encryptedAttributes.includes(config.nameAttribute);
  // Names that cannot be read yet are shown as labels.
  const namesLocked = encryptNames && !unlocked;
  // Nobody can be added or changed.
  const detailsLocked = encryptDetails && !unlocked;
  useEffect(() => {
    if (encryptDetails) requirePassphrase();
  }, [encryptDetails, requirePassphrase]);
  const [passphraseOpen, setPassphraseOpen] = useState(false);
  const decryption = useDecryptedNames({
    nodes,
    nameAttribute: config.nameAttribute,
    variables: personVariables,
  });
  const decryptedNames = decryption.names;

  // Someone who still holds the label the stage saved for them is unnamed.
  // Only the participant's family is drawn: other stages can add people of
  // the same type who are not family, and they are never shown or changed
  // here.
  const family = useMemo(
    () =>
      participantsFamily(
        readFamily(nodes, edges, config, generatedLabels, decryptedNames),
      ),
    [nodes, edges, config, generatedLabels, decryptedNames],
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
    // While the addition is being recorded, part of it is already real. It
    // is looked for in the network rather than in the family: someone
    // recorded before the link that joins them to the family is not in it
    // yet.
    const recordedIds = new Set(
      nodes.map((node) => node[entityPrimaryKeyProperty]),
    );
    const draftNodes: NcNode[] = plan.people
      .filter((person) => !recordedIds.has(person.id))
      .map((person) => ({
        [entityPrimaryKeyProperty]: person.id,
        type: config.personType,
        [entityAttributesProperty]: person.details,
      }));
    const draftEdges: NcEdge[] = plan.links
      .filter(
        (link) =>
          !edges.some(
            (existing) =>
              existing.type === config.relationshipType &&
              existing.from === link.source &&
              existing.to === link.target,
          ),
      )
      .map((link, index) => ({
        [entityPrimaryKeyProperty]: `draft-${index}`,
        type: config.relationshipType,
        from: link.source,
        to: link.target,
        [entityAttributesProperty]: linkAttributesFor(config, link),
      }));
    return participantsFamily(
      readFamily(
        [...nodes, ...draftNodes],
        [...edges, ...draftEdges],
        config,
        generatedLabels,
        decryptedNames,
      ),
    );
  }, [draft, family, nodes, edges, config, generatedLabels, decryptedNames]);
  const nodeColor = useStageSelector(getNodeColorSelector);
  // Connectors, and the preview of a new one, take the codebook's colour for
  // the relationship type ('edge-color-seq-N' is the CSS variable --edge-N).
  const edgeColorSelector = useMemo(
    () => getEdgeColorForType(config.relationshipType),
    [config.relationshipType],
  );
  const edgeColorName = useSelector(edgeColorSelector);
  const edgeColor = `var(--edge-${edgeColorName.replace('edge-color-seq-', '')})`;
  // A person's symbol is the person type's shape in the codebook, which the
  // researcher may map to one of their attributes, such as gender identity
  // or sex assigned at birth.
  const shapeDefinition = codebook.node?.[config.personType]?.shape;

  // The gender identity question offers the attribute's own options, with
  // the labels the researcher gave them.
  const genderIdentityAttribute = config.genderIdentity?.attribute;
  const toPresentationalText = useResolvePresentationalText();
  const genderIdentityOptions = useMemo(() => {
    if (genderIdentityAttribute === undefined) return [];
    const definition =
      codebook.node?.[config.personType]?.variables?.[genderIdentityAttribute];
    return definition?.type === 'categorical'
      ? definition.options.map((option) => ({
          value: option.value,
          label: toPresentationalText(option.label),
        }))
      : [];
  }, [
    codebook,
    config.personType,
    genderIdentityAttribute,
    toPresentationalText,
  ]);

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
  const zoomButtons = usePedigreeZoomButtons({
    panZoom,
    onShowWholeFamily: () => showWholeFamily(),
  });

  // No menu while the panel is open: it would offer to add to someone else
  // mid-way through describing this person. Nor while connecting or
  // disconnecting people, nor while the family waits for the passphrase.
  const menuPersonId =
    panel?.open || tool !== 'pointer' || nomination || detailsLocked
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
  const chosenFraming = pedigreeMetadata?.framing;
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
  const framing = pedigreeFraming(framingSetting, chosenFraming);
  const chooseFraming = useCallback(
    (chosen: FramingId) => {
      dispatch(
        updateStageMetadata({
          currentStep,
          metadata: { ...pedigreeMetadata, framing: chosen },
        }),
      );
    },
    [dispatch, currentStep, pedigreeMetadata],
  );
  // Everyone the participant has not named is shown by the label that will
  // be saved as their name when they leave, worked out afresh from the family
  // as it stands, so the canvas and the stages after it always agree.
  const labels = useMemo(
    () => labelEveryone(shown, framing, intl),
    [shown, framing, intl],
  );
  const displayName = useCallback(
    (personId: string) =>
      labels.get(personId) ?? intl.formatMessage(messages.familyMember),
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

  // Anything that could write what the study encrypts waits for the
  // passphrase, and asks for it instead, saying why: to see the names, when
  // they are encrypted, as well as to add or change people. When no
  // passphrase can be entered, it says so instead.
  const passphraseNotice = encryptionUnavailable
    ? lockedNotice
    : encryptNames
      ? messages.passphraseNeededNotice
      : messages.detailsPassphraseNeededNotice;
  const askForPassphrase = () => {
    requirePassphrase();
    setAnnouncement(intl.formatMessage(passphraseNotice));
    if (!encryptionUnavailable) setPassphraseOpen(true);
  };

  const openAddPanel = (relation: Relation, anchor: Person) => {
    if (detailsLocked) {
      askForPassphrase();
      return;
    }
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
              missingDetailsFor(person, requiredFormVariables, config).length >
              0,
          )
        : null,
    [family, completeness, requiredFormVariables, config],
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
  const checklistComplete =
    progress !== null &&
    progress.items.length === 0 &&
    !(participantFraming && chosenFraming === undefined);
  useEffect(() => {
    updateReady(checklistComplete);
  }, [updateReady, checklistComplete]);

  // Next is held back, with the list of what is still needed shown, until
  // the family is complete. A recommendation lets the participant through on
  // pressing Next again with the list already open.
  // (Pressing Next closes the list, as a press outside it, before this runs;
  // so a recommendation remembers that it has been shown instead.)
  const shownBeforeNext = useRef(false);
  const completeEnoughToLeave = (direction: Direction) => {
    if (direction !== 'forwards' || !progress || !completeness) return true;
    // A family no passphrase can unlock can never be completed.
    if (detailsLocked && encryptionUnavailable) return true;
    // Only the family's own prompt asks for it to be complete.
    if (nomination) return true;
    if (progress.items.length === 0) return true;
    if (completeness.enforcement === 'recommended' && shownBeforeNext.current) {
      return true;
    }
    shownBeforeNext.current = true;
    setTrackerOpen(true);
    return false;
  };

  // When the stage records each person's relationship to the participant, it
  // is worked out afresh from the family whenever the participant leaves, in
  // whichever direction, as the labels are: written for everyone connected
  // to the participant, named or not, and cleared from anyone who holds one
  // but is no longer connected. The participant has none. It is not typed
  // input, and only text attributes can be encrypted, so it never waits for
  // the passphrase.
  const saveRelationships = async () => {
    const attribute = config.relationshipToParticipantAttribute;
    if (!attribute) return;
    await Promise.all(
      relationshipWrites(nodes, family, config, attribute).map((write) =>
        dispatch(
          updateNode({
            nodeId: write.personId,
            attributePatch:
              write.relationship === undefined
                ? { set: {}, unset: [attribute] }
                : { set: { [attribute]: [write.relationship] }, unset: [] },
            currentStep,
          }),
        ),
      ),
    );
  };

  // Everyone the participant left unnamed is given a label as their name, in
  // the participant's language and choice of words, so they can be recognised
  // in the rest of the interview. The labels are saved whenever the
  // participant moves on — to another prompt or out of the stage, forwards,
  // back, or to another stage — before the next stage reads the family.
  //
  // The stage's metadata records who holds a generated label, by the
  // fingerprint of the value written (ciphertext, when the name attribute is
  // encrypted), so that on a return visit those people are unnamed again and
  // are given fresh labels when the participant leaves, while a name written
  // since on another stage no longer matches and is never overwritten.
  //
  // An encrypted label is written with the interview's key. Without it,
  // going on waits for the participant to enter the passphrase; going back
  // leaves the labels to be saved when they next leave. When no passphrase
  // can ever put the key in force, they are never saved.
  const saveGeneratedLabels = async (direction: Direction) => {
    // Every encrypted name is decrypted first, so that no label repeats a
    // typed name still being decrypted.
    const decrypted = unlocked ? await decryption.decryptAll(nodes) : undefined;
    const current = decrypted
      ? participantsFamily(
          readFamily(nodes, edges, config, generatedLabels, decrypted),
        )
      : family;
    const saved = generateLabels(current, framing, intl);
    const { held, toWrite } = labelWrites(
      current,
      saved,
      config.nameAttribute,
      decrypted ?? decryptedNames,
    );
    if (toWrite.size > 0 && namesLocked) {
      if (direction === 'backwards' || encryptionUnavailable) return true;
      askForPassphrase();
      return false;
    }
    const record: Record<string, string> = {};
    for (const [personId, stored] of held) {
      record[personId] = nameFingerprint(stored);
    }
    for (const [personId, label] of toWrite) {
      const result = await dispatch(
        updateNode({
          nodeId: personId,
          attributePatch: {
            set: { [config.nameAttribute]: label },
            unset: [],
          },
          currentStep,
        }),
      );
      // The value as stored, which encryption may have turned to ciphertext.
      const written = updateNode.fulfilled.match(result)
        ? readOwnProperty(
            result.payload.attributePatch.set,
            config.nameAttribute,
          )
        : undefined;
      if (written !== undefined) record[personId] = nameFingerprint(written);
    }
    if (
      Object.keys(record).length === 0 &&
      pedigreeMetadata?.generatedLabels === undefined
    ) {
      return true;
    }
    dispatch(
      updateStageMetadata({
        currentStep,
        metadata: { ...pedigreeMetadata, generatedLabels: record },
      }),
    );
    return true;
  };

  // The stage is not left while an answer it requires is missing: the
  // completeness requirement (above), and, when the participant chooses the
  // wording, their choice, which the saved labels are written in. Going on
  // without it opens the choice again. Going back is not held up, and saves
  // no labels: they are saved in the chosen words when the participant
  // next leaves.
  const framingUnanswered = participantFraming && chosenFraming === undefined;
  useBeforeNext(async (direction) => {
    if (framingUnanswered) {
      if (direction === 'forwards') {
        setFramingOpen(true);
        return false;
      }
      await saveRelationships();
      return true;
    }
    if (!completeEnoughToLeave(direction)) return false;
    await saveRelationships();
    return saveGeneratedLabels(direction);
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
      void openEdit(person.id);
    }
  };

  const openEdit = async (personId: string) => {
    if (detailsLocked) {
      askForPassphrase();
      return;
    }
    const recorded = family.byId.get(personId);
    if (!recorded) return;
    // The researcher's encrypted fields open on what was typed. One that can
    // never be read opens unavailable, and is kept as stored unless the
    // participant answers it again.
    const node = nodes.find(
      (candidate) => candidate[entityPrimaryKeyProperty] === personId,
    );
    const details = node
      ? await decryptDetails(
          node,
          formFields.map((field) => field.variable),
          personVariables,
          getDecryptionScope(store.getState),
          encryptionUnavailable,
        )
      : undefined;
    if (details?.status === 'locked') {
      askForPassphrase();
      return;
    }
    for (const reason of details?.unreadable ?? []) reportUnreadable(reason);
    const unavailable = details?.unavailable ?? [];
    const attributes = Object.fromEntries(
      Object.entries(recorded.attributes).filter(
        ([variable]) => !unavailable.includes(variable),
      ),
    );
    for (const [variable, value] of details?.values ?? []) {
      writeOwnProperty(attributes, variable, value);
    }
    const person = { ...recorded, attributes };
    rememberView(personId, personId);
    setPanel({
      open: true,
      key: uuid(),
      mode: {
        kind: 'edit',
        person,
        missing: missingDetailsFor(person, requiredFormVariables, config),
        unavailable,
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
    if (detailsLocked) {
      setLastFocusedId(personId);
      askForPassphrase();
      return;
    }
    if (nomination) {
      setLastFocusedId(personId);
      const person = family.byId.get(personId);
      if (!person || !canSelect(person)) return;
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
    void openEdit(personId);
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
    return person !== undefined && (!nomination || canSelect(person));
  });

  const handleNodeKeyDown = (
    personId: string,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    focusNeighbourInDirection(nodeRefs.current, personId, event);
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

  // An answer that someone has no siblings or children, or that the
  // participant doesn't know, is withdrawn once the family records one: read
  // from the family as stored after each change to it, so whoever the change
  // gives a sibling or child — not only the person it was made to — loses an
  // answer it contradicts.
  const withdrawContradictedAnswers = async () => {
    const notRecordedAttribute = config.relativesNotRecordedAttribute;
    if (!notRecordedAttribute) return;
    const state = store.getState();
    const latest = participantsFamily(
      readFamily(
        getNetworkNodes(state, displayedStep),
        getNetworkEdges(state, displayedStep),
        config,
      ),
    );
    for (const [personId, kept] of answersContradictedBy(latest)) {
      await dispatch(
        updateNode({
          nodeId: personId,
          attributePatch: {
            set: { [notRecordedAttribute]: kept },
            unset: [],
          },
          currentStep,
        }),
      );
    }
  };

  const handleSubmit = async (result: PersonFormResult) => {
    if (!panel) return;
    // Without the key (it went while the panel was open) nothing typed could
    // be saved, so the panel stays open until the passphrase is entered.
    if (detailsLocked) {
      askForPassphrase();
      return;
    }
    const { mode } = panel;
    closePanel();
    const typedName = readOwnProperty(result.set, config.nameAttribute);

    if (mode.kind === 'edit') {
      // A change of sex at birth withdraws the person from every prompt
      // limited to the other sex, so no nomination stands for someone the
      // prompt excludes.
      const sexAttribute = config.sexAssignedAtBirthAttribute;
      const sexValue = readOwnProperty(result.set, sexAttribute);
      const sexAssignedAtBirth = Array.isArray(sexValue)
        ? String(sexValue[0])
        : result.unset.includes(sexAttribute)
          ? undefined
          : mode.person.sexAssignedAtBirth;
      const set = { ...result.set };
      for (const attribute of nominationsWithdrawnBy(
        stage.nominationPrompts ?? [],
        mode.person.attributes,
        sexAssignedAtBirth,
      )) {
        writeOwnProperty(set, attribute, false);
      }
      await dispatch(
        updateNode({
          nodeId: mode.person.id,
          attributePatch: {
            set,
            unset: result.unset.filter(
              (variable) => !Object.hasOwn(set, variable),
            ),
          },
          currentStep,
        }),
      );
      // A name typed for someone whose label was saved is theirs now, even
      // when it is the same words.
      if (
        typeof typedName === 'string' &&
        typedName.trim() !== '' &&
        Object.hasOwn(generatedLabels, mode.person.id)
      ) {
        dispatch(
          updateStageMetadata({
            currentStep,
            metadata: {
              ...pedigreeMetadata,
              generatedLabels: Object.fromEntries(
                Object.entries(generatedLabels).filter(
                  ([personId]) => personId !== mode.person.id,
                ),
              ),
            },
          }),
        );
      }

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
      // A parent re-described as biological gives the person siblings, and
      // the parent a child.
      await withdrawContradictedAnswers();
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
          // What the participant typed is written encrypted where the study
          // encrypts it.
          useEncryption: encryptDetails,
          currentStep,
        }),
      ).unwrap();
    }
    for (const link of plan.links) await addLink(link);
    await withdrawContradictedAnswers();
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

  // People named together, joined as the participant's language joins a
  // list.
  const listOfNames = (ids: readonly string[]) =>
    intl.formatList(
      ids.map((id) =>
        intl.formatMessage(messages.listedName, { name: displayName(id) }),
      ),
      { type: 'conjunction' },
    );

  // The links between two people, in either direction.
  const linksBetween = (a: string, b: string) =>
    family.links
      .filter(
        (link) =>
          (link.source === a && link.target === b) ||
          (link.source === b && link.target === a),
      )
      .map((link) => link.id);

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
    // Only the participant's family is drawn, so a connection that is the
    // only link between the participant and someone cannot be removed: they
    // would vanish from the tree. The participant connects them another way
    // first.
    if (tool === 'disconnect') {
      const cutOff = peopleCutOff(family, {
        linkIds: linksBetween(linkingId, personId),
      });
      if (cutOff.length > 0) {
        refuse(
          intl.formatMessage(messages.disconnectWouldCutOff, {
            count: cutOff.length,
            names: listOfNames(cutOff),
          }),
        );
        return;
      }
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
    await withdrawContradictedAnswers();
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
        for (const linkId of linksBetween(firstId, secondId)) {
          dispatch(deleteEdge(linkId));
        }
        setAnnouncement(
          intl.formatMessage(messages.disconnectedAnnouncement, args),
        );
      },
    });
    endConnecting();
  };

  // Removing someone who is the only link between the participant and other
  // people removes those people too: only the participant's family is drawn,
  // so they would otherwise vanish from the tree while staying in the
  // interview. The confirmation names them.
  const handleRemove = async (personId: string) => {
    const name = displayName(personId);
    const { cutOffIds, linkIds } = planRemovePerson(family, personId);
    const removedIds = [personId, ...cutOffIds];
    // Close the panel first: its focus trap would otherwise hold focus away
    // from the confirmation.
    closePanel();
    await confirm({
      title: intl.formatMessage(messages.removeConfirmTitle, { name }),
      description:
        cutOffIds.length === 0
          ? intl.formatMessage(messages.removeConfirmDescription)
          : intl.formatMessage(messages.removeConfirmDescriptionWithOthers, {
              count: cutOffIds.length,
              names: listOfNames(cutOffIds),
            }),
      confirmLabel: intl.formatMessage(messages.remove),
      intent: 'destructive',
      onConfirm: () => {
        for (const linkId of linkIds) dispatch(deleteEdge(linkId));
        for (const id of removedIds) dispatch(deleteNode(id));
        if (focusedId !== null && removedIds.includes(focusedId)) {
          setFocusedId(null);
        }
        setAnnouncement(
          cutOffIds.length === 0
            ? intl.formatMessage(messages.removedAnnouncement, { name })
            : intl.formatMessage(messages.removedWithOthersAnnouncement, {
                name,
                count: cutOffIds.length,
              }),
        );
      },
    });
  };

  // Escape in the add menu returns focus to its person; Escape on the person
  // hides the menu.
  // (+ and − zoom about the middle of the canvas, in `PedigreeViewport`.)
  const handleCanvasKeyDown = (event: React.KeyboardEvent) => {
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
        {/* Drag to pan, wheel or pinch to zoom. */}
        <PedigreeViewport
          viewportRef={viewportRef}
          contentRef={contentRef}
          panZoom={panZoom}
          onKeyDown={handleCanvasKeyDown}
          onBlur={handleCanvasBlur}
          overlay={
            connectorFrom &&
            tool === 'connect' && (
              <ConnectorPreview
                container={viewportRef}
                transform={panZoom}
                from={connectorFrom}
                to={connectorTo}
                color={edgeColor}
              />
            )
          }
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
                  disabled={nomination ? !canSelect(person) : false}
                  linking={
                    tool !== 'pointer' &&
                    (personId === linkingId || personId === connectorTargetId)
                  }
                  menuOpen={hasMenu}
                  // The person being added has not been asked yet.
                  hasMissingDetails={
                    !nomination &&
                    family.byId.has(personId) &&
                    missingDetailsFor(person, requiredFormVariables, config)
                      .length > 0
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
        </PedigreeViewport>
        <div
          ref={toolbarAreaRef}
          className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2 px-4"
        >
          {detailsLocked && (
            <Alert
              variant="info"
              density="compact"
              appearance="soft"
              className="pointer-events-auto my-0 w-auto"
              data-testid="pedigree-passphrase-notice"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="text-sm">
                  <AppMessage message={passphraseNotice} />
                </p>
                {!encryptionUnavailable && (
                  <Button size="sm" onClick={() => setPassphraseOpen(true)}>
                    <AppMessage message={messages.enterPassphrase} />
                  </Button>
                )}
              </div>
            </Alert>
          )}
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
                  disabled={detailsLocked}
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
              {zoomButtons}
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
      {!encryptionUnavailable && (
        <PassphraseOverlay
          show={passphraseOpen}
          choosing={!passphraseChosen}
          onAccepted={() => setPassphraseOpen(false)}
          onClose={() => setPassphraseOpen(false)}
        />
      )}
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
            generatedLabels={generatedLabels}
            decryptedNames={decryptedNames}
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
