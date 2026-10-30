import { isEqual } from 'es-toolkit';
import { useCallback, useMemo } from 'react';

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
