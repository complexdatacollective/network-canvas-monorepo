import { isEqual } from 'es-toolkit';
import { useMemo, useState, useSyncExternalStore } from 'react';

import { suppliedInterfaceText } from '@codaco/interview/supplied-wording';
import { type LocalizedString } from '@codaco/protocol-validation';

import {
  heldSharedWord,
  sharedWordingInUse,
  type SharedWordingInUse,
} from '../../form/sharedWordingDraft.ts';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';

/** One group of the interview's shared words, as the open stage uses it. */
export type SharedWordingGroup = Readonly<{
  group: string;
  /** Every entry of the group the stage uses, in the order they are shown. */
  keys: readonly string[];
  /**
   * The entries of those the saved protocol shows, with the text it shows
   * for each (its own wording, or Network Canvas's where it has none). An
   * entry in `keys` and not here is one the saved protocol does not show
   * yet, which the open stage is the first to use. Either way a change to
   * it is part of the stage's draft, saved with the stage (see
   * `pendingSharedWording`).
   */
  entries: readonly (readonly [string, LocalizedString | undefined])[];
}>;

/**
 * The entries in use, as the last reading found them: the same object for as
 * long as the reading does not change, so the form's every keystroke reads
 * the stage again without handing the section a new list.
 */
class InUseReading {
  #last: SharedWordingInUse = [];

  read(next: SharedWordingInUse): SharedWordingInUse {
    if (!isEqual(next, this.#last)) this.#last = next;
    return this.#last;
  }
}

/**
 * The shared words every stage of the open stage's kind shows alike, by
 * group, as the protocol would use them were the stage saved as it stands:
 * the saved protocol with the stage's draft in place of it, or added to it
 * (see `sharedWordingInUse`). An entry a setting brings in is listed as the
 * setting is turned on, and one it takes out goes as it is turned off, while
 * the stage is still open.
 *
 * Follows the stage's draft through the form's store, reading the stage again
 * on each change but handing back a new list only when what is in use moves.
 */
export function useSharedStageWording(): readonly SharedWordingGroup[] {
  const protocol = useProtocolContext();
  const { storeApi, identity, liveDraft } = useStageEditorForm();
  const [reading] = useState(() => new InUseReading());
  const read = () =>
    reading.read(sharedWordingInUse(protocol, identity, liveDraft()));
  const inUse = useSyncExternalStore(storeApi.subscribe, read, read);
  // Rebuilt for what is in use and for the words the protocol holds, and not
  // for every other change to the protocol.
  const { interfaceText } = protocol;
  return useMemo(
    () =>
      inUse.map(({ group, keys }) => ({
        group,
        keys,
        entries: keys.flatMap((key) => {
          const held = heldSharedWord({ interfaceText }, group, key);
          return held === undefined ? [] : [[key, held] as const];
        }),
      })),
    [inUse, interfaceText],
  );
}

/**
 * Whether the saved protocol holds wording of the researcher's own for any
 * shared word of `groups`: one it shows as something other than Network
 * Canvas's wording.
 */
export const rewordsSharedWording = (
  groups: readonly SharedWordingGroup[],
  localization: ProtocolLocalization,
): boolean =>
  groups.some(({ group, entries }) =>
    entries.some(([key, held]) => {
      const supplied = suppliedInterfaceText(group, key, localization);
      return supplied !== undefined && !isEqual(held, supplied);
    }),
  );
