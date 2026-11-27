import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import RichTextEditorField, {
  type RichTextInsertState,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';

import type { RichTextContent } from '../../markdown/markdownAdapter.ts';
import {
  ATTRIBUTE_MENU_LABEL,
  AttributeMenuButton,
  useAttributeMenuState,
} from './AttributeMenuButton.tsx';

/** The button and its popover, with one thing in the list to insert. */
function GreetingMenu({ insert }: Readonly<{ insert: RichTextInsertState }>) {
  const state = useAttributeMenuState(insert);
  return (
    <AttributeMenuButton insert={insert} state={state}>
      <button
        type="button"
        className="px-2 py-1"
        onClick={() => {
          state.setMenuOpen(false);
          insert.commands.insertContent({ type: 'text', text: 'hello' });
        }}
      >
        Say hello
      </button>
    </AttributeMenuButton>
  );
}

const greetingMenu = (insert: RichTextInsertState) => (
  <GreetingMenu insert={insert} />
);

function Editor() {
  const [value, setValue] = useState<RichTextContent | undefined>(undefined);
  return (
    <div className="w-[560px]">
      <RichTextEditorField
        id="attribute-menu-button"
        name="attribute-menu-button"
        aria-label="Prompt"
        singleLine
        insertTools={{ label: 'Insert an attribute', render: greetingMenu }}
        changeMode="input"
        value={value}
        onChange={setValue}
      />
    </div>
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Dynamic text/Attribute menu button',
  component: Editor,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The Attribute button of a text editor’s toolbar and the popover that it opens, with whatever list it is given inside: from the button, or where `{` is typed. The Attribute menu and the menu of a translatable string’s placeholders and wording both use it. Closed, it hands the caret back to where it was in the text.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Editor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opened from the button, and what is chosen goes in at the caret. */
export const FromTheButton: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const editor = await canvas.findByRole('textbox', { name: 'Prompt' });
    await userEvent.click(editor);
    await userEvent.keyboard('Say ');

    await userEvent.click(canvas.getByRole('button', { name: 'Attribute' }));
    const menu = within(
      await body.findByRole('dialog', { name: ATTRIBUTE_MENU_LABEL }),
    );
    await userEvent.click(menu.getByRole('button', { name: 'Say hello' }));

    await waitFor(() => expect(editor).toHaveTextContent(/^Say hello$/));
    await waitFor(() => expect(editor).toHaveFocus());
  },
};

/**
 * Opened by typing `{`: what is chosen takes the brace's place. Closed with
 * Escape, the brace stays, and the caret is back after it, not at the start
 * of the text.
 */
export const FromABrace: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const editor = await canvas.findByRole('textbox', { name: 'Prompt' });
    await userEvent.click(editor);
    await userEvent.keyboard('Hi {{');
    const menu = within(
      await body.findByRole('dialog', { name: ATTRIBUTE_MENU_LABEL }),
    );
    // Chosen, it takes the brace's place.
    await userEvent.click(menu.getByRole('button', { name: 'Say hello' }));
    await waitFor(() => expect(editor).toHaveTextContent(/^Hi hello$/));
    await waitFor(() => expect(editor).toHaveFocus());

    await userEvent.keyboard(' {{');
    // The popover mounts transparent and is drawn in on a later frame, even
    // with animations skipped: its visibility is waited for, not read once.
    const reopened = await body.findByRole('dialog', {
      name: ATTRIBUTE_MENU_LABEL,
    });
    await waitFor(() => expect(reopened).toBeVisible());

    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(body.queryByRole('dialog', { name: ATTRIBUTE_MENU_LABEL })).toBe(
        null,
      ),
    );
    await waitFor(() => expect(editor).toHaveFocus());
    await userEvent.keyboard('x');
    await waitFor(() => expect(editor).toHaveTextContent(/^Hi hello \{x$/));
  },
};
