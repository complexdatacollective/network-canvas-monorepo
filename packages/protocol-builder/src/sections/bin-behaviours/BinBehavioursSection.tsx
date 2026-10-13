import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import { suppliedStageSettingApplies } from '@codaco/protocol-validation';

import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import { WordingRow, type WordingSetting } from '../../form/WordingRow.tsx';
import BuilderSection from '../BuilderSection.tsx';
import {
  startingWording,
  useSuppliedStageWording,
} from '../supplied-wording/suppliedStageWording.ts';
import type { BinStageType } from './binBehaviours.tsx';
import { binBehavioursMessages } from './binBehavioursMessages.ts';
import InteractionModeField from './InteractionModeField.tsx';

const INTERACTION_MODE_FIELD = 'behaviours.interactionMode';
const REQUIRE_COMPLETE_PLACEMENT_FIELD = 'behaviours.requireCompletePlacement';

const UNPLACED_NOTICE: WordingSetting = {
  path: 'unplacedNodesNotice',
  label: binBehavioursMessages.unplacedNoticeLabel,
  hint: binBehavioursMessages.unplacedNoticeHint,
};

/**
 * How the participant places nodes on an Ordinal or Categorical Bin stage
 * (#1652), and whether they must place every one (#1428). The two interfaces
 * share one `behaviours` object, so they share this section too.
 *
 * The completion gate starts off, which keeps today's behaviour: Next pulses
 * once every node is placed and is never blocked. Switched on, the participant
 * cannot leave a prompt with a node still in the drawer, and is told so in the
 * words below the switch, which start as Network Canvas's and are asked only
 * while the gate is on.
 */
export default function BinBehavioursSection({
  stageType,
}: Readonly<{ stageType: BinStageType }>) {
  const intl = useAppIntl();
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedStageWording(stageType);
  const showsNotice = suppliedStageSettingApplies(
    { type: stageType, behaviours: useStageValue('behaviours') },
    [UNPLACED_NOTICE.path],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(binBehavioursMessages.title)}
      description={intl.formatMessage(binBehavioursMessages.description)}
    >
      <Field<typeof InteractionModeField>
        name={INTERACTION_MODE_FIELD}
        component={InteractionModeField}
        label={intl.formatMessage(binBehavioursMessages.interactionModeLabel)}
      />
      <Field<typeof ToggleField>
        name={REQUIRE_COMPLETE_PLACEMENT_FIELD}
        component={ToggleField}
        label={intl.formatMessage(
          binBehavioursMessages.requireCompletePlacementLabel,
        )}
        hint={intl.formatMessage(
          binBehavioursMessages.requireCompletePlacementHint,
        )}
        inline
      />
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
    </BuilderSection>
  );
}
