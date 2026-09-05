import StageEditorShell from '../../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../../interfaces/documentation.ts';
import GeospatialPromptsSection from '../../sections/geospatial/GeospatialPromptsSection.tsx';
import MapAppearanceSection from '../../sections/geospatial/MapAppearanceSection.tsx';
import MapSourceSection from '../../sections/geospatial/MapSourceSection.tsx';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import type { StageEditorProps } from '../../stage-editor-contract.ts';
import { interviewPosition } from '../pedigree/stageEditorComposition.ts';

const DOCUMENTATION_URL = interfaceDocumentationUrl('geospatial');

/**
 * The editor for a geospatial stage.
 *
 * A geospatial stage asks the participant where something is, and records the
 * answer as an area of a map. The map is four decisions a researcher makes at
 * different times, each finishable on its own and each reported separately in
 * the outline — and the prompts sit in the middle of them.
 *
 * What the map IS comes first, because nothing can be asked until it exists:
 * the key that lets a map be drawn, and the layer that says which areas can be
 * chosen. The prompts follow, because the property recorded from that layer is
 * what each prompt's answer is stored as. How the map LOOKS and where it opens
 * come last: those are settled once the researcher knows what they are asking
 * the participant to point at.
 *
 * The key and the layer are stored resources. This editor never sees a file, a
 * URL or a key value: the fields hold asset ids, chosen through the package's
 * resource picker, and the map preview asks the host to resolve a style for an
 * id rather than asking for the key behind it.
 */
export function GeospatialStageEditor({
  controller,
  actions,
}: StageEditorProps<'Geospatial'>) {
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
      <MapSourceSection />
      <GeospatialPromptsSection />
      <MapAppearanceSection />
      <SkipLogicSection />
      <InterviewerGuidanceSection />
    </StageEditorShell>
  );
}
