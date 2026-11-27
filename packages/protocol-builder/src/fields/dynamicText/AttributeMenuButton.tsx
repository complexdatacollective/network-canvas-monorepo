import { Braces } from 'lucide-react';
import { type ReactNode, useId, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  type RichTextInsertState,
  ToolbarButton,
  toolbarLabelledButtonStyles,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { Popover, PopoverContent } from '@codaco/fresco-ui/Popover';
import { cx } from '@codaco/fresco-ui/utils/cva';

/**
 * The accessible name of the list inside an Attribute menu: screen-reader
 * text, which stays English.
 */
export const ATTRIBUTE_MENU_LABEL = 'Insert an attribute';

const messages = defineMessages({
  attribute: {
    id: 'protocolBuilder.attributeMenu.attribute',
    defaultMessage: 'Attribute',
    description:
      'Button in the toolbar of a text editor that opens the list of attributes that can be put in the text, such as the name of the node or today’s date.',
  },
});

/** Whether an Attribute menu is open, and how to close it. */
type AttributeMenuState = Readonly<{
  /** Opened from the toolbar button (a typed `{` opens it too). */
  menuOpen: boolean;
  setMenuOpen: (open: boolean | ((was: boolean) => boolean)) => void;
  /** Closes the menu, leaving a typed `{` where it is. */
  close: () => void;
}>;

export function useAttributeMenuState(
  insert: RichTextInsertState,
): AttributeMenuState {
  const [menuOpen, setMenuOpen] = useState(false);
  return {
    menuOpen,
    setMenuOpen,
    close: () => {
      setMenuOpen(false);
      insert.trigger?.dismiss();
    },
  };
}

/**
 * The Attribute button of a text editor's toolbar, and the popover that it
 * opens with the list (`children`) inside: from the button, or where `{` is
 * typed. Hidden while `suspended`, as when a dialog opened from the list is
 * in front of it. While `missing` is given, the button carries a warning dot,
 * and `missing` is its description: that the text lacks something the list
 * offers and the text requires.
 */
export function AttributeMenuButton({
  insert,
  state,
  suspended = false,
  missing,
  children,
}: Readonly<{
  insert: RichTextInsertState;
  state: AttributeMenuState;
  suspended?: boolean;
  missing?: string;
  children: ReactNode;
}>) {
  const intl = useAppIntl();
  const button = useRef<HTMLButtonElement>(null);
  const missingId = useId();
  const { trigger, commands } = insert;
  const open = (state.menuOpen || trigger !== null) && !suspended;

  return (
    <>
      <ToolbarButton
        ref={button}
        className={cx(
          toolbarLabelledButtonStyles,
          missing !== undefined && 'relative',
        )}
        disabled={!insert.editable}
        aria-haspopup="dialog"
        aria-expanded={open}
        // The button keeps its name; what is missing is its description.
        aria-describedby={missing === undefined ? undefined : missingId}
        data-missing={missing === undefined ? undefined : ''}
        onClick={() => state.setMenuOpen((was) => !was)}
      >
        <Braces aria-hidden />
        {intl.formatMessage(messages.attribute)}
        {missing !== undefined && (
          <>
            <span
              aria-hidden
              className="bg-warning absolute inset-e-1 top-1 size-2 rounded-full"
            />
            <span id={missingId} hidden>
              {missing}
            </span>
          </>
        )}
      </ToolbarButton>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next) state.close();
        }}
      >
        <PopoverContent
          anchor={trigger?.anchor ?? button}
          side="bottom"
          align="start"
          spacing="xs"
          aria-label={ATTRIBUTE_MENU_LABEL}
          className="w-[min(24rem,90vw)]"
          // The caret goes back where it was in the text, not to its start.
          finalFocus={commands.returnFocus}
        >
          {children}
        </PopoverContent>
      </Popover>
    </>
  );
}
