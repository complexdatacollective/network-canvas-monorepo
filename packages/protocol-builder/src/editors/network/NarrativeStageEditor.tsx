import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import AutomaticLayoutSection from '../../sections/network/AutomaticLayoutSection.tsx';
import BackgroundSection from '../../sections/network/BackgroundSection.tsx';
import NarrativeBehavioursSection from '../../sections/network/NarrativeBehavioursSection.tsx';
import NarrativePresetsSection from '../../sections/network/NarrativePresetsSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageHeading from '../../sections/StageHeading.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';

const DOCUMENTATION_URL = interfaceDocumentationUrl('narrative');

/**
 * The editor for a narrative stage.
 *
 * A narrative stage is a canvas the researcher and participant talk over: the
 * participant is shown the network they have already built, one saved way of
 * looking at it at a time, and asked to tell its story. So the sections read
 * in the order the decisions are made — which people are on the canvas, the
 * pictures of them that can be switched between, what sits behind them, and
 * what the participant may do to any of it.
 *
 * Every section is the package's own, and every one of them is given semantic
 * props alone: which entity the stage is about, and whether this canvas can
 * draw an image behind its nodes. Nothing here passes a stage path, a
 * selector, or a host store, and nothing here reads the draft: the sections
 * take the form, the protocol and the resource gateway from the shell's own
 * context.
 *
 * `AutomaticLayoutSection` sits beside the canvas permissions rather than
 * inside them because it is not a permission: it decides how the stage
 * arranges nodes before the participant touches anything. It is composed here
 * — where Architect kept the same choice inside its own behaviours section —
 * so that `behaviours.automaticLayout` has an editor at all. A new narrative
 * stage is created holding it, and a submit replaces `behaviours` outright, so
 * an unrendered member of that object would be dropped by the first save.
 */
export function NarrativeStageEditor({
  controller,
  actions,
}: StageEditorProps<'Narrative'>) {
  return (
    <StageEditorShell
      controller={controller}
      {...(actions === undefined ? {} : { actions })}
    >
      <StageHeading documentationUrl={DOCUMENTATION_URL} />
      <SubjectSection entity="node" filter />
      <NarrativePresetsSection />
      <BackgroundSection allowsImage />
      <AutomaticLayoutSection />
      <NarrativeBehavioursSection />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
