import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import GeospatialPromptsSection from '../../sections/geospatial/GeospatialPromptsSection.tsx';
import MapOptionsSection from '../../sections/geospatial/MapOptionsSection.tsx';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import {
  interviewPosition,
  type NamedStageEditorProps,
} from '../pedigree/stageEditorComposition.ts';

const DOCUMENTATION_URL = interfaceDocumentationUrl('geospatial');

/**
 * The editor for a geospatial stage.
 *
 * A geospatial stage asks the participant where something is, and records the
 * answer as an area of a map. Nothing can be asked until the map exists, so
 * the map comes first: the key that lets one be drawn, the layer that says
 * which areas can be chosen, how it looks, and where it opens. Those are four
 * decisions a researcher makes at different times, and each of them appears in
 * the outline separately — `MapOptionsSection` renders them as four sections
 * of its own, in that fixed order, so the prompts follow all four rather than
 * splitting them. That is also the order Architect has always shown.
 *
 * The key and the layer are stored resources. This editor never sees a file, a
 * URL or a key value: the fields hold asset ids, chosen through the package's
 * resource picker, and the map preview asks the host to resolve a style for an
 * id rather than asking for the key behind it.
 */
export function GeospatialStageEditor({
  controller,
  actions,
}: NamedStageEditorProps<'Geospatial'>) {
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
      <MapOptionsSection />
      <GeospatialPromptsSection />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
