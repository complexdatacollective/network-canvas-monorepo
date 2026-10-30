import { isEqual } from 'es-toolkit';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  interfaceTextArguments,
  type LocalizedString,
} from '@codaco/protocol-validation';

import LocalizedMessageField, {
  localizedMessageProblemText,
} from '../../fields/LocalizedMessageField.tsx';
import { LocalizedInputField } from '../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../form/requiredField.ts';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import {
  nameInterfaceText,
  nameInterfaceTextGroup,
} from '../../localization/interfaceTextNames.ts';
import { useProtocolLocalization } from '../../localization/ProtocolLocalization.tsx';
import type {
  SharedWordingGroup,
  SharedWordingWrites,
} from './sharedWordingState.ts';

const messages = defineMessages({
  sharedNote: {
    id: 'protocolBuilder.stageWording.sharedNote',
    defaultMessage:
      'These words appear on every stage of this kind. Changes to them are saved straight away.',
    description:
      'Note above the words, in a stage’s wording section, that every stage of the same type shows alike, such as the zoom buttons of every Family Pedigree stage. The protocol holds them once, so changing one changes it on all those stages, and the change is saved as soon as the researcher leaves the field rather than when they save the stage.',
  },
});

/**
 * Why a shared word cannot be saved as it reads, or undefined when it can:
 * every one the protocol holds needs words in its default language, and one
 * that shows values has to show them as its setting allows.
 */
const problemOf = (
  group: string,
  key: string,
  value: LocalizedString,
  defaultLocale: string,
  intl: IntlShape,
): string | undefined => {
  if ((value[defaultLocale] ?? '').trim() === '') return REQUIRED;
  const declaration = interfaceTextArguments(group, key);
  return declaration === undefined
    ? undefined
    : localizedMessageProblemText(value, declaration, intl);
};

/**
 * The words every stage of a kind shows alike, edited where the stage is.
 *
 * The protocol holds them once for all those stages, so they are not part of
 * the stage: a change is written to the protocol as the researcher leaves the
 * group it is in (through the section's `writes`), and is not undone by
 * discarding the stage's own changes.
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
  return (
    <>
      <Paragraph>{intl.formatMessage(messages.sharedNote)}</Paragraph>
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
  group: { group, entries },
  named,
  writes,
}: Readonly<{
  group: SharedWordingGroup;
  named: boolean;
  writes: SharedWordingWrites;
}>) {
  const intl = useAppIntl();
  const { readOnly } = useStageEditorForm();
  const localization = useProtocolLocalization();
  const headingId = useId();

  // What the researcher has typed and the protocol does not hold yet, by
  // entry, and why the protocol would not take it.
  const [drafts, setDrafts] = useState<ReadonlyMap<string, LocalizedString>>(
    () => new Map(),
  );
  const [refusals, setRefusals] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const latest = useRef({ drafts, entries });
  latest.current = { drafts, entries };

  // A draft the protocol has caught up with is the protocol's again, so a
  // collaborator's later change is shown rather than hidden behind it.
  useEffect(() => {
    setDrafts((current) => {
      const caughtUp = [...current].filter(([key, value]) =>
        isEqual(entries.find(([held]) => held === key)?.[1], value),
      );
      if (caughtUp.length === 0) return current;
      const next = new Map(current);
      for (const [key] of caughtUp) next.delete(key);
      return next;
    });
  }, [entries]);

  const flush = useCallback(async () => {
    if (localization === undefined || readOnly) return;
    const { drafts: pending, entries: held } = latest.current;
    const updates = [...pending].flatMap(([key, value]) => {
      const current = held.find(([heldKey]) => heldKey === key)?.[1];
      return isEqual(current, value) ||
        problemOf(group, key, value, localization.defaultLocale, intl) !==
          undefined
        ? []
        : [{ group, key, value }];
    });
    if (updates.length === 0) return;
    const outcome = await writes.write(updates);
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
  }, [group, intl, localization, readOnly, writes]);

  // Leaving the editor with focus still in a field writes what it holds.
  const flushOnLeave = useRef(flush);
  flushOnLeave.current = flush;
  useEffect(() => () => void flushOnLeave.current(), []);

  if (localization === undefined) return null;

  return (
    <section
      aria-label={named ? undefined : nameInterfaceTextGroup(intl, group)}
      aria-labelledby={named ? headingId : undefined}
      className="not-last:mb-8"
      // The change is written as focus leaves a field, not on every
      // keystroke: each write is a revision of the protocol.
      onBlur={() => void flush()}
    >
      {named && (
        <p id={headingId} className="mb-4 font-semibold">
          {nameInterfaceTextGroup(intl, group)}
        </p>
      )}
      {entries.map(([key, held]) => {
        const value = drafts.get(key) ?? held;
        const drafted = drafts.get(key);
        const problem =
          drafted === undefined
            ? undefined
            : problemOf(group, key, drafted, localization.defaultLocale, intl);
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
