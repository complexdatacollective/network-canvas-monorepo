import { isEqual } from 'es-toolkit';
import { z } from 'zod/mini';

import type { IntlShape } from '@codaco/app-i18n/messages';
import type {
  CustomFieldValidation,
  FieldValue,
} from '@codaco/fresco-ui/form/store/types';
import { suppliedInterfaceText } from '@codaco/interview/supplied-wording';
import {
  interfaceTextArguments,
  type InterfaceTextUpdate,
  lacksDefaultLanguageText,
  type LocalizedString,
  sharedStageInterfaceTextUsed,
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

/** The stage form's field for one shared entry the open stage uses. */
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

/**
 * What the stage form holds for one shared entry, mounted or parked, as the
 * field holds it rather than as a submit cleans it: a translation the
 * researcher emptied is still a translation they emptied, and has to be
 * refused rather than read as wording never given. Undefined when the form
 * has never shown the entry. `baseline` is what the form measures the field's
 * unsaved change against.
 */
export function sharedWordingInForm(
  storeApi: StageFormStoreApi,
  group: string,
  key: string,
): Readonly<{ value: FieldValue; baseline: FieldValue }> | undefined {
  const name = sharedWordingFieldName(group, key);
  const { fields, dormantValues } = storeApi.getState();
  const field = fields.get(name) ?? dormantValues.get(name);
  return field === undefined
    ? undefined
    : { value: field.value, baseline: field.initialValue };
}

/**
 * What the saved protocol shows for one shared entry, if it shows the entry:
 * its own wording, or Network Canvas's where it has none (see
 * `ProtocolBuilderProtocolContext.interfaceText`).
 */
export const heldSharedWord = (
  protocol: Pick<ProtocolBuilderProtocolContext, 'interfaceText'>,
  group: string,
  key: string,
): LocalizedString | undefined => {
  const groups: Readonly<
    Record<string, Readonly<Record<string, LocalizedString | undefined>>>
  > = protocol.interfaceText ?? {};
  return groups[group]?.[key];
};

/**
 * The wording a shared entry's field starts with, and what the researcher's
 * change to it is measured against: what the saved protocol shows for it, or,
 * for an entry the open stage is the first to use, Network Canvas's wording
 * in the protocol's languages.
 */
export const standingSharedWord = (
  protocol: Pick<
    ProtocolBuilderProtocolContext,
    'interfaceText' | 'localization'
  >,
  group: string,
  key: string,
): LocalizedString | undefined =>
  heldSharedWord(protocol, group, key) ??
  (protocol.localization === undefined
    ? undefined
    : suppliedInterfaceText(group, key, protocol.localization));

/**
 * Whether the form holds the researcher's change to a shared word the saved
 * protocol shows: different from what its field was opened with (its
 * baseline), and from what the protocol shows now.
 *
 * Both, because the protocol can change under an open stage: a collaborator
 * may save the same word while it is open. A field the researcher left alone
 * follows the protocol while it is on screen (see `SharedStageWording`), but
 * one parked out of sight still holds the wording it was opened with, and
 * saving that would put the old wording back over the collaborator's. A
 * change the researcher did make is theirs whatever the protocol came to
 * hold, and is saved over the collaborator's wording with the stage, as a
 * change to any part of a stage someone else saved meanwhile would be.
 */
const isSharedWordingChange = (
  inForm: Readonly<{ value: unknown; baseline: unknown }> | undefined,
  held: LocalizedString | undefined,
): inForm is Readonly<{ value: unknown; baseline: unknown }> =>
  inForm !== undefined &&
  !isEqual(inForm.value, inForm.baseline) &&
  !isEqual(inForm.value, held);

/**
 * A field's value as the localized words it saves: a field emptied of every
 * language holds nothing at all, which is wording the researcher removed
 * rather than wording never shown.
 */
const asWording = (value: unknown): LocalizedString =>
  isLocalizedString(value) ? value : {};

/**
 * The shared words a save writes with the stage.
 *
 * The words every stage of a kind shares belong to the protocol, but a
 * researcher changing them from a stage editor is editing that stage: the
 * change is part of the stage's draft, kept with the rest of it until the
 * stage is saved, written in the same change as the stage, and thrown away
 * with the draft if the stage is not saved. Nothing reaches the protocol
 * while the stage is open.
 *
 * So the save carries, of the entries the stage uses: each the saved
 * protocol shows that the researcher has changed (`isSharedWordingChange`),
 * as the form holds it; and each the protocol does not show yet, which the
 * stage is the first to use, with what the form holds for it or Network
 * Canvas's wording in the protocol's languages where the researcher has not
 * been shown it. A host stores only the researcher's own wording of each
 * (`interfaceTextWithUpdates`), so an entry sent as Network Canvas words it
 * writes nothing, and removes wording the settings still held for it. A
 * change that cannot be saved refuses the save rather than being left behind
 * (`sharedWordingIssues`). An entry the stage stops using is left out,
 * whatever the form still holds for it.
 */
export function pendingSharedWording(
  protocol: ProtocolBuilderProtocolContext,
  identity: StageIdentity,
  draft: StageFormDraft,
  inForm: (
    group: string,
    key: string,
  ) => Readonly<{ value: unknown; baseline: unknown }> | undefined,
): readonly InterfaceTextUpdate[] {
  const { localization } = protocol;
  if (localization === undefined) return [];
  return sharedWordingInUse(protocol, identity, draft).flatMap(
    ({ group, keys }) =>
      keys.flatMap((key) => {
        const formHolds = inForm(group, key);
        const held = heldSharedWord(protocol, group, key);
        if (held !== undefined) {
          return isSharedWordingChange(formHolds, held)
            ? [{ group, key, value: asWording(formHolds.value) }]
            : [];
        }
        const value =
          formHolds === undefined
            ? suppliedInterfaceText(group, key, localization)
            : asWording(formHolds.value);
        return value === undefined ? [] : [{ group, key, value }];
      }),
  );
}

/**
 * Why a shared word cannot be saved as it reads, or undefined when it can:
 * every one needs words in the protocol's default language, and one that
 * shows values has to show them as its declaration allows. The rule every
 * shared word a stage save writes is held to.
 */
function sharedWordingProblem(
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
 * `sharedWordingProblem` as the rule of the stage form's field for a shared
 * entry, so the field says it as it is left and the form will not submit
 * while it stands.
 *
 * Not said of the wording the saved protocol already shows for the entry
 * (`held`): a save writes only a change to it, so wording the researcher has
 * not touched is not this stage's to answer for, and a word another stage
 * left wanting does not keep this one from being saved.
 */
export function sharedWordingValidation(
  group: string,
  key: string,
  held: LocalizedString | undefined,
  defaultLocale: string,
  intl: IntlShape,
): CustomFieldValidation {
  return {
    schema: z.unknown().check(
      z.superRefine((value, ctx) => {
        if (!isLocalizedString(value)) return;
        if (held !== undefined && isEqual(value, held)) return;
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

/** One shared word the stage form holds a field for, mounted or parked. */
type SharedWordingField = Readonly<{
  name: string;
  group: string;
  key: string;
  value: FieldValue;
  /** What the form measures the field's unsaved change against. */
  baseline: FieldValue;
}>;

/**
 * Every shared word the stage form holds a field for, mounted or parked,
 * whatever the stage's settings currently show: a field its setting has
 * hidden still holds what the researcher gave it, and returns with it.
 */
function sharedWordingFields(
  storeApi: StageFormStoreApi,
): readonly SharedWordingField[] {
  const { fields, dormantValues } = storeApi.getState();
  return [...fields, ...dormantValues].flatMap(([name, field]) => {
    const path = field.path ?? safeFieldPath(name);
    const [root, group, key] = path ?? [];
    return path?.length !== 3 ||
      root !== SHARED_WORDING_PATH ||
      typeof group !== 'string' ||
      typeof key !== 'string'
      ? []
      : [
          {
            name,
            group,
            key,
            value: field.value,
            baseline: field.initialValue,
          },
        ];
  });
}

/**
 * What the researcher has given the shared words the form holds, by field:
 * the part of a save's ask that is theirs rather than the protocol's. The
 * words a save sends are worked out from this AND from what the protocol
 * holds, and a save that lands changes what it holds, so a request is named by
 * this, never by the words it sent (see `StageEditorShell`'s `handleSubmit`).
 */
export function sharedWordingAsk(
  storeApi: StageFormStoreApi,
): Readonly<Record<string, FieldValue>> {
  return Object.fromEntries(
    sharedWordingFields(storeApi)
      .map(({ name, value }) => [name, value] as const)
      .toSorted(([a], [b]) => a.localeCompare(b)),
  );
}

/**
 * What switching the wording section off puts back in the form, as it puts
 * back the stage's own wording: Network Canvas's wording for every shared
 * word the form holds a field for, mounted or hidden by its setting, and for
 * every entry the stage uses that the form has never shown, where the saved
 * protocol shows something else for it. `changed` says whether the form, or
 * the protocol for an entry the form has not shown, holds anything else:
 * a reset that changes nothing still has to stand, as the section switching
 * off empties the fields it closes over (see `StageWordingSection`).
 *
 * Put back in the form rather than written: like any other change made in a
 * stage editor, it is part of the stage's draft, saved with the stage and
 * thrown away with it.
 */
export function sharedWordingResets(
  storeApi: StageFormStoreApi,
  protocol: ProtocolBuilderProtocolContext,
  inUse: SharedWordingInUse,
  localization: ProtocolLocalization,
): readonly Readonly<{ name: string; value: FieldValue; changed: boolean }>[] {
  const fields = sharedWordingFields(storeApi);
  const inForm = fields.flatMap(({ name, group, key, value }) => {
    const supplied = suppliedInterfaceText(group, key, localization);
    return supplied === undefined
      ? []
      : [{ name, value: supplied, changed: !isEqual(value, supplied) }];
  });
  const unshown = inUse.flatMap(({ group, keys }) =>
    keys.flatMap((key) => {
      const name = sharedWordingFieldName(group, key);
      const held = heldSharedWord(protocol, group, key);
      const supplied = suppliedInterfaceText(group, key, localization);
      return fields.some((field) => field.name === name) ||
        held === undefined ||
        supplied === undefined ||
        isEqual(held, supplied)
        ? []
        : [{ name, value: supplied, changed: true }];
    }),
  );
  return [...inForm, ...unshown];
}

/**
 * Settles what the form holds for shared words once a save has taken the
 * stage, and answers with each one's new baseline, by group and entry, for
 * the form's unsaved-change check.
 *
 * A word the save wrote is the protocol's now, so what the form holds for it
 * is what was saved. A word it left out of an entry the stage still uses
 * held no change of the researcher's, so it takes what the protocol shows,
 * which a collaborator may have changed while it was parked out of sight.
 * One left out of an entry the stage had stopped using goes with the save,
 * which is where an entry no longer used goes: its wording goes back to
 * Network Canvas's and does not return if the setting is turned on again.
 */
export function settleSharedWording(
  storeApi: StageFormStoreApi,
  written: readonly InterfaceTextUpdate[],
  protocol: ProtocolBuilderProtocolContext,
  inUse: SharedWordingInUse,
): Record<string, Record<string, FieldValue>> {
  const { localization } = protocol;
  const baselines: Record<string, Record<string, FieldValue>> = {};
  for (const { name, group, key, value: held } of sharedWordingFields(
    storeApi,
  )) {
    let value = held;
    const wasWritten = written.some(
      (update) => update.group === group && update.key === key,
    );
    const used = inUse.some(
      (entries) => entries.group === group && entries.keys.includes(key),
    );
    const settled = wasWritten
      ? undefined
      : used
        ? standingSharedWord(protocol, group, key)
        : localization === undefined
          ? undefined
          : suppliedInterfaceText(group, key, localization);
    if (settled !== undefined && !isEqual(settled, held)) {
      storeApi.getState().setFieldValue(name, settled);
      value = settled;
    }
    baselines[group] = { ...baselines[group], [key]: value };
  }
  return baselines;
}
