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
 * The prompts sit between the two halves of the map. What the map IS — the key
 * that lets one be drawn at all, and the layer that says which areas can be
 * chosen — comes first, because the property recorded from that layer is what
 * every prompt's answer is stored as. How it looks and where it opens come
 * last, once the researcher knows what they are asking about.
 *
 * The key and the layer are stored resources: these fields hold asset ids, and
 * no key value can reach this editor.
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
