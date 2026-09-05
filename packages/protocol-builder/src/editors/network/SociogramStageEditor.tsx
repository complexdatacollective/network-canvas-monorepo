import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import AutomaticLayoutSection from '../../sections/network/AutomaticLayoutSection.tsx';
import BackgroundSection from '../../sections/network/BackgroundSection.tsx';
import SociogramPromptsSection from '../../sections/network/SociogramPromptsSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import {
  interviewPosition,
  type NamedStageEditorProps,
} from '../pedigree/stageEditorComposition.ts';

const DOCUMENTATION_URL = interfaceDocumentationUrl('sociogram');

/**
 * The editor for a sociogram stage.
 *
 * A sociogram sets the participant a series of tasks on a canvas — place these
 * people, connect the ones who know each other, mark the ones you are closest
 * to — so the prompts are the substance of the stage and come first, before
 * the two decisions about the canvas they are performed on: what is drawn
 * behind the nodes, and how the nodes are arranged when the stage opens.
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
}: NamedStageEditorProps<'Sociogram'>) {
  const { snapshot } = controller;
  const position = interviewPosition(
    snapshot.protocolContext,
    snapshot.editedSection.identity.id,
  );

  return (
    <StageEditorShell
      controller={controller}
      {...(actions === undefined ? {} : { actions })}
    >
      <StageNameSection
        {...(position === undefined ? {} : { position })}
        documentationUrl={DOCUMENTATION_URL}
      />
      <SubjectSection entity="node" filter />
      <SociogramPromptsSection />
      <BackgroundSection allowsImage />
      <AutomaticLayoutSection />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
