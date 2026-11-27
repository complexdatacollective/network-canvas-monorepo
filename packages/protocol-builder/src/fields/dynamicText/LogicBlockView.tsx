import { Plus, Split } from 'lucide-react';
import { useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import type {
  RichTextLogicBlocks,
  RichTextLogicBlockViewProps,
  RichTextLogicBranchLabelProps,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';

import { useLanguageNaming } from '../../localization/LanguageNaming.tsx';
import {
  logicBlockMetaOf,
  conditionVersionMetaOf,
} from '../../localization/messageDocument.ts';
import { BlockSettingsPopover } from '../BlockSettingsPopover.tsx';
import { VariablePill } from '../VariablePill.tsx';
import { useDynamicTextEnvironment } from './editorEnvironment.ts';
import {
  caseKeysOf,
  logicBlockStateOf,
  missingNumberCategories,
  numberBranchesIn,
} from './logicBlockModel.ts';
import {
  logicBlockMessages,
  LogicBlockSettings,
} from './LogicBlockPopover.tsx';
import { logicOptionLabel } from './logicOptions.ts';
import { logicVersionLabel } from './versionLabels.ts';

const messages = defineMessages({
  addAnswer: {
    id: 'protocolBuilder.logicBlock.addAnswer',
    defaultMessage: 'Add a version for another answer',
    description:
      'Button at the foot of a logic block that has different content for each answer. It opens the block’s settings, where the researcher chooses which answers have content of their own.',
  },
  addNumberForms: {
    id: 'protocolBuilder.logicBlock.addNumberForms',
    defaultMessage: 'Add a version for each number form of {language}',
    description:
      'Button at the foot of a logic block that has a version for singular or plural numbers, shown when the block lacks versions for some of the number forms of the language being edited, as a block copied from another language can. It adds the missing versions, empty. language is the name of the language being edited, such as “Arabic”.',
  },
  emptyBranch: {
    id: 'protocolBuilder.logicBlock.emptyBranch',
    defaultMessage: 'Nothing is shown.',
    description:
      'Shown in a branch of a logic block that has no content: in that case, the participant sees nothing in its place.',
  },
});

/**
 * A logic block in researcher text: its heading (what decides which branch
 * is shown), its branches, and its settings, which open from the settings
 * button in the heading (the same button, attached to its settings in the
 * same way, as every other block's) and as the block is put in.
 */
function LogicBlockView({
  meta,
  branches,
  content,
  editable,
  update,
  remove,
  fieldScope,
  branchesWithContent,
}: RichTextLogicBlockViewProps) {
  const intl = useAppIntl();
  const environment = useDynamicTextEnvironment();
  const { pendingLogicBlock, setPendingLogicBlock } = environment;
  const { name: languageName } = useLanguageNaming();
  const [open, setOpen] = useState(false);
  // Counts the openings of the settings, so that each starts afresh.
  const [openings, setOpenings] = useState(0);
  // Set while the settings ask a question over themselves.
  const asking = useRef(false);
  const state = logicBlockStateOf(meta, branches);

  const setSettingsOpen = (next: boolean) => {
    if (!next && asking.current) return;
    if (next && !open) setOpenings((count) => count + 1);
    setOpen(next);
  };
  const openSettings = () => setSettingsOpen(true);
  const pill =
    (state.option === 'answers' || state.option === 'number') &&
    state.value !== undefined &&
    state.value !== '' ? (
      <VariablePill
        {...environment.naming.pillFor(state.value)}
        size="sm"
        describeKind
      />
    ) : null;
  const missingAnswers =
    state.option === 'answers'
      ? caseKeysOf(environment.choices, state.value).filter(
          (key) => !state.answerKeys.includes(key),
        )
      : [];
  // Each language is its own text, so a block copied from another language
  // has that language's number forms.
  const missingNumbers =
    state.option === 'number'
      ? missingNumberCategories(branches, environment.locale)
      : [];

  return (
    <div
      // Opens the settings of a block just put in from the toolbar, once it
      // is drawn. A new function on each render, so React calls it again
      // after the toolbar names the block.
      ref={(node) => {
        // The toolbar names the block by the element the editor drew it in,
        // which contains this one.
        if (
          node === null ||
          pendingLogicBlock === null ||
          !pendingLogicBlock.contains(node)
        ) {
          return;
        }
        setPendingLogicBlock(null);
        openSettings();
      }}
      className="flex flex-col"
      data-logic-block={state.option}
    >
      <div
        contentEditable={false}
        className="bg-info/10 border-info/40 flex items-center gap-2 border-b border-dashed px-4 py-2 text-sm select-none"
      >
        <Split aria-hidden className="text-info size-4 shrink-0 rotate-90" />
        <span className="text-info font-bold">
          {intl.formatMessage(logicBlockMessages.title)}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate">
            {logicOptionLabel(intl, state.option, 'content')}
            {pill === null ? '' : ':'}
          </span>
          {pill}
        </span>
        <BlockSettingsPopover
          name="Logic block settings"
          open={open}
          onOpenChange={setSettingsOpen}
          // Selecting the block would move focus into the text, which
          // closes the settings: they open over the block as it is.
          select={() => undefined}
        >
          <LogicBlockSettings
            key={openings}
            state={state}
            update={update}
            remove={remove}
            branchesWithContent={branchesWithContent}
            fieldScope={fieldScope}
            onAsking={(next) => {
              asking.current = next;
            }}
            onClose={() => setSettingsOpen(false)}
          />
        </BlockSettingsPopover>
      </div>
      {content}
      {editable && missingAnswers.length > 0 && (
        <div contentEditable={false} className="px-3 pb-2 select-none">
          <Button
            size="sm"
            variant="text"
            icon={<Plus aria-hidden />}
            onClick={openSettings}
          >
            {intl.formatMessage(messages.addAnswer)}
          </Button>
        </div>
      )}
      {editable && missingNumbers.length > 0 && (
        <div contentEditable={false} className="px-3 pb-2 select-none">
          <Button
            size="sm"
            variant="text"
            icon={<Plus aria-hidden />}
            onClick={() =>
              update(meta, numberBranchesIn(branches, environment.locale))
            }
          >
            {intl.formatMessage(messages.addNumberForms, {
              language: languageName(environment.locale),
            })}
          </Button>
        </div>
      )}
    </div>
  );
}

/** The label at the top of a branch: the case in which it is shown. */
function LogicBranchLabel({
  blockMeta,
  branch,
  index,
}: RichTextLogicBranchLabelProps) {
  const intl = useAppIntl();
  const environment = useDynamicTextEnvironment();
  const meta = logicBlockMetaOf(blockMeta) ?? { kind: 'participant' };
  const conditionVersion = conditionVersionMetaOf(branch.meta);
  const label = logicVersionLabel(
    {
      intl,
      naming: environment.naming,
      locale: environment.locale,
      conditionSentence: environment.conditionSentence,
      hasCondition: (conditionId) =>
        Object.hasOwn(environment.conditions.values, conditionId),
    },
    meta,
    branch.key,
    conditionVersion,
    index,
  );
  return <span className="text-info text-sm font-bold">{label}</span>;
}

/** The logic blocks of researcher text, for `RichTextEditorField`. */
export const useLogicBlocks = (): RichTextLogicBlocks => {
  const intl = useAppIntl();
  return {
    View: LogicBlockView,
    BranchLabel: LogicBranchLabel,
    emptyBranchText: intl.formatMessage(messages.emptyBranch),
  };
};
