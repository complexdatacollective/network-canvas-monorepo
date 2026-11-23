import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import type {
  RichTextAssetBlockKind,
  RichTextAssetBlockViewProps,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { assetBlockAttributes } from '@codaco/fresco-ui/testing/assetBlock';

import { messages } from '../assetBlockMessages.ts';
import { createAssetBlockView } from '../AssetBlockView.tsx';

type Known = { kind: RichTextAssetBlockKind; name: string } | undefined;

const attributes = assetBlockAttributes;

const IMAGE_DESCRIPTION_HINT =
  'This is read aloud to participants who use screen reader technology. Leave it blank if the image is decorative.';
const SIZE_HINT =
  'How tall this is shown on the page. Full size shows it at its natural height. You can also drag the handle at its corner.';
const FILE_HINT =
  'The file shown here. Choosing another keeps the description and other settings.';

/**
 * A stand-in for the resource picker: a field's control that says which file
 * it holds, and answers with another, or with none.
 */
const FileField = ({
  id,
  kind,
  value,
  onChange,
  onBrowserOpenChange,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
}: CreateFormFieldProps<
  string,
  'div',
  {
    kind: RichTextAssetBlockKind;
    onBrowserOpenChange?: (open: boolean) => void;
  }
>) => (
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
    <button type="button" onClick={() => onBrowserOpenChange?.(true)}>
      Browse
    </button>
    <button type="button" onClick={() => onBrowserOpenChange?.(false)}>
      Stop browsing
    </button>
  </div>
);

const setup = ({
  kind = 'image',
  known,
  textDirection,
  withFileField = false,
  ...props
}: {
  kind?: RichTextAssetBlockKind;
  /** The direction of the text the block sits in, where it states one. */
  textDirection?: 'ltr' | 'rtl';
  /** `null`: the protocol holds no such file. */
  known?: Known | null;
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
    ...props,
  };
  const drawn = (shown: ComponentProps<typeof View>) =>
    textDirection === undefined ? (
      <View {...shown} />
    ) : (
      <div dir={textDirection}>
        <View {...shown} />
      </div>
    );
  const { rerender } = render(drawn(viewProps));
  return {
    user,
    update,
    remove,
    returnToText,
    /** Draws the view again, with `changes` to what it was given. */
    redraw: (changes: Partial<RichTextAssetBlockViewProps>) =>
      rerender(drawn({ ...viewProps, ...changes })),
  };
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

    it('stay while the file field’s browser is open, wherever focus is', async () => {
      const { user, redraw } = setup({ withFileField: true });
      await user.click(screen.getByRole('button', { name: 'Browse' }));
      // Focus leaves the field as the settings are hidden for the browser,
      // before the browser takes it: the browser is the settings', and stays.
      redraw({ active: false });
      expect(fileField('Image')).toBeInTheDocument();
      // Closed, with focus nowhere in the field, it takes the settings with it.
      await user.click(screen.getByRole('button', { name: 'Stop browsing' }));
      expect(fileField('Image')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('offers no way to replace the file where the page has none', () => {
      setup();
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
    expect(
      screen.getByText(messages.unusable.defaultMessage),
    ).toBeInTheDocument();
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
