import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { getLocaleMetadata, type LocaleTag } from '@codaco/protocol-validation';

import PreviewToolbar from './PreviewToolbar';

type ToolbarProofProps = Readonly<{
  locales: readonly LocaleTag[];
  initialLocale: LocaleTag;
  onChange: (locale: LocaleTag) => void;
}>;

/** The toolbar holding its own choice, as the preview window does. */
function ToolbarProof({ locales, initialLocale, onChange }: ToolbarProofProps) {
  const [value, setValue] = useState(initialLocale);
  return (
    <PreviewToolbar
      options={locales.map((locale) => getLocaleMetadata(locale))}
      value={value}
      onChange={(locale) => {
        setValue(locale);
        onChange(locale);
      }}
    />
  );
}

const meta = {
  title: 'Architect/Preview/Preview toolbar',
  component: ToolbarProof,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The bar above an interview preview. Its menu lists every language the protocol declares alphabetically, each named in that language, and shows the interview in the one chosen until the preview window closes. A language chooser stage moves it too.',
      },
    },
  },
  args: { onChange: fn() },
  tags: ['autodocs'],
} satisfies Meta<typeof ToolbarProof>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A protocol translated into several languages, one written right to left.
 * The menu sorts them by name, whatever order the protocol declares them in.
 */
export const SeveralLanguages: Story = {
  args: { locales: ['zh-Hans', 'ar', 'fr', 'en'], initialLocale: 'en' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const menu = canvas.getByRole('combobox', { name: 'Preview language' });
    const options = within(menu).getAllByRole('option');
    await expect(options.map((option) => option.lang)).toEqual([
      'en',
      'fr',
      'ar',
      'zh-Hans',
    ]);
    await expect(options[2]).toHaveAttribute('dir', 'rtl');

    await userEvent.selectOptions(menu, 'fr');
    await expect(menu).toHaveValue('fr');
    await expect(args.onChange).toHaveBeenCalledWith('fr');
  },
};

/** One language: the menu names it and offers nothing to switch to. */
export const OneLanguage: Story = {
  args: { locales: ['en'], initialLocale: 'en' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const menu = canvas.getByRole('combobox', { name: 'Preview language' });
    await expect(menu).toBeDisabled();
    await expect(menu).toHaveValue('en');
  },
};
