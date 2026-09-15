import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentProps, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '../../storybook-support/awaitPassiveEffects';
import IconPicker from './IconPicker';

/**
 * The arg-driven example, holding the icon it is shown choosing.
 *
 * The control is always controlled — a `<Field>` owns the value — so a story
 * that only spread its args would render a picker nothing could be chosen
 * from, and the docs page's first example would look broken.
 */
function ExampleIconPicker(props: ComponentProps<typeof IconPicker>) {
  const [value, setValue] = useState(props.value);

  return (
    <IconPicker
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
    />
  );
}

const meta = {
  title: 'Systems/Form/Fields/IconPicker',
  component: IconPicker,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
A searchable picker over every icon an interview can draw, each shown as itself.

\`\`\`tsx
import Field from '@codaco/fresco-ui/form/Field/Field';
import IconPicker from '@codaco/fresco-ui/form/fields/IconPicker';

<Field name="icon" label="Icon" component={IconPicker} required />;
\`\`\`

- The value stored is the icon's own name, which is what \`Icon\` draws and what
  a protocol carries.
- Both icon sets are offered: Network Canvas' own icons first
  (\`add-a-person\`, \`menu-sociogram\`, …), then Lucide's (\`UserPlus\`, …).
  The list comes from the same maps \`Icon\` dispatches on, so the picker offers
  exactly what the renderer supports.
- Search matches the letters and digits of a name alone, so "user plus",
  "user-plus" and "userplus" all reach \`UserPlus\`.
- The list holds 200 icons at a time. When more than that match, it says how
  many it is showing of how many, rather than stopping silently.
- Labelling belongs to the surrounding field: use it as the \`component\` of a
  \`<Field>\`, or of an \`UnconnectedField\` when the value is not the form's.
        `,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    'aria-invalid': { control: 'boolean' },
    'disabled': { control: 'boolean' },
    'readOnly': { control: 'boolean' },
  },
  args: {
    'aria-label': 'Icon',
    'value': 'add-a-person',
  },
  // Rendered bare and handed every arg, so the Controls panel drives the real
  // public surface — `disabled`, `readOnly` and `aria-invalid` included, which
  // a wrapper that only read `value` left unexercised.
  render: (args) => <ExampleIconPicker key={args.value} {...args} />,
} satisfies Meta<typeof IconPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('combobox', { name: 'Icon' });

    await expect(trigger).toHaveTextContent('add-a-person');
  },
};

/** Opened, searched across naming conventions, and chosen with the keyboard. */
export const SearchAndChoose: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole('combobox', { name: 'Icon' }));

    const search = await body.findByPlaceholderText('Search icons…');
    await userEvent.type(search, 'user plus');

    const option = await body.findByRole('option', { name: /UserPlus/ });
    await userEvent.click(option);

    await waitFor(async () => {
      await expect(
        canvas.getByRole('combobox', { name: 'Icon' }),
      ).toHaveTextContent('UserPlus');
    });
  },
};

/** A search matching nothing says so instead of showing an empty list. */
export const NoMatches: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole('combobox', { name: 'Icon' }));
    await userEvent.type(
      await body.findByPlaceholderText('Search icons…'),
      'not-a-rendered-icon',
    );

    await expect(await body.findByText('No icons found')).toBeVisible();
  },
};

/** Nothing chosen yet: the trigger says what it is waiting for. */
export const Empty: Story = {
  args: { value: '' },
};

/** A held icon the picker's old two-name list left unreachable. */
export const NetworkCanvasIcon: Story = {
  args: { value: 'menu-sociogram' },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const Invalid: Story = {
  args: { 'aria-invalid': true },
};
