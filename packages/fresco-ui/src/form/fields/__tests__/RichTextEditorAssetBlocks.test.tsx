import { render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';

import { assetBlockAttributes } from '../../../testing/assetBlock';
import { withMod } from '../../../testing/modKey';
import {
  assetBlockControlsAt,
  assetBlockControlsProps,
  type RichTextAssetBlockViewProps,
} from '../richText/assetBlockNode';
import { block, doc, paragraph, renderField } from './richTextEditorField';

const attributesShown = (): Record<string, unknown> =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the stub view writes JSON.stringify of its attributes object
  JSON.parse(screen.getByTestId('attributes').textContent ?? '{}') as Record<
    string,
    unknown
  >;

const toolbar = () => within(screen.getByRole('toolbar'));

describe('a single-line field', () => {
  it('draws no block for a block its value holds', async () => {
    const field = renderField({
      singleLine: true,
      value: doc(
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Line' }],
        },
        block({ assetId: 'a1' }),
      ),
      pick: vi.fn(() => Promise.resolve('a1')),
    });
    await field.editor();

    expect(screen.queryByTestId('view')).toBeNull();
  });
});

describe('inserting a block', () => {
  it('puts a block with default attributes at the caret, after the text typed before it', async () => {
    const pick = vi.fn(() => Promise.resolve('a1'));
    const field = renderField({ pick, value: doc(paragraph('Hello')) });
    const editor = await field.editor();

    await field.user.click(editor);
    await field.user.keyboard('!');
    await field.user.click(
      toolbar().getByRole('button', { name: 'Insert image' }),
    );

    expect(pick).toHaveBeenCalledExactlyOnceWith('image');
    await waitFor(() => {
      expect(screen.getByTestId('view')).toBeInTheDocument();
    });
    expect(attributesShown()).toEqual(assetBlockAttributes());
    const emitted = field.lastDocument();
    // The caret was after the "!" typed at the start of the line: the block
    // splits the paragraph there, and the rest of the text follows it.
    expect(emitted?.content?.[0]).toEqual(paragraph('!'));
    expect(emitted?.content?.[1]).toMatchObject({
      type: 'assetBlock',
      attrs: { assetId: 'a1' },
    });
    expect(emitted?.content?.[2]).toEqual(paragraph('Hello'));
    // And it is the block that is selected, with the keyboard in the field:
    // that is when a view shows what changes it.
    await waitFor(() => {
      expect(screen.getByTestId('view')).toHaveAttribute(
        'data-selected',
        'true',
      );
    });
    expect(screen.getByTestId('view')).toHaveAttribute('data-active', 'true');
  });

  it.each(['image', 'audio', 'video'] as const)(
    'asks the picker for %s from its own button',
    async (kind) => {
      const pick = vi.fn(() => Promise.resolve(undefined));
      const field = renderField({ pick });
      await field.editor();

      await field.user.click(
        toolbar().getByRole('button', { name: `Insert ${kind}` }),
      );

      expect(pick).toHaveBeenCalledExactlyOnceWith(kind);
    },
  );

  it('leaves a paragraph to type in after a block that would end the document', async () => {
    const field = renderField({
      pick: () => Promise.resolve('a1'),
      value: doc({ type: 'paragraph' }),
    });
    const editor = await field.editor();

    await field.user.click(editor);
    await field.user.click(
      toolbar().getByRole('button', { name: 'Insert image' }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('view')).toBeInTheDocument();
    });
    const types = field.lastDocument()?.content?.map(({ type }) => type);
    expect(types).toEqual(['assetBlock', 'paragraph']);
    expect(field.lastDocument()?.content?.at(-1)).toEqual({
      type: 'paragraph',
    });
    // The block is selected there too, and not the paragraph that came with it.
    await waitFor(() => {
      expect(screen.getByTestId('view')).toHaveAttribute(
        'data-selected',
        'true',
      );
    });
  });

  it('inserts nothing when the picker chooses nothing', async () => {
    const pick = vi.fn(() => Promise.resolve(undefined));
    const field = renderField({ pick });
    const editor = await field.editor();

    await field.user.click(editor);
    await field.user.click(
      toolbar().getByRole('button', { name: 'Insert image' }),
    );

    await waitFor(() => {
      expect(pick).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('view')).toBeNull();
    expect(field.onChange).not.toHaveBeenCalled();
  });
});

describe('a block the value holds', () => {
  it('is drawn by the consumer’s view with its attributes normalised', async () => {
    const field = renderField({
      value: doc(
        paragraph('Before'),
        block({
          assetId: 'a1',
          description: 'A map',
          size: 'enormous',
          align: 'sideways',
          autoplay: false,
        }),
        paragraph('After'),
      ),
    });
    await field.editor();

    expect(attributesShown()).toEqual(
      assetBlockAttributes({ description: 'A map', autoplay: false }),
    );
    expect(screen.getByTestId('view')).toHaveAttribute('data-editable', 'true');
  });

  it('keeps a valid size and alignment', async () => {
    const field = renderField({
      value: doc(
        block({ assetId: 'a1', size: 'small', align: 'end', loop: false }),
        paragraph('After'),
      ),
    });
    await field.editor();

    expect(attributesShown()).toMatchObject({
      size: 'small',
      align: 'end',
      loop: false,
    });
  });

  it('changes its attributes when the view updates them, and says so', async () => {
    const field = renderField({
      value: doc(block({ assetId: 'a1' }), paragraph('After')),
    });
    await field.editor();

    await field.user.click(screen.getByRole('button', { name: 'Make large' }));

    await waitFor(() => {
      expect(attributesShown().size).toBe('large');
    });
    expect(field.lastDocument()?.content?.[0]).toMatchObject({
      type: 'assetBlock',
      attrs: { assetId: 'a1', size: 'large' },
    });
  });

  // A view may draw a player, which reads its file when it is made: given
  // another file, the view is made again rather than handed the new one.
  it('makes its view again when the file changes, and keeps it when a setting does', async () => {
    let made = 0;
    function CountedView({ attributes, update }: RichTextAssetBlockViewProps) {
      const [number] = useState(() => {
        made += 1;
        return made;
      });
      return (
        <div data-testid="counted" data-made={number}>
          {attributes.assetId}
          <div {...assetBlockControlsProps}>
            <button type="button" onClick={() => update({ size: 'small' })}>
              Make small
            </button>
            <button type="button" onClick={() => update({ assetId: 'a2' })}>
              Change file
            </button>
          </div>
        </div>
      );
    }
    const field = renderField({
      assetBlocks: { View: CountedView },
      value: doc(block({ assetId: 'a1' }), paragraph('After')),
    });
    await field.editor();
    const first = screen.getByTestId('counted').getAttribute('data-made');

    await field.user.click(screen.getByRole('button', { name: 'Make small' }));
    await waitFor(() => {
      expect(field.lastDocument()?.content?.[0]).toMatchObject({
        attrs: { size: 'small' },
      });
    });
    expect(screen.getByTestId('counted')).toHaveAttribute('data-made', first);

    await field.user.click(screen.getByRole('button', { name: 'Change file' }));
    await waitFor(() => {
      expect(screen.getByTestId('counted')).toHaveTextContent('a2');
    });
    expect(screen.getByTestId('counted')).not.toHaveAttribute(
      'data-made',
      first,
    );
  });

  it('is deleted when the view removes it, leaving the text', async () => {
    const field = renderField({
      value: doc(
        paragraph('Before'),
        block({ assetId: 'a1' }),
        paragraph('After'),
      ),
    });
    await field.editor();

    await field.user.click(
      screen.getByRole('button', { name: 'Remove block' }),
    );

    await waitFor(() => {
      expect(screen.queryByTestId('view')).toBeNull();
    });
    expect(field.lastDocument()?.content).toEqual([
      paragraph('Before'),
      paragraph('After'),
    ]);
  });

  it('returns focus to the text when the view removes it from a control', async () => {
    const field = renderField({
      value: doc(
        paragraph('Before'),
        block({ assetId: 'a1' }),
        paragraph('After'),
      ),
    });
    const editor = await field.editor();

    const remove = screen.getByRole('button', { name: 'Remove block' });
    await field.user.click(remove);
    await waitFor(() => {
      expect(screen.queryByTestId('view')).toBeNull();
    });

    expect(editor).toHaveFocus();
  });
});

describe('typing where a block is', () => {
  it('opens with the caret in the last text, not on a block that ends it', async () => {
    const field = renderField({
      autoFocus: true,
      value: doc(paragraph('Before'), block({ assetId: 'a1' })),
    });
    const editor = await field.editor();
    await waitFor(() => {
      expect(editor).toHaveFocus();
    });
    expect(screen.getByTestId('view')).toHaveAttribute(
      'data-selected',
      'false',
    );

    await field.user.keyboard('!');

    await waitFor(() => {
      expect(field.lastDocument()?.content?.[0]).toEqual(paragraph('Before!'));
    });
    expect(field.lastDocument()?.content?.[1]).toMatchObject({
      type: 'assetBlock',
      attrs: { assetId: 'a1' },
    });
  });

  it('starts a paragraph below a selected block rather than typing over it', async () => {
    // Nothing but a block, so the field can only open with it selected.
    const field = renderField({
      autoFocus: true,
      value: doc(block({ assetId: 'a1' })),
    });
    const editor = await field.editor();
    await waitFor(() => {
      expect(editor).toHaveFocus();
    });
    await waitFor(() => {
      expect(screen.getByTestId('view')).toHaveAttribute(
        'data-selected',
        'true',
      );
    });

    await field.user.keyboard('Hi');

    await waitFor(() => {
      expect(field.lastDocument()?.content?.[1]).toEqual(paragraph('Hi'));
    });
    expect(field.lastDocument()?.content).toHaveLength(2);
    expect(field.lastDocument()?.content?.[0]).toMatchObject({
      type: 'assetBlock',
      attrs: { assetId: 'a1' },
    });
  });
});

describe('a block in a selection of text', () => {
  // The element the field draws around the consumer's view.
  const blockElement = () =>
    screen.getByTestId('view').closest('[data-asset-block]');

  it('is marked as selected text when a selection runs across it', async () => {
    const field = renderField({
      value: doc(
        paragraph('Before'),
        block({ assetId: 'a1' }),
        paragraph('After'),
      ),
    });
    const editor = await field.editor();
    await field.user.click(within(editor).getByText('After'));
    expect(blockElement()).not.toHaveAttribute('data-in-selected-text');

    await field.user.keyboard(withMod('a'));
    await waitFor(() => {
      expect(blockElement()).toHaveAttribute('data-in-selected-text');
    });
    // The block is part of a selection, not the selection itself.
    expect(screen.getByTestId('view')).toHaveAttribute(
      'data-selected',
      'false',
    );
  });

  it('is not marked once focus leaves the field', async () => {
    const field = renderField({
      value: doc(
        paragraph('Before'),
        block({ assetId: 'a1' }),
        paragraph('After'),
      ),
    });
    const editor = await field.editor();
    render(<button type="button">Elsewhere</button>);
    await field.user.click(within(editor).getByText('After'));
    await field.user.keyboard(withMod('a'));
    await waitFor(() => {
      expect(blockElement()).toHaveAttribute('data-in-selected-text');
    });

    await field.user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    await waitFor(() => {
      expect(blockElement()).not.toHaveAttribute('data-in-selected-text');
    });
  });

  it('is outlined, not marked, when it is the selection by itself', async () => {
    // Nothing but a block, so the field can only open with it selected.
    const field = renderField({
      autoFocus: true,
      value: doc(block({ assetId: 'a1' })),
    });
    await field.editor();
    await waitFor(() => {
      expect(screen.getByTestId('view')).toHaveAttribute(
        'data-selected',
        'true',
      );
    });
    expect(blockElement()).toHaveAttribute('data-selected');
    expect(blockElement()).not.toHaveAttribute('data-in-selected-text');
  });
});

describe('where focus is', () => {
  it('is told to the view: in the field, or out of it', async () => {
    const field = renderField({
      value: doc(block({ assetId: 'a1' }), paragraph('After')),
    });
    const editor = await field.editor();
    render(<button type="button">Elsewhere</button>);
    expect(screen.getByTestId('view')).toHaveAttribute('data-active', 'false');

    await field.user.click(within(editor).getByText('After'));
    await waitFor(() => {
      expect(screen.getByTestId('view')).toHaveAttribute('data-active', 'true');
    });

    // In one of the view's own controls it is still in the field.
    await field.user.click(screen.getByRole('button', { name: 'Make large' }));
    await waitFor(() => {
      expect(attributesShown().size).toBe('large');
    });
    expect(screen.getByTestId('view')).toHaveAttribute('data-active', 'true');

    await field.user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    await waitFor(() => {
      expect(screen.getByTestId('view')).toHaveAttribute(
        'data-active',
        'false',
      );
    });
  });
});

/** A view whose controls are not in the block but over the page. */
function ViewWithControlsElsewhere({
  selected,
  active,
  returnToText,
}: RichTextAssetBlockViewProps) {
  return (
    <div data-testid="view" {...assetBlockControlsAt('controls-of-a1')}>
      {selected &&
        active &&
        createPortal(
          <div id="controls-of-a1">
            <span tabIndex={-1}>Not a control</span>
            <input aria-label="Description" />
            <button type="button" onClick={returnToText}>
              Back to the text
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

describe('controls a view draws over the page', () => {
  // Nothing but a block, so the field can only open with it selected: the
  // arrow keys are not something jsdom moves a caret with.
  const openOnBlock = async () => {
    const field = renderField({
      autoFocus: true,
      assetBlocks: { View: ViewWithControlsElsewhere },
      value: doc(block({ assetId: 'a1' })),
    });
    const editor = await field.editor();
    await waitFor(() => {
      expect(editor).toHaveFocus();
    });
    await screen.findByRole('textbox', { name: 'Description' });
    return { field, editor };
  };

  it('are reached with Enter on the selected block, at the first of them', async () => {
    const { field } = await openOnBlock();

    await field.user.keyboard('{Enter}');

    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveFocus();
    // Enter went to the controls: it started no paragraph.
    expect(field.onChange).not.toHaveBeenCalled();
  });

  it('stay while focus is in them, and hand it back to the block', async () => {
    const { field, editor } = await openOnBlock();
    await field.user.keyboard('{Enter}');
    await field.user.keyboard('A harbour');
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(
      'A harbour',
    );

    await field.user.click(
      screen.getByRole('button', { name: 'Back to the text' }),
    );

    await waitFor(() => {
      expect(editor).toHaveFocus();
    });
    // The block is still the selection, so its controls are still there.
    expect(
      screen.getByRole('textbox', { name: 'Description' }),
    ).toBeInTheDocument();
    expect(field.onChange).not.toHaveBeenCalled();
  });
});

describe('a field that cannot be edited', () => {
  it.each([
    ['disabled', { disabled: true }],
    ['read-only', { readOnly: true }],
  ] as const)('disables the insert buttons when %s', async (_kind, props) => {
    const field = renderField({
      ...props,
      pick: vi.fn(() => Promise.resolve('a1')),
    });
    await field.editor();

    for (const name of ['Insert image', 'Insert audio', 'Insert video']) {
      expect(toolbar().getByRole('button', { name })).toBeDisabled();
    }
  });

  it('tells the view it cannot edit', async () => {
    const field = renderField({
      readOnly: true,
      value: doc(block({ assetId: 'a1' }), paragraph('After')),
    });
    await field.editor();

    expect(screen.getByTestId('view')).toHaveAttribute(
      'data-editable',
      'false',
    );
  });

  // The view is the consumer's and may be showing a control at the moment
  // the field stops being editable: a form disables its fields as it submits.
  it.each([
    ['disabled', { disabled: true }],
    ['read-only', { readOnly: true }],
  ] as const)(
    'tells a view already drawn when the field becomes %s, and changes nothing for it',
    async (_kind, props) => {
      const value = doc(block({ assetId: 'a1' }), paragraph('After'));
      const field = renderField({ value });
      await field.editor();
      expect(screen.getByTestId('view')).toHaveAttribute(
        'data-editable',
        'true',
      );

      field.change(props);

      await waitFor(() => {
        expect(screen.getByTestId('view')).toHaveAttribute(
          'data-editable',
          'false',
        );
      });
      await field.user.click(
        screen.getByRole('button', { name: 'Make large' }),
      );
      await field.user.click(
        screen.getByRole('button', { name: 'Remove block' }),
      );

      expect(attributesShown()).toMatchObject({ assetId: 'a1', size: null });
      expect(field.onChange).not.toHaveBeenCalled();

      // And it can be changed again once the field can.
      field.change({ disabled: false, readOnly: false });
      await waitFor(() => {
        expect(screen.getByTestId('view')).toHaveAttribute(
          'data-editable',
          'true',
        );
      });
      await field.user.click(
        screen.getByRole('button', { name: 'Make large' }),
      );
      await waitFor(() => {
        expect(attributesShown().size).toBe('large');
      });
    },
  );
});
