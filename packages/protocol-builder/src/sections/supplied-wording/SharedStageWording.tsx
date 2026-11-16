import { isEqual } from 'es-toolkit';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { suppliedInterfaceText } from '@codaco/interview/supplied-wording';
import {
  interfaceTextArguments,
  type LocalizedString,
} from '@codaco/protocol-validation';

import LocalizedMessageField from '../../fields/LocalizedMessageField.tsx';
import { LocalizedInputField } from '../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../form/requiredField.ts';
import {
  isHandedOver,
  sharedWordingFieldName,
  sharedWordingInForm,
  sharedWordingProblem,
  sharedWordingValidation,
} from '../../form/sharedWordingDraft.ts';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import {
  hintInterfaceText,
  nameInterfaceText,
  nameInterfaceTextGroup,
} from '../../localization/interfaceTextNames.ts';
import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import { useProtocolLocalization } from '../../localization/ProtocolLocalization.tsx';
import { useLatest } from '../../state/useLatest.ts';
import {
  carryHandedOverWording,
  type SharedWordingGroup,
  type SharedWordingWrites,
} from './sharedWordingState.ts';

const messages = defineMessages({
  sharedNote: {
    id: 'protocolBuilder.stageWording.sharedNote',
    defaultMessage:
      'These words appear on every stage of this kind. Changes to them are saved straight away.',
    description:
      'Note above the words, in a stage’s wording section, that every stage of the same type shows alike, such as the zoom buttons of every Family Pedigree stage. The protocol holds them once, so changing one changes it on all those stages, and the change is saved as soon as the researcher leaves the field rather than when they save the stage.',
  },
  sharedNoteNoneHeld: {
    id: 'protocolBuilder.stageWording.sharedNoteNoneHeld',
    defaultMessage: 'These words appear on every stage of this kind.',
    description:
      'Note above the words, in a stage’s wording section, that every stage of the same type shows alike, such as the drawing tools of every Narrative stage, shown when the protocol uses none of them yet because the stage being edited is the first to need them. The protocol holds them once, so changing one changes it on all those stages. Each of them says beside itself when a change to it is saved.',
  },
  savedWithStage: {
    id: 'protocolBuilder.stageWording.savedWithStage',
    defaultMessage: 'Changes to this are saved when you save the stage.',
    description:
      'Shown under one of the words every stage of the same type shares, in a stage’s wording section, when the protocol does not use that word until the stage being edited is saved, for example the message shown when a map search finds nothing, which a map stage needs only once its search is turned on. Unlike the other shared words, which are saved as soon as the researcher leaves the field, a change to this one is saved together with the stage, and discarded if the stage is not saved. "this" is the word above the note.',
  },
});

/**
 * The words every stage of a kind shows alike, edited where the stage is.
 *
 * The protocol words them once for all those stages, so they are not part of
 * the stage: a change is written to the protocol as the researcher leaves the
 * group it is in (through the section's `writes`), and is not undone by
 * discarding the stage's own changes. The exception is an entry the saved
 * protocol does not show yet, which the open stage is the first to need: it
 * is held with the stage's draft and saved with the stage (see
 * `SHARED_WORDING_PATH`), and says so beside itself.
 *
 * "Held by the protocol" below means shown by the saved protocol, with the
 * text it shows: the protocol stores a wording only where the researcher
 * changed Network Canvas's.
 */
export default function SharedStageWording({
  groups,
  writes,
}: Readonly<{
  groups: readonly SharedWordingGroup[];
  writes: SharedWordingWrites;
}>) {
  const intl = useAppIntl();
  // Shown only while the section is on, so showing them again means the
  // section was switched back on after closing held its writes back.
  useEffect(() => writes.resume(), [writes]);
  // The note that changes are saved straight away is said only over words
  // that are: an entry held with the stage says the opposite beside itself.
  const anyHeld = groups.some(({ entries }) => entries.length > 0);
  return (
    <>
      <Paragraph>
        {intl.formatMessage(
          anyHeld ? messages.sharedNote : messages.sharedNoteNoneHeld,
        )}
      </Paragraph>
      {groups.map((group) => (
        <SharedWordingGroupFields
          key={group.group}
          group={group}
          named={groups.length > 1}
          writes={writes}
        />
      ))}
    </>
  );
}

function SharedWordingGroupFields({
  group: { group, keys, entries },
  named,
  writes,
}: Readonly<{
  group: SharedWordingGroup;
  named: boolean;
  writes: SharedWordingWrites;
}>) {
  const intl = useAppIntl();
  const { readOnly, storeApi } = useStageEditorForm();
  const localization = useProtocolLocalization();
  const headingId = useId();

  // The entries the protocol holds whose field still holds the researcher's
  // unsaved change from before it did (`isHandedOver`): kept in the field the
  // researcher was using, as their draft of the shared word, until it is
  // written. One control throughout, so a word being typed when the protocol
  // comes to hold it keeps its text, its caret and focus.
  const heldWordOf = useCallback(
    (key: string) => entries.find(([heldKey]) => heldKey === key)?.[1],
    [entries],
  );
  const handedOverKeys = useSyncExternalStore(storeApi.subscribe, () =>
    keys
      .filter((key) =>
        isHandedOver(
          sharedWordingInForm(storeApi, group, key),
          heldWordOf(key),
        ),
      )
      .join('\n'),
  );
  const handedOver = new Set(handedOverKeys.split('\n'));

  // What the researcher has typed and the protocol does not hold yet, by
  // entry, and why the protocol would not take it.
  const [drafts, setDrafts] = useState<ReadonlyMap<string, LocalizedString>>(
    () => new Map(),
  );
  const [refusals, setRefusals] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const latest = useLatest({ drafts, entries });

  // The words last sent for each entry and not yet landed. Until they land,
  // they are what the protocol will hold, so a draft is compared with them
  // rather than with what it holds now: words put back while a change is on
  // its way match the protocol, but must still be written after that change.
  // Read by `flush` from the ref, and while rendering from its copy in state.
  const sending = useRef(new Map<string, LocalizedString>());
  const [sendingNow, setSendingNow] = useState<
    ReadonlyMap<string, LocalizedString>
  >(() => new Map());
  const updateSending = useCallback(
    (change: (next: Map<string, LocalizedString>) => void) => {
      const next = new Map(sending.current);
      change(next);
      sending.current = next;
      setSendingNow(next);
    },
    [],
  );

  // A draft the protocol has caught up with is the protocol's again, so a
  // collaborator's later change is shown rather than hidden behind it.
  // Adjusted during render, as the protocol's entries change, rather than in
  // an effect.
  const [seenEntries, setSeenEntries] = useState(entries);
  if (seenEntries !== entries) {
    setSeenEntries(entries);
    setDrafts((current) => {
      const caughtUp = [...current].filter(
        ([key, value]) =>
          isEqual(entries.find(([held]) => held === key)?.[1], value) &&
          (!sendingNow.has(key) || isEqual(sendingNow.get(key), value)),
      );
      if (caughtUp.length === 0) return current;
      const next = new Map(current);
      for (const [key] of caughtUp) next.delete(key);
      return next;
    });
  }

  const flush = useCallback(async () => {
    if (localization === undefined || readOnly) return;
    const { drafts: pending, entries: held } = latest();
    const updates = [...pending].flatMap(([key, value]) => {
      const current = sending.current.has(key)
        ? sending.current.get(key)
        : held.find(([heldKey]) => heldKey === key)?.[1];
      return isEqual(current, value) ||
        sharedWordingProblem(
          group,
          key,
          value,
          localization.defaultLocale,
          intl,
        ) !== undefined
        ? []
        : [{ group, key, value }];
    });
    if (updates.length === 0) return;
    updateSending((next) => {
      for (const { key, value } of updates) next.set(key, value);
    });
    const outcome = await writes.write(updates);
    // Landed or refused: forget the words sent, unless later ones replaced
    // them, and let go of a draft the protocol now holds, as the protocol's
    // entries may have changed while those words were still on their way.
    const settled = updates.filter(
      ({ key, value }) => sending.current.get(key) === value,
    );
    updateSending((next) => {
      for (const { key } of settled) next.delete(key);
    });
    const { entries: now } = latest();
    setDrafts((current) => {
      const caughtUp = settled.filter(({ key }) => {
        const drafted = current.get(key);
        return (
          drafted !== undefined &&
          isEqual(now.find(([nowKey]) => nowKey === key)?.[1], drafted)
        );
      });
      if (caughtUp.length === 0) return current;
      const next = new Map(current);
      for (const { key } of caughtUp) next.delete(key);
      return next;
    });
    // Held back: the section is closing and resets these words itself.
    if (outcome === undefined) return;
    setRefusals((current) => {
      const next = new Map(current);
      for (const { key } of updates) {
        if (outcome.status === 'applied') next.delete(key);
        else next.set(key, outcome.message);
      }
      return next;
    });
  }, [group, intl, latest, localization, readOnly, updateSending, writes]);

  // Leaving the editor with focus still in a field writes what it holds.
  const flushOnLeave = useEffectEvent(() => void flush());
  useEffect(() => () => flushOnLeave(), []);

  if (localization === undefined) return null;

  return (
    <section
      aria-label={named ? undefined : nameInterfaceTextGroup(intl, group)}
      aria-labelledby={named ? headingId : undefined}
      className="not-last:mb-8"
      // The change is written as focus leaves a field, not on every
      // keystroke: each write is a revision of the protocol.
      onBlur={() => {
        void flush();
        if (readOnly) return;
        void carryHandedOverWording({
          storeApi,
          writes,
          held: (heldGroup, key) =>
            heldGroup === group ? heldWordOf(key) : undefined,
          localization,
          intl,
        });
      }}
    >
      {named && (
        <p id={headingId} className="mb-4 font-semibold">
          {nameInterfaceTextGroup(intl, group)}
        </p>
      )}
      {keys.map((key) => {
        const heldEntry = entries.find(([heldKey]) => heldKey === key);
        if (heldEntry === undefined || handedOver.has(key)) {
          return (
            <PendingSharedWord
              key={key}
              group={group}
              wordKey={key}
              localization={localization}
              heldByProtocol={heldEntry !== undefined}
            />
          );
        }
        const [, held] = heldEntry;
        const value = drafts.get(key) ?? held;
        const drafted = drafts.get(key);
        const problem =
          drafted === undefined
            ? undefined
            : sharedWordingProblem(
                group,
                key,
                drafted,
                localization.defaultLocale,
                intl,
              );
        const refusal = refusals.get(key);
        const errors = [problem, refusal].filter(
          (error): error is string => error !== undefined,
        );
        const onChange = (next: LocalizedString | undefined) => {
          setDrafts((current) => new Map(current).set(key, next ?? {}));
        };
        const declaration = interfaceTextArguments(group, key);
        const common = {
          name: `interfaceText.${group}.${key}`,
          label: nameInterfaceText(intl, key),
          hint: hintInterfaceText(intl, key),
          value,
          onChange,
          readOnly,
          required: true,
          errors,
          showErrors: errors.length > 0,
        };
        return declaration === undefined ? (
          <UnconnectedField<typeof LocalizedInputField>
            key={key}
            {...common}
            component={LocalizedInputField}
            wraps
          />
        ) : (
          <UnconnectedField<typeof LocalizedMessageField>
            key={key}
            {...common}
            component={LocalizedMessageField}
            arguments={declaration}
          />
        );
      })}
    </section>
  );
}

/**
 * One shared word the protocol does not hold yet: the open stage is the first
 * to need it. Its wording is a field of the stage form, so it starts with
 * Network Canvas's wording in every language, is held with the stage's draft
 * and checked by the rule a held word is checked by, and is written when the
 * stage is saved (see `pendingSharedWording`) or thrown away with the draft.
 *
 * Still this control if the protocol comes to hold the entry while the field
 * holds a change of the researcher's (`heldByProtocol`), until that change is
 * written: the field, its text and focus stay where they are.
 */
function PendingSharedWord({
  group,
  wordKey,
  localization,
  heldByProtocol,
}: Readonly<{
  group: string;
  wordKey: string;
  localization: ProtocolLocalization;
  /**
   * The protocol has come to hold the entry while the field held the
   * researcher's change: it is their draft of a shared word now, written as
   * one is, so the field no longer says it is saved with the stage.
   */
  heldByProtocol: boolean;
}>) {
  const intl = useAppIntl();
  const { readOnly } = useStageEditorForm();
  const { defaultLocale } = localization;
  const validation = useMemo(
    () => sharedWordingValidation(group, wordKey, defaultLocale, intl),
    [defaultLocale, group, intl, wordKey],
  );
  const hint = [
    hintInterfaceText(intl, wordKey),
    heldByProtocol ? undefined : intl.formatMessage(messages.savedWithStage),
  ]
    .filter((part): part is string => part !== undefined)
    .join('\n\n');
  const declaration = interfaceTextArguments(group, wordKey);
  const common = {
    name: sharedWordingFieldName(group, wordKey),
    label: nameInterfaceText(intl, wordKey),
    hint,
    initialValue: suppliedInterfaceText(group, wordKey, localization),
    readOnly,
    required: REQUIRED,
    custom: validation,
  };
  return declaration === undefined ? (
    <Field<typeof LocalizedInputField>
      {...common}
      component={LocalizedInputField}
      wraps
    />
  ) : (
    <Field<typeof LocalizedMessageField>
      {...common}
      component={LocalizedMessageField}
      arguments={declaration}
    />
  );
}
