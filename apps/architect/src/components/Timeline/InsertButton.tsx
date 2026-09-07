import { Plus } from 'lucide-react';
import { motion, type Variants } from 'motion/react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { cx } from '~/utils/cva';

import { timelineRowGrid } from './rowLayout';
const messages = defineMessages({
  addStageHereBeforeStage: {
    id: 'architect.timeline.insertButton.addStageHereBeforeStage',
    defaultMessage:
      'Add stage here, before stage {position, number}: {nextStageName}',
    description: 'The aria-label text in components / Timeline / InsertButton.',
  },
  addStageHere: {
    id: 'architect.timeline.insertButton.addStageHere',
    defaultMessage: 'Add stage here',
    description: 'Visible text in components / Timeline / InsertButton.',
  },
});

type InsertButtonProps = {
  /** 1-based position the new stage would take. */
  position: number;
  /** The stage this insertion point sits above. */
  nextStageName: string;
  onClick: () => void;
  variants?: Variants;
};

/**
 * An insertion point between two stages.
 *
 * Everything that makes this button legible — the plus glyph and its label —
 * used to appear on hover alone, so a keyboard researcher was left looking at a
 * focus ring around an apparently empty strip. The reveal now answers
 * `:focus-visible` as well as hover.
 *
 * Every insertion point also used to be called "Add stage here", so a researcher
 * tabbing a long protocol heard the same three words over and over with nothing
 * to tell them apart. The accessible name now says where the stage would land.
 * It still OPENS with the visible words, which is what WCAG's Label in Name
 * asks of a control whose visible text is part of its name.
 */
const InsertButton = ({
  position,
  nextStageName,
  onClick,
  variants,
}: InsertButtonProps) => {
  const intl = useAppIntl();
  return (
    <motion.button
      type="button"
      aria-label={intl.formatMessage(messages.addStageHereBeforeStage, {
        position: position,
        nextStageName: nextStageName,
      })}
      className={cx(
        timelineRowGrid,
        'focusable group cursor-pointer px-4 py-1',
      )}
      onClick={onClick}
      variants={variants}
    >
      <div />
      <div className="bg-timeline text-primary-contrast group-hover:bg-action group-focus-visible:bg-action flex h-10 w-10 scale-40 items-center justify-center rounded-full transition-all duration-300 ease-in-out group-hover:scale-110 group-focus-visible:scale-110">
        <Plus
          className="h-6 w-6 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
          strokeWidth={2.5}
        />
      </div>
      <span className="justify-self-start text-lg font-semibold opacity-0 transition-all group-hover:font-bold group-hover:opacity-100 group-focus-visible:opacity-100">
        {intl.formatMessage(messages.addStageHere)}
      </span>
    </motion.button>
  );
};

export default InsertButton;
