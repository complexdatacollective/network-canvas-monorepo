import PromptsSection from '../PromptsSection.tsx';
import { networkCanvasMessages } from './networkCanvasMessages.ts';
import {
  SociogramPromptFields,
  SociogramPromptPreview,
} from './SociogramPromptFields.tsx';

/**
 * The tasks this sociogram sets, in order.
 *
 * The list, its ordering, its dialog and its rule that a stage must ask
 * something are the package's shared prompt section; everything this interface
 * adds is inside the row dialog — where the nodes are remembered, which
 * connections are drawn, and what tapping a node does.
 *
 * The four sentences handed down are descriptors, not strings: the shared
 * section is worded for a question the participant answers, and a sociogram's
 * prompts set TASKS performed on a canvas — a difference a translator has to
 * be shown rather than left to infer from a section they never see.
 */
export default function SociogramPromptsSection() {
  return (
    <PromptsSection
      PromptEditor={SociogramPromptFields}
      PromptPreview={SociogramPromptPreview}
      description={networkCanvasMessages.sociogramPromptsDescription}
      waitingDescription={
        networkCanvasMessages.sociogramPromptsWaitingDescription
      }
      fieldHint={networkCanvasMessages.sociogramPromptsFieldHint}
      emptyState={networkCanvasMessages.sociogramPromptsEmptyState}
    />
  );
}
