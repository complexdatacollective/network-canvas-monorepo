import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import { saveBlob } from '~/files/save';
import type { BackgroundDocument } from '~/model/types';
import { useEditorStore } from '~/state/editorStore';

import { downloadSvgFlow, editDocumentDetailsFlow } from '../fileActions';

vi.mock('~/files/save', async (importOriginal) => {
  const original = await importOriginal<typeof import('~/files/save')>();
  return { ...original, saveBlob: vi.fn() };
});

const saveBlobMock = vi.mocked(saveBlob);

const initialDocument: BackgroundDocument = {
  version: 1,
  title: 'Untitled background',
  description: 'A responsive Network Canvas background.',
  elements: [],
};

beforeEach(() => {
  saveBlobMock.mockReset();
  saveBlobMock.mockResolvedValue({ saved: true });
  useEditorStore.setState({
    doc: initialDocument,
    savedDocument: initialDocument,
    past: [],
    future: [],
    selection: null,
    gestureSnapshot: null,
  });
});

describe('downloadSvgFlow', () => {
  it('marks the exported document as saved after a successful download', async () => {
    useEditorStore
      .getState()
      .commitDoc({ ...initialDocument, title: 'My field map' });
    expect(useEditorStore.getState().isDirty()).toBe(true);

    await downloadSvgFlow();

    expect(saveBlobMock).toHaveBeenCalledWith(
      expect.any(Blob),
      'my-field-map.svg',
      expect.objectContaining({ mimeType: 'image/svg+xml' }),
    );
    expect(useEditorStore.getState().isDirty()).toBe(false);
  });

  it('keeps the document dirty when the save flow is cancelled', async () => {
    saveBlobMock.mockResolvedValue({ saved: false });
    useEditorStore
      .getState()
      .commitDoc({ ...initialDocument, title: 'My field map' });

    await downloadSvgFlow();

    expect(useEditorStore.getState().isDirty()).toBe(true);
  });

  it('keeps unsanitized editor content dirty after exporting its sanitized snapshot', async () => {
    const unsanitized = {
      ...initialDocument,
      title: 'Field\u000bmap',
      description: 'Visible\fdescription',
    };
    useEditorStore.getState().commitDoc(unsanitized);

    await downloadSvgFlow();

    const state = useEditorStore.getState();
    expect(state.doc).toBe(unsanitized);
    expect(state.savedDocument).toMatchObject({
      title: 'Fieldmap',
      description: 'Visibledescription',
    });
    expect(state.isDirty()).toBe(true);
  });
});

describe('editDocumentDetailsFlow', () => {
  it('saves a trimmed title and description through document history', async () => {
    const openDialogMock = vi.fn().mockResolvedValue({
      title: '  My field map  ',
      description: '  Used for the follow-up interview.  ',
    });
    const openDialog =
      openDialogMock as unknown as DialogContextType['openDialog'];

    await editDocumentDetailsFlow({ openDialog });

    expect(openDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'form',
        title: 'Document details',
        submitLabel: 'Save',
      }),
    );
    expect(useEditorStore.getState().doc).toMatchObject({
      title: 'My field map',
      description: 'Used for the follow-up interview.',
    });
    expect(useEditorStore.getState().past).toHaveLength(1);
    expect(useEditorStore.getState().isDirty()).toBe(true);
  });

  it('leaves the document unchanged when the dialog is cancelled', async () => {
    const openDialogMock = vi.fn().mockResolvedValue(null);
    const openDialog =
      openDialogMock as unknown as DialogContextType['openDialog'];

    await editDocumentDetailsFlow({ openDialog });

    expect(useEditorStore.getState().doc).toBe(initialDocument);
    expect(useEditorStore.getState().past).toHaveLength(0);
  });

  it('does not add history when submitted details are unchanged', async () => {
    const openDialogMock = vi.fn().mockResolvedValue({
      title: initialDocument.title,
      description: initialDocument.description,
    });
    const openDialog =
      openDialogMock as unknown as DialogContextType['openDialog'];

    await editDocumentDetailsFlow({ openDialog });

    expect(useEditorStore.getState().past).toHaveLength(0);
  });
});
