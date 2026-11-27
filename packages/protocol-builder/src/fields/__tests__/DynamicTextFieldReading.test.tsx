import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { dynamicValueNameFor } from '@codaco/protocol-validation';

import { mountedAs } from '../../editors/__tests__/formEditorHarness.tsx';
import { informationStageEditor } from '../../editors/information/InformationStageEditor.ts';
import type { ProtocolReading } from '../../state/protocolContext.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { testVariableId } from '../../testing/testId.ts';

const reading: { status: 'read' | 'reading' } = { status: 'read' };

// How far the protocol has been read, set by each test: the harness hands the
// editor a protocol that is read at once.
vi.mock('../../state/protocolContext.ts', async (importActual) => {
  const actual =
    await importActual<typeof import('../../state/protocolContext.ts')>();
  return {
    ...actual,
    useProtocolReading: (): ProtocolReading =>
      reading.status === 'read'
        ? actual.useProtocolReading()
        : { status: 'reading' },
  };
});

/** An attribute the codebook does not have, as it lacks one not yet read. */
const ABSENT = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: testVariableId('not-read-yet'),
});

const openPage = () =>
  renderStageEditor({
    stage: {
      type: 'Information',
      fields: {
        label: { 'en-US': 'Welcome' },
        content: {
          'en-US': `Hello {${ABSENT}}`,
        },
      },
    },
    editor: mountedAs(informationStageEditor.Information),
  });

const pageEditor = () => screen.findByRole('textbox', { name: 'Rich Text' });

describe('text that shows an attribute the codebook does not have', () => {
  it('is not called a problem while the protocol is still being read', async () => {
    reading.status = 'reading';
    const harness = openPage();
    const editor = await pageEditor();
    await harness.opened();

    expect(editor).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/no longer exists/)).not.toBeInTheDocument();
  });

  it('is called a problem once the protocol has been read', async () => {
    reading.status = 'read';
    const harness = openPage();
    const editor = await pageEditor();
    await harness.opened();

    await waitFor(() => expect(editor).toHaveAttribute('aria-invalid', 'true'));
  });
});
