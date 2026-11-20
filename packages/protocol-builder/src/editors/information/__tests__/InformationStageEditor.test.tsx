import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { selectIsFormDirty } from '@codaco/fresco-ui/form/store/formStoreProvider';
import { withMod } from '@codaco/fresco-ui/testing/modKey';

import PageContentSection from '../../../sections/page-content/PageContentSection.tsx';
import { fixtureStageIds } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import {
  expectStageUntouched,
  mountedAs,
  stageNameInput,
} from '../../__tests__/formEditorHarness.tsx';
import { informationStageEditor } from '../InformationStageEditor.ts';

/**
 * The page's editor is the real rich-text editor, driven through the
 * harness's `user`, which types into ProseMirror the way jsdom allows.
 */

/** Copy in the fixture protocol's only language, as schema 9 holds it. */
const en = (text: string) => ({ 'en-US': text });

const MAP = {
  'map-1': { name: 'Harbour map', type: 'image', source: 'harbour.png' },
};

/** A page with a heading, a passage of text, and a picture between them. */
const PAGE = [
  '# Welcome',
  '',
  'Thank you for taking part.',
  '',
  '![The harbour](asset:map-1?size=medium&align=end)',
  '',
  'Please read on.',
].join('\n');

const openPage = (content = PAGE) => ({
  stage: {
    type: 'Information' as const,
    fields: { label: en('Welcome page'), content: en(content) },
  },
  assets: MAP,
  editor: mountedAs(informationStageEditor.Information),
});

const openFixture = () => ({
  stageId: 'information-1' as const,
  editor: mountedAs(informationStageEditor.Information),
});

/** Where a host would insert a new page: over the one the fixture holds. */
const INFORMATION_INDEX = fixtureStageIds().indexOf('information-1');

const createFixture = () => ({
  create: { type: 'Information' as const, position: INFORMATION_INDEX },
  assets: MAP,
  editor: mountedAs(informationStageEditor.Information),
});

const pageEditor = () => screen.findByRole('textbox', { name: 'Rich Text' });

function DirtyFlag() {
  const dirty = useFormStore(selectIsFormDirty);
  return <p data-testid="form-dirty">{dirty ? 'dirty' : 'clean'}</p>;
}

/**
 * What is true of THIS interface and no other. The list of sections it
 * composes, and the round trip over its fixture stage, are asked of all four
 * form editors together in `editors/__tests__/formEditors.test.tsx`.
 */
describe('the editor for a page of content', () => {
  it('opens on the stage the protocol holds', async () => {
    renderStageEditor(openFixture());

    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
      'Information',
    );
    const editor = await pageEditor();
    expect(editor).toHaveTextContent('Welcome');
    expect(editor).toHaveTextContent('Welcome to this interview.');
  });

  it('opens a page holding a heading, text and a block with all three in the editor', async () => {
    renderStageEditor(openPage());

    const editor = await pageEditor();
    expect(
      within(editor).getByRole('heading', { name: 'Welcome' }),
    ).toBeInTheDocument();
    expect(editor).toHaveTextContent('Thank you for taking part.');
    expect(editor).toHaveTextContent('Please read on.');
    // The block is one thing among the paragraphs, in the order written.
    const blocks = editor.querySelectorAll('[data-asset-block]');
    expect(blocks).toHaveLength(1);
    const picture = within(blocks[0] as HTMLElement).getByRole('img', {
      name: 'The harbour',
    });
    // The settings in the text are what the picture is drawn with.
    expect(picture).toHaveClass('max-h-96', 'object-right');
    expect([...editor.children].map((child) => child.tagName)).toEqual([
      'H1',
      'P',
      'DIV',
      'P',
    ]);
  });

  it('saves the identical content when nothing was edited', async () => {
    const harness = renderStageEditor(openPage());
    await pageEditor();

    const saved = await harness.submit();

    expect(saved?.stageDocument.content).toEqual(en(PAGE));
  });

  it('is not dirty when it opens on a page holding blocks', async () => {
    renderStageEditor({
      ...openPage(),
      editor: undefined,
      sections: (
        <>
          <PageContentSection />
          <DirtyFlag />
        </>
      ),
    });
    await pageEditor();

    // The editor reads the markdown into a document and the document back;
    // were that not the identity, a page nobody touched would ask to be saved.
    await waitFor(() =>
      expect(screen.getByTestId('form-dirty')).toHaveTextContent('clean'),
    );
  });

  it('round-trips the page it opens, key for key', async () => {
    const harness = renderStageEditor(openPage());
    await pageEditor();

    await harness.roundTrip();
  });

  it('opens a new stage on the interface template', async () => {
    renderStageEditor(createFixture());

    // An Information stage has no authored defaults, so a new one arrives
    // empty. The exception is the name, which the open edit proposes because
    // it is creating the stage.
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));
    expect(stageNameInput().value).toMatch(/^Information/);
    expect((await pageEditor()).textContent).toBe('');
  });

  it('saves the text typed as markdown, beside the block it was typed next to', async () => {
    const harness = renderStageEditor(
      openPage('Thank you.\n\n![The harbour](asset:map-1?size=small)'),
    );
    const editor = await pageEditor();

    await harness.user.type(editor, 'Hello. ');

    const saved = await harness.submit();
    expect(saved?.stageDocument.content).toEqual(
      en('Hello. Thank you.\n\n![The harbour](asset:map-1?size=small)'),
    );
  });

  it('saves a new stage once the researcher has written it', async () => {
    const harness = renderStageEditor(createFixture());
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));

    await harness.user.clear(stageNameInput());
    await harness.user.type(stageNameInput(), 'Welcome screen');
    await harness.user.type(await pageEditor(), 'Thank you for taking part.');

    const request = await harness.submit();
    expect(request?.stageDocument.label).toEqual(en('Welcome screen'));
    expect(request?.stageDocument.content).toEqual(
      en('Thank you for taking part.'),
    );
    // The stage of the new schema holds no heading and list of items.
    expect(request?.stageDocument).not.toHaveProperty('title');
    expect(request?.stageDocument).not.toHaveProperty('items');
  });

  it('puts a chosen image into the page as a block, and saves it', async () => {
    const harness = renderStageEditor(createFixture());
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));
    const editor = await pageEditor();
    await harness.user.click(editor);

    await harness.user.click(
      screen.getByRole('button', { name: 'Insert image' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Harbour map' }),
    );

    await waitFor(() =>
      expect(editor.querySelectorAll('[data-asset-block]')).toHaveLength(1),
    );
    const request = await harness.submit();
    expect(request?.stageDocument.content).toEqual(en('![](asset:map-1)'));
  });

  it('refuses an empty page, and says which section is at fault', async () => {
    const harness = renderStageEditor(openFixture());
    const editor = await pageEditor();

    await harness.user.click(editor);
    await harness.user.keyboard(`${withMod('a')}{Backspace}`);

    expect(await harness.submit()).toBeNull();
    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Content')?.state,
      ).toBe('Has a problem'),
    );
  });

  /**
   * The draft lives in the form and nowhere else until a save hands the whole
   * section back, so an editor closed without saving has written nothing at
   * all. Asked of the protocol, because that is the only place it could have
   * reached.
   */
  it('writes nothing when the researcher discards the edit', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.type(await pageEditor(), 'A sentence nobody kept. ');
    expectStageUntouched(harness);

    await harness.cancel();

    expectStageUntouched(harness);
  });
});
