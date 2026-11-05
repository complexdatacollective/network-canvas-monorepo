import { isEqual } from 'es-toolkit';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  type InterfaceTextUpdate,
  type LocalizedString,
  STAGE_TYPE_INTERFACE_TEXT,
  type StageType,
  suppliedInterfaceText,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import {
  useSettingsSectionWrite,
  type CodebookWriteOutcome,
} from '../../codebook/writes.ts';
import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';

/** One group of the interview's shared words, as the protocol holds it. */
export type SharedWordingGroup = Readonly<{
  group: string;
  entries: readonly (readonly [string, LocalizedString | undefined])[];
}>;

/**
 * The shared words every stage of `stageType` shows alike, by group, as the
 * protocol holds them: only the groups, and the entries, it holds. The
 * protocol holds an entry only while one of its stages shows it (see
 * `interfaceTextFor`), so a group that is not there has nothing to edit.
 */
export function useSharedStageWording(
  stageType: StageType,
): readonly SharedWordingGroup[] {
  const { interfaceText } = useProtocolContext();
  return useMemo(
    () =>
      (STAGE_TYPE_INTERFACE_TEXT[stageType] ?? []).flatMap((group) => {
        const entries = Object.entries(interfaceText?.[group] ?? {});
        return entries.length === 0 ? [] : [{ group, entries }];
      }),
    [interfaceText, stageType],
  );
}

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

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The settings document holding `updates` over the shared words it holds. */
const withUpdates = (
  document: SectionDoc,
  updates: readonly InterfaceTextUpdate[],
): SectionDoc => {
  const held = isRecord(document.interfaceText) ? document.interfaceText : {};
  const next: Record<string, unknown> = { ...held };
  for (const { group, key, value } of updates) {
    const current = next[group];
    next[group] = { ...(isRecord(current) ? current : {}), [key]: value };
  }
  return { ...document, interfaceText: next };
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
  });
  useEffect(() => {
    state.current.shared = shared;
    state.current.applied = [];
  }, [shared]);

  return useMemo(
    () => ({
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
        return current.shared.map(({ group, entries }) => ({
          group,
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
    }),
    [write],
  );
}
