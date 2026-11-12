import { isEqual } from 'es-toolkit';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import type { IntlShape } from '@codaco/app-i18n/messages';
import {
  interfaceTextWithUpdates,
  suppliedInterfaceText,
} from '@codaco/interview/supplied-wording';
import {
  type InterfaceTextUpdate,
  type LocalizedString,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import {
  useSettingsSectionWrite,
  type CodebookWriteOutcome,
} from '../../codebook/writes.ts';
import {
  handedOverWording,
  type HandedOverWord,
  sharedWordingInUse,
  type SharedWordingInUse,
  sharedWordingProblem,
} from '../../form/sharedWordingDraft.ts';
import {
  type StageFormStoreApi,
  useStageEditorForm,
} from '../../form/stageEditorContext.ts';
import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';

/** One group of the interview's shared words, as the open stage uses it. */
export type SharedWordingGroup = Readonly<{
  group: string;
  /** Every entry of the group the stage uses, in the order they are shown. */
  keys: readonly string[];
  /**
   * The entries of those the saved protocol shows, with the text it shows
   * for each (its own wording, or Network Canvas's where it has none): a
   * change is written to the protocol as their field is left. An entry in
   * `keys` and not here is one the saved protocol does not show yet, held
   * with the stage's draft and written when the stage is saved (see
   * `SHARED_WORDING_PATH`).
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
          const held = heldWord(interfaceText, group, key);
          return held === undefined ? [] : [[key, held] as const];
        }),
      })),
    [inUse, interfaceText],
  );
}

/**
 * What the saved protocol shows for one shared entry, if it shows the entry
 * (see `ProtocolBuilderProtocolContext.interfaceText`).
 */
const heldWord = (
  interfaceText: ProtocolBuilderProtocolContext['interfaceText'],
  group: string,
  key: string,
): LocalizedString | undefined => {
  const groups: Readonly<
    Record<string, Readonly<Record<string, LocalizedString | undefined>>>
  > = interfaceText ?? {};
  return groups[group]?.[key];
};

/**
 * The shared words of `groups` the researcher has changed from Network
 * Canvas's wording, each with Network Canvas's wording to put back.
 */
export const sharedWordingChanges = (
  groups: readonly SharedWordingGroup[],
  localization: ProtocolLocalization,
): readonly InterfaceTextUpdate[] =>
  groups.flatMap(({ group, entries }) =>
    entries.flatMap(([key, held]) => {
      const supplied = suppliedInterfaceText(group, key, localization);
      return supplied === undefined || isEqual(held, supplied)
        ? []
        : [{ group, key, value: supplied }];
    }),
  );

/**
 * The settings document after `updates` to its shared words: it holds only
 * the researcher's own wording (see `interfaceTextWithUpdates`), and no
 * interface text at all when that leaves none.
 */
const withUpdates = (
  { interfaceText: held, ...document }: SectionDoc,
  updates: readonly InterfaceTextUpdate[],
): SectionDoc => {
  const interfaceText = interfaceTextWithUpdates(held, updates);
  return Object.keys(interfaceText).length === 0
    ? document
    : { ...document, interfaceText };
};

/**
 * Writes shared words into the protocol at once, under the settings' own
 * lock: they belong to every stage of a kind, not to the stage being edited,
 * so they are not saved with it (see `useSettingsSectionWrite`).
 */
export function useWriteSharedWording(): (
  updates: readonly InterfaceTextUpdate[],
) => Promise<CodebookWriteOutcome> {
  const write = useSettingsSectionWrite();
  return useCallback(
    (updates) => write((document) => withUpdates(document, updates)),
    [write],
  );
}

/**
 * The shared words one wording section writes, held so that switching it off
 * can wait for them. A word is written as its field is left, so pressing the
 * switch straight after typing starts a write that is still on its way when
 * the section decides what to reset: without waiting, it would decide from
 * the words the protocol held before, and the write would land after the
 * reset, leaving the researcher's wording behind a section that says Network
 * Canvas's.
 */
export type SharedWordingWrites = Readonly<{
  /** Writes `updates`, or nothing (undefined) while the section is closing. */
  write: (
    updates: readonly InterfaceTextUpdate[],
  ) => Promise<CodebookWriteOutcome | undefined>;
  /**
   * Holds back further writes, waits for those on their way, and gives the
   * shared words as they now stand, with what those writes applied.
   */
  settle: () => Promise<readonly SharedWordingGroup[]>;
  /** Lets writes through again: the section stayed on, or opened again. */
  resume: () => void;
  /**
   * Writes the researcher's changes to shared words the protocol has come to
   * hold while the stage was open (see `carryHandedOverWording`), and once
   * one is written and shown, puts its field back to its baseline: the
   * protocol holds it, so it is no unsaved change of the stage's.
   */
  carry: (
    storeApi: StageFormStoreApi,
    changes: readonly HandedOverWord[],
  ) => Promise<CodebookWriteOutcome | undefined>;
  /**
   * Puts back to its baseline each carried field the protocol now shows the
   * written words for. Not before: until then the field is still the
   * researcher's draft of the shared word, and showing the protocol's copy
   * would show the collaborator's wording for a moment.
   */
  release: (storeApi: StageFormStoreApi) => void;
}>;

export function useSharedWordingWrites(
  shared: readonly SharedWordingGroup[],
): SharedWordingWrites {
  const write = useWriteSharedWording();
  const state = useRef({
    pending: new Set<Promise<unknown>>(),
    // Each write reads the settings it rewrites, so one waits for the write
    // before it: two on their way at once would each read the settings
    // without the other's words, and the later would put the earlier's back.
    last: Promise.resolve() as Promise<unknown>,
    // Applied since the protocol last showed the shared words: the protocol
    // holds them, but the words this section was given may not show them yet.
    applied: [] as InterfaceTextUpdate[],
    held: false,
    shared,
    // The fields whose change is being carried into the protocol now.
    carrying: new Set<string>(),
    // Those carried, until the protocol shows what was written for them.
    carried: new Map<string, HandedOverWord>(),
  });
  useEffect(() => {
    state.current.shared = shared;
    state.current.applied = [];
  }, [shared]);

  return useMemo(() => {
    const writes: SharedWordingWrites = {
      write: (updates) => {
        const current = state.current;
        if (current.held) return Promise.resolve(undefined);
        const outcome = current.last.then(() => write(updates));
        current.last = outcome.catch(() => undefined);
        const tracked = outcome
          .then((result) =>
            result.status === 'applied'
              ? current.applied.push(...updates)
              : undefined,
          )
          .finally(() => current.pending.delete(tracked));
        current.pending.add(tracked);
        return outcome;
      },
      settle: async () => {
        const current = state.current;
        current.held = true;
        while (current.pending.size > 0) {
          await Promise.allSettled(current.pending);
        }
        const applied = new Map(
          current.applied.map(
            (update) =>
              [`${update.group}.${update.key}`, update.value] as const,
          ),
        );
        return current.shared.map(({ group, keys, entries }) => ({
          group,
          keys,
          entries: entries.map(
            ([key, held]) =>
              [
                key,
                applied.has(`${group}.${key}`)
                  ? applied.get(`${group}.${key}`)
                  : held,
              ] as const,
          ),
        }));
      },
      resume: () => {
        state.current.held = false;
      },
      carry: async (storeApi, changes) => {
        const { carrying, carried } = state.current;
        const fresh = changes.filter(
          ({ name, update }) =>
            !carrying.has(name) &&
            !isEqual(carried.get(name)?.update.value, update.value),
        );
        if (fresh.length === 0) return undefined;
        for (const { name } of fresh) carrying.add(name);
        try {
          const outcome = await writes.write(fresh.map(({ update }) => update));
          if (outcome?.status === 'applied') {
            for (const change of fresh) carried.set(change.name, change);
            writes.release(storeApi);
          }
          return outcome;
        } finally {
          for (const { name } of fresh) carrying.delete(name);
        }
      },
      release: (storeApi) => {
        const { carried, shared: groups } = state.current;
        for (const [name, { update, baseline }] of carried) {
          const { fields, dormantValues } = storeApi.getState();
          const field = fields.get(name) ?? dormantValues.get(name);
          // Changed again since it was written: a change of its own, still to
          // be written, and no longer this one's to release.
          if (!isEqual(field?.value, update.value)) {
            carried.delete(name);
            continue;
          }
          const held = groups
            .find(({ group }) => group === update.group)
            ?.entries.find(([key]) => key === update.key)?.[1];
          if (!isEqual(held, update.value)) continue;
          carried.delete(name);
          storeApi.getState().setFieldValue(name, baseline);
        }
      },
    };
    return writes;
  }, [write]);
}

/**
 * Writes the researcher's changes to shared words the protocol has come to
 * hold while the stage was open: a collaborator saved a stage using the word
 * first. The protocol holds it now, so it is a shared word like any other and
 * a change to it is written as one is, as its field is left. So: those that
 * can be saved, of the entries `held` names, except one whose field the
 * researcher is still in. One that cannot be saved stays in its field, to be
 * made good (see `isHandedOver`).
 */
export function carryHandedOverWording({
  storeApi,
  writes,
  held,
  localization,
  intl,
}: Readonly<{
  storeApi: StageFormStoreApi;
  writes: SharedWordingWrites;
  held: (group: string, key: string) => LocalizedString | undefined;
  localization: ProtocolLocalization;
  intl: IntlShape;
}>): Promise<CodebookWriteOutcome | undefined> {
  const focused =
    typeof document === 'undefined' ? null : document.activeElement;
  const changes = handedOverWording(storeApi, held).filter(
    ({ name, update: { group, key, value } }) =>
      focused?.closest(`[data-field-path="${name}"]`) == null &&
      sharedWordingProblem(
        group,
        key,
        value,
        localization.defaultLocale,
        intl,
      ) === undefined,
  );
  return changes.length === 0
    ? Promise.resolve(undefined)
    : writes.carry(storeApi, changes);
}
