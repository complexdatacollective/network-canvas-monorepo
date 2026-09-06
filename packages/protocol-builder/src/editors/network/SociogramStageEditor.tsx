import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import AutomaticLayoutSection from '../../sections/network/AutomaticLayoutSection.tsx';
import BackgroundSection from '../../sections/network/BackgroundSection.tsx';
import NarrativeBehavioursSection from '../../sections/network/NarrativeBehavioursSection.tsx';
import SociogramPromptsSection from '../../sections/network/SociogramPromptsSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageHeading from '../../sections/StageHeading.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';

const DOCUMENTATION_URL = interfaceDocumentationUrl('sociogram');

/**
 * A sociogram grants the same two canvas permissions a narrative does, and
 * they mean the same thing — but a sociogram stores each node's position in
 * the attribute its own PROMPT names, not in a preset's, so the sentence about
 * where a moved node ends up is written for this interface rather than
 * borrowed from the other one.
 */
const CANVAS_INTERACTION_COPY = {
  description:
    'Choose what the participant may do to the canvas while they work through the prompts.',
  repositioningHint:
    'The participant can drag nodes to new positions. Each position is stored in the attribute the prompt they are answering names, so moving a node here changes it everywhere that attribute is used.',
} as const;

/**
 * The editor for a sociogram stage.
 *
 * A sociogram sets the participant a series of tasks on a canvas — place these
 * people, connect the ones who know each other, mark the ones you are closest
 * to — so the prompts are the substance of the stage and come first, before
 * the decisions about the canvas they are performed on: what is drawn behind
 * the nodes, how the nodes are arranged when the stage opens, and what the
 * participant is allowed to do to the picture.
 *
 * Those last three are every key the Sociogram schema's `behaviours` object
 * has — `automaticLayout`, `freeDraw` and `allowRepositioning` — and all three
 * are mounted deliberately. A save would not lose an unrendered one; what a
 * missing section costs is the decision itself. A stage somebody else authored
 * would open with a behaviour switched on that nothing on screen mentions and
 * nothing on screen can switch off.
 *
 * The prompts, the background, the layout and the permissions are all the
 * package's shared sections, given semantic props alone. Each of them reads
 * the protocol through the editor's own context, so a codebook change a
 * collaborator makes reaches the pickers inside an open prompt dialog without
 * this editor doing anything.
 */
export function SociogramStageEditor({
  controller,
  actions,
}: StageEditorProps<'Sociogram'>) {
  return (
    <StageEditorShell
      controller={controller}
      {...(actions === undefined ? {} : { actions })}
    >
      <StageHeading documentationUrl={DOCUMENTATION_URL} />
      <SubjectSection entity="node" filter />
      <SociogramPromptsSection />
      <BackgroundSection allowsImage />
      <AutomaticLayoutSection />
      <NarrativeBehavioursSection copy={CANVAS_INTERACTION_COPY} />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
