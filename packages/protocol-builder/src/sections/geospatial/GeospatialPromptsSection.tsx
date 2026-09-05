import PromptsSection, { type PromptsCopy } from '../PromptsSection.tsx';
import GeospatialPromptEditor from './GeospatialPromptEditor.tsx';
import GeospatialPromptPreview from './GeospatialPromptPreview.tsx';

const DEFAULT_COPY: Partial<PromptsCopy> = {
  description:
    'Write the questions this stage asks about places, and drag them into the order the participant answers them.',
  waitingDescription:
    'Choose the type this stage works with before writing its prompts.',
  fieldHint:
    'Each prompt asks for one place and records it in one location attribute. Add at least one.',
  emptyStateMessage:
    'No prompts yet. Create one to ask the participant where something is.',
};

export type GeospatialPromptsSectionProps = Readonly<{
  copy?: Partial<PromptsCopy>;
}>;

/**
 * The places a geospatial stage asks about.
 *
 * The shared prompt list, with this interface's own row: a question and the
 * location attribute the answer is stored in. Everything a prompt list has in
 * common with every other one — its ordering, its identity per row, its rule
 * that a stage must ask something — belongs to `PromptsSection` and is not
 * repeated here.
 */
export default function GeospatialPromptsSection({
  copy,
}: GeospatialPromptsSectionProps) {
  return (
    <PromptsSection
      PromptEditor={GeospatialPromptEditor}
      PromptPreview={GeospatialPromptPreview}
      copy={{ ...DEFAULT_COPY, ...copy }}
    />
  );
}
