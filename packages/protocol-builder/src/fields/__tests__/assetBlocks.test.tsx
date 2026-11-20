import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import type {
  RichTextAssetBlockKind,
  RichTextAssetBlockViewProps,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';

import {
  createAssetBlockView,
  heightDraggedTo,
  settingsPlacement,
  sizeNearest,
} from '../assetBlocks.tsx';

const UNUSABLE =
  'This block’s resource is not in this protocol, or is not something a page can show.';

type Known = { kind: RichTextAssetBlockKind; name: string } | undefined;

const attributes = (
  changes: Partial<RichTextAssetBlockViewProps['attributes']> = {},
): RichTextAssetBlockViewProps['attributes'] => ({
  assetId: 'a1',
  description: '',
  size: null,
  align: 'center',
  autoplay: true,
  loop: true,
  ...changes,
});

const IMAGE_DESCRIPTION_HINT =
  'This is read aloud to participants who use screen reader technology. Leave it blank if the image is decorative.';
const SIZE_HINT =
  'How tall this is shown on the page. Full size shows it at its natural height. You can also drag the handle at its corner.';
const FILE_HINT =
  'The file shown here. Choose another to replace it, and its settings are kept.';

/**
 * A stand-in for the resource picker: a field's control that says which file
 * it holds, and answers with another, or with none.
 */
const FileField = ({
  id,
  kind,
  value,
  onChange,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
}: CreateFormFieldProps<string, 'div', { kind: RichTextAssetBlockKind }>) => (
  <div
    role="group"
    id={id}
    aria-labelledby={labelledBy}
    aria-describedby={describedBy}
    data-kind={kind}
    data-value={value}
  >
    <button type="button" onClick={() => onChange?.('a2')}>
      Choose another
    </button>
    <button type="button" onClick={() => onChange?.(value)}>
      Choose the same
    </button>
    <button type="button" onClick={() => onChange?.(undefined)}>
      Let it go
    </button>
  </div>
);

const setup = ({
  kind = 'image',
  known,
  pick,
  textDirection,
  withFileField = false,
  ...props
}: {
  kind?: RichTextAssetBlockKind;
  /** The direction of the text the block sits in, where it states one. */
  textDirection?: 'ltr' | 'rtl';
  /** `null`: the protocol holds no such file. */
  known?: Known | null;
  pick?: RichTextAssetBlockViewProps['pick'];
  /** Whether the page offers a way to replace a block's file. */
  withFileField?: boolean;
} & Partial<RichTextAssetBlockViewProps> = {}) => {
  const found: Known =
    known === undefined
      ? { kind, name: 'Harbour photo' }
      : (known ?? undefined);
  const View = createAssetBlockView({
    useAsset: () => found,
    Preview: ({ kind: previewKind, name, className }) => (
      <div
        data-testid="preview"
        data-kind={previewKind}
        data-name={name}
        className={className}
      />
    ),
    ...(withFileField && { FileField }),
  });
  const update = vi.fn<RichTextAssetBlockViewProps['update']>();
  const remove = vi.fn<RichTextAssetBlockViewProps['remove']>();
  const returnToText = vi.fn<RichTextAssetBlockViewProps['returnToText']>();
  const user = userEvent.setup();
  const viewProps: ComponentProps<typeof View> = {
    attributes: attributes(),
    selected: true,
    editable: true,
    active: true,
    update,
    remove,
    returnToText,
    ...(pick !== undefined && { pick }),
    ...props,
  };
  render(
    textDirection === undefined ? (
      <View {...viewProps} />
    ) : (
      <div dir={textDirection}>
        <View {...viewProps} />
      </div>
    ),
  );
  return { user, update, remove, returnToText };
};

const sizeButton = (name: string) => screen.getByRole('button', { name });
const description = () => screen.queryByRole('textbox');
const deleteButton = () => screen.queryByRole('button', { name: 'Delete' });
const fileField = (name: string) => screen.queryByRole('group', { name });

describe('the settings of a block', () => {
  it.each([
    ['not selected', { selected: false }],
    ['selected in a field that cannot be edited', { editable: false }],
    ['selected in a field focus has left', { active: false }],
  ])('are not shown when the block is %s', (_kind, props) => {
    setup(props);
    expect(description()).toBeNull();
    expect(deleteButton()).toBeNull();
    // The file itself is still drawn.
    expect(screen.getByTestId('preview')).toBeInTheDocument();
  });

  it('are shown when the block is selected and can be edited', () => {
    setup();
    expect(description()).toBeInTheDocument();
    expect(deleteButton()).toBeInTheDocument();
  });

  it.each([
    ['image', 'Image settings'],
    ['audio', 'Audio settings'],
    ['video', 'Video settings'],
  ] as const)('stand over the page, named for the %s', (kind, name) => {
    setup({ kind });
    const settings = screen.getByRole('dialog', { name });
    expect(settings).toContainElement(description());
  });

  it('are where the block says they are, for Enter on the block to reach', () => {
    setup();
    const named = document
      .querySelector('[data-asset-block-controls-id]')
      ?.getAttribute('data-asset-block-controls-id');
    expect(named).toBeTruthy();
    expect(
      screen.getByRole('dialog', { name: 'Image settings' }),
    ).toHaveAttribute('id', named);
  });

  it('do not take focus as they appear', () => {
    setup();
    expect(
      screen.getByRole('dialog', { name: 'Image settings' }),
    ).not.toContainElement(
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
    );
  });

  describe('for an image', () => {
    it('offers a description and a size, and no playback', () => {
      setup({ kind: 'image' });
      expect(description()).toHaveAccessibleName('Description');
      expect(sizeButton('Full size')).toBeInTheDocument();
      expect(screen.queryByRole('switch')).toBeNull();
    });

    it('labels each setting, and says what the description and size are for', () => {
      setup({ kind: 'image', attributes: attributes({ size: 'small' }) });
      // Shown, as a form's fields are, and not only read out (the popup
      // fades in, which jsdom never finishes: the story looks at it drawn).
      const shown = (text: string) =>
        expect(screen.getByText(text)).not.toHaveClass('sr-only');
      shown('Description');
      shown(IMAGE_DESCRIPTION_HINT);
      shown('Display size');
      shown(SIZE_HINT);
      shown('Alignment');
      expect(description()).toHaveAccessibleDescription(IMAGE_DESCRIPTION_HINT);
      const size = screen.getByRole('group', { name: 'Display size' });
      expect(size).toHaveAccessibleDescription(SIZE_HINT);
      expect(size).toContainElement(sizeButton('Small'));
      const align = screen.getByRole('group', { name: 'Alignment' });
      expect(align).toContainElement(
        screen.getByRole('button', { name: 'Align to the end' }),
      );
    });

    it('offers alignment only once a size is set', () => {
      setup({ kind: 'image', attributes: attributes({ size: null }) });
      expect(
        screen.queryByRole('button', { name: 'Align to the end' }),
      ).toBeNull();
    });

    it('offers alignment when a size is set', () => {
      setup({ kind: 'image', attributes: attributes({ size: 'small' }) });
      expect(
        screen.getByRole('button', { name: 'Align to the end' }),
      ).toBeInTheDocument();
    });
  });

  describe('for a video', () => {
    it('offers a size and both playback settings', () => {
      setup({ kind: 'video' });
      expect(sizeButton('Full size')).toBeInTheDocument();
      expect(
        screen.getByRole('switch', { name: 'Start playing automatically' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('switch', { name: 'Repeat when it ends' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Align to the end' }),
      ).toBeNull();
    });
  });

  describe('for audio', () => {
    it('offers alignment and both playback settings, and no size', () => {
      setup({ kind: 'audio' });
      expect(
        screen.getByRole('button', { name: 'Align to the end' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('switch', { name: 'Start playing automatically' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Full size' })).toBeNull();
      expect(screen.queryByRole('group', { name: 'Display size' })).toBeNull();
    });
  });

  describe('changing them', () => {
    it('updates the description as it is typed', async () => {
      const { user, update } = setup();
      await user.type(screen.getByRole('textbox'), 'A');
      expect(update).toHaveBeenLastCalledWith({ description: 'A' });
    });

    it('updates the size, and clears it for full size', async () => {
      const { user, update } = setup({
        attributes: attributes({ size: 'small' }),
      });
      await user.click(sizeButton('Large'));
      expect(update).toHaveBeenLastCalledWith({ size: 'large' });
      await user.click(sizeButton('Full size'));
      expect(update).toHaveBeenLastCalledWith({ size: null });
    });

    it('updates the alignment', async () => {
      const { user, update } = setup({
        kind: 'audio',
      });
      await user.click(
        screen.getByRole('button', { name: 'Align to the end' }),
      );
      expect(update).toHaveBeenLastCalledWith({ align: 'end' });
      await user.click(
        screen.getByRole('button', { name: 'Align to the start' }),
      );
      expect(update).toHaveBeenLastCalledWith({ align: 'start' });
    });

    it('updates autoplay and loop', async () => {
      const { user, update } = setup({ kind: 'video' });
      await user.click(
        screen.getByRole('switch', { name: 'Start playing automatically' }),
      );
      expect(update).toHaveBeenLastCalledWith({ autoplay: false });
      await user.click(
        screen.getByRole('switch', { name: 'Repeat when it ends' }),
      );
      expect(update).toHaveBeenLastCalledWith({ loop: false });
    });

    it('shows the current playback settings', () => {
      setup({
        kind: 'audio',
        attributes: attributes({ autoplay: false, loop: true }),
      });
      expect(
        screen.getByRole('switch', { name: 'Start playing automatically' }),
      ).not.toBeChecked();
      expect(
        screen.getByRole('switch', { name: 'Repeat when it ends' }),
      ).toBeChecked();
    });

    it('removes the block', async () => {
      const { user, remove, update } = setup();
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      expect(remove).toHaveBeenCalledTimes(1);
      expect(update).not.toHaveBeenCalled();
    });

    it('offers the file as a field of its own, named for its kind', () => {
      setup({ kind: 'video', withFileField: true });
      const field = fileField('Video');
      expect(field).toHaveAccessibleDescription(FILE_HINT);
      expect(field).toHaveAttribute('data-kind', 'video');
      expect(field).toHaveAttribute('data-value', 'a1');
      expect(
        screen.getByRole('dialog', { name: 'Video settings' }),
      ).toContainElement(field);
    });

    it('replaces the file with the one chosen, and goes back to the block', async () => {
      const { user, update, remove, returnToText } = setup({
        withFileField: true,
      });
      await user.click(screen.getByRole('button', { name: 'Choose another' }));
      // Only the file: the block's other settings are its own.
      expect(update).toHaveBeenCalledExactlyOnceWith({ assetId: 'a2' });
      expect(returnToText).toHaveBeenCalledTimes(1);
      expect(remove).not.toHaveBeenCalled();
    });

    it('changes nothing when the same file is chosen again', async () => {
      const { user, update, returnToText } = setup({ withFileField: true });
      await user.click(screen.getByRole('button', { name: 'Choose the same' }));
      expect(update).not.toHaveBeenCalled();
      expect(returnToText).toHaveBeenCalledTimes(1);
    });

    it('deletes the block when its file is let go', async () => {
      const { user, update, remove } = setup({ withFileField: true });
      await user.click(screen.getByRole('button', { name: 'Let it go' }));
      expect(remove).toHaveBeenCalledTimes(1);
      expect(update).not.toHaveBeenCalled();
    });

    it('offers no way to replace the file where the page has none', () => {
      // A way to choose a file for a new block is not one to replace a file.
      setup({ pick: vi.fn(() => Promise.resolve('a2')) });
      expect(fileField('Image')).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Change the image' }),
      ).toBeNull();
      expect(deleteButton()).toBeInTheDocument();
    });

    it('offers no file field for a file it cannot show', () => {
      setup({ known: null, withFileField: true });
      expect(screen.queryByRole('group')).toBeNull();
    });

    it('returns to the text on Escape from a control', async () => {
      const { user, returnToText } = setup();
      await user.click(screen.getByRole('textbox'));
      await user.keyboard('{Escape}');
      expect(returnToText).toHaveBeenCalledTimes(1);
    });

    it('does not return to the text on another key', async () => {
      const { user, returnToText } = setup();
      await user.click(screen.getByRole('textbox'));
      await user.keyboard('x{Enter}');
      expect(returnToText).not.toHaveBeenCalled();
    });
  });
});

describe('the drawing of a block', () => {
  it('names the file by its description, or by its own name without one', () => {
    setup({ attributes: attributes({ description: 'The harbour at dawn' }) });
    expect(screen.getByTestId('preview')).toHaveAttribute(
      'data-name',
      'The harbour at dawn',
    );
  });

  it('falls back to the file’s name when the description is blank', () => {
    setup({ attributes: attributes({ description: '   ' }) });
    expect(screen.getByTestId('preview')).toHaveAttribute(
      'data-name',
      'Harbour photo',
    );
  });

  it('holds an image to the height its size names', () => {
    setup({ attributes: attributes({ size: 'small' }) });
    expect(screen.getByTestId('preview')).toHaveClass('max-h-48');
  });

  it('says so when the file is not in the protocol or cannot be shown', () => {
    setup({ known: null, attributes: attributes({ assetId: 'gone' }) });
    expect(screen.getByText(UNUSABLE)).toBeInTheDocument();
    expect(screen.queryByTestId('preview')).toBeNull();
  });

  it('offers only removal for a file it cannot show', () => {
    setup({ known: null });
    expect(description()).toBeNull();
    expect(screen.getByRole('button')).toHaveAccessibleName('Delete');
  });
});

describe('the alignment icons', () => {
  const iconOf = (name: string) =>
    screen
      .getByRole('button', { name })
      .querySelector('svg')
      ?.getAttribute('class');

  const icons = (textDirection: 'ltr' | 'rtl') => {
    setup({ textDirection, attributes: attributes({ size: 'small' }) });
    const found = {
      start: iconOf('Align to the start'),
      end: iconOf('Align to the end'),
    };
    cleanup();
    return found;
  };

  it('point where the file will sit in the direction the text runs, whatever the interface’s', () => {
    const leftToRight = icons('ltr');
    const rightToLeft = icons('rtl');

    expect(leftToRight.start).toBeTruthy();
    expect(leftToRight.start).not.toBe(leftToRight.end);
    expect(rightToLeft.start).toBe(leftToRight.end);
    expect(rightToLeft.end).toBe(leftToRight.start);
  });
});

describe('the size a picture is dragged to', () => {
  const heights = [
    ['small', 192],
    ['medium', 384],
    ['large', 600],
    ['full', 900],
  ] as const;

  it.each([
    [0, 'small'],
    [287, 'small'],
    [289, 'medium'],
    [491, 'medium'],
    [493, 'large'],
    [749, 'large'],
    [751, 'full'],
    [5000, 'full'],
  ] as const)(
    'is the size drawn nearest to %i pixels tall: %s',
    (wanted, size) => {
      expect(sizeNearest(wanted, heights)).toBe(size);
    },
  );

  it('is the largest of the sizes that draw a small picture the same', () => {
    // A picture 300 pixels tall at the page's width: medium, large and full
    // size all draw it whole.
    const small = [
      ['small', 192],
      ['medium', 300],
      ['large', 300],
      ['full', 300],
    ] as const;
    expect(sizeNearest(300, small)).toBe('full');
    expect(sizeNearest(200, small)).toBe('small');
  });
});

describe('the height a picture’s corner is dragged to', () => {
  // A picture twice as wide as it is tall, 100 pixels tall when taken hold of.
  const RATIO = 2;

  it('is the height it was until the corner moves', () => {
    expect(heightDraggedTo(100, { across: 0, down: 0 }, RATIO)).toBe(100);
  });

  it('follows the corner down, or up', () => {
    expect(heightDraggedTo(100, { across: 0, down: 40 }, RATIO)).toBe(140);
    expect(heightDraggedTo(100, { across: 0, down: -40 }, RATIO)).toBe(60);
  });

  it('follows the corner across as the picture’s shape has it', () => {
    // 80 pixels wider is 40 pixels taller, at twice as wide as tall.
    expect(heightDraggedTo(100, { across: 80, down: 0 }, RATIO)).toBe(140);
    expect(heightDraggedTo(100, { across: -80, down: 0 }, RATIO)).toBe(60);
  });

  it('takes the move that says the most', () => {
    // Down by 10 says 110; across by 80 says 140.
    expect(heightDraggedTo(100, { across: 80, down: 10 }, RATIO)).toBe(140);
    // Across by 10 says 105; down by 50 says 150.
    expect(heightDraggedTo(100, { across: 10, down: 50 }, RATIO)).toBe(150);
    // Shrinking counts as much as growing: up by 30 says 70.
    expect(heightDraggedTo(100, { across: 20, down: -30 }, RATIO)).toBe(70);
  });
});

describe('where a block’s settings stand', () => {
  // A page seen in the whole of a window 1000 pixels tall keeps 96 clear at
  // the top and 90 at the bottom, and the settings stand 10 from the file.
  const WINDOW = { top: 0, bottom: 1000 };

  it('stand under the file where they fit there', () => {
    expect(settingsPlacement({ top: 110, bottom: 302 }, 450, WINDOW)).toEqual({
      side: 'bottom',
      overlaps: false,
    });
  });

  it('stand over the file where they fit only there', () => {
    expect(settingsPlacement({ top: 700, bottom: 892 }, 450, WINDOW)).toEqual({
      side: 'top',
      overlaps: false,
    });
  });

  it('cover the file from the side with more room where they fit on neither', () => {
    // 304 under the file, 298 over it.
    expect(settingsPlacement({ top: 404, bottom: 596 }, 450, WINDOW)).toEqual({
      side: 'bottom',
      overlaps: true,
    });
    // 244 under it, 358 over it.
    expect(settingsPlacement({ top: 464, bottom: 656 }, 450, WINDOW)).toEqual({
      side: 'top',
      overlaps: true,
    });
  });

  it('measure the room from where the page is seen, below a banner over it', () => {
    // Over the file there would be 594 in the whole window, and is 524 in a
    // page seen from 70 pixels down.
    expect(
      settingsPlacement({ top: 700, bottom: 892 }, 550, WINDOW).overlaps,
    ).toBe(false);
    expect(
      settingsPlacement({ top: 700, bottom: 892 }, 550, {
        top: 70,
        bottom: 1000,
      }).overlaps,
    ).toBe(true);
  });
});
