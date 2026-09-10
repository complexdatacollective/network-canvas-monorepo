import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { geospatialPrompts } from './sections/geospatialPrompts.tsx';
import { mapAppearance } from './sections/mapAppearance.tsx';
import { mapSource } from './sections/mapSource.tsx';

/**
 * The map a participant is asked to point at.
 *
 * A geospatial stage asks where something is and records the answer as one
 * area of a map, so the map is authored in two sittings with the questions
 * between them.
 *
 * What the map IS comes first, because nothing can be asked until it exists:
 * the key that lets a map be drawn at all, and the layer that says which areas
 * can be chosen. The prompts follow, because the property recorded from that
 * layer is what each prompt's answer is stored as. How the map LOOKS and where
 * it opens come last — those are settled once the researcher knows what they
 * are asking the participant to point at, and the starting view is usually
 * chosen to frame the answer.
 *
 * The key and the layer are stored resources. This editor never sees a file, a
 * URL or a key value: the fields hold asset ids chosen through the package's
 * resource picker, and the map behind the starting view asks the host to
 * resolve a map for an id rather than asking for the key behind it.
 */
export const geospatialStageEditor = defineStageEditor('Geospatial', [
  stageHeading({ documentation: 'geospatial' }),
  subjectPicker({ entity: 'node', filter: true }),
  mapSource(),
  geospatialPrompts(),
  mapAppearance(),
  skipLogic(),
  interviewerGuidance(),
]);
