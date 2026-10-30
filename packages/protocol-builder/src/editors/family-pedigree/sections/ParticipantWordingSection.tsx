import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { CustomFieldValidation } from '@codaco/fresco-ui/form/store/types';
import {
  type LocalizedString,
  type MessageArguments,
  PEDIGREE_PERSON_ARGUMENTS,
  PEDIGREE_WORDING_ARGUMENTS,
} from '@codaco/protocol-validation';

import LocalizedMessageField, {
  localizedMessageValidation,
} from '../../../fields/LocalizedMessageField.tsx';
import { LocalizedInputField } from '../../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import {
  useStageHasAnyValue,
  useStageValue,
} from '../../../form/stageFormHooks.ts';
import StageWordingSection from '../../../sections/supplied-wording/StageWordingSection.tsx';
import {
  startingWording,
  useSuppliedStageWording,
} from '../../../sections/supplied-wording/suppliedStageWording.ts';
import {
  PARTICIPANT_WORDING_GROUPS,
  settingPath,
  type WordingGate,
  type WordingGroup,
} from './participantWordingSettings.ts';
import {
  COMPLETENESS_PATH,
  NODE_CONFIGURATION_PATHS,
} from './pedigreeSlots.ts';

const COMPLETENESS_FIELDS = [COMPLETENESS_PATH];

/**
 * Every setting the participant sees on this stage, in the words the
 * Family Pedigree's own interface uses, with the wording Network Canvas
 * supplies for each in the protocol's languages, in the order a participant
 * meets them, each with a hint saying where it is shown.
 *
 * A setting the stage gains while the section's part for it is closed
 * (choosing the framing, asking gender identity, or switching on the
 * completeness requirement) is written with Network Canvas's wording when the
 * stage is saved (see `stageDocument`). The fields start as the stage holds
 * them, or as Network Canvas supplies them, so the section waits for the
 * protocol's languages.
 */
export default function ParticipantWordingSection() {
  const intl = useAppIntl();
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedStageWording('FamilyPedigree');
  const framing = useStageValue('framing');
  const genderIdentity = useStageValue(NODE_CONFIGURATION_PATHS.genderIdentity);
  const checksCompleteness = useStageHasAnyValue(COMPLETENESS_FIELDS);
  const shown: Readonly<Record<WordingGate, boolean>> = {
    choosesFraming: framing === 'participantPreference',
    asksGenderIdentity: genderIdentity !== undefined,
    checksCompleteness,
  };

  const validations = useMemo(
    () =>
      new Map<MessageArguments, CustomFieldValidation>(
        [
          ...Object.values(PEDIGREE_WORDING_ARGUMENTS),
          PEDIGREE_PERSON_ARGUMENTS,
        ].map((declaration) => [
          declaration,
          localizedMessageValidation(declaration, intl),
        ]),
      ),
    [intl],
  );

  const groups = PARTICIPANT_WORDING_GROUPS.filter(
    (group) => group.gate === undefined || shown[group.gate],
  );
  const paths = groups.flatMap((group) =>
    group.settings
      .filter((setting) => setting.gate === undefined || shown[setting.gate])
      .map((setting) => settingPath(group, setting)),
  );

  return (
    <StageWordingSection stageType="FamilyPedigree" paths={paths}>
      {supplied !== undefined &&
        groups.map((group) => (
          <WordingGroupFields
            key={group.id}
            group={group}
            shown={shown}
            committedFields={committedFields}
            supplied={supplied}
            validations={validations}
          />
        ))}
    </StageWordingSection>
  );
}

type GroupFieldsProps = Readonly<{
  shown: Readonly<Record<WordingGate, boolean>>;
  committedFields: Parameters<typeof startingWording>[0];
  supplied: ReadonlyMap<string, LocalizedString>;
  validations: ReadonlyMap<MessageArguments, CustomFieldValidation>;
}>;

/** The fields of one group: each of its settings the stage shows. */
function WordingGroupFields({
  group,
  shown,
  committedFields,
  supplied,
  validations,
}: GroupFieldsProps & Readonly<{ group: WordingGroup }>) {
  const intl = useAppIntl();
  return group.settings
    .filter((setting) => setting.gate === undefined || shown[setting.gate])
    .map((setting) => {
      const name = settingPath(group, setting);
      const label = intl.formatMessage(setting.label);
      const hint =
        setting.hint === undefined
          ? undefined
          : intl.formatMessage(setting.hint);
      const initialValue = startingWording(committedFields, name, supplied);
      return setting.arguments === undefined ? (
        <Field<typeof LocalizedInputField>
          key={name}
          name={name}
          component={LocalizedInputField}
          label={label}
          hint={hint}
          wraps={setting.wraps}
          initialValue={initialValue}
          required={REQUIRED}
        />
      ) : (
        <Field<typeof LocalizedMessageField>
          key={name}
          name={name}
          component={LocalizedMessageField}
          label={label}
          hint={hint}
          arguments={setting.arguments}
          initialValue={initialValue}
          required={REQUIRED}
          custom={validations.get(setting.arguments)}
        />
      );
    });
}
