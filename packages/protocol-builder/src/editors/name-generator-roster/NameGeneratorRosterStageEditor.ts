import { alterLimits } from '../../sections/alter-limits/alterLimits.tsx';
import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { nameGeneratorPrompts } from '../../sections/name-generator-prompts/nameGeneratorPrompts.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { cardDisplay } from './sections/cardDisplay.tsx';
import { rosterDataSource } from './sections/rosterDataSource.tsx';
import { rosterPanel } from './sections/rosterPanel.tsx';
import { searchOptions } from './sections/searchOptions.tsx';
import { sortOptions } from './sections/sortOptions.tsx';

/**
 * The name generator a participant chooses people from a list with.
 *
 * Nobody is typed in here: the people already exist in a data file, and the
 * participant picks them. So the data file comes second, right after the type
 * it creates, because everything after it names one of its columns — and the
 * sections describing the list itself come after the questions, because
 * they are how the stage LOOKS rather than what it asks, the panel's title
 * first.
 *
 * No side panels: the roster IS the panel, and the schema gives `panels` to
 * the other two name generators only. So its one title is the stage's own
 * `panelTitle`, rather than a title inside a `panels` entry.
 */
export const nameGeneratorRosterStageEditor = defineStageEditor(
  'NameGeneratorRoster',
  [
    subjectPicker({ entity: 'node' }),
    rosterDataSource(),
    nameGeneratorPrompts(),
    rosterPanel(),
    cardDisplay(),
    sortOptions(),
    searchOptions(),
    alterLimits(),
    skipLogic(),
    interviewerGuidance(),
  ],
);
