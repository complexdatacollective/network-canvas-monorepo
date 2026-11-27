'use client';

import { ChevronDown } from 'lucide-react';
import { useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { buttonVariants } from '../../../Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../../DropdownMenu';
import { useInterfaceLanguage } from '../../../interfaceLanguage';
import { headingVariants } from '../../../typography/Heading';
import { paragraphVariants } from '../../../typography/Paragraph';
import { ToolbarButton } from './EditorToolbar';

const messages = defineMessages({
  textStyleParagraph: {
    id: 'frescoUi.richTextEditor.textStyleParagraph',
    defaultMessage: 'Paragraph',
    description:
      'Choice in the rich text editor toolbar’s list of text styles, and what the list shows while the line the caret is in is ordinary text rather than a heading.',
  },
  textStyleHeading: {
    id: 'frescoUi.richTextEditor.textStyleHeading',
    defaultMessage: 'Heading {level}',
    description:
      'Choice in the rich text editor toolbar’s list of text styles, and what the list shows while the line the caret is in is a heading. {level} is the heading’s level, a number from 1 (the largest) to 4.',
  },
});

/** A level of heading the editor can make. */
export type HeadingLevel = 1 | 2 | 3 | 4;

/** What kind of block a line is: a paragraph, or a heading of one level. */
type TextStyle = 'paragraph' | HeadingLevel;

// Each style as the list of text styles shows it: its name set the way a line
// of that style is set in the text, so the list shows how large each one is.
// Without the space a paragraph or heading keeps around it among others.
const TEXT_STYLE_SAMPLES: Readonly<Record<TextStyle, string>> = {
  paragraph: paragraphVariants({ margin: 'none' }),
  1: headingVariants({ level: 'h1', margin: 'none' }),
  2: headingVariants({ level: 'h2', margin: 'none' }),
  3: headingVariants({ level: 'h3', margin: 'none' }),
  4: headingVariants({ level: 'h4', margin: 'none' }),
};

// The control that says what kind of block the line is, and lists the others.
// As wide whichever it names, so the controls after it stay where they are.
const triggerStyles = buttonVariants({
  size: 'sm',
  color: 'dynamic',
  variant: 'text',
  textStyle: 'default',
  className: 'h-10 w-36 gap-1 px-3 text-sm [&>.lucide]:size-4',
});

/**
 * What kind of block the line is: a paragraph, or a heading of one level.
 * One of several, so it is chosen from a list that also says which it is
 * now, rather than from a button for each.
 */
export function TextStyleMenu({
  levels,
  active,
  unavailable,
  onPick,
}: Readonly<{
  /** The levels of heading the field allows, besides a paragraph. */
  levels: readonly HeadingLevel[];
  /** The line's heading level, or `undefined` for a paragraph. */
  active: HeadingLevel | undefined;
  /** Nothing can be chosen: the list is closed, and its control disabled. */
  unavailable: boolean;
  /**
   * Makes the line a heading of `level`, or a paragraph for `undefined`.
   * Answers whether it did: one asked as the field stops being editable does
   * nothing, and the list then leaves focus to go where it would have gone.
   */
  onPick: (level: HeadingLevel | undefined) => boolean;
}>) {
  const intl = useAppIntl();
  // The style's name is the interface's words, drawn in the toolbar of a
  // field whose region is in the language of the text being written: it
  // says its own language and direction, as a pill's label does.
  const labelLanguage = useInterfaceLanguage();
  const [open, setOpen] = useState(false);
  // Whether the list is closing because a style was chosen.
  const picked = useRef(false);

  const styles: readonly { value: TextStyle; label: string }[] = [
    {
      value: 'paragraph',
      label: intl.formatMessage(messages.textStyleParagraph),
    },
    ...levels.map((level) => ({
      value: level,
      label: intl.formatMessage(messages.textStyleHeading, { level }),
    })),
  ];
  const current: TextStyle = active ?? 'paragraph';

  return (
    <DropdownMenu
      // Closed with the field, like the other things its toolbar opens: a
      // list left open over a field that cannot be edited would go on
      // offering to change it.
      open={open && !unavailable}
      onOpenChange={setOpen}
    >
      <DropdownMenuTrigger
        disabled={unavailable}
        render={
          <ToolbarButton className={triggerStyles} disabled={unavailable} />
        }
      >
        <span className="sr-only" lang="en">
          {'Text style:'}
        </span>{' '}
        <span
          {...labelLanguage}
          className="text-match-parent min-w-0 flex-1 truncate"
        >
          {styles.find((style) => style.value === current)?.label}
        </span>
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        showArrow={false}
        sideOffset={4}
        finalFocus={() => {
          const wasPicked = picked.current;
          picked.current = false;
          return !wasPicked;
        }}
      >
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value: unknown) => {
            const level = levels.find((each) => each === value);
            if (level === undefined && value !== 'paragraph') return;
            // The caret goes back to the text, and the list closes without
            // taking it for its button.
            picked.current = true;
            if (!onPick(level)) picked.current = false;
          }}
        >
          {styles.map((style) => (
            <DropdownMenuRadioItem
              key={style.value}
              value={style.value}
              // One choice, made and done with: unlike a set of switches, the
              // list has nothing more to offer once it is made.
              closeOnClick
            >
              <span className={TEXT_STYLE_SAMPLES[style.value]}>
                {style.label}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
