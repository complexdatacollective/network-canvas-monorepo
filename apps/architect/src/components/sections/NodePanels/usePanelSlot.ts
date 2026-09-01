import { useStageFormValue } from '~/components/StageEditor/stageFormHooks';

/**
 * The stage-form path a panel row owns, and whether it still owns it.
 *
 * Panels are stored positionally (`panels[N].title`, …), so a row's field
 * names change when the list is re-indexed. A deletion re-indexes it while the
 * deleted row is STILL MOUNTED: `ArrayField` renders removed items through an
 * `AnimatePresence mode="popLayout"` exit, and an exiting child keeps the props
 * it had before removal. Deleting the first of two panels therefore leaves the
 * exiting row bound to `panels[0]` at the same moment the survivor rebinds from
 * `panels[1]` to `panels[0]`, and the store's `fields` map is keyed by name
 * alone — one entry, two live owners.
 *
 * That cost the survivor its data outright. The survivor registered over the
 * exiting row's entry, and when the exit finished the unmount unregistered the
 * name it no longer owned, taking the survivor's live field with it: the panel
 * saved as `{id}` alone, with `title` and `dataSource` stranded in dormant
 * storage holding the DELETED panel's values. `panelSchema` requires both, so
 * the stage saved invalid.
 *
 * The row cannot tell it is exiting from its own props — they are the stale
 * ones — but it can tell from the store: the slot's `id` is rewritten to the
 * new occupant before the re-render (`NodePanels.handlePanelsChange`), so a row
 * whose own id is no longer the one at its slot has been superseded.
 *
 * A superseded row must render no connected fields. Dropping them unregisters
 * its names in the SAME commit that rebinds the survivor, and React runs every
 * effect cleanup for a commit before any effect body, so the survivor's
 * registration lands after the exiting row's teardown rather than before it.
 * The value survives that handoff via dormant storage — the unregister parks
 * the value `handlePanelsChange` has already written (the survivor's), and
 * `registerField` prefers a dormant value over `initialValue`, which here would
 * be the stale committed content of the slot the survivor moved into.
 */
export const usePanelSlot = (
  itemId: unknown,
  committedIndex: number | undefined,
  index: number,
) => {
  const fieldName = `panels[${committedIndex ?? index}]`;
  const slotId = useStageFormValue<string>(`${fieldName}.id`);

  return {
    fieldName,
    // An id-less row is a draft the list has not accepted yet; it owns nothing
    // until `handlePanelsChange` has written it into a slot.
    ownsSlot: typeof itemId === 'string' && slotId === itemId,
  };
};
