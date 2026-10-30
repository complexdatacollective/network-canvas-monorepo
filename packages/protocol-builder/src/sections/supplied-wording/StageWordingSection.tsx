import { isEqual } from 'es-toolkit';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import { STAGE_TYPE_INTERFACE_TEXT } from '@codaco/protocol-validation';
import type { StageType } from '@codaco/protocol-validation';

import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { stageAnswerAt } from '../../form/stageFormHooks.ts';
import { useProtocolLocalization } from '../../localization/ProtocolLocalization.tsx';
import BuilderSection from '../BuilderSection.tsx';
import SharedStageWording from './SharedStageWording.tsx';
import { useSuppliedStageWording } from './suppliedStageWording.ts';

const messages = defineMessages({
  defaultWhenOff: {
    id: 'protocolBuilder.stageWording.defaultWhenOff',
    defaultMessage:
      'Switch this off to use Network Canvas’s wording in every language.',
    description:
      'Follows the description of a stage’s Wording section, which can be switched off. Says what switching it off does: the stage then shows the wording Network Canvas supplies, in each of the protocol’s languages, instead of wording the researcher wrote.',
  },
  switchOffTitle: {
    id: 'protocolBuilder.stageWording.switchOffTitle',
    defaultMessage: 'Use Network Canvas’s wording?',
    description:
      'Title of the dialog asking a researcher to confirm switching off a stage’s Wording section after they changed some of its wording.',
  },
  switchOffDescription: {
    id: 'protocolBuilder.stageWording.switchOffDescription',
    defaultMessage:
      'The wording you changed in this section goes back to Network Canvas’s wording, in every language.',
    description:
      'Body of the dialog asking a researcher to confirm switching off a stage’s Wording section. Says what they lose: each text they changed returns to the wording Network Canvas supplies, in every one of the protocol’s languages.',
  },
  switchOffConfirm: {
    id: 'protocolBuilder.stageWording.switchOffConfirm',
    defaultMessage: 'Use Network Canvas’s wording',
    description:
      'Confirm button of the dialog that switches off a stage’s Wording section and puts back the wording Network Canvas supplies.',
  },
});

const asFieldValue = (value: unknown): FieldValue =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- supplied wording is a language-to-text map, which a localized text field holds as its value
  value as FieldValue;

type StageWordingSectionProps = Readonly<{
  stageType: StageType;
  title: string;
  description: string;
  /** The dotted paths of the settings the section shows. */
  paths: readonly string[];
  children: ReactNode;
}>;

/**
 * A stage's Wording section: the words a participant reads that this stage
 * holds, each starting with Network Canvas's wording, and the words every
 * stage of its kind shares, which the protocol holds once.
 *
 * Optional. Switched off, the stage holds Network Canvas's wording in every
 * language, which follows the protocol as languages are added or removed, so
 * switching off puts that wording back (asking first if the researcher changed
 * any of it). It starts on when the stage already holds wording of the
 * researcher's own, and whenever the protocol has more than one language, so
 * a translation still to be written is in view.
 */
export default function StageWordingSection({
  stageType,
  title,
  description,
  paths,
  children,
}: StageWordingSectionProps) {
  const intl = useAppIntl();
  const { confirm } = useDialog();
  const { storeApi, committedFields, applyOwnCommands } = useStageEditorForm();
  const localization = useProtocolLocalization();
  const supplied = useSuppliedStageWording(stageType);

  const differsFromSupplied = useCallback(
    (read: (path: string) => unknown) =>
      supplied !== undefined &&
      paths.some(
        (path) =>
          supplied.has(path) && !isEqual(read(path), supplied.get(path)),
      ),
    [paths, supplied],
  );

  const shouldStartOn = () =>
    (localization?.locales.length ?? 1) > 1 ||
    differsFromSupplied((path) =>
      stageAnswerAt(storeApi.getState(), committedFields, path),
    );
  // Decided once, as the section mounts, but not before the protocol's
  // languages are read: the stage can open a moment before its settings.
  const [startOn, setStartOn] = useState(shouldStartOn);
  const [decided, setDecided] = useState(localization !== undefined);
  useEffect(() => {
    if (decided || localization === undefined) return;
    setStartOn(shouldStartOn());
    setDecided(true);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- decided once, when the languages arrive
  }, [decided, localization]);

  const switchOff = useCallback(async () => {
    if (supplied === undefined) return false;
    const liveValue = (path: string) =>
      stageAnswerAt(storeApi.getState(), committedFields, path);
    if (differsFromSupplied(liveValue)) {
      const confirmed = await confirm({
        title: intl.formatMessage(messages.switchOffTitle),
        description: intl.formatMessage(messages.switchOffDescription),
        confirmLabel: intl.formatMessage(messages.switchOffConfirm),
        cancelLabel: intl.formatMessage(commonMessages.cancel),
        intent: 'warning',
        onConfirm: () => undefined,
      });
      if (confirmed !== true) return false;
    }

    const resets = paths.flatMap((path) => {
      const value = supplied.get(path);
      return value === undefined || isEqual(liveValue(path), value)
        ? []
        : [{ path, value }];
    });
    // The document first, in one batch, then the controls: a field the
    // section is closing over is parked with its value, and would write the
    // researcher's wording back on save.
    const { refused } = applyOwnCommands(
      resets.map(({ path, value }) => ({
        op: 'set' as const,
        key: path.split('.'),
        value,
      })),
    );
    if (refused) return false;
    const { fields, dormantValues } = storeApi.getState();
    for (const { path, value } of resets) {
      if (!fields.has(path) && !dormantValues.has(path)) continue;
      storeApi.getState().setFieldValue(path, asFieldValue(value));
    }
    return true;
  }, [
    applyOwnCommands,
    committedFields,
    confirm,
    differsFromSupplied,
    intl,
    paths,
    storeApi,
    supplied,
  ]);

  const sharedGroups = STAGE_TYPE_INTERFACE_TEXT[stageType] ?? [];

  return (
    <BuilderSection
      // Mounted again once the languages are known, so it reads `startOn`
      // from them.
      key={decided ? 'decided' : 'pending'}
      title={title}
      description={`${description} ${intl.formatMessage(messages.defaultWhenOff)}`}
      optional={{ startOn, switchOff, owns: paths }}
    >
      {children}
      {sharedGroups.length > 0 && <SharedStageWording groups={sharedGroups} />}
    </BuilderSection>
  );
}
