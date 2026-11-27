import { act, fireEvent, render, screen } from '@testing-library/react';
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

const SETTINGS_NAMES = {
  image: 'Image settings',
  audio: 'Audio settings',
  video: 'Video settings',
} as const;

const settingsButton = (kind: RichTextAssetBlockKind = 'image') =>
  screen.queryByRole('button', { name: SETTINGS_NAMES[kind] });

const setup = ({
  kind = 'image',
  known,
  textDirection,
  withFileField = false,
  openSettings = true,
  ...props
}: {
  kind?: RichTextAssetBlockKind;
  /** Whether to open the settings from their button, where it is shown. */
  openSettings?: boolean;
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
  const selectKeepingFocus =
    vi.fn<RichTextAssetBlockViewProps['selectKeepingFocus']>();
  const user = userEvent.setup();
  const viewProps: ComponentProps<typeof View> = {
    attributes: attributes(),
    selected: true,
    hovered: false,
    editable: true,
    active: true,
    update,
    remove,
    returnToText,
    selectKeepingFocus,
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
  const button =
    found === undefined
      ? screen.queryByRole('button', { name: 'Block settings' })
      : settingsButton(found.kind);
  if (openSettings && button !== null) {
    act(() => {
      fireEvent.click(button);
    });
  }
  return {
    user,
    update,
    remove,
    returnToText,
    selectKeepingFocus,
    /** Draws the view again, with `changes` to what it was given. */
    redraw: (changes: Partial<RichTextAssetBlockViewProps>) =>
      rerender(drawn({ ...viewProps, ...changes })),
  };
};

const description = () => screen.queryByRole('textbox');
// Named for what it deletes ("Delete image"), or "Delete" for a file that
// the page cannot show.
const deleteButton = () =>
  screen.queryByRole('button', { name: /^Delete( image| audio| video)?$/ });
const fileField = (name: string) => screen.queryByRole('group', { name });

describe('the settings button of a block', () => {
  it.each([
    ['not selected', { selected: false }],
    ['selected in a field that cannot be edited', { editable: false }],
    ['selected in a field focus has left', { active: false }],
  ])('is not shown when the block is %s', (_kind, props) => {
    setup({ ...props, openSettings: false });
    expect(settingsButton()).toBeNull();
    // The file itself is still drawn.
    expect(screen.getByTestId('preview')).toBeInTheDocument();
  });

  it('is shown while the pointer is over the block, selected or not', () => {
    setup({
      selected: false,
      active: false,
      hovered: true,
      openSettings: false,
    });
    expect(settingsButton()).toBeInTheDocument();
  });

  it('is not shown over a block in a field that cannot be edited', () => {
    setup({ editable: false, hovered: true, openSettings: false });
    expect(settingsButton()).toBeNull();
  });

  it('is the action of the block’s tab, which Enter on the selected block presses', () => {
    setup({ openSettings: false });
    const button = settingsButton();
    expect(button).toHaveAttribute('data-block-action');
    expect(button?.closest('[data-block-tab]')).not.toBeNull();
  });
});

describe('the settings of a block', () => {
  it('are not open until their button is pressed, however the block is selected', () => {
    setup({ openSettings: false });
    expect(description()).toBeNull();
    expect(deleteButton()).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('open from their button, and select the block as they do', () => {
    const { returnToText, selectKeepingFocus } = setup({
      selected: false,
      active: false,
      hovered: true,
      openSettings: false,
    });
    act(() => {
      fireEvent.click(settingsButton() as HTMLElement);
    });
    expect(description()).toBeInTheDocument();
    expect(deleteButton()).toBeInTheDocument();
    expect(settingsButton()).toHaveAttribute('aria-expanded', 'true');
    // Selected, with focus left for the settings to take: not put back in
    // the text, which would take it from them.
    expect(selectKeepingFocus).toHaveBeenCalledTimes(1);
    expect(returnToText).not.toHaveBeenCalled();
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

  it('close as the block stops being selected', () => {
    const { redraw } = setup();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    redraw({ selected: false, active: false, hovered: true });
    expect(screen.queryByRole('dialog')).toBeNull();
    // Selected again, they stay closed until their button is pressed.
    redraw({ selected: true, active: true });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  describe('for an image', () => {
    it('offers a description, and no size, alignment or playback', () => {
      setup({ kind: 'image', attributes: attributes({ size: 'small' }) });
      expect(description()).toHaveAccessibleName('Description');
      // Shown, as a form's fields are, and not only read out (the popup
      // fades in, which jsdom never finishes: the story looks at it drawn).
      expect(screen.getByText(IMAGE_DESCRIPTION_HINT)).not.toHaveClass(
        'sr-only',
      );
      expect(description()).toHaveAccessibleDescription(IMAGE_DESCRIPTION_HINT);
      // Its size is set by dragging its corner; where it sits is not
      // something Markdown can say.
      expect(screen.queryByRole('group', { name: 'Display size' })).toBeNull();
      expect(screen.queryByRole('group', { name: 'Alignment' })).toBeNull();
      expect(screen.queryByRole('switch')).toBeNull();
    });
  });

  describe('for a video', () => {
    it('offers both playback settings, and no size or alignment', () => {
      setup({ kind: 'video' });
      expect(
        screen.getByRole('switch', { name: 'Start playing automatically' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('switch', { name: 'Repeat when it ends' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Display size' })).toBeNull();
      expect(screen.queryByRole('group', { name: 'Alignment' })).toBeNull();
    });
  });

  describe('for audio', () => {
    it('offers both playback settings, and no size or alignment', () => {
      setup({ kind: 'audio' });
      expect(
        screen.getByRole('switch', { name: 'Start playing automatically' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Display size' })).toBeNull();
      expect(screen.queryByRole('group', { name: 'Alignment' })).toBeNull();
    });
  });

  describe('changing them', () => {
    it('updates the description as it is typed', async () => {
      const { user, update } = setup();
      await user.type(screen.getByRole('textbox'), 'A');
      expect(update).toHaveBeenLastCalledWith({ description: 'A' });
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
      await user.click(screen.getByRole('button', { name: 'Delete image' }));
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
      // The block stops being selected as the settings are hidden for the
      // browser, before the browser takes focus: the browser is the
      // settings', and stays.
      redraw({ selected: false, active: false });
      expect(fileField('Image')).toBeInTheDocument();
      // Closed, with the block no longer selected, it takes the settings
      // with it.
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

    it('close on Escape from a control, and give focus back to their button', async () => {
      const { user } = setup();
      await user.click(screen.getByRole('textbox'));
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(settingsButton()).toHaveFocus();
    });

    it('stay open on another key', async () => {
      const { user } = setup();
      await user.click(screen.getByRole('textbox'));
      await user.keyboard('x{Enter}');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
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
    expect(deleteButton()).toHaveAccessibleName('Delete');
    expect(
      screen.getByRole('dialog', { name: 'Block settings' }),
    ).toContainElement(deleteButton());
    expect(
      screen
        .getAllByRole('button')
        .map(
          (button) => button.getAttribute('aria-label') ?? button.textContent,
        ),
    ).toEqual(['Block settings', 'Delete']);
  });
});

describe('the description', () => {
  it('is typed in the direction of the text, whatever the interface’s', () => {
    setup({ textDirection: 'rtl' });
    expect(description()).toHaveAttribute('dir', 'rtl');
  });
});
