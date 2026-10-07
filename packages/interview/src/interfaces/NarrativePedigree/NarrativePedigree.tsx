import type { StageProps } from '../../types';
import NarrativePedigreeView from './components/NarrativePedigreeView';

/**
 * Read-only disease-visualisation interface. Renders the pedigree captured by a
 * FamilyPedigree stage (referenced via `sourceStageId`) and lets a participant
 * explore disease prevalence and inheritance — choosing a disease from the
 * legend and focusing on any individual. It NEVER mutates the shared interview
 * network — it only reads the nodes/edges the source stage wrote, filtered to
 * that stage's node/edge types.
 */
export default function NarrativePedigree(
  props: StageProps<'NarrativePedigree'>,
) {
  return <NarrativePedigreeView stage={props.stage} />;
}
