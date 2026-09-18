import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { expect, waitFor, within } from 'storybook/test';

import Surface from '@codaco/fresco-ui/layout/Surface';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import { contrastRatio } from '@codaco/fresco-ui/storybook-support/colorContrast';

const AA_NORMAL_TEXT = 4.5;

const PROSE = 'Read the [consent notice](https://example.org) before starting.';

const AUTHOR_LINK = 'rgb(0, 128, 0)';

const meta = {
  title: 'Design System/Architect accent surface link',
  parameters: {
    layout: 'padded',
    a11y: { disable: true },
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LinkOnAccentSurface: Story = {
  render: () => (
    <>
      <div style={{ '--link': AUTHOR_LINK } as CSSProperties}>
        <Surface noContainer data-testid="author-default">
          <RenderMarkdown render={<div />}>{PROSE}</RenderMarkdown>
        </Surface>
      </div>
      <Surface series="accent" noContainer data-testid="accent">
        <RenderMarkdown render={<div />}>{PROSE}</RenderMarkdown>
        <Surface series="accent" noContainer data-testid="accent-nested">
          <RenderMarkdown render={<div />}>{PROSE}</RenderMarkdown>
        </Surface>
        <Surface series="default" noContainer data-testid="nested-default">
          <RenderMarkdown render={<div />}>{PROSE}</RenderMarkdown>
        </Surface>
      </Surface>
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const linkIn = (surface: HTMLElement) => {
      const link = within(surface).getAllByRole('link')[0];
      if (!link) throw new Error('The prose rendered no link to measure.');
      return link;
    };
    const ratioIn = (surface: HTMLElement) =>
      contrastRatio(
        getComputedStyle(linkIn(surface)).color,
        getComputedStyle(surface).backgroundColor,
      );
    const labelIn = (surface: HTMLElement) => {
      const label = linkIn(surface).querySelector('span');
      if (!label) throw new Error('The link rendered no label span.');
      return label;
    };
    const underlineAtRest = (surface: HTMLElement) =>
      !getComputedStyle(labelIn(surface)).backgroundSize.startsWith('0%');
    const expectUnderline = async (
      surface: HTMLElement,
      rest: string,
      focused: string,
    ) => {
      const link = linkIn(surface);
      const label = labelIn(surface);
      await expect(getComputedStyle(label).backgroundSize).toBe(rest);
      link.focus();
      await expect(link.matches(':focus-visible')).toBe(true);
      await waitFor(() =>
        expect(getComputedStyle(label).backgroundSize).toBe(focused),
      );
      link.blur();
    };

    const authorDefault = canvas.getByTestId('author-default');
    const accent = canvas.getByTestId('accent');
    const nestedAccent = canvas.getByTestId('accent-nested');
    const nestedDefault = canvas.getByTestId('nested-default');

    await expect(ratioIn(accent)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    await expect(ratioIn(nestedAccent)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    await expect(ratioIn(nestedDefault)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);

    await expect(underlineAtRest(accent)).toBe(true);
    await expect(underlineAtRest(nestedAccent)).toBe(true);
    await expect(underlineAtRest(nestedDefault)).toBe(false);

    await expect(getComputedStyle(linkIn(authorDefault)).color).toBe(
      AUTHOR_LINK,
    );
    await expect(underlineAtRest(authorDefault)).toBe(false);

    await expectUnderline(accent, '100% 1px', '100% 3px');
    await expectUnderline(nestedDefault, '0% 2px', '100% 2px');
    await expectUnderline(authorDefault, '0% 2px', '100% 2px');
  },
};
