import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

import { CONTENT_SLOT_NAMES, normalizeType } from '../itemTypes';

/**
 * The three asset pickers stand in for the resource browser, which needs the
 * whole Redux protocol store and an asset manifest. Everything under test —
 * which field is registered, what value it holds, what a save commits — runs
 * through the real `ArchitectField`/`Field`/form store either way; the stub
 * only replaces the chrome for choosing a file. The rich text editor is NOT
 * stubbed: whether an asset id can appear in it is the whole question.
 */
type PickerStubProps = {
  value?: FieldValue;
  onChange?: (value: string) => void;
};

// A function DECLARATION: `vi.mock` factories run during the mocked module's
// import, which is before a `const` in this file has left its temporal dead
// zone.
function makePickerStub(kind: string) {
  return function ResourcePickerStub({ value, onChange }: PickerStubProps) {
    return (
      <div>
        <span data-testid={`${kind}-value`}>
          {typeof value === 'string' ? value : ''}
        </span>
        <button type="button" onClick={() => onChange?.(`asset-${kind}-1`)}>
          Choose {kind}
        </button>
        <button type="button" onClick={() => onChange?.(`asset-${kind}-2`)}>
          Choose another {kind}
        </button>
      </div>
    );
  };
}

vi.mock('~/components/Form/Fields/Image', () => ({
  default: makePickerStub('image'),
}));
vi.mock('~/components/Form/Fields/Audio', () => ({
  default: makePickerStub('audio'),
}));
vi.mock('~/components/Form/Fields/Video', () => ({
  default: makePickerStub('video'),
}));

import ItemEditor from '../ItemEditor';

type ItemRow = {
  id: string;
  type: string;
  content?: string;
  size?: string;
};

const TYPE_LABELS = {
  text: 'Text',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
} as const;

type SlotType = keyof typeof TYPE_LABELS;

const renderItemEditor = (item: ItemRow) => {
  const submitted = vi.fn();
  render(
    <Form
      onSubmit={(values) => {
        submitted(values);
        return { success: true };
      }}
    >
      <ItemEditor
        allowSize
        type={item.type}
        content={item.content}
        size={item.size}
      />
      <SubmitButton>Save</SubmitButton>
    </Form>,
  );
  return { submitted };
};

const chooseType = (type: SlotType) => {
  fireEvent.click(screen.getByRole('radio', { name: TYPE_LABELS[type] }));
};

const clickButton = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }));
};

const contentField = () => {
  const field = document.querySelector('[data-field-name^="content"]');
  if (!(field instanceof HTMLElement)) {
    throw new Error('the Content field is not rendered');
  }
  return field;
};

const richTextValue = () =>
  within(contentField()).getByRole('textbox').textContent;

const pickerValue = (kind: Exclude<SlotType, 'text'>) =>
  screen.getByTestId(`${kind}-value`).textContent;

// By role, not by `[aria-live]`: fresco-ui's own field-error regions are also
// polite live regions, and a document-order selector would pick whichever
// happens to come first.
const announcement = () => screen.getByRole('status').textContent ?? '';

describe('ItemEditor content-type switching', () => {
  it('opens a saved text item with its content already in the editor', async () => {
    renderItemEditor({ id: '1', type: 'text', content: 'Saved prose' });

    await waitFor(() => {
      expect(richTextValue()).toBe('Saved prose');
    });
  });

  // The filed defect: the rich text editor was populated with the image
  // asset's uuid, which a second save then wrote out as participant text.
  it('never shows an asset id in the rich text editor when an image item becomes text', async () => {
    renderItemEditor({
      id: '1',
      type: 'image',
      content: 'asset-image-1',
      size: 'MEDIUM',
    });

    await waitFor(() => {
      expect(pickerValue('image')).toBe('asset-image-1');
    });

    chooseType('text');

    await waitFor(() => {
      expect(richTextValue()).toBe('');
    });
    expect(contentField().textContent).not.toContain('asset-image-1');
    // The text control is a field of its OWN, not the shared `content` field
    // the asset id lives in — that separation is what makes the emptiness
    // above structural rather than a matter of clearing in time.
    expect(
      document.querySelector(`[data-field-name="${CONTENT_SLOT_NAMES.text}"]`),
    ).not.toBeNull();
    expect(
      document.querySelector(`[data-field-name="${CONTENT_SLOT_NAMES.image}"]`),
    ).toBeNull();
    expect(document.querySelector('[data-field-name="content"]')).toBeNull();
  });

  it('restores the text an item was opened with after a round trip through Image', async () => {
    renderItemEditor({
      id: '1',
      type: 'text',
      content: 'Saved prose',
    });

    await waitFor(() => {
      expect(richTextValue()).toBe('Saved prose');
    });

    chooseType('image');
    await waitFor(() => {
      expect(pickerValue('image')).toBe('');
    });

    chooseType('text');
    await waitFor(() => {
      expect(richTextValue()).toBe('Saved prose');
    });
  });

  it('restores an unsaved resource choice after a round trip through another type', async () => {
    renderItemEditor({
      id: '1',
      type: 'text',
      content: 'Saved prose',
    });

    chooseType('image');
    clickButton('Choose image');
    await waitFor(() => {
      expect(pickerValue('image')).toBe('asset-image-1');
    });

    chooseType('audio');
    await waitFor(() => {
      expect(pickerValue('audio')).toBe('');
    });

    chooseType('image');
    await waitFor(() => {
      expect(pickerValue('image')).toBe('asset-image-1');
    });
  });

  // Every ordered pair, because the defect was symmetric: whatever the
  // outgoing type held must never appear in the incoming type's control, and
  // an image id is no more a valid audio id than it is prose.
  const allTypes: SlotType[] = ['text', 'image', 'audio', 'video'];
  const pairs = allTypes.flatMap((from) =>
    allTypes.filter((to) => to !== from).map((to) => [from, to] as const),
  );

  it.each(pairs)(
    'shows an empty control with no trace of the %s draft after switching to %s',
    async (from: SlotType, to: SlotType) => {
      renderItemEditor({ id: '1', type: 'text' });

      chooseType(from);
      if (from === 'text') {
        // A text draft can only be entered through the editor, which is not
        // typeable under jsdom; the e2e suite covers typed prose. Every other
        // origin type gets a real, unsaved draft below.
        await waitFor(() => {
          expect(richTextValue()).toBe('');
        });
      } else {
        clickButton(`Choose ${from}`);
        await waitFor(() => {
          expect(pickerValue(from)).toBe(`asset-${from}-1`);
        });
      }

      chooseType(to);

      await waitFor(() => {
        expect(
          document.querySelector(
            `[data-field-name="${CONTENT_SLOT_NAMES[to]}"]`,
          ),
        ).not.toBeNull();
      });
      expect(
        document.querySelector(
          `[data-field-name="${CONTENT_SLOT_NAMES[from]}"]`,
        ),
      ).toBeNull();
      if (to === 'text') {
        expect(richTextValue()).toBe('');
      } else {
        expect(pickerValue(to)).toBe('');
      }
      expect(contentField().textContent).not.toContain(`asset-${from}-1`);
    },
  );

  // `denormalizeType` hands back the schema's ambiguous 'asset' when a
  // reference cannot be resolved in the manifest. There is no input that can
  // mean it, and falling back to the rich text editor is what put an asset id
  // in front of the researcher as prose.
  it('gives an unresolved asset reference no content control, and says why', () => {
    renderItemEditor({ id: '1', type: 'asset', content: 'missing-asset' });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(
      document.querySelector(`[data-field-name="${CONTENT_SLOT_NAMES.text}"]`),
    ).toBeNull();
    expect(document.body.textContent).not.toContain('missing-asset');
    expect(
      screen.getByText(/resource is no longer in this protocol/),
    ).toBeInTheDocument();
  });

  // The same dead end reached from the opposite cause. An item can reference a
  // resource that IS in the manifest and is not a medium a content item can
  // present: `denormalizeType` then hands back that resource's own type
  // ('network', 'geojson', 'apikey'), which names no input either. Such an
  // item is schema-valid — nothing cross-validates a content item's asset
  // reference — so an imported protocol can carry one, and telling this
  // researcher the resource is missing sends them looking through Resources
  // for a deletion that never happened.
  it('does not claim a resource is missing when it is only the wrong kind of file', () => {
    renderItemEditor({ id: '1', type: 'network', content: 'network-asset-1' });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(
      document.querySelector(`[data-field-name="${CONTENT_SLOT_NAMES.text}"]`),
    ).toBeNull();
    expect(document.body.textContent).not.toContain('network-asset-1');
    expect(screen.queryByText(/no longer in this protocol/)).toBeNull();
    expect(
      screen.getByText(/not an image, audio or video file/),
    ).toBeInTheDocument();
  });

  it('shows no missing-resource notice for an item with no content yet', () => {
    renderItemEditor({ id: '1', type: '' });

    expect(document.querySelector('[data-field-name^="content"]')).toBeNull();
    expect(
      screen.queryByText(/resource is no longer in this protocol/),
    ).toBeNull();
  });

  it('commits only the chosen type as content, with no draft keys left over', async () => {
    const committedRow: ItemRow = {
      id: '1',
      type: 'image',
      content: 'asset-image-1',
      size: 'MEDIUM',
    };
    const { submitted } = renderItemEditor(committedRow);

    chooseType('video');
    clickButton('Choose video');
    clickButton('Save');

    await waitFor(() => {
      expect(submitted).toHaveBeenCalled();
    });
    const values = submitted.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(values[CONTENT_SLOT_NAMES.video]).toBe('asset-video-1');
    expect(values[CONTENT_SLOT_NAMES.image]).toBeUndefined();

    // An APPROXIMATION of what DialogArrayField commits — the real path also
    // walks the store's dormant values through lodash `set`/`unset`
    // (`mergeEditedRow`), which only an end-to-end save exercises. The e2e
    // suite's "drops a text draft left behind by a switch to Image" covers
    // that; this asserts the normalize step alone.
    const rowToCommit = normalizeType({ ...committedRow, ...values } as {
      type: string;
    });
    // `size` survives: it is a display treatment both image and video carry,
    // and its control stays mounted showing the value across the switch.
    expect(rowToCommit).toEqual({
      id: '1',
      type: 'asset',
      content: 'asset-video-1',
      size: 'MEDIUM',
    });
  });

  it('announces that the content left behind is being kept, and that it came back', async () => {
    renderItemEditor({ id: '1', type: 'text', content: 'Saved prose' });

    chooseType('image');
    await waitFor(() => {
      expect(announcement()).toBe(
        'Content type changed to Image. The content you entered for the previous type is kept, and returns if you change back to it.',
      );
    });

    chooseType('text');
    await waitFor(() => {
      expect(announcement()).toBe(
        'Content type changed to Text. The content you entered for Text earlier has been restored.',
      );
    });
  });

  // Announcing "your content is kept" when nothing was ever entered promises
  // content that does not exist, and tells a screen-reader user nothing about
  // the question the defect is really about.
  it('does not claim content is kept when none was entered', async () => {
    renderItemEditor({ id: '1', type: '' });

    chooseType('text');
    chooseType('image');

    await waitFor(() => {
      expect(announcement()).toBe(
        'Content type changed to Image. Nothing has been entered for Image yet.',
      );
    });
  });

  it('announces the content field appearing when the first type is chosen', async () => {
    renderItemEditor({ id: '1', type: '' });

    expect(announcement()).toBe('');
    chooseType('text');

    await waitFor(() => {
      expect(announcement()).toBe(
        'Content type set to Text. A content field for it has been added below.',
      );
    });
  });
});
