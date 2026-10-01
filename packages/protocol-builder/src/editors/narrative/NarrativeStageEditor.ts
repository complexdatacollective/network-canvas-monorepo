import { background } from '../../sections/background/background.tsx';
import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { canvasPermissions } from './sections/permissions/canvasPermissions.tsx';
import { narrativePresets } from './sections/presets/narrativePresets.tsx';

/**
 * The canvas a participant is shown their own network on and asked to talk
 * about it.
 *
 * A narrative stage collects nothing: the network is already built, and the
 * researcher moves between saved pictures of it while the participant tells
 * its story. So the sections read in the order the decisions are made — which
 * people are on the canvas, the pictures that can be switched between, what
 * sits behind them, and what the participant may do to any of it.
 *
 * Automatic layout is one of those last permissions rather than a section of
 * its own: it is a switch on the canvas the participant is looking at, beside
 * drawing and repositioning, which is where Architect put it.
 */
export const narrativeStageEditor = defineStageEditor('Narrative', [
  subjectPicker({ entity: 'node', filter: true }),
  narrativePresets(),
  background(),
  canvasPermissions(),
  skipLogic(),
  interviewerGuidance(),
]);
