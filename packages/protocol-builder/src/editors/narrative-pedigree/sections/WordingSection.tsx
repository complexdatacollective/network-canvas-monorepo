import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { CustomFieldValidation } from '@codaco/fresco-ui/form/store/types';
import {
  type MessageArguments,
  SNAPSHOT_CONDITION_ARGUMENTS,
  SNAPSHOT_INHERITANCE_ARGUMENTS,
} from '@codaco/protocol-validation';

import LocalizedMessageField, {
  localizedMessageValidation,
} from '../../../fields/LocalizedMessageField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { WordingRow, type WordingSetting } from '../../../form/WordingRow.tsx';
import StageWordingSection from '../../../sections/supplied-wording/StageWordingSection.tsx';
import {
  startingWording,
  useSuppliedStageWording,
} from '../../../sections/supplied-wording/suppliedStageWording.ts';
import { narrativePedigreeMessages as messages } from './narrativePedigreeMessages.ts';

const STAGE_TYPE = 'NarrativePedigree';

/** The words that are not messages with placeholders: each is plain text. */
const TEXT: readonly WordingSetting[] = [
  {
    path: 'saveSnapshot',
    label: messages.saveSnapshotButtonLabel,
    hint: messages.saveSnapshotHint,
  },
  {
    path: 'conditionText.selectCondition',
    label: messages.selectConditionLabel,
    hint: messages.selectConditionHint,
  },
];

/** The snapshot titles, which are messages that fill in the pedigree's own names. */
const SNAPSHOT_TITLES = [
  {
    path: 'conditionText.snapshotCondition',
    label: messages.snapshotConditionLabel,
    hint: messages.snapshotConditionHint,
    arguments: SNAPSHOT_CONDITION_ARGUMENTS,
  },
  {
    path: 'conditionText.snapshotInheritance',
    label: messages.snapshotInheritanceLabel,
    hint: messages.snapshotInheritanceHint,
    arguments: SNAPSHOT_INHERITANCE_ARGUMENTS,
  },
] as const;

/**
 * The words a participant reads on the pedigree that this stage holds: the
 * snapshot button, the condition picker and the snapshot titles. Each starts
 * with Network Canvas's wording. The key and the focus button are the same on
 * every Narrative Pedigree stage, so the protocol holds them once (see
 * `SharedStageWording`).
 */
export default function WordingSection() {
  const intl = useAppIntl();
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedStageWording(STAGE_TYPE);

  const validations = useMemo(
    () =>
      new Map<MessageArguments, CustomFieldValidation>(
        [SNAPSHOT_CONDITION_ARGUMENTS, SNAPSHOT_INHERITANCE_ARGUMENTS].map(
          (declaration) => [
            declaration,
            localizedMessageValidation(declaration, intl),
          ],
        ),
      ),
    [intl],
  );

  return (
    <StageWordingSection
      stageType={STAGE_TYPE}
      paths={[...TEXT, ...SNAPSHOT_TITLES].map((setting) => setting.path)}
    >
      {supplied !== undefined && (
        <>
          {TEXT.map((setting) => (
            <WordingRow
              key={setting.path}
              setting={setting}
              initialValue={startingWording(
                committedFields,
                setting.path,
                supplied,
              )}
            />
          ))}
          {SNAPSHOT_TITLES.map((title) => (
            <Field<typeof LocalizedMessageField>
              key={title.path}
              name={title.path}
              component={LocalizedMessageField}
              label={intl.formatMessage(title.label)}
              hint={intl.formatMessage(title.hint)}
              arguments={title.arguments}
              initialValue={startingWording(
                committedFields,
                title.path,
                supplied,
              )}
              required={REQUIRED}
              custom={validations.get(title.arguments)}
            />
          ))}
        </>
      )}
    </StageWordingSection>
  );
}
