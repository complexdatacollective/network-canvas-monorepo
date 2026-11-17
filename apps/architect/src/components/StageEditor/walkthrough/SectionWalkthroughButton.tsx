import { Info } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
import type { SectionKey } from '@codaco/protocol-builder/sections/sectionKeys';
import { useStageEdit } from '@codaco/protocol-builder/stageEdit';

import { useWalkthrough } from './useWalkthrough';
import { openWalkthrough } from './walkthroughStore';

const messages = defineMessages({
  label: {
    id: 'architect.stageEditor.walkthrough.sectionWalkthrough',
    defaultMessage: 'Walk me through {section}',
    description:
      'Accessible name and tooltip of the info button beside the title of a section of the stage being edited. It opens the step-by-step guide to the stage at the step about that section. section is the section’s title, such as “Prompts”.',
  },
});

type Section = Readonly<{ key: SectionKey; title: string }>;

/**
 * Beside a section's title, opens the walkthrough at the first step about
 * that section. Shown only for a section a step is about.
 */
function SectionWalkthroughButton({ section }: Readonly<{ section: Section }>) {
  const intl = useAppIntl();
  const { identity } = useStageEdit();
  const walkthrough = useWalkthrough(identity?.type);
  const step =
    walkthrough?.steps.findIndex(
      (candidate) => candidate.section === section.key,
    ) ?? -1;
  if (step === -1) return null;
  const label = intl.formatMessage(messages.label, { section: section.title });
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <IconButton
            size="sm"
            variant="text"
            icon={<Info aria-hidden />}
            aria-label={label}
            onClick={(event) =>
              openWalkthrough(event.currentTarget, identity?.id ?? '', step)
            }
          />
        }
      />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export const renderSectionWalkthroughButton = (section: Section) => (
  <SectionWalkthroughButton section={section} />
);
