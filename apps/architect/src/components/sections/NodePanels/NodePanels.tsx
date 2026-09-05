import { createElement, useCallback, useEffect, useMemo, useRef } from 'react';
import { v4 as uuid } from 'uuid';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import ArrayField from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import Section from '@codaco/fresco-ui/Section';
import type { RuleSetValue } from '~/components/sections/fields/RuleSetFields';
import { HiddenFieldValue } from '~/components/sections/Form/withFieldsHandlers';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageRestoreVersion } from '~/components/StageEditor/StageFormBridge';
import {
  useSetStageValue,
  useStageFormValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';
import { useStageDraftHistory } from '~/components/StageEditor/useStageDraftHistory';

import NodePanel, { type NodePanelValue } from './NodePanel';
// Every other array in the stage form is one opaque field value, but
// NetworkFilter (used by each row below) reads and writes the STAGE form
// directly. So each panel's fields stay individually registered on the
// stage — `panels[N].title`/`.dataSource`/`.filter` — and this component only
// drives the add/remove/reorder UI over them: `ArrayField` renders bounded by
// `MAX_PANELS`, uncontrolled by a literal `panels` field (registering one
// would race the individual leaves), and `handlePanelsChange` writes the
// recomputed list back across the same bounded set of field paths. The list
// this component renders from is likewise assembled per index (`usePanelAt`)
// rather than read off the `panels` container path — as is the stage name's
// own read, which is why the bound is shared rather than local.
import { MAX_PANELS } from './panelSlots';
const utilityMessages = defineMessages({
  thisWillDeleteYourPanelConfiguration: {
    id: 'architect.utility.sections.nodePanels.nodePanels.thisWillDeleteYourPanelConfiguration',
    defaultMessage: 'This will delete your panel configuration',
    description:
      'The title text in components / sections / NodePanels / NodePanels.',
  },
  thisWillClearYourPanelConfiguration: {
    id: 'architect.utility.sections.nodePanels.nodePanels.thisWillClearYourPanelConfiguration',
    defaultMessage:
      'This will clear your panel configuration, and delete any filter rules you have created. Do you want to continue?',
    description:
      'The description text in components / sections / NodePanels / NodePanels.',
  },
  removePanels: {
    id: 'architect.utility.sections.nodePanels.nodePanels.removePanels',
    defaultMessage: 'Remove panels',
    description:
      'The confirmLabel text in components / sections / NodePanels / NodePanels.',
  },
});
const additionalMessages = defineMessages({
  addNewPanel: {
    id: 'architect.additional.sections.nodePanels.nodePanels.addNewPanel',
    defaultMessage: 'Add new panel',
    description:
      'The addButtonLabel text in components / sections / NodePanels / NodePanels.',
  },
  noSidePanelsConfigured: {
    id: 'architect.additional.sections.nodePanels.nodePanels.noSidePanelsConfigured',
    defaultMessage: 'No side panels configured.',
    description:
      'The emptyStateMessage text in components / sections / NodePanels / NodePanels.',
  },
});
const messages = defineMessages({
  sidePanels: {
    id: 'architect.sections.nodePanels.nodePanels.sidePanels',
    defaultMessage: 'Side panels',
    description:
      'The title text in components / sections / NodePanels / NodePanels.',
  },
  selectANodeTypeToConfigure: {
    id: 'architect.sections.nodePanels.nodePanels.selectANodeTypeToConfigure',
    defaultMessage: 'Select a node type to configure side panels.',
    description:
      'The description text in components / sections / NodePanels / NodePanels.',
  },
  configureUpToTwoSidePanels: {
    id: 'architect.sections.nodePanels.nodePanels.configureUpToTwoSidePanels',
    defaultMessage: 'Configure up to two side panels for this name generator.',
    description:
      'The description text in components / sections / NodePanels / NodePanels.',
  },
  panels: {
    id: 'architect.sections.nodePanels.nodePanels.panels',
    defaultMessage: 'Panels',
    description:
      'The label text in components / sections / NodePanels / NodePanels.',
  },
});

// `ArrayField` decides whether to re-sync its internal item list from `value`
// by REFERENCE (`useArrayFieldItems.ts`'s `value !== prevValueRef.current`),
// not by deep equality. An inline `panels ?? []` fallback would allocate a
// fresh array every render, so it would look like new external data on every
// render and wipe out `addItem`'s optimistic local state before the just-
// registered fields' dormant values ever caught up. A stable module-level
// empty array keeps the "no panels" case a no-op for that comparison.
const EMPTY_PANELS: NodePanelValue[] = [];

const createNodePanel = (): NodePanelValue => ({
  id: uuid(),
  title: undefined,
  dataSource: 'existing',
  filter: undefined,
});

/**
 * One panel, assembled from its own registered/dormant leaves.
 *
 * Deliberately NOT `useStageFormValue('panels')`. `panels` is never a
 * registered field; its individually registered leaves are the source of truth
 * for both live values and committed fallbacks. Reading those leaves keeps the
 * list stable without shadowing its registrations with a synthetic container
 * value.
 *
 * Returns `undefined` for a slot with no id, which is exactly the slot
 * `writePanelAt(index, undefined)` leaves behind.
 */
const usePanelAt = (index: number): NodePanelValue | undefined => {
  const id = useStageFormValue<string>(`panels[${index}].id`);
  const title = useStageFormValue<string>(`panels[${index}].title`);
  const dataSource = useStageFormValue<string>(`panels[${index}].dataSource`);
  const filter = useStageFormValue<RuleSetValue>(`panels[${index}].filter`);

  return useMemo(() => {
    if (typeof id !== 'string') return undefined;
    // The same normalisation `writePanelAt` applies, so a reorder (which
    // rewrites every slot from this list) cannot turn an absent optional
    // leaf — `filter` is unregistered whenever NetworkFilter's own toggle is
    // shut — into a hole in the panel it writes back.
    return {
      id,
      title,
      dataSource: dataSource ?? 'existing',
      filter,
    };
  }, [dataSource, filter, id, title]);
};

export const handlePanelToggleChange = async (
  newState: boolean,
  panels: Array<Record<string, unknown>> | null | undefined,
  confirm: ReturnType<typeof useDialog>['confirm'],
) => {
  if (!panels || panels.length === 0 || newState) return true;

  return (
    (await confirm({
      title: createElement(AppMessage, {
        message: utilityMessages.thisWillDeleteYourPanelConfiguration,
      }),
      description: createElement(AppMessage, {
        message: utilityMessages.thisWillClearYourPanelConfiguration,
      }),
      confirmLabel: createElement(AppMessage, {
        message: utilityMessages.removePanels,
      }),
      cancelLabel: createElement(AppMessage, {
        message: commonMessages.cancel,
      }),
      intent: 'warning',
      onConfirm: () => {},
    })) === true
  );
};

export const NodePanels = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const { type } = useSubject();
  const disabled = !type;
  const { confirm } = useDialog();
  const setStageValue = useSetStageValue();
  // One read per slot, because hooks need a static call count — this pair IS
  // `MAX_PANELS`, and adding a third panel means adding a third read.
  const panel0 = usePanelAt(0);
  const panel1 = usePanelAt(1);
  const panels = useMemo(() => {
    const configured = [panel0, panel1].filter(
      (panel): panel is NodePanelValue => panel !== undefined,
    );
    // `undefined` (not `[]`) for "no panels": it is what the toggle reads as
    // off, and what keeps `EMPTY_PANELS` — a stable reference — as the value
    // handed to `ArrayField` in that case.
    return configured.length > 0 ? configured : undefined;
  }, [panel0, panel1]);
  // Adding a panel is invisible to the undo timeline without this. The add
  // writes per-index leaves (`writePanelAt`) that are not registered yet, and
  // `setFieldValue` parks an unregistered name in dormant storage WITHOUT
  // touching the store's `fields` map — so the bridge's subscriber returns on
  // its `next.fields === previous.fields` guard and never even asks whether
  // the change was structural. The registrations that follow a commit later
  // are then discarded as mount churn (`diffFields` ignores fields that appear
  // or disappear, which is what keeps section expansion out of the timeline).
  // The researcher gets an add that Undo cannot back out, and a first edit to
  // the new panel whose undo step deletes the whole panel instead of the edit.
  //
  // Snapshotting from inside `handlePanelsChange` cannot fix it: at that
  // instant the new values are still dormant, `getFormValues()` still reports
  // the pre-add stage, and the `isEqual` dedup makes the snapshot a no-op.
  // This effect is the first moment the panel exists in the form's output —
  // a component's own effects run after its children's, so the row and the id
  // registrations below have registered by the time it runs.
  const { flushPendingEdit } = useStageDraftHistory();
  // Keyed on the ids rather than the panel objects so an ordinary edit to a
  // panel's title does not re-run the effect at all.
  const panelIdKey = (panels ?? EMPTY_PANELS)
    .map((panel) => panel.id)
    .join('|');
  const previousPanelIdKeyRef = useRef(panelIdKey);
  const restoreVersion = useStageRestoreVersion();
  const previousRestoreVersionRef = useRef(restoreVersion);
  useEffect(() => {
    const previousPanelIdKey = previousPanelIdKeyRef.current;
    previousPanelIdKeyRef.current = panelIdKey;
    const previousRestoreVersion = previousRestoreVersionRef.current;
    previousRestoreVersionRef.current = restoreVersion;

    // An undo/redo re-adds a panel by writing exactly the same leaves, so it
    // reaches this effect looking exactly like the gesture above. Snapshotting
    // on top of a restore branches `future` and silently destroys the redo.
    // Neither `ui.restoring` nor the bridge's ref can gate it: both are only
    // true *inside* `runRestore`, which has finished by the time an effect
    // observing its writes runs (see `useStageRestoreVersion`).
    if (previousRestoreVersion !== restoreVersion) return;

    // Only an id that was not there before, which is only ever an add. The
    // mount is the obvious exclusion — a stage opened with panels already
    // configured must not push an entry before the researcher has touched
    // anything — but removals, reorders and section collapse are excluded too:
    // they write leaves that ARE registered, so they already reach the
    // timeline on the ordinary leaf debounce. Flushing them here instead would
    // snapshot the removed row mid-exit-animation, while its cleared slot is
    // still registered and still in `getFormValues()`.
    const previousIds = previousPanelIdKey ? previousPanelIdKey.split('|') : [];
    const currentIds = panelIdKey ? panelIdKey.split('|') : [];
    if (currentIds.every((id) => previousIds.includes(id))) return;

    flushPendingEdit();
  }, [flushPendingEdit, panelIdKey, restoreVersion]);

  const writePanelAt = useCallback(
    (index: number, panel: NodePanelValue | undefined) => {
      setStageValue(`panels[${index}].id`, panel?.id);
      setStageValue(`panels[${index}].title`, panel?.title);
      setStageValue(
        `panels[${index}].dataSource`,
        panel?.dataSource ?? 'existing',
      );
      setStageValue(`panels[${index}].filter`, panel?.filter);
    },
    [setStageValue],
  );

  const handlePanelsChange = useCallback(
    (nextPanels: NodePanelValue[] | undefined) => {
      const resolvedPanels = nextPanels ?? [];
      resolvedPanels.forEach((panel, index) => writePanelAt(index, panel));
      for (let index = resolvedPanels.length; index < MAX_PANELS; index += 1) {
        writePanelAt(index, undefined);
      }
    },
    [writePanelAt],
  );

  const handleOpenChange = useCallback(
    (newState: boolean) => handlePanelToggleChange(newState, panels, confirm),
    [confirm, panels],
  );

  return (
    <Section
      title={intl.formatMessage(messages.sidePanels)}
      description={
        disabled
          ? intl.formatMessage(messages.selectANodeTypeToConfigure)
          : intl.formatMessage(messages.configureUpToTwoSidePanels)
      }
      toggleable
      disabled={disabled}
      defaultOpen={!disabled && panels !== undefined}
      onOpenChange={handleOpenChange}
    >
      {/*
        Each panel's id has no control of its own, but `getFormValues()`
        reports REGISTERED fields only — `writePanelAt`'s `setFieldValue` parks
        an unregistered name in dormant storage, where the save cannot see it.
        Without these registrations a panel is saved with no `id` at all and
        the protocol fails validation (`stages.N.panels.0.id`).

        They belong HERE rather than in `NodePanel`, even though every other
        panel field is registered there. `getId` reads the id back off the
        assembled value, so an id that comes and goes with the row would flip
        `ArrayField`'s internal id between the panel's own uuid and a minted
        one — remounting the row, unregistering the id with it, and starting
        the same cycle again. This component never remounts, so the id stays
        registered and the row's identity stays put.
      */}
      {(panels ?? EMPTY_PANELS).map((panel, index) => (
        <HiddenFieldValue
          // Panels are addressed by position (`writePanelAt`), so position is
          // the identity here.
          key={`panel-id-${index}`}
          name={`panels[${index}].id`}
          initialValue={typeof panel?.id === 'string' ? panel.id : undefined}
        />
      ))}
      <UnconnectedField
        name="panels"
        label={intl.formatMessage(messages.panels)}
        component={ArrayField<NodePanelValue>}
        value={panels ?? EMPTY_PANELS}
        onChange={handlePanelsChange}
        itemComponent={NodePanel}
        itemTemplate={createNodePanel}
        getId={(panel: NodePanelValue) => panel.id}
        itemClasses="elevation-low"
        addButtonLabel={intl.formatMessage(additionalMessages.addNewPanel)}
        emptyStateMessage={intl.formatMessage(
          additionalMessages.noSidePanelsConfigured,
        )}
        immediateAdd
        sortable
        maxItems={MAX_PANELS}
        confirmDelete={false}
        disabled={disabled}
      />
    </Section>
  );
};
