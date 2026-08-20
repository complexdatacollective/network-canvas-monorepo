import { useMemo } from 'react';

import type { Panel } from '@codaco/protocol-validation';
import { useStageFormValue } from '~/components/StageEditor/stageFormHooks';

/**
 * How many positional panel slots a name generator has.
 *
 * Panels live in the stage form as per-index leaves (`panels[N].id`, `.title`,
 * `.dataSource`, `.filter`) rather than as one opaque `panels` field — see the
 * note at the top of `NodePanels`. Every reader therefore assembles the list
 * from a fixed number of slots, and because hooks need a static call count,
 * raising this bound means adding a read per slot in each of them (here, and
 * `NodePanels`' own `usePanelAt`).
 */
export const MAX_PANELS = 2;

/** The only part of a panel the stage name's qualifier reads. */
type PanelSummary = Pick<Panel, 'dataSource'>;

const usePanelSummaryAt = (index: number): PanelSummary | undefined => {
  const id = useStageFormValue<string>(`panels[${index}].id`);
  const dataSource = useStageFormValue<Panel['dataSource']>(
    `panels[${index}].dataSource`,
  );

  return useMemo(() => {
    // A slot with no id is an empty slot — exactly what
    // `NodePanels`' `writePanelAt(index, undefined)` leaves behind.
    if (typeof id !== 'string') return undefined;
    // The default `writePanelAt` writes, so a panel whose data source has not
    // been touched still qualifies the name the way it will once saved.
    return { dataSource: dataSource ?? 'existing' };
  }, [dataSource, id]);
};

/**
 * The stage's panels, for the auto-generated stage name.
 *
 * Deliberately NOT `useStageFormValue('panels')`. `panels` is never a
 * registered field, and toggling the section off parks a dormant
 * `panels: undefined` sentinel on that exact path (`NodePanels`'
 * `removePanels`) — which outranks the values assembled from the path's leaves
 * for the rest of the editing session (see `stageFormHooks`' documented
 * resolution order). A container read therefore stayed `undefined` forever
 * after one toggle-off, and the name silently lost its "with … Panels"
 * qualifier even though the re-added panel really was saved.
 *
 * Registering a real `panels` field is not the alternative: a registered
 * container would race the per-index leaves and change what the stage saves.
 */
export const usePanelsForAutoName = (): PanelSummary[] | undefined => {
  // One read per slot, because hooks need a static call count — this pair IS
  // `MAX_PANELS`.
  const panel0 = usePanelSummaryAt(0);
  const panel1 = usePanelSummaryAt(1);

  return useMemo(() => {
    const configured = [panel0, panel1].filter(
      (panel): panel is PanelSummary => panel !== undefined,
    );
    return configured.length > 0 ? configured : undefined;
  }, [panel0, panel1]);
};
