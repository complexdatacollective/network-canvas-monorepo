import { useMemo } from 'react';

import { useStageValue } from '../../form/stageFormHooks.ts';
import type { AutoStageNamePanel } from '../../naming/useAutoStageName.ts';
import type { StageHeadingSectionProps } from '../stage-heading/StageHeadingSection.tsx';

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
 * What the name proposed to a new stage is qualified by, for a generator that
 * offers side panels.
 *
 * Composed by the editors that HAVE panels rather than read inside the heading,
 * because the schema gives `panels` to `NameGenerator` and
 * `NameGeneratorQuickAdd` and to nothing else (a roster name generator's list
 * IS the panel), and the heading must not ask a third about a key its
 * interface does not have.
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
 * Here the whole list is ONE registered field value — the list is a field
 * component, and never registers per-index leaves, so a deleted row cannot
 * resurrect itself — so the container path IS the panels, and switching the
 * section off parks `undefined` at exactly the path this reads.
 */
export function useAutoNameFromPanels(): StageHeadingSectionProps['autoName'] {
  const rawPanels = useStageValue(PANELS);

  return useMemo(() => {
    // The section switched off, which is a stage with no panels rather than a
    // stage whose panels are unknown: the name says nothing about them.
    if (!Array.isArray(rawPanels)) return {};
    // An empty list is passed on as an empty list. `resolvePanelQualifier`
    // already reads it as the same absence a missing list is — a stage with no
    // panels is named as if the section had never been switched on — and a
    // second guard here would only be a second thing to keep in step with it.
    const panels: readonly AutoStageNamePanel[] = rawPanels
      .filter(isRecord)
      .map((panel) => ({
        dataSource:
          typeof panel.dataSource === 'string' && panel.dataSource !== ''
            ? panel.dataSource
            : INTERVIEW_NETWORK,
      }));
    return { panels };
  }, [rawPanels]);
}
