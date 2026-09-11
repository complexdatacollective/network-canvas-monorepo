import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { VARIABLE_TYPE_OPTIONS } from '../../codebook/variableTypeLabels.ts';
import { controlsForType } from '../collectableTypes.ts';
import AttributeControlBadge from './AttributeControlBadge.tsx';

/**
 * One badge per kind of attribute, each with the first control its type
 * allows, on the surface the row list draws them on.
 *
 * Every colour at once because the badge's colour is the whole of what varies
 * between rows: the a11y check this preview runs over every story is what says
 * the sentence inside a badge is readable, and it can only say it about the
 * colours the story actually puts on the page.
 */
function EveryAttributeType() {
  return (
    <main className="bg-surface flex flex-col gap-2.5 p-6">
      {VARIABLE_TYPE_OPTIONS.map(({ value }) => (
        <div key={value}>
          <AttributeControlBadge
            attribute={{
              type: value,
              component: controlsForType(value)[0]?.value,
            }}
          />
        </div>
      ))}
      <div>
        <AttributeControlBadge
          attribute={{ type: 'a-type-from-a-later-schema' }}
        />
      </div>
      <div>
        <AttributeControlBadge attribute={undefined} />
      </div>
    </main>
  );
}

const meta = {
  title: 'Protocol Builder/Sections/Attribute control badge',
  component: EveryAttributeType,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'What a form field collects, as its collapsed row says it: the kind of attribute and the control the participant answers with, marked in the colour that attribute type carries everywhere else. Outlined rather than filled — white on the filled colour is under 4.5:1 for several of these types.',
      },
    },
  },
} satisfies Meta<typeof EveryAttributeType>;

export default meta;

type Story = StoryObj<typeof meta>;

export const EveryType: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    /**
     * The whole sentence one badge says, which no single element holds: the
     * type and the control are emphasised inside it, so the span is matched by
     * the text it ends up with rather than by a text node.
     */
    const badgeSaying = async (sentence: string) =>
      await canvas.findByText(
        (_text, element) =>
          element?.tagName === 'SPAN' && element.textContent === sentence,
      );

    // Named, because a badge that rendered nothing would pass the contrast
    // check this story exists for.
    await expect(
      await badgeSaying('Text attribute using Text input input control'),
    ).toBeVisible();
    await expect(
      await badgeSaying(
        'a-type-from-a-later-schema attribute using  input control',
      ),
    ).toBeVisible();
    await expect(
      canvas.getByText('This attribute is no longer in the codebook.'),
    ).toBeVisible();
  },
};
