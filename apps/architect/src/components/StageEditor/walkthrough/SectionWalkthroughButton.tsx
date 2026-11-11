import { Info } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import { useStageEdit } from '@codaco/protocol-builder/stageEdit';

import { useStageWalkthrough } from './StageWalkthrough';
import { openWalkthrough } from './walkthroughStore';

const messages = defineMessages({
  label: {
    id: 'architect.stageEditor.walkthrough.sectionWalkthrough',
    defaultMessage: 'Walk me through {section}',
    description:
      'Accessible name and tooltip of the info button beside the title of a section of the stage being edited. It opens the step-by-step guide to the stage at the step about that section. section is the section’s title, such as “Prompts”.',
  },
});

/**
 * Beside a section's title, opens the walkthrough at the first step about
 * that section. Shown only for a section a step is about.
 */
function SectionWalkthroughButton({ title }: Readonly<{ title: string }>) {
  const intl = useAppIntl();
  const walkthrough = useStageWalkthrough();
  const { identity } = useStageEdit();
  const step =
    walkthrough?.steps
      .filter((candidate) => candidate.dialog === undefined)
      .findIndex(
        (candidate) => candidate.section?.toLowerCase() === title.toLowerCase(),
      ) ?? -1;
  if (step === -1) return null;
  const label = intl.formatMessage(messages.label, { section: title });
  return (
    <IconButton
      size="sm"
      variant="text"
      icon={<Info aria-hidden />}
      title={label}
      aria-label={label}
      onClick={(event) =>
        openWalkthrough(event.currentTarget, identity?.id ?? '', step)
      }
    />
  );
}

export const renderSectionWalkthroughButton = (title: string) => (
  <SectionWalkthroughButton title={title} />
);
