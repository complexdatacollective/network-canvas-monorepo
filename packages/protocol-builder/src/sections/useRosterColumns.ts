import { useMemo } from 'react';

import type { OptionGetter } from '../form/arrayFields/MultiSelect.tsx';
import { useStageValue } from '../form/stageFormHooks.ts';
import { useResourceInspection } from '../resources/components/useResourceInspection.ts';

/** Where a roster stage records the data file it draws its people from. */
export const DATA_SOURCE = 'dataSource';

export type RosterColumns = Readonly<{
  /** One entry per attribute the data file's people carry. */
  names: readonly string[];
  /** The file is still being read, so an empty list means "not yet". */
  busy: boolean;
  /** No data file is chosen, so there is nothing to configure against. */
  waiting: boolean;
  /** Which file these columns came from, for a section that resets with it. */
  resourceId?: string;
  /** The file could not be read — its message, in the host's own words. */
  problem?: string;
}>;

const NO_NAMES: readonly string[] = Object.freeze([]);

/**
 * The attributes the chosen roster's people carry.
 *
 * Everything a roster stage configures — which attributes appear on a card,
 * which the participant may sort by, which a search matches against — is
 * chosen from these, and they come from the file itself rather than from the
 * codebook: a roster is external data, and a column in it is not required to
 * be a codebook attribute at all.
 *
 * Read through the resource gateway, which is the only thing in this package
 * that reaches host storage. A stage editor never sees a URL, a path or the
 * bytes.
 */
export function useRosterColumns(): RosterColumns {
  const dataSource = useStageValue(DATA_SOURCE);
  const resourceId =
    typeof dataSource === 'string' && dataSource !== ''
      ? dataSource
      : undefined;
  const { inspection, busy, failure } = useResourceInspection(resourceId);

  return useMemo(
    () => ({
      names: inspection?.variableNames ?? NO_NAMES,
      busy,
      waiting: resourceId === undefined,
      ...(resourceId === undefined ? {} : { resourceId }),
      ...(failure === undefined ? {} : { problem: failure.message }),
    }),
    [busy, failure, inspection, resourceId],
  );
}

/**
 * The roster's columns as a list field's options: each offered once, and one
 * already chosen disabled rather than removed, so the list still reads as the
 * whole data file.
 *
 * Shared by every roster section that picks columns — card details and
 * sortable properties are the same question asked twice — so a column reads
 * the same way wherever the researcher meets it.
 */
export function useColumnOptionGetter(names: readonly string[]): OptionGetter {
  return useMemo<OptionGetter>(
    () => (fieldName, _rowValues, allValues) => {
      if (fieldName !== 'variable') return [];
      const used = chosenColumns(allValues);
      return names.map((name) => ({
        value: name,
        label: name,
        ...(used.includes(name) ? { disabled: true } : {}),
      }));
    },
    [names],
  );
}

/** The column each row of a list field currently names. */
function chosenColumns(allValues: unknown): string[] {
  if (!Array.isArray(allValues)) return [];
  return allValues.flatMap((row) =>
    typeof row === 'object' &&
    row !== null &&
    typeof Reflect.get(row, 'variable') === 'string'
      ? [Reflect.get(row, 'variable') as string]
      : [],
  );
}
