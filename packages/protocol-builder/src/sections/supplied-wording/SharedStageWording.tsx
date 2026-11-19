import { isEqual } from 'es-toolkit';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
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
  sharedWordingFieldName,
  sharedWordingInForm,
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
import type { SharedWordingGroup } from './sharedWordingState.ts';

const messages = defineMessages({
  sharedNote: {
    id: 'protocolBuilder.stageWording.sharedNoteNoneHeld',
    defaultMessage: 'These words appear on every stage of this kind.',
    description:
      'Note above the words, in a stage’s wording section, that every stage of the same type shows alike, such as the drawing tools of every Narrative stage. The protocol holds them once, so a change to one, saved with the stage being edited, changes it on all those stages.',
  },
});

/**
 * The words every stage of a kind shows alike, edited where the stage is.
 *
 * The protocol words them once for all those stages, but a change made here
 * is made in the stage editor, and so is part of the stage's draft like any
 * other: it is held in the stage form, makes the stage unsaved, is written
 * with the stage when it is saved (see `pendingSharedWording`), and is thrown
 * away with the draft when it is not.
 *
 * "Held by the protocol" below means shown by the saved protocol, with the
 * text it shows: the protocol stores a wording only where the researcher
 * changed Network Canvas's.
 */
export default function SharedStageWording({
  groups,
}: Readonly<{
  groups: readonly SharedWordingGroup[];
}>) {
  const intl = useAppIntl();
  return (
    <>
      <Paragraph>{intl.formatMessage(messages.sharedNote)}</Paragraph>
      {groups.map((group) => (
        <SharedWordingGroupFields
          key={group.group}
          group={group}
          named={groups.length > 1}
        />
      ))}
    </>
  );
}

function SharedWordingGroupFields({
  group: { group, keys, entries },
  named,
}: Readonly<{
  group: SharedWordingGroup;
  named: boolean;
}>) {
  const intl = useAppIntl();
  const localization = useProtocolLocalization();
  const headingId = useId();

  if (localization === undefined) return null;

  return (
    <section
      aria-label={named ? undefined : nameInterfaceTextGroup(intl, group)}
      aria-labelledby={named ? headingId : undefined}
      className="not-last:mb-8"
    >
      {named && (
        <p id={headingId} className="mb-4 font-semibold">
          {nameInterfaceTextGroup(intl, group)}
        </p>
      )}
      {keys.map((key) => (
        <SharedWord
          key={key}
          group={group}
          wordKey={key}
          localization={localization}
          held={entries.find(([heldKey]) => heldKey === key)?.[1]}
        />
      ))}
    </section>
  );
}

/**
 * One shared word, as a field of the stage form: it starts with what the
 * saved protocol shows for it (`held`), or with Network Canvas's wording in
 * every language where the open stage is the first to use it, and is checked
 * by the rule a shared word is saved under.
 *
 * The field is measured against that wording, so the stage is unsaved while
 * it holds anything else. When a collaborator saves the same word while the
 * stage is open, a field the researcher has left alone follows it, as it
 * holds no change of theirs; one they have changed keeps their wording, which
 * the stage's save writes over the collaborator's. The field's baseline moves
 * with the protocol either way (the field registers again with its new
 * starting wording), so the stage is unsaved exactly while the field differs
 * from what the protocol shows. One control throughout, so a word being typed
 * when the protocol changes keeps its text, its caret and focus.
 */
function SharedWord({
  group,
  wordKey,
  localization,
  held,
}: Readonly<{
  group: string;
  wordKey: string;
  localization: ProtocolLocalization;
  held: LocalizedString | undefined;
}>) {
  const intl = useAppIntl();
  const { readOnly, storeApi } = useStageEditorForm();
  const { defaultLocale } = localization;
  const name = sharedWordingFieldName(group, wordKey);
  const heldWording = useStableWording(held);
  const standing = useStableWording(
    held ?? suppliedInterfaceText(group, wordKey, localization),
  );

  // What the field was last measured against. A field parked out of sight
  // (its part closed, or its setting off) was measured against the wording
  // the protocol showed when it was parked, which may since have changed:
  // read before this control registers it again, as registering takes the
  // starting wording below as its baseline.
  const [parked] = useState(() =>
    sharedWordingInForm(storeApi, group, wordKey),
  );
  const measuredAgainst = useRef<unknown>(
    parked === undefined ? standing : parked.baseline,
  );
  useEffect(() => {
    const previous = measuredAgainst.current;
    measuredAgainst.current = standing;
    if (isEqual(previous, standing)) return;
    const inForm = sharedWordingInForm(storeApi, group, wordKey);
    if (inForm !== undefined && isEqual(inForm.value, previous)) {
      storeApi.getState().setFieldValue(name, standing);
    }
  }, [group, name, standing, storeApi, wordKey]);

  const validation = useMemo(
    () =>
      sharedWordingValidation(group, wordKey, heldWording, defaultLocale, intl),
    [defaultLocale, group, heldWording, intl, wordKey],
  );
  const declaration = interfaceTextArguments(group, wordKey);
  const common = {
    name,
    label: nameInterfaceText(intl, wordKey),
    hint: hintInterfaceText(intl, wordKey),
    initialValue: standing,
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

/**
 * The same object for as long as the wording reads the same: the protocol is
 * read again on every change to it, and a new object for the same words
 * would register the field again for nothing.
 */
function useStableWording(
  wording: LocalizedString | undefined,
): LocalizedString | undefined {
  const [stable, setStable] = useState(() => wording);
  if (stable !== wording && !isEqual(stable, wording)) {
    setStable(() => wording);
    return wording;
  }
  return stable;
}
