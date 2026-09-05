import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import AlterLimitsSection from '../../sections/AlterLimitsSection.tsx';
import NameGeneratorPromptsSection from '../../sections/NameGeneratorPromptsSection.tsx';
import NodePanelsSection from '../../sections/NodePanelsSection.tsx';
import QuickAddSection from '../../sections/QuickAddSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';
import NameGeneratorFrame from './NameGeneratorFrame.tsx';

const DOCUMENTATION_URL = interfaceDocumentationUrl(
  'name-generator-using-quick-add',
);

/**
 * The name generator a participant names people with in a single box.
 *
 * The same stage as the form-based name generator with the form replaced by
 * one attribute: the participant types a name and a person exists. That is
 * why quick add sits where the form does — it is what this stage records —
 * and why it is required rather than optional, since a stage with nothing to
 * fill in creates people with no name at all.
 *
 * Owns `subject`, `quickAdd`, `prompts`, `panels` and
 * `behaviours.{minNodes,maxNodes}`; the frame owns `label`, `skipLogic` and
 * `interviewScript`.
 */
export function NameGeneratorQuickAddStageEditor({
  controller,
  actions,
}: StageEditorProps<'NameGeneratorQuickAdd'>) {
  return (
    <NameGeneratorFrame
      controller={controller}
      documentationUrl={DOCUMENTATION_URL}
      {...(actions === undefined ? {} : { actions })}
    >
      <SubjectSection entity="node" />
      <QuickAddSection />
      <NameGeneratorPromptsSection />
      <NodePanelsSection />
      <AlterLimitsSection />
    </NameGeneratorFrame>
  );
}
