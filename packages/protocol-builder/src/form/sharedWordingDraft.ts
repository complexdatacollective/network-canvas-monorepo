import { z } from 'zod/mini';

import type { IntlShape } from '@codaco/app-i18n/messages';
import type {
  CustomFieldValidation,
  FieldValue,
} from '@codaco/fresco-ui/form/store/types';
import {
  interfaceTextArguments,
  type InterfaceTextUpdate,
  lacksDefaultLanguageText,
  type LocalizedString,
  sharedStageInterfaceTextUsed,
  suppliedInterfaceText,
} from '@codaco/protocol-validation';

import { localizedMessageProblemText } from '../fields/LocalizedMessageField.tsx';
import {
  isLocalizedString,
  type ProtocolLocalization,
} from '../localization/localizedText.ts';
import type { ProtocolBuilderProtocolContext } from '../protocol-context.ts';
import {
  SHARED_WORDING_PATH,
  stageFieldsOf,
  type StageFormDraft,
  type StageIdentity,
} from '../stageDocument.ts';
import { safeFieldPath } from './documentFromSubmission.ts';
import type { SectionValidationIssue } from './outlineStore.ts';
import { REQUIRED } from './requiredField.ts';
import type { StageFormStoreApi } from './stageEditorContext.ts';

/** The stage form's field for one shared entry the protocol does not hold. */
export const sharedWordingFieldName = (group: string, key: string): string =>
  `${SHARED_WORDING_PATH}.${group}.${key}`;

/** The entries of one group of shared words a stage uses, in their order. */
export type SharedWordingInUse = readonly Readonly<{
  group: string;
  keys: readonly string[];
}>[];

const NONE_IN_USE: SharedWordingInUse = Object.freeze([]);

/**
 * The shared words of the stage's kind the protocol would use were the stage
 * saved as the draft holds it: the saved protocol with this stage in place of
 * its saved self, or added to it (see `sharedStageInterfaceTextUsed`). Nothing
 * until the protocol's languages are known, as the words cannot be shown
 * before then.
 */
export function sharedWordingInUse(
  protocol: ProtocolBuilderProtocolContext,
  identity: StageIdentity,
  draft: StageFormDraft,
): SharedWordingInUse {
  const { localization } = protocol;
  if (localization === undefined) return NONE_IN_USE;
  return sharedStageInterfaceTextUsed(
    {
      localization,
      codebook: protocol.codebook,
      stages: protocol.orderedStages,
    },
    { ...stageFieldsOf(draft), id: identity.id, type: identity.type },
  );
}

/** Whether the protocol, as saved, holds one shared entry. */
const holdsSharedWord = (
  protocol: ProtocolBuilderProtocolContext,
  group: string,
  key: string,
): boolean => {
  const groups: Readonly<
    Record<string, Readonly<Record<string, unknown>> | undefined>
  > = protocol.interfaceText ?? {};
  return groups[group]?.[key] !== undefined;
};

/**
 * What the stage form holds for one shared entry, mounted or parked, as the
 * field holds it rather than as a submit cleans it: a translation the
 * researcher emptied is still a translation they emptied, and has to be
 * refused rather than read as wording never given. Undefined when the form
 * has never shown the entry.
 */
export function sharedWordingInForm(
  storeApi: StageFormStoreApi,
  group: string,
  key: string,
): Readonly<{ value: FieldValue }> | undefined {
  const name = sharedWordingFieldName(group, key);
  const { fields, dormantValues } = storeApi.getState();
  const field = fields.get(name) ?? dormantValues.get(name);
  return field === undefined ? undefined : { value: field.value };
}

/**
 * The shared words a save writes with the stage: every entry the stage
 * brings into use that the protocol does not hold, with what the form holds
 * for it, or Network Canvas's wording in the protocol's languages where the
 * researcher has not been shown it. Exactly what `withInterfaceText` would
 * give the protocol on the save, but for the researcher's own words, so a
 * host that keeps the words a protocol uses (Architect) and one that does not
 * (Studio) both end up holding them. An entry the stage stops using is left
 * out, whatever the form still holds for it.
 */
export function pendingSharedWording(
  protocol: ProtocolBuilderProtocolContext,
  identity: StageIdentity,
  draft: StageFormDraft,
  inForm: (
    group: string,
    key: string,
  ) => Readonly<{ value: unknown }> | undefined,
): readonly InterfaceTextUpdate[] {
  const { localization } = protocol;
  if (localization === undefined) return [];
  return sharedWordingInUse(protocol, identity, draft).flatMap(
    ({ group, keys }) =>
      keys.flatMap((key) => {
        if (holdsSharedWord(protocol, group, key)) return [];
        const held = inForm(group, key);
        // A field emptied of every language holds nothing at all, which is
        // wording the researcher removed rather than wording never shown.
        const value =
          held === undefined
            ? suppliedInterfaceText(group, key, localization)
            : isLocalizedString(held.value)
              ? held.value
              : {};
        return value === undefined ? [] : [{ group, key, value }];
      }),
  );
}

/**
 * Why a shared word cannot be saved as it reads, or undefined when it can:
 * every one needs words in the protocol's default language, and one that
 * shows values has to show them as its declaration allows. One rule for an
 * entry the protocol holds, written as its field is left, and for one held
 * with the stage, written when the stage is saved.
 */
export function sharedWordingProblem(
  group: string,
  key: string,
  value: LocalizedString,
  defaultLocale: string,
  intl: IntlShape,
): string | undefined {
  if (lacksDefaultLanguageText(value, defaultLocale)) return REQUIRED;
  const declaration = interfaceTextArguments(group, key);
  return declaration === undefined
    ? undefined
    : localizedMessageProblemText(value, declaration, intl);
}

/**
 * `sharedWordingProblem` as the rule of the stage form's field for an entry
 * held with the stage, so the field says it as it is left and the form will
 * not submit while it stands.
 */
export function sharedWordingValidation(
  group: string,
  key: string,
  defaultLocale: string,
  intl: IntlShape,
): CustomFieldValidation {
  return {
    schema: z.unknown().check(
      z.superRefine((value, ctx) => {
        if (!isLocalizedString(value)) return;
        const problem = sharedWordingProblem(
          group,
          key,
          value,
          defaultLocale,
          intl,
        );
        if (problem !== undefined) {
          ctx.addIssue({ code: 'custom', input: value, message: problem });
        }
      }),
    ),
  };
}

/**
 * The shared words a save would write that cannot be saved, each as a
 * problem at the stage form's field for it, so the save is refused and the
 * section holding the field answers for it.
 */
export function sharedWordingIssues(
  updates: readonly InterfaceTextUpdate[],
  defaultLocale: string,
  intl: IntlShape,
): SectionValidationIssue[] {
  return updates.flatMap(({ group, key, value }) => {
    const problem = sharedWordingProblem(
      group,
      key,
      value,
      defaultLocale,
      intl,
    );
    return problem === undefined
      ? []
      : [
          {
            path: [SHARED_WORDING_PATH, group, key],
            code: 'custom',
            message: problem,
            absent: false,
          },
        ];
  });
}

/**
 * Settles what the form holds for shared words once a save has taken the
 * stage, and answers with each one's new baseline, by group and entry, for
 * the form's unsaved-change check.
 *
 * A word the save wrote is the protocol's now, so what the form holds for it
 * is what was saved. A word it left out belonged to an entry the stage had
 * stopped using: nothing was deleted for it while the stage was open, but the
 * save is where an entry no longer used goes, so its wording goes back to
 * Network Canvas's and does not return if the setting is turned on again.
 */
export function settleSharedWording(
  storeApi: StageFormStoreApi,
  written: readonly InterfaceTextUpdate[],
  localization: ProtocolLocalization | undefined,
): Record<string, Record<string, FieldValue>> {
  const baselines: Record<string, Record<string, FieldValue>> = {};
  const { fields, dormantValues } = storeApi.getState();
  for (const [name, field] of [...fields, ...dormantValues]) {
    const path = field.path ?? safeFieldPath(name);
    const [root, group, key] = path ?? [];
    if (
      path?.length !== 3 ||
      root !== SHARED_WORDING_PATH ||
      typeof group !== 'string' ||
      typeof key !== 'string'
    ) {
      continue;
    }
    let value = field.value;
    const wasWritten = written.some(
      (update) => update.group === group && update.key === key,
    );
    const supplied =
      wasWritten || localization === undefined
        ? undefined
        : suppliedInterfaceText(group, key, localization);
    if (supplied !== undefined) {
      storeApi.getState().setFieldValue(name, supplied);
      value = supplied;
    }
    baselines[group] = { ...baselines[group], [key]: value };
  }
  return baselines;
}
