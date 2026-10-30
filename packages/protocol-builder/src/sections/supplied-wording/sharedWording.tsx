import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { STAGE_TYPE_INTERFACE_TEXT } from '@codaco/protocol-validation';
import type { StageType } from '@codaco/protocol-validation';

import type { StageSection } from '../../editors/defineStageEditor.tsx';
import BuilderSection from '../BuilderSection.tsx';
import SharedStageWording from './SharedStageWording.tsx';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.stageWording.sharedTitle',
    defaultMessage: 'Participant wording',
    description:
      'Heading of the stage editor section listing the words every stage of this type shows a participant alike, for a stage type that has no wording of its own to edit. Matches the Participant wording section of the other stage types.',
  },
});

/**
 * The Participant wording section of a stage type that holds no wording of its own: only
 * the words every stage of its kind shows alike (see `SharedStageWording`).
 */
export const sharedWording =
  (stageType: StageType): StageSection =>
  () => <SharedWordingSection stageType={stageType} />;

function SharedWordingSection({
  stageType,
}: Readonly<{ stageType: StageType }>) {
  const intl = useAppIntl();
  return (
    <BuilderSection title={intl.formatMessage(messages.title)}>
      <SharedStageWording groups={STAGE_TYPE_INTERFACE_TEXT[stageType] ?? []} />
    </BuilderSection>
  );
}
