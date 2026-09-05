import { defineStageEditorPart } from '../stage-editor-contract.ts';
import { CategoricalBinStageEditor } from './census/CategoricalBinStageEditor.tsx';
import { DyadCensusStageEditor } from './census/DyadCensusStageEditor.tsx';
import { OneToManyDyadCensusStageEditor } from './census/OneToManyDyadCensusStageEditor.tsx';
import { OrdinalBinStageEditor } from './census/OrdinalBinStageEditor.tsx';
import { TieStrengthCensusStageEditor } from './census/TieStrengthCensusStageEditor.tsx';

/**
 * The interfaces that ask about people the participant has already named.
 *
 * One family because they share their hard parts: every one of them works on a
 * node type that can be narrowed by a filter, and every one of them is a list
 * of questions asked one at a time about a person or a pair. The two bins
 * share a variable picker and a pair of sort-order editors; the three censuses
 * share the connection an affirmative answer creates.
 *
 * Written through `defineStageEditorPart` rather than annotated, so the exact
 * set of interfaces claimed here survives into the type system — see that
 * function's own comment for what an annotation would destroy.
 */
export const censusAndBinStageEditors = defineStageEditorPart({
  CategoricalBin: CategoricalBinStageEditor,
  OrdinalBin: OrdinalBinStageEditor,
  DyadCensus: DyadCensusStageEditor,
  OneToManyDyadCensus: OneToManyDyadCensusStageEditor,
  TieStrengthCensus: TieStrengthCensusStageEditor,
});
