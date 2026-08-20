import { useCallback, useEffect, useMemo, useRef } from 'react';
import { v4 as uuid } from 'uuid';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import ArrayField from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
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
import useLatchedExpansion from '~/hooks/useLatchedExpansion';

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
 * registered field, so a container read is answered by the store's DORMANT map
 * as soon as `removePanels` parks its "cleared" sentinel there — and a dormant
 * entry outranks the assembled form values for the rest of the editing session
 * (see `stageFormHooks.ts`'s documented resolution order). The container read
 * therefore stays `undefined` forever after one toggle-off: the id
 * registrations below never render again, and a panel added afterwards is
 * saved with no `id` at all, which the protocol schema rejects
 * (`panelSchema.id`). Reading the leaves has the same clear/restore semantics
 * without the shadowing — `writePanelAt` parks each leaf dormant too, so a
 * cleared panel reads back as cleared and a re-added one reads back as
 * present.
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
  removePanels: () => void,
) => {
  if (!panels || panels.length === 0 || newState) {
    return true;
  }

  const confirmed = await confirm({
    title: 'This will delete your panel configuration',
    description:
      'This will clear your panel configuration, and delete any filter rules you have created. Do you want to continue?',
    confirmLabel: 'Remove panels',
    cancelLabel: 'Cancel',
    intent: 'warning',
    onConfirm: () => {},
  });

  if (!confirmed) return false;

  removePanels();
  return true;
};

export const NodePanels = (_props: StageEditorSectionProps) => {
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
  // Removing the last panel must not collapse the section out from under the
  // user; an explicit toggle-off releases the latch, so panels restored
  // afterwards (undo) expand it again rather than being saved out of sight.
  const { startExpanded, onExplicitClose } = useLatchedExpansion(
    panels !== undefined,
  );

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
    // anything — but removals, reorders and the toggle-off are excluded too:
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

  const handleToggleChange = useCallback(
    async (newState: boolean) => {
      const allowed = await handlePanelToggleChange(
        newState,
        panels,
        confirm,
        () => {
          // Clear every panel's own leaves: they are real per-index fields
          // (`panels[N].id/.title/.dataSource/.filter`), and `registerField`
          // prefers a dormant value over `initialValue`, so leaving their
          // dormant slots untouched would let a remount resurrect the
          // pre-toggle-off data. Clearing the ids is also what makes the
          // section read as off — `usePanelAt` keys on them.
          for (let index = 0; index < MAX_PANELS; index += 1) {
            writePanelAt(index, undefined);
          }
          // The stage's `panels` key is never a registered field, so nothing
          // parks a "cleared" record for it on unmount. Written so undo/redo
          // sees the whole key as a known name rather than reconstructing it
          // from the leaves; the section's own reads deliberately never touch
          // it (see `usePanelAt`).
          setStageValue('panels', undefined);
        },
      );
      // Release the latch only once the close has actually gone through: a
      // cancelled confirm leaves the section open, and releasing the latch
      // there would collapse it on the very next render anyway.
      if (allowed && !newState) onExplicitClose();
      return allowed;
    },
    [confirm, onExplicitClose, panels, setStageValue, writePanelAt],
  );

  return (
    <Section
      title="Side Panels"
      toggleable
      disabled={disabled}
      summary={
        <Paragraph>
          Use this section to configure up to two side panels on this name
          generator.
        </Paragraph>
      }
      startExpanded={startExpanded}
      handleToggleChange={handleToggleChange}
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
        label="Side panel configuration"
        labelHidden
        component={ArrayField<NodePanelValue>}
        value={panels ?? EMPTY_PANELS}
        onChange={handlePanelsChange}
        itemComponent={NodePanel}
        itemTemplate={createNodePanel}
        getId={(panel: NodePanelValue) => panel.id}
        itemClasses="bg-accent text-accent-contrast elevation-low"
        addButtonLabel="Add new panel"
        emptyStateMessage="No side panels configured."
        immediateAdd
        sortable
        maxItems={MAX_PANELS}
        confirmDelete={false}
        disabled={disabled}
      />
    </Section>
  );
};
