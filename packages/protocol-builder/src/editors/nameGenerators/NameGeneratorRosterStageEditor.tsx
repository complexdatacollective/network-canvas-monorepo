import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import AlterLimitsSection from '../../sections/AlterLimitsSection.tsx';
import CardDisplaySection from '../../sections/CardDisplaySection.tsx';
import ExternalDataSourceSection from '../../sections/ExternalDataSourceSection.tsx';
import NameGeneratorPromptsSection from '../../sections/NameGeneratorPromptsSection.tsx';
import SearchOptionsSection from '../../sections/SearchOptionsSection.tsx';
import SortOptionsSection from '../../sections/SortOptionsSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';
import NameGeneratorFrame from './NameGeneratorFrame.tsx';

const DOCUMENTATION_URL = interfaceDocumentationUrl('name-generator-roster');

/**
 * The name generator a participant chooses people from a list with.
 *
 * Nobody is typed in here: the people already exist in a data file, and the
 * participant picks them. So the data file comes first — everything after it
 * names one of its columns — and the three sections that describe the list
 * itself come after the questions, because they are how the stage LOOKS
 * rather than what it asks. This stage has no side panels: the roster is the
 * panel.
 *
 * Owns `subject`, `dataSource`, `prompts`, `cardOptions.additionalProperties`,
 * `sortOptions.{sortOrder,sortableProperties}`,
 * `searchOptions.{matchProperties,fuzziness}` and
 * `behaviours.{minNodes,maxNodes}`; the frame owns `label`, `skipLogic` and
 * `interviewScript`.
 */
export function NameGeneratorRosterStageEditor({
  controller,
}: StageEditorProps<'NameGeneratorRoster'>) {
  return (
    <NameGeneratorFrame
      controller={controller}
      documentationUrl={DOCUMENTATION_URL}
    >
      <SubjectSection entity="node" />
      <ExternalDataSourceSection />
      <NameGeneratorPromptsSection />
      <CardDisplaySection />
      <SortOptionsSection />
      <SearchOptionsSection />
      <AlterLimitsSection />
    </NameGeneratorFrame>
  );
}
