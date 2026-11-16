import {
  SUBJECT_ARGUMENTS,
  suppliedStageSettingApplies,
} from '@codaco/protocol-validation';

import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import { WordingRow, type WordingSetting } from '../../form/WordingRow.tsx';
import StageWordingSection from '../supplied-wording/StageWordingSection.tsx';
import {
  startingWording,
  useSuppliedStageWording,
} from '../supplied-wording/suppliedStageWording.ts';
import type { BinStageType } from './binBehaviours.tsx';
import { binBehavioursMessages } from './binBehavioursMessages.ts';

const UNPLACED_NOTICE: WordingSetting = {
  path: 'unplacedNodesNotice',
  label: binBehavioursMessages.unplacedNoticeLabel,
  hint: binBehavioursMessages.unplacedNoticeHint,
  arguments: SUBJECT_ARGUMENTS,
};

/**
 * A bin stage's "Customize built-in wording" section: the words that keep the
 * participant on a prompt until every node is placed, asked only while the
 * stage requires that, which may name the stage's node type, and the words
 * every stage of its kind shares (see `SharedStageWording`). Not shown when
 * the stage has neither.
 */
export default function BinWordingSection({
  stageType,
}: Readonly<{ stageType: BinStageType }>) {
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedStageWording(stageType);
  const showsNotice = suppliedStageSettingApplies(
    { type: stageType, behaviours: useStageValue('behaviours') },
    [UNPLACED_NOTICE.path],
  );

  return (
    <StageWordingSection
      stageType={stageType}
      paths={showsNotice ? [UNPLACED_NOTICE.path] : []}
    >
      {supplied !== undefined && showsNotice && (
        <WordingRow
          setting={UNPLACED_NOTICE}
          initialValue={startingWording(
            committedFields,
            UNPLACED_NOTICE.path,
            supplied,
          )}
        />
      )}
    </StageWordingSection>
  );
}
