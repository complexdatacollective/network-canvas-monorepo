import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { contrastRatio } from '@codaco/fresco-ui/storybook-support/colorContrast';

const AA_NORMAL_TEXT = 4.5;

const ERROR = 'Write what this answer says, or clear both to offer Yes and No.';

const meta = {
  title: 'Design System/Architect accent surface destructive text',
  parameters: {
    layout: 'padded',
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const Errors = ({ name }: { name: string }) => (
  <FieldErrors id={`${name}-errors`} name={name} errors={[ERROR]} show />
);

export const FieldErrorOnAccentSurface: Story = {
  render: () => (
    <>
      <Surface noContainer data-testid="page">
        <Errors name="page" />
      </Surface>
      <Surface series="accent" noContainer data-testid="accent">
        <Errors name="accent" />
        <Surface noContainer data-testid="accent-nested">
          <Errors name="accent-nested" />
        </Surface>
        <Surface series="default" noContainer data-testid="nested-default">
          <Errors name="nested-default" />
        </Surface>
      </Surface>
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const surfaces = ['page', 'accent', 'accent-nested', 'nested-default'];
    const errorIn = (id: string) => canvas.getByTestId(`${id}-field-error`);
    const isFilled = (element: Element) => {
      const background = getComputedStyle(element).backgroundColor;
      return background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent';
    };
    const groundOf = (id: string) => {
      const error = errorIn(id);
      return getComputedStyle(isFilled(error) ? error : canvas.getByTestId(id))
        .backgroundColor;
    };

    await expect(
      getComputedStyle(canvas.getByTestId('accent-nested')).backgroundColor,
    ).not.toBe(getComputedStyle(canvas.getByTestId('accent')).backgroundColor);

    await expect(
      surfaces
        .map((id) => ({
          id,
          ratio: contrastRatio(
            getComputedStyle(errorIn(id)).color,
            groundOf(id),
          ),
        }))
        .filter(({ ratio }) => ratio < AA_NORMAL_TEXT)
        .map(({ id, ratio }) => `${id} ${ratio.toFixed(2)}:1`),
      'a field error is below AA on what it is drawn on',
    ).toEqual([]);

    for (const id of ['accent', 'accent-nested']) {
      await expect(isFilled(errorIn(id))).toBe(true);
    }
    for (const id of ['page', 'nested-default']) {
      await expect(isFilled(errorIn(id))).toBe(false);
    }
  },
};
