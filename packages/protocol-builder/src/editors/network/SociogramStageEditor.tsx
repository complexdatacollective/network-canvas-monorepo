import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import AutomaticLayoutSection from '../../sections/network/AutomaticLayoutSection.tsx';
import BackgroundSection from '../../sections/network/BackgroundSection.tsx';
import SociogramPromptsSection from '../../sections/network/SociogramPromptsSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageHeading from '../../sections/StageHeading.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';

const DOCUMENTATION_URL = interfaceDocumentationUrl('sociogram');

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
 * `automaticLayout` is the only key of the Sociogram schema's `behaviours`
 * object this editor offers, and the other two are deliberately not asked
 * about. `canvasBehavioursSchema` is shared with the narrative interface, so
 * `freeDraw` and `allowRepositioning` are EXPRESSIBLE on a sociogram — and the
 * interview honours neither: `Sociogram.tsx` reads no drawing flag, and
 * repositioning is unconditionally on there by a recorded decision (#673,
 * decision #12), guarded by a test that refuses to let the interface pass the
 * flag at all. A switch promising a behaviour the participant will never get
 * is worse than no switch: the researcher answers a question about their study
 * and the answer does nothing. Architect's own sociogram editor asks about
 * neither for the same reason.
 *
 * A stage somebody else authored carrying one of them keeps it: a submit
 * writes each mounted field at its own path and leaves the keys beside it
 * alone, so nothing here throws away a decision this editor cannot show.
 *
 * The prompts, the background and the layout are all the package's shared
 * sections, given semantic props alone. Each of them reads the protocol
 * through the editor's own context, so a codebook change a collaborator makes
 * reaches the pickers inside an open prompt dialog without this editor doing
 * anything.
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
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
