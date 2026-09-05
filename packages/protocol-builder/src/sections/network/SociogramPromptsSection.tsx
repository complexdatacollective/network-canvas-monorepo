import PromptsSection, { type PromptsCopy } from '../PromptsSection.tsx';
import {
  SociogramPromptFields,
  SociogramPromptPreview,
} from './SociogramPromptFields.tsx';

const SOCIOGRAM_COPY: Partial<PromptsCopy> = {
  description:
    'Write the tasks the participant works through on the canvas, and drag them into the order they do them.',
  waitingDescription:
    'Choose what this stage works with before writing its prompts.',
  fieldHint:
    'The participant works through these one at a time, in this order. Each one decides what the canvas shows and what tapping a node does.',
  emptyStateMessage:
    'No prompts yet. Create one to say what the participant does on the canvas.',
};

export type SociogramPromptsSectionProps = Readonly<{
  copy?: Partial<PromptsCopy>;
}>;

/**
 * The tasks this sociogram sets, in order.
 *
 * The list, its ordering, its dialog and its rule that a stage must ask
 * something are the package's shared prompt section; everything this interface
 * adds is inside the row dialog — where the nodes are remembered, which
 * connections are drawn, and what tapping a node does.
 */
export default function SociogramPromptsSection({
  copy,
}: SociogramPromptsSectionProps) {
  return (
    <PromptsSection
      PromptEditor={SociogramPromptFields}
      PromptPreview={SociogramPromptPreview}
      copy={{ ...SOCIOGRAM_COPY, ...copy }}
    />
  );
}
