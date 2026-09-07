import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import BackgroundSection from '../../sections/network/BackgroundSection.tsx';
import ComposerEdgeConfigurationSection from '../../sections/network/ComposerEdgeConfigurationSection.tsx';
import ComposerNodeConfigurationSection from '../../sections/network/ComposerNodeConfigurationSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageHeading from '../../sections/StageHeading.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';

const DOCUMENTATION_URL = interfaceDocumentationUrl('network-composer');

/**
 * The editor for a network composer stage.
 *
 * A network composer hands the participant the canvas itself: they add the
 * people, position them, group them, and draw the connections between them.
 * There are no prompts to write, so the stage is described by what those
 * actions are allowed to be — the attribute a new node's name is stored in,
 * the attribute its position is stored in, the attribute that groups it, and
 * the kinds of connection that can be drawn — and then by what the canvas
 * looks like behind all of it.
 *
 * No network filter: the schema gives this interface none, because the
 * participant builds the network here rather than being shown a part of one
 * built earlier.
 */
export function NetworkComposerStageEditor({
  controller,
  actions,
}: StageEditorProps<'NetworkComposer'>) {
  return (
    <StageEditorShell
      controller={controller}
      {...(actions === undefined ? {} : { actions })}
    >
      <StageHeading documentationUrl={DOCUMENTATION_URL} />
      <SubjectSection entity="node" />
      <ComposerNodeConfigurationSection />
      <ComposerEdgeConfigurationSection />
      <BackgroundSection allowsImage />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
