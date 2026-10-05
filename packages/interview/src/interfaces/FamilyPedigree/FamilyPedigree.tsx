'use client';

import { MousePointer2, Waypoints } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
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
  ToolbarIconButton,
  ToolbarSeparator,
  ToolbarToggleGroup,
} from '@codaco/fresco-ui/SegmentedToolbar';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import Prompts from '../../components/Prompts/Prompts';
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
} from '../../selectors/session';
import { getCodebook } from '../../store/modules/protocol';
import {
  addEdge,
  addNode,
  deleteEdge,
  deleteNode,
  updateEdge,
  updateNode,
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

/**
 * What selecting a person does: open their details (with their add menu on
 * hover or focus), or pick them as one of two people to connect.
 */
type Tool = 'pointer' | 'connect';

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
  [config.kindVariable]: [link.kind],
  ...(link.kind === 'partner'
    ? { [config.currentPartnerVariable]: link.isCurrentPartner ?? true }
    : {
        [config.gestationalCarrierVariable]: link.isGestationalCarrier ?? false,
      }),
});

/** Everything to create to add a relative, under the panel's ids. */
const planAddition = (
  family: Family,
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
        attributeData: { [config.egoVariable]: true },
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

  // The connect tool links two people already shown: the first person
  // selected waits (`linkingId`) for the second, and then a menu asks how
  // the pair are related.
  const [tool, setTool] = useState<Tool>('pointer');
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [connectPair, setConnectPair] = useState<ConnectPair | null>(null);
  // Why the last selection was refused, shown in place of the instruction.
  const [connectNotice, setConnectNotice] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // No menu while the panel is open: it would offer to add to someone else
  // mid-way through describing this person. Nor while connecting people.
  const menuPersonId =
    panel?.open || tool === 'connect' ? null : (hoveredId ?? focusedId);
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
  // when their name is not known.
  const framing = stage.framing ?? 'gendered';
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

  // Bring the participant into view once their symbol is first laid out, so a
  // large family opens centred on them rather than on its top-left corner.
  const centredOnEgo = useRef(false);
  useEffect(() => {
    if (centredOnEgo.current || !family.egoId || nodeWidth === 0) return;
    const egoNode = nodeRefs.current.get(family.egoId);
    if (!egoNode) return;
    centredOnEgo.current = true;
    egoNode.scrollIntoView({ block: 'center', inline: 'center' });
  });

  const openAddPanel = (relation: Relation, anchor: Person) =>
    setPanel({
      open: true,
      key: uuid(),
      mode: { kind: 'add', relation, anchor },
      // The new person, and up to two unnamed parents for a sibling.
      ids: [uuid(), uuid(), uuid()],
    });

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
              missingDetailsFor(person, requiredFormVariables).length > 0,
          )
        : null,
    [family, completeness, requiredFormVariables],
  );
  const [trackerOpen, setTrackerOpen] = useState(false);

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
    setPanel({
      open: true,
      key: uuid(),
      mode: {
        kind: 'edit',
        person,
        missing: missingDetailsFor(person, requiredFormVariables),
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
    )
      setFocusedId(personId);
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
    if (tool === 'connect') setHoveredId(null);
    else hoverLeaveTimer.current = setTimeout(() => setHoveredId(null), 300);
  };

  // A touch screen has no hover, so a tap leaves the person's menu showing
  // once their details panel closes.
  const lastPointerType = useRef<string | null>(null);

  // Selecting a person (click, tap, Enter or Space) opens their details. The
  // panel returns focus to them when it closes.
  const handleActivate = (personId: string) => {
    if (tool === 'connect') {
      handleConnectSelect(personId);
      return;
    }
    setLastFocusedId(personId);
    if (lastPointerType.current === 'touch') setFocusedId(personId);
    lastPointerType.current = null;
    openEdit(personId);
  };

  // Roving focus: the family is a single tab stop, and the arrow keys move
  // between people by where they sit in the tree.
  const tabStopId =
    (lastFocusedId && family.byId.has(lastFocusedId) ? lastFocusedId : null) ??
    family.egoId ??
    family.people[0]?.id;

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
      if (id !== personId) candidates.set(id, centreOf(element));
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
    const notRecordedVariable = config.relativesNotRecordedVariable;
    if (!notRecordedVariable) return;
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
              [notRecordedVariable]: recorded.filter(
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
      for (const linkId of result.linkRemovals ?? []) {
        dispatch(deleteEdge(linkId));
      }
      for (const update of result.linkUpdates ?? []) {
        await dispatch(
          updateEdge({
            edgeId: update.linkId,
            attributePatch: {
              set: {
                [config.kindVariable]: [update.kind],
                ...(update.kind === 'partner'
                  ? { [config.currentPartnerVariable]: update.isCurrentPartner }
                  : {
                      [config.gestationalCarrierVariable]:
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
    setConnectPair(null);
    setHoveredId(null);
    setFocusedId(null);
  };

  const handleConnectSelect = (personId: string) => {
    setLastFocusedId(personId);
    setConnectNotice(null);
    if (connectPair) return;
    if (
      linkingId &&
      linkingId !== personId &&
      areConnected(family, linkingId, personId)
    ) {
      // A pair has one link at most; the first person stays selected.
      const isYou = (id: string) => family.byId.get(id)?.isEgo === true;
      const [first, second] = isYou(personId)
        ? [personId, linkingId]
        : [linkingId, personId];
      const notice = intl.formatMessage(messages.connectAlreadyConnected, {
        firstIsYou: isYou(first) ? 'true' : 'false',
        first: displayName(first),
        second: displayName(second),
      });
      setConnectNotice(notice);
      setAnnouncement(notice);
      return;
    }
    if (!linkingId) {
      setLinkingId(personId);
      setAnnouncement(
        intl.formatMessage(messages.connectHintLinking, {
          isYou: family.byId.get(personId)?.isEgo ? 'true' : 'false',
          name: displayName(personId),
        }),
      );
    } else if (linkingId === personId) {
      // Selecting the first person again lets them go.
      setLinkingId(null);
    } else {
      setConnectPair({ firstId: linkingId, secondId: personId });
    }
  };

  const endConnecting = () => {
    setConnectPair(null);
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
  // Someone already connected to the first person is not a target: the line
  // keeps following the mouse past them.
  const isConnectTarget = (id: string | null): id is string =>
    id !== null &&
    linkingId !== null &&
    id !== linkingId &&
    !areConnected(family, linkingId, id);
  const connectorTargetId =
    connectPair?.secondId ??
    [hoveredId, focusedId].find(isConnectTarget) ??
    null;
  const connectorTo = connectorTargetId
    ? (nodeRefs.current.get(connectorTargetId) ?? null)
    : null;

  return (
    <div
      className="interface relative flex h-full flex-col"
      onPointerDown={handleStagePointerDown}
    >
      <div className="shrink-0">
        <Prompts
          prompts={[{ id: 'pedigree', text: stage.prompt }]}
          currentPromptId="pedigree"
        />
      </div>
      {measurementContainer}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          role="region"
          aria-label={intl.formatMessage(messages.canvasLabel)}
          className="relative min-h-0 w-full flex-1 overflow-auto"
          onKeyDown={handleCanvasKeyDown}
          onBlur={handleCanvasBlur}
          data-testid="pedigree-canvas"
        >
          <div
            ref={contentRef}
            className="relative flex min-h-full min-w-max items-center justify-center p-40"
          >
            {connectorFrom && (
              <ConnectorPreview
                container={contentRef}
                from={connectorFrom}
                to={connectorTo}
                color={edgeColor}
              />
            )}
            <PedigreeLayout
              nodeIds={nodeIds}
              edgeColor={edgeColor}
              links={links}
              nodeNames={nodeNames}
              nodeWidth={nodeWidth}
              nodeHeight={nodeHeight}
              // Room around each person for the add menu that appears beside,
              // above and below them, and for their name beneath.
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
                    selected={personId === selectedId}
                    linking={
                      tool === 'connect' &&
                      (personId === linkingId || personId === connectorTargetId)
                    }
                    menuOpen={hasMenu}
                    // The person being added has not been asked yet.
                    hasMissingDetails={
                      family.byId.has(personId) &&
                      missingDetailsFor(person, requiredFormVariables).length >
                        0
                    }
                    adopted={shown.links.some(
                      (link) =>
                        link.kind === 'adoptive' && link.target === personId,
                    )}
                    lineColor={edgeColor}
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
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2 px-4">
          {tool === 'connect' && (
            <p
              className="text-sm opacity-80"
              data-testid="pedigree-connect-hint"
            >
              {connectNotice ??
                (linkingId
                  ? intl.formatMessage(messages.connectHintLinking, {
                      isYou: family.byId.get(linkingId)?.isEgo
                        ? 'true'
                        : 'false',
                      name: displayName(linkingId),
                    })
                  : intl.formatMessage(messages.connectHint))}
            </p>
          )}
          <SegmentedToolbar
            aria-label={intl.formatMessage(messages.toolsLabel)}
            size="lg"
            className="pointer-events-auto"
          >
            <ToolbarToggleGroup
              aria-label={intl.formatMessage(messages.toolGroupLabel)}
              value={[tool]}
              onValueChange={(value) => {
                const next = value[0];
                if (next === 'pointer' || next === 'connect') chooseTool(next);
              }}
            >
              <ToolbarIconButton
                value="pointer"
                aria-label={intl.formatMessage(messages.pointerTool)}
                icon={<MousePointer2 />}
                data-testid="pedigree-tool-pointer"
              />
              <ToolbarIconButton
                value="connect"
                aria-label={intl.formatMessage(messages.connectTool)}
                icon={<Waypoints />}
                data-testid="pedigree-tool-connect"
              />
            </ToolbarToggleGroup>
            {progress && completeness && <ToolbarSeparator />}
            {progress && completeness && (
              <CompletenessTracker
                progress={progress}
                enforcement={completeness.enforcement}
                open={trackerOpen}
                onOpenChange={setTrackerOpen}
                family={family}
                displayName={displayName}
                onItemSelect={handleTrackerItem}
              />
            )}
          </SegmentedToolbar>
        </div>
      </div>
      <ConnectMenu
        pair={connectPair}
        family={family}
        displayName={displayName}
        anchor={
          connectPair
            ? (nodeRefs.current.get(connectPair.secondId) ?? null)
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
            formFields={formFields}
            displayName={displayName}
            askAbout={
              panel.mode.kind === 'edit' && progress
                ? relativesToAskAbout(family, progress, panel.mode.person.id)
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
