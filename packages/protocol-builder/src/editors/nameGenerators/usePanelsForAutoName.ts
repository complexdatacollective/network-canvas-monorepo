import { useMemo } from 'react';

import { useStageValue } from '../../form/stageFormHooks.ts';
import type { AutoStageNamePanel } from '../../naming/useAutoStageName.ts';

/** Where a name generator that offers side panels keeps them. */
const PANELS = 'panels';

/**
 * The source a panel has until the researcher chooses another one. It is what
 * `NodePanelsSection`'s own row template writes, so a panel created and left
 * alone qualifies the name exactly as it will once the stage is saved.
 */
const INTERVIEW_NETWORK = 'existing';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The stage's side panels, for the name proposed to a stage being created.
 *
 * Read here rather than inside `StageNameSection` because only an interface
 * that HAS panels should ask about them: the schema gives `panels` to
 * `NameGenerator` and `NameGeneratorQuickAdd` and to nothing else (a roster
 * name generator's list IS the panel). `NameGeneratorFrame` calls this only
 * for the editors that declare `hasSidePanels`, which are exactly those two.
 *
 * Only `dataSource` is carried, because it is the only part of a panel the
 * qualifier reads — see `resolveStageQualifier`, which turns panels that all
 * draw on the interview's own network into "with Network Panels", panels that
 * all draw on imported networks into "with Roster Panels", and a mixture into
 * "with Panels". That rule is Architect's, unchanged: it is the same module
 * `apps/architect/src/components/StageEditor/autoStageName/useAutoStageName.ts`
 * calls, reached there through
 * `apps/architect/src/components/sections/NodePanels/panelSlots.ts`'s
 * `usePanelsForAutoName`.
 *
 * What differs from Architect is only WHERE the panels are read from, because
 * the two builders hold them differently. Architect registers per-index leaves
 * (`panels[0].dataSource`, …) and has to assemble the list from a fixed number
 * of slots, working around a dormant sentinel parked on the container path.
 * Here the whole list is ONE registered field value — see
 * `ProtocolArrayField`, which never registers per-index leaves so a deleted
 * row cannot resurrect itself — so the container path IS the panels, and
 * switching the section off parks `undefined` at exactly the path this reads.
 */
export function usePanelsForAutoName():
  | readonly AutoStageNamePanel[]
  | undefined {
  const rawPanels = useStageValue(PANELS);

  return useMemo(() => {
    if (!Array.isArray(rawPanels)) return undefined;
    // An empty list is passed on as an empty list. `resolvePanelQualifier`
    // already reads it as the same absence a missing list is — a stage with no
    // panels is named as if the section had never been switched on — and a
    // second guard here would only be a second thing to keep in step with it.
    return rawPanels.filter(isRecord).map((panel) => ({
      dataSource:
        typeof panel.dataSource === 'string' && panel.dataSource !== ''
          ? panel.dataSource
          : INTERVIEW_NETWORK,
    }));
  }, [rawPanels]);
}
