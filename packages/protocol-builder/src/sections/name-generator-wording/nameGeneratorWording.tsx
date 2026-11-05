import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import {
  MAX_NODES_ARGUMENTS,
  type MessageArguments,
  MIN_NODES_ARGUMENTS,
  SUBJECT_ARGUMENTS,
  UNNAMED_LABEL_ARGUMENTS,
} from '@codaco/protocol-validation';

import type { StageSection } from '../../editors/defineStageEditor.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import { WordingRow, type WordingSetting } from '../../form/WordingRow.tsx';
import StageWordingSection from '../supplied-wording/StageWordingSection.tsx';
import {
  startingWording,
  useSuppliedStageWording,
} from '../supplied-wording/suppliedStageWording.ts';

type NameGeneratorType =
  | 'NameGenerator'
  | 'NameGeneratorQuickAdd'
  | 'NameGeneratorRoster';

export const nameGeneratorWordingMessages = defineMessages({
  minNoticeLabel: {
    id: 'protocolBuilder.nameGeneratorWording.minNoticeLabel',
    defaultMessage: 'Minimum not reached',
    description:
      'Label of the field holding the message shown when the participant tries to continue having named fewer people than the stage’s minimum.',
  },
  minNoticeHint: {
    id: 'protocolBuilder.nameGeneratorWording.minNoticeHint',
    defaultMessage:
      'Shown when the participant tries to continue before adding as many nodes as this stage asks for.',
    description:
      'Hint under the setting holding the minimum not reached message, in the Customize built-in wording section of a Name Generator stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  maxNoticeLabel: {
    id: 'protocolBuilder.nameGeneratorWording.maxNoticeLabel',
    defaultMessage: 'Maximum reached',
    description:
      'Label of the field holding the message shown once the participant has named the most people this stage allows.',
  },
  maxNoticeHint: {
    id: 'protocolBuilder.nameGeneratorWording.maxNoticeHint',
    defaultMessage:
      'Shown once the participant has added as many nodes as this stage allows.',
    description:
      'Hint under the setting holding the maximum reached message, in the Customize built-in wording section of a Name Generator stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  addNamePlaceholderLabel: {
    id: 'protocolBuilder.nameGeneratorWording.addNamePlaceholderLabel',
    defaultMessage: 'Quick-add placeholder',
    description:
      'Label of the field holding the placeholder of the quick-add box, shown until the participant starts typing.',
  },
  addNamePlaceholderHint: {
    id: 'protocolBuilder.nameGeneratorWording.addNamePlaceholderHint',
    defaultMessage:
      'Shown in the quick-add box until the participant starts typing. Describe what to type for the kind of node this stage adds.',
    description:
      'Hint under the setting holding the quick-add placeholder, in the Customize built-in wording section of a Name Generator stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  allAddedLabel: {
    id: 'protocolBuilder.nameGeneratorWording.allAddedLabel',
    defaultMessage: 'Everything added',
    description:
      'Label of the field holding the message shown when every person on a roster has already been added.',
  },
  allAddedHint: {
    id: 'protocolBuilder.nameGeneratorWording.allAddedHint',
    defaultMessage:
      'Shown in the roster list once everything in it has been added.',
    description:
      'Hint under the setting holding the everything added message, in the Customize built-in wording section of a Name Generator stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  unnamedLabelLabel: {
    id: 'protocolBuilder.nameGeneratorWording.unnamedLabelLabel',
    defaultMessage: 'Unnamed label',
    description:
      'Label of the field holding the label of a roster entry that has no name or other details to show.',
  },
  unnamedLabelHint: {
    id: 'protocolBuilder.nameGeneratorWording.unnamedLabelHint',
    defaultMessage:
      'Label for a roster entry that has no name. The number tells unnamed entries apart.',
    description:
      'Hint under the setting holding the unnamed label, in the Customize built-in wording section of a Name Generator for Roster Data stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
});

/** Where a stage holds each setting, which the form names by path. */
const MIN_NODES = 'behaviours.minNodes';
const MAX_NODES = 'behaviours.maxNodes';

const setting = (
  path: string,
  label: MessageDescriptor,
  hint: MessageDescriptor,
  args: MessageArguments,
): WordingSetting => ({ path, label, hint, arguments: args });

const MIN_NOTICE = setting(
  'minNodesNotice',
  nameGeneratorWordingMessages.minNoticeLabel,
  nameGeneratorWordingMessages.minNoticeHint,
  MIN_NODES_ARGUMENTS,
);
const MAX_NOTICE = setting(
  'maxNodesNotice',
  nameGeneratorWordingMessages.maxNoticeLabel,
  nameGeneratorWordingMessages.maxNoticeHint,
  MAX_NODES_ARGUMENTS,
);
const ADD_NAME_PLACEHOLDER = setting(
  'addNamePlaceholder',
  nameGeneratorWordingMessages.addNamePlaceholderLabel,
  nameGeneratorWordingMessages.addNamePlaceholderHint,
  SUBJECT_ARGUMENTS,
);
const ALL_ADDED = setting(
  'allAddedNotice',
  nameGeneratorWordingMessages.allAddedLabel,
  nameGeneratorWordingMessages.allAddedHint,
  SUBJECT_ARGUMENTS,
);
const UNNAMED_LABEL = setting(
  'unnamedLabel',
  nameGeneratorWordingMessages.unnamedLabelLabel,
  nameGeneratorWordingMessages.unnamedLabelHint,
  UNNAMED_LABEL_ARGUMENTS,
);

/**
 * The words a name generator shows about its limits, its quick-add box and a
 * roster's list. Each appears only where its part of the stage is on, each
 * starts as Network Canvas's wording, and each may name the stage's node type
 * (the limits also their number). The words every stage of a kind shows
 * alike, such as how to finish adding a node, are the protocol's interface
 * text.
 */
export const nameGeneratorWording =
  (stageType: NameGeneratorType): StageSection =>
  () => <NameGeneratorWordingSection stageType={stageType} />;

function NameGeneratorWordingSection({
  stageType,
}: Readonly<{ stageType: NameGeneratorType }>) {
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedStageWording(stageType);
  const minNodes = useStageValue(MIN_NODES);
  const maxNodes = useStageValue(MAX_NODES);

  const hasMinimum = typeof minNodes === 'number' && minNodes > 0;
  const hasMaximum = typeof maxNodes === 'number';

  const settings = [
    ...(hasMinimum ? [MIN_NOTICE] : []),
    ...(hasMaximum ? [MAX_NOTICE] : []),
    ...(stageType === 'NameGeneratorQuickAdd' ? [ADD_NAME_PLACEHOLDER] : []),
    ...(stageType === 'NameGeneratorRoster' ? [ALL_ADDED, UNNAMED_LABEL] : []),
  ];

  return (
    <StageWordingSection
      stageType={stageType}
      paths={settings.map(({ path }) => path)}
    >
      {supplied !== undefined &&
        settings.map((wording) => (
          <WordingRow
            key={wording.path}
            setting={wording}
            initialValue={startingWording(
              committedFields,
              wording.path,
              supplied,
            )}
          />
        ))}
    </StageWordingSection>
  );
}
