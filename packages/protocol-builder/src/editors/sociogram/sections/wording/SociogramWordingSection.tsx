import { useAppIntl } from '@codaco/app-i18n/react';
import { suppliedStageSettingApplies } from '@codaco/protocol-validation';

import { useStageEditorForm } from '../../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../../form/stageFormHooks.ts';
import {
  WordingRow,
  type WordingSetting,
} from '../../../../form/WordingRow.tsx';
import BuilderSection from '../../../../sections/BuilderSection.tsx';
import {
  startingWording,
  useSuppliedStageWording,
} from '../../../../sections/supplied-wording/suppliedStageWording.ts';
import { sociogramWordingMessages as messages } from './sociogramWordingMessages.ts';

const STAGE_TYPE = 'Sociogram';

/** The layout tools' words, asked while automatic layout is on. */
const WORDS: readonly WordingSetting[] = [
  {
    path: 'tooltips.pauseLayout',
    label: messages.pauseLayoutTooltipLabel,
    hint: messages.layoutTooltipHint,
  },
  {
    path: 'tooltips.resumeLayout',
    label: messages.resumeLayoutTooltipLabel,
    hint: messages.layoutTooltipHint,
  },
];

/**
 * The labels of the sociogram's layout tools. They are asked only while the
 * stage lays its nodes out automatically, and each starts with Network
 * Canvas's wording.
 */
export default function SociogramWordingSection() {
  const intl = useAppIntl();
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedStageWording(STAGE_TYPE);
  const stage = {
    type: STAGE_TYPE,
    behaviours: useStageValue('behaviours'),
  };

  return (
    <BuilderSection
      title={intl.formatMessage(messages.wordingTitle)}
      description={intl.formatMessage(messages.wordingDescription)}
    >
      {supplied !== undefined &&
        WORDS.filter((setting) =>
          suppliedStageSettingApplies(stage, setting.path.split('.')),
        ).map((setting) => (
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
    </BuilderSection>
  );
}
