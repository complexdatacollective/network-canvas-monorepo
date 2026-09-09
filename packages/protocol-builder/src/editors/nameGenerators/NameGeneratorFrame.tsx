import type { ReactNode } from 'react';

import type { StageEditorController } from '../../controller.ts';
import StageEditorShell from '../../form/StageEditorShell.tsx';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageHeading from '../../sections/StageHeading.tsx';
import type { StageEditorActions } from '../../stage-editor-contract.ts';
import { saveStageAction } from '../saveStageAction.tsx';
import { usePanelsForAutoName } from './usePanelsForAutoName.ts';

export type NameGeneratorFrameProps = Readonly<{
  controller: StageEditorController;
  /** Where this interface is documented. */
  documentationUrl: string;
  /**
   * This interface offers side panels, so the name proposed to a stage being
   * created is qualified by them.
   *
   * Declared by the editor rather than assumed by the frame, because the
   * schema gives `panels` to only two of the three name generators — a roster
   * name generator's list IS the panel — and the frame must not ask the third
   * about a key its interface does not have.
   */
  hasSidePanels?: boolean;
  /**
   * The host's action chrome, forwarded from whichever editor mounted the
   * frame. Left out — by a host that renders none, and by the package's own
   * tests and stories — the shared `saveStageAction` fills the slot, the same
   * one the form family falls back to.
   */
  actions?: StageEditorActions;
  /**
   * The interface's own sections, in the order a researcher meets them:
   * what the stage works on, what it asks, and how it behaves.
   */
  children: ReactNode;
}>;

/**
 * Everything the three name generators have in common besides their sections.
 *
 * The parts every stage editor carries — the shell, the stage's own heading,
 * skip logic and the interviewer's notes — plus the ONE ordering rule that is
 * the same for every interface: identity first, then what the interface itself
 * is about, then whether the stage runs at all, then the notes the interviewer
 * reads. An editor composes its own sections into the middle and states
 * nothing about the ends.
 *
 * It lives beside the name generators rather than above them because they are
 * the first family to land. The moment a second family needs it, it moves up —
 * there is nothing about it that is specific to naming people. The heading has
 * already made that move: every interface says where its stage sits, so
 * `StageHeading` sits with the sections rather than inside this frame.
 */
export default function NameGeneratorFrame({
  controller,
  documentationUrl,
  hasSidePanels = false,
  actions,
  children,
}: NameGeneratorFrameProps) {
  return (
    <StageEditorShell
      controller={controller}
      actions={actions ?? saveStageAction}
    >
      {/*
        Two headings rather than one that reads the panels conditionally: which
        of them an interface gets is fixed for the life of the editor, and a
        hook cannot be called only sometimes.
      */}
      {hasSidePanels ? (
        <PanelledStageHeading documentationUrl={documentationUrl} />
      ) : (
        <StageHeading documentationUrl={documentationUrl} />
      )}
      {children}
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}

/**
 * The heading of a stage whose side panels qualify its proposed name.
 *
 * The panels are read here rather than by the editor above because they live
 * in the stage form, which only exists inside the shell — the editor names the
 * interface's capability, and the frame reads it where it can be read.
 */
function PanelledStageHeading({
  documentationUrl,
}: Readonly<{ documentationUrl: string }>) {
  const panels = usePanelsForAutoName();

  return (
    <StageHeading
      documentationUrl={documentationUrl}
      {...(panels === undefined ? {} : { autoName: { panels } })}
    />
  );
}
