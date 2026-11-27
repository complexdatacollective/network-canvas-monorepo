import { Plus, Settings2, Split, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button, IconButton } from '@codaco/fresco-ui/Button';
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
  LogicBlockPopover,
  useLogicBlockRemoval,
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
 * is shown), its branches, and its settings, which open from the heading
 * and as the block is put in.
 */
function LogicBlockView({
  meta,
  branches,
  content,
  editable,
  update,
  remove,
  select,
  element,
  fieldScope,
  branchesWithContent,
}: RichTextLogicBlockViewProps) {
  const intl = useAppIntl();
  const environment = useDynamicTextEnvironment();
  const { pendingLogicBlock, setPendingLogicBlock } = environment;
  const { name: languageName } = useLanguageNaming();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const state = logicBlockStateOf(meta, branches);

  const openSettings = () => setAnchor(element());
  const removeBlock = useLogicBlockRemoval(remove, branchesWithContent);
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
        // The toolbar names the block by the element the editor drew it in.
        // Refs are set from the inside out, so the frame (`element`) is not
        // set yet as this one is: the block is found from this element.
        if (
          node === null ||
          pendingLogicBlock === null ||
          !pendingLogicBlock.contains(node)
        ) {
          return;
        }
        setPendingLogicBlock(null);
        setAnchor(node.closest<HTMLElement>('[data-logic-block-view]') ?? node);
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
        <IconButton
          size="sm"
          variant="text"
          aria-label="Logic block settings"
          icon={<Settings2 aria-hidden />}
          onClick={() => {
            select();
            openSettings();
          }}
        />
        {editable && (
          <IconButton
            size="sm"
            variant="text"
            color="destructive"
            aria-label="Delete logic block"
            icon={<Trash2 aria-hidden />}
            onClick={() => void removeBlock()}
          />
        )}
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
      {anchor !== null && (
        <LogicBlockPopover
          state={state}
          update={update}
          remove={remove}
          branchesWithContent={branchesWithContent}
          fieldScope={fieldScope}
          anchor={anchor}
          onClose={() => setAnchor(null)}
        />
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
