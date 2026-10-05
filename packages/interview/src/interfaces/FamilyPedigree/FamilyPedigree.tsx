'use client';

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
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Node from '@codaco/fresco-ui/Node';
import { entityPrimaryKeyProperty } from '@codaco/shared-consts';

import Prompts from '../../components/Prompts/Prompts';
import { useCurrentStep } from '../../contexts/CurrentStepContext';
import { useNodeMeasurement } from '../../hooks/useNodeMeasurement';
import { useStageSelector } from '../../hooks/useStageSelector';
import {
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
import AddRelativeMenu from './components/AddRelativeMenu';
import PersonDrawer from './components/PersonDrawer';
import PersonForm, {
  type PersonFormMode,
  type PersonFormResult,
} from './components/PersonForm';
import PersonNode from './components/PersonNode';
import { messages } from './messages';
import {
  missingDetailsFor,
  pedigreeConfigFromStage,
  planAddRelative,
  planRemovePerson,
  readFamily,
  type Relation,
} from './model';
import PedigreeLayout from './pedigree-layout/components/PedigreeLayout';
import type { PedigreeLink } from './pedigree-layout/types';
import {
  ARROW_DIRECTIONS,
  nearestInDirection,
  type Point,
} from './spatialNavigation';

type PanelState = {
  open: boolean;
  /** Changes for every opening, so the form starts fresh. */
  key: string;
  mode: PersonFormMode;
} | null;

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
  const nodeColor = useStageSelector(getNodeColorSelector);
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
  const selectedId =
    panel?.open && panel.mode.kind === 'edit' ? panel.mode.person.id : null;
  // No menu while the panel is open: it would offer to add to someone else
  // mid-way through describing this person.
  const menuPersonId = panel?.open ? null : (hoveredId ?? focusedId);
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

  const displayName = useCallback(
    (personId: string) => {
      const person = family.byId.get(personId);
      if (person?.isEgo) return intl.formatMessage(messages.you);
      return person?.name ?? intl.formatMessage(messages.unnamedPerson);
    },
    [family.byId, intl],
  );

  const links: PedigreeLink[] = useMemo(
    () =>
      family.links.map((link) => ({
        source: link.source,
        target: link.target,
        kind: link.kind,
        isActive: link.isCurrentPartner,
        isGestationalCarrier: link.isGestationalCarrier,
      })),
    [family.links],
  );
  const nodeIds = useMemo(
    () => family.people.map((person) => person.id),
    [family.people],
  );
  const nodeNames = useMemo(
    () =>
      new Map(family.people.map((person) => [person.id, person.name ?? ''])),
    [family.people],
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

  const openAdd = (relation: Relation) => {
    if (!menuPerson) return;
    setPanel({
      open: true,
      key: uuid(),
      mode: { kind: 'add', relation, anchor: menuPerson },
    });
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
    });
  };

  const closePanel = () =>
    setPanel((current) => (current ? { ...current, open: false } : null));

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
    hoverLeaveTimer.current = setTimeout(() => setHoveredId(null), 300);
  };

  // A touch screen has no hover, so a tap leaves the person's menu showing
  // once their details panel closes.
  const lastPointerType = useRef<string | null>(null);

  // Selecting a person (click, tap, Enter or Space) opens their details. The
  // panel returns focus to them when it closes.
  const handleActivate = (personId: string) => {
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

    if (!result.request) return;
    const plan = planAddRelative({
      family,
      anchorId: mode.anchor.id,
      newPersonId: uuid(),
      details: result.set,
      request: result.request,
      createId: uuid,
    });
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
    for (const link of plan.links) {
      await dispatch(
        addEdge({
          from: link.source,
          to: link.target,
          type: config.relationshipType,
          attributeData: {
            [config.kindVariable]: [link.kind],
            ...(link.kind === 'partner'
              ? {
                  [config.currentPartnerVariable]:
                    link.isCurrentPartner ?? true,
                }
              : {
                  [config.gestationalCarrierVariable]:
                    link.isGestationalCarrier ?? false,
                }),
          },
          currentStep,
        }),
      ).unwrap();
    }
    const name = result.set[config.nameVariable];
    setAnnouncement(
      intl.formatMessage(messages.addedAnnouncement, {
        name:
          typeof name === 'string'
            ? name
            : intl.formatMessage(messages.unnamedPerson),
      }),
    );
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

  const panelSubject = panel
    ? panel.mode.kind === 'add'
      ? panel.mode.anchor
      : panel.mode.person
    : undefined;

  return (
    <div
      className="interface flex h-full flex-col"
      onPointerDown={handleStagePointerDown}
    >
      <div className="shrink-0">
        <Prompts
          prompts={[{ id: 'pedigree', text: stage.prompt }]}
          currentPromptId="pedigree"
        />
      </div>
      {measurementContainer}
      <div
        role="region"
        aria-label={intl.formatMessage(messages.canvasLabel)}
        className="relative min-h-0 w-full flex-1 overflow-auto"
        onKeyDown={handleCanvasKeyDown}
        onBlur={handleCanvasBlur}
        data-testid="pedigree-canvas"
      >
        <div className="flex min-h-full min-w-max items-center justify-center p-40">
          <PedigreeLayout
            nodeIds={nodeIds}
            links={links}
            nodeNames={nodeNames}
            nodeWidth={nodeWidth}
            nodeHeight={nodeHeight}
            // Room around each person for the add menu that appears beside,
            // above and below them, and for their name beneath.
            rowGapRatio={1.4}
            columnGapRatio={1.4}
            renderNode={(personId) => {
              const person = family.byId.get(personId);
              if (!person) return null;
              const hasMenu = personId === menuPersonId;
              return (
                <PersonNode
                  person={person}
                  color={nodeColor}
                  selected={personId === selectedId}
                  menuOpen={hasMenu}
                  hasMissingDetails={
                    missingDetailsFor(person, requiredFormVariables).length > 0
                  }
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
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {/* Keyed per opening so every panel starts with an empty form. It wraps
          the whole drawer so the footer's submit button reaches the form. */}
      <FormStoreProvider key={panel?.key ?? 'closed'}>
        <PersonDrawer
          open={panel?.open ?? false}
          onClose={closePanel}
          onClosed={() => setPanel(null)}
          returnFocus={() =>
            panelSubject
              ? (nodeRefs.current.get(panelSubject.id) ?? null)
              : null
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
              <Button type="button" variant="text" onClick={closePanel}>
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
              onSubmit={(result) => void handleSubmit(result)}
            />
          )}
        </PersonDrawer>
      </FormStoreProvider>
    </div>
  );
};

export default FamilyPedigree;
