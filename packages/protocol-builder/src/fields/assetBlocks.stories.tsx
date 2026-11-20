import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ReactNode, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

import StageEditorShell from '../form/StageEditorShell.tsx';
import { ProtocolBuilder } from '../ProtocolBuilder.tsx';
import { ResourceClientProvider } from '../resources/client.tsx';
import {
  createStoryHost,
  IMAGE_RESOURCE,
  PROTOCOL_RESOURCES,
  type StoryResource,
} from '../resources/components/storyFixtures.ts';
import PageContentSection from '../sections/page-content/PageContentSection.tsx';
import { StageEditSession } from '../stageEdit.tsx';
import { createAssetBlockView } from './assetBlocks.tsx';

// What a block's view draws, from stand-ins for where its files come from.
const View = createAssetBlockView({
  useAsset: (assetId) =>
    assetId === 'missing' ? undefined : { kind: 'image', name: 'harbour.png' },
  Preview: ({ name }) => (
    <div className="bg-surface-1 h-24 rounded p-2">{name}</div>
  ),
});

const meta = {
  title: 'Protocol Builder/Fields/Asset blocks',
  component: View,
  args: {
    attributes: {
      assetId: 'a1',
      description: '',
      size: 'small',
      align: 'center',
      autoplay: true,
      loop: true,
    },
    selected: true,
    editable: true,
    active: true,
    update: fn(),
    remove: fn(),
    returnToText: fn(),
  },
} satisfies Meta<typeof View>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A selected image in a field the researcher is in: its picture, and over the
 * page beside it the settings that change how it shows, each a labelled field.
 */
export const SelectedImage: Story = {
  play: async ({ canvasElement, args }) => {
    // The settings stand over the page, outside the story's own element.
    const settingsElement = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', { name: 'Image settings' });
    const settings = within(settingsElement);
    // Labelled, with their guidance shown under the label.
    await waitFor(() =>
      expect(settings.getByText('Description')).toBeVisible(),
    );
    await expect(
      settings.getByText(
        'This is read aloud to participants who use screen reader technology. Leave it blank if the image is decorative.',
      ),
    ).toBeVisible();
    await expect(settings.getByText('Display size')).toBeVisible();
    const size = settings.getByRole('group', { name: 'Display size' });
    await expect(size).toHaveAccessibleDescription(
      'How tall this is shown on the page. Full size shows it at its natural height. You can also drag the handle at its corner.',
    );
    await expect(
      settings.getByRole('group', { name: 'Alignment' }),
    ).toBeVisible();
    await userEvent.click(within(size).getByRole('button', { name: 'Large' }));
    await expect(args.update).toHaveBeenCalledWith({ size: 'large' });
    // Delete, marked with a bin.
    const remove = settings.getByRole('button', { name: 'Delete' });
    await expect(remove.querySelector('svg')).toBeVisible();
    await userEvent.click(remove);
    await expect(args.remove).toHaveBeenCalled();
  },
};

/** Not selected: just the picture, as the participant will meet it. */
export const NotSelected: Story = {
  args: { selected: false },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole('button', {
        name: 'Delete',
      }),
    ).toBeNull();
  },
};

/** A block naming a file the protocol no longer holds says so. */
export const MissingFile: Story = {
  args: { attributes: { ...meta.args.attributes, assetId: 'missing' } },
};

// A square picture that is drawn, so that it has a corner: held to a size, it
// is narrower than its box, and sits against one side of it.
const SQUARE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#6ecae8"/></svg>',
)}`;

const DrawnView = createAssetBlockView({
  useAsset: () => ({ kind: 'image', name: 'square.svg' }),
  Preview: ({ name, className }) => (
    <img src={SQUARE} alt={name} className={className} />
  ),
});

/**
 * Where the corner that resizes the picture in `scope` is wanted: on the
 * bottom corner of the outline a selected block is drawn with, on the side
 * the picture grows towards, which is the left for a picture held against the
 * right of its box, and the right otherwise. Whatever size the picture is, so
 * that a small picture in a wide box has its corner where the selected box
 * has one. Read from the outline as it is drawn: around the block in the
 * editor, around a stand-in for it in the stories that draw a view alone.
 */
const expectCornerOfTheBox = async (scope: Element) => {
  const corner = await waitFor(() => {
    const found = scope.querySelector('[data-asset-block-resize]');
    if (found === null) throw new Error('No corner yet');
    return found.getBoundingClientRect();
  });
  const image = scope.querySelector('img');
  const block = scope.querySelector('[data-asset-block]');
  if (image === null || block === null) throw new Error('No picture');
  const style = getComputedStyle(block);
  await expect(style.outlineStyle).not.toBe('none');
  // The middle of the line the outline is drawn as.
  const out =
    Number.parseFloat(style.outlineOffset) +
    Number.parseFloat(style.outlineWidth) / 2;
  const box = block.getBoundingClientRect();
  const across =
    Number.parseFloat(getComputedStyle(image).objectPosition) / 100;
  const x = across === 1 ? box.left - out : box.right + out;
  await expect(
    Math.abs((corner.left + corner.right) / 2 - x),
  ).toBeLessThanOrEqual(1);
  await expect(
    Math.abs((corner.top + corner.bottom) / 2 - (box.bottom + out)),
  ).toBeLessThanOrEqual(1);
};

/**
 * A view drawn alone, in a stand-in for the block the editor draws around it:
 * outlined as the editor outlines a selected block.
 */
function Outlined({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      data-asset-block=""
      className="outline-primary rounded-sm outline-2 outline-offset-4"
    >
      {children}
    </div>
  );
}

const cornerIsAtTheBoxsCorner: Story['play'] = async ({ canvasElement }) => {
  await expectCornerOfTheBox(canvasElement);
};

// These stories are each about one direction of text, which they set
// themselves, so there is no other direction to draw them in and compare.
const ONE_DIRECTION = ['!mirror'];

const drawnIn = (direction: 'ltr' | 'rtl'): Story['render'] =>
  function Drawn(args) {
    return (
      <div dir={direction} className="w-[600px]">
        <Outlined>
          <DrawnView {...args} />
        </Outlined>
      </div>
    );
  };

/** Text that reads left to right, its picture where a line ends. */
export const CornerOfAPictureAtTheEnd: Story = {
  args: { attributes: { ...meta.args.attributes, align: 'end' } },
  render: drawnIn('ltr'),
  tags: ONE_DIRECTION,
  play: cornerIsAtTheBoxsCorner,
};

/**
 * Text that reads right to left, its picture where a line starts: against the
 * right of its box, as above, though the page runs the other way.
 */
export const CornerOfAPictureInRightToLeftText: Story = {
  args: { attributes: { ...meta.args.attributes, align: 'start' } },
  render: drawnIn('rtl'),
  tags: ONE_DIRECTION,
  play: cornerIsAtTheBoxsCorner,
};

/** Right to left, and where a line ends: against the left of its box. */
export const CornerOfAPictureAtTheEndOfRightToLeftText: Story = {
  args: { attributes: { ...meta.args.attributes, align: 'end' } },
  render: drawnIn('rtl'),
  tags: ONE_DIRECTION,
  play: cornerIsAtTheBoxsCorner,
};

const SIZE_CHOICES = [null, 'small', 'medium', 'large'] as const;
const ALIGNMENTS = ['start', 'center', 'end'] as const;

/**
 * A picture at each size and in each place across the page, each selected:
 * its corner is at the corner of its box every time, the box's height being
 * the picture's and its width the page's.
 */
export const CornerAtEverySize: Story = {
  args: { active: false },
  tags: ONE_DIRECTION,
  render: function EverySize(args) {
    return (
      <div dir="ltr" className="flex w-[600px] flex-col gap-10">
        {SIZE_CHOICES.flatMap((size) =>
          ALIGNMENTS.map((align) => (
            <div
              key={`${size}-${align}`}
              data-testid={`${size ?? 'full'}-${align}`}
            >
              <Outlined>
                <DrawnView
                  {...args}
                  attributes={{ ...args.attributes, size, align }}
                />
              </Outlined>
            </div>
          )),
        )}
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const blocks = within(canvasElement).getAllByTestId(/-/);
    await expect(blocks).toHaveLength(12);
    for (const block of blocks) await expectCornerOfTheBox(block);
  },
};

/** A small picture in the middle of the page, with its settings beside it. */
export const SmallPicture: Story = {
  render: drawnIn('ltr'),
  tags: ONE_DIRECTION,
  play: cornerIsAtTheBoxsCorner,
};

/** A second picture to choose in place of the first: square, where it is wide. */
const SQUARE_RESOURCE: StoryResource = Object.freeze({
  kind: 'image',
  id: 'image-2',
  name: 'Square sketch',
  source: 'square.svg',
  contentType: 'image/svg+xml',
  bytes:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#6ecae8"/></svg>',
});

/**
 * A page being written in a stage editor, its text holding the block `block`
 * spells: the real editor, over a host holding real files, with the
 * resource browser a block's settings open.
 */
function PageHost({ block }: Readonly<{ block: string }>) {
  const [host] = useState(() =>
    createStoryHost({
      resources: [...PROTOCOL_RESOURCES, SQUARE_RESOURCE],
      stage: {
        stageId: 'welcome-screen',
        type: 'Information',
        fields: {
          label: { 'en-US': 'Welcome' },
          content: {
            'en-US': `Welcome to the study.\n\n${block}\n\nPlease read on.`,
          },
        },
      },
    }),
  );
  return (
    <DialogProvider>
      <ProtocolBuilder adapter={host.adapter} protocolId={host.protocolId}>
        <ResourceClientProvider>
          <StageEditSession target={{ sectionId: host.sectionId }}>
            <main className="mx-auto max-w-4xl p-6">
              <StageEditorShell>
                <PageContentSection />
              </StageEditorShell>
            </main>
          </StageEditSession>
        </ResourceClientProvider>
      </ProtocolBuilder>
    </DialogProvider>
  );
}

/** Selects the block in the page, and waits for its settings. */
const selectBlock = async (canvasElement: HTMLElement, name: string) => {
  const block = await waitFor(() => {
    const found =
      canvasElement.querySelector<HTMLElement>('[data-asset-block]');
    if (found === null) throw new Error('No block yet');
    return found;
  });
  // Clicked where it is drawn, as a pointer clicks: the text finds what was
  // clicked from where the click was.
  const target = block.querySelector('img, video, audio') ?? block;
  const { left, top, width, height } = target.getBoundingClientRect();
  await userEvent.pointer({
    keys: '[MouseLeft]',
    target,
    coords: { clientX: left + width / 2, clientY: top + height / 2 },
  });
  await waitFor(() => expect(block).toHaveAttribute('data-selected'));
  const settings = await within(canvasElement.ownerDocument.body).findByRole(
    'dialog',
    { name },
  );
  return { block, settings: within(settings) };
};

const pressed = (button: HTMLElement) =>
  expect(button).toHaveAttribute('aria-pressed', 'true');

// The page is a whole editor rather than a layout in the reading direction:
// the other stories mirror the block itself.
const WHOLE_EDITOR = ['!mirror'];

/**
 * A picture's file replaced from its settings: the resource browser opens
 * over them, and once a file is chosen the block draws it, is still
 * selected, and keeps its description, size and place.
 */
export const ReplacingThePicture: Story = {
  tags: WHOLE_EDITOR,
  render: () => (
    <PageHost
      block={`![The neighbourhood](asset:${IMAGE_RESOURCE.id}?size=small&align=end)`}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const { block, settings } = await selectBlock(
      canvasElement,
      'Image settings',
    );
    const file = settings.getByRole('group', { name: 'Image' });
    await expect(file).toHaveAccessibleDescription(
      'The file shown here. Choose another to replace it, and its settings are kept.',
    );
    await expect(within(file).getByText('Neighbourhood photo')).toBeVisible();

    // Closed with nothing chosen, the browser leaves the block as it was.
    await userEvent.click(
      within(file).getByRole('button', { name: 'Change the image' }),
    );
    await body.findByRole('dialog', { name: 'Choose an image' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: 'Choose an image' }),
      ).toBeNull(),
    );
    await expect(block).toHaveAttribute('data-selected');
    const settingsAfterEscape = await body.findByRole('dialog', {
      name: 'Image settings',
    });
    await expect(
      within(settingsAfterEscape).getByText('Neighbourhood photo'),
    ).toBeVisible();

    await userEvent.click(
      within(settingsAfterEscape).getByRole('button', {
        name: 'Change the image',
      }),
    );
    const browser = await body.findByRole('dialog', {
      name: 'Choose an image',
    });
    await userEvent.click(
      await within(browser).findByRole('button', { name: /Square sketch/ }),
    );

    // The new file, drawn: square, where the first was wide.
    await waitFor(() => {
      const image = block.querySelector('img');
      expect(image?.naturalWidth).toBeGreaterThan(0);
      expect(image?.naturalWidth).toBe(image?.naturalHeight);
    });
    // Still the selection, with the caret on it, where Enter goes back into
    // its settings; and those are over the page again.
    await expect(block).toHaveAttribute('data-selected');
    await waitFor(() =>
      expect(
        within(canvasElement).getByRole('textbox', { name: /^Rich Text/ }),
      ).toHaveFocus(),
    );
    const again = within(
      await body.findByRole('dialog', { name: 'Image settings' }),
    );
    await expect(
      within(again.getByRole('group', { name: 'Image' })).getByText(
        'Square sketch',
      ),
    ).toBeVisible();
    // Its corner is on the corner of the selected box, small as it is.
    await expectCornerOfTheBox(canvasElement);
    // Its other settings are kept.
    await expect(
      again.getByRole('textbox', { name: 'Description' }),
    ).toHaveValue('The neighbourhood');
    await pressed(again.getByRole('button', { name: 'Small' }));
    await pressed(again.getByRole('button', { name: 'Align to the end' }));
    // And nothing else was chosen as the browser closed.
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: 'Choose an image' }),
      ).toBeNull(),
    );
  },
};

/** A video's settings: its playback, as well as how it shows. */
export const VideoSettings: Story = {
  tags: WHOLE_EDITOR,
  render: () => (
    <PageHost block="![A walkthrough](asset:video-1?size=medium&autoplay=false)" />
  ),
  play: async ({ canvasElement }) => {
    const { settings } = await selectBlock(canvasElement, 'Video settings');
    await expect(
      settings.getByRole('switch', { name: 'Start playing automatically' }),
    ).not.toBeChecked();
    await expect(
      settings.getByRole('switch', { name: 'Repeat when it ends' }),
    ).toBeChecked();
    await expect(
      settings.getByRole('group', { name: 'Video' }),
    ).toBeInTheDocument();
    await expect(
      settings.getByRole('button', { name: 'Delete' }),
    ).toBeInTheDocument();
  },
};
