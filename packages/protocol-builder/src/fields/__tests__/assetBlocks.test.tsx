import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type {
  RichTextAssetBlockKind,
  RichTextAssetBlockViewProps,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';

import { createAssetBlockView } from '../assetBlocks.tsx';

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

const setup = ({
  kind = 'image',
  known,
  pick,
  textDirection,
  ...props
}: {
  kind?: RichTextAssetBlockKind;
  /** The direction of the text the block sits in, where it states one. */
  textDirection?: 'ltr' | 'rtl';
  /** `null`: the protocol holds no such file. */
  known?: Known | null;
  pick?: RichTextAssetBlockViewProps['pick'];
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
  });
  const update = vi.fn<RichTextAssetBlockViewProps['update']>();
  const remove = vi.fn<RichTextAssetBlockViewProps['remove']>();
  const returnToText = vi.fn<RichTextAssetBlockViewProps['returnToText']>();
  const user = userEvent.setup();
  const viewProps: ComponentProps<typeof View> = {
    attributes: attributes(),
    selected: true,
    editable: true,
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

describe('the settings of a block', () => {
  it.each([
    ['not selected', { selected: false }],
    ['selected in a field that cannot be edited', { editable: false }],
  ])('are not shown when the block is %s', (_kind, props) => {
    setup(props);
    expect(description()).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Remove from the text' }),
    ).toBeNull();
    // The file itself is still drawn.
    expect(screen.getByTestId('preview')).toBeInTheDocument();
  });

  it('are shown when the block is selected and can be edited', () => {
    setup();
    expect(description()).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove from the text' }),
    ).toBeInTheDocument();
  });

  it('are marked as controls, so keys and clicks in them are not the text’s', () => {
    setup();
    expect(
      description()?.closest('[data-asset-block-controls]'),
    ).not.toBeNull();
  });

  describe('for an image', () => {
    it('offers a description and a size, and no playback', () => {
      setup({ kind: 'image' });
      expect(description()).toHaveAccessibleName('Description');
      expect(sizeButton('Full size')).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).toBeNull();
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
        screen.getByRole('checkbox', { name: 'Start playing automatically' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('checkbox', { name: 'Repeat when it ends' }),
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
        screen.getByRole('checkbox', { name: 'Start playing automatically' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Full size' })).toBeNull();
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
        screen.getByRole('checkbox', { name: 'Start playing automatically' }),
      );
      expect(update).toHaveBeenLastCalledWith({ autoplay: false });
      await user.click(
        screen.getByRole('checkbox', { name: 'Repeat when it ends' }),
      );
      expect(update).toHaveBeenLastCalledWith({ loop: false });
    });

    it('shows the current playback settings', () => {
      setup({
        kind: 'audio',
        attributes: attributes({ autoplay: false, loop: true }),
      });
      expect(
        screen.getByRole('checkbox', { name: 'Start playing automatically' }),
      ).not.toBeChecked();
      expect(
        screen.getByRole('checkbox', { name: 'Repeat when it ends' }),
      ).toBeChecked();
    });

    it('removes the block', async () => {
      const { user, remove, update } = setup();
      await user.click(
        screen.getByRole('button', { name: 'Remove from the text' }),
      );
      expect(remove).toHaveBeenCalledTimes(1);
      expect(update).not.toHaveBeenCalled();
    });

    it('changes the file to the one chosen, of the same kind', async () => {
      const pick = vi.fn(() => Promise.resolve('a2'));
      const { user, update } = setup({ kind: 'video', pick });
      await user.click(
        screen.getByRole('button', { name: 'Change the video' }),
      );
      expect(pick).toHaveBeenCalledExactlyOnceWith('video');
      await waitFor(() => {
        expect(update).toHaveBeenCalledWith({ assetId: 'a2' });
      });
    });

    it('leaves the file alone when none is chosen', async () => {
      const pick = vi.fn(() => Promise.resolve(undefined));
      const { user, update } = setup({ pick });
      await user.click(
        screen.getByRole('button', { name: 'Change the image' }),
      );
      await waitFor(() => {
        expect(pick).toHaveBeenCalled();
      });
      await act(() => Promise.resolve());
      expect(update).not.toHaveBeenCalled();
    });

    it('offers no change without a way to choose', () => {
      setup();
      expect(
        screen.queryByRole('button', { name: 'Change the image' }),
      ).toBeNull();
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
    expect(
      screen.getByRole('button', { name: 'Remove from the text' }),
    ).toBeInTheDocument();
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
