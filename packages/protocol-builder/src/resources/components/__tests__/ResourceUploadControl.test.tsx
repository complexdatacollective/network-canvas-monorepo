import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ResourceUploadControl from '../ResourceUploadControl.tsx';
import { renderInResourceContext } from './resourceContext.tsx';
import { createResourceHost, withResourceProcedures } from './resourceHost.ts';

const CHOOSE_FILE = 'Choose a file from your computer';
const BELL = String.fromCharCode(0x7);

describe('ResourceUploadControl', () => {
  const chooseRoster = async (contents: string, name: string) => {
    const user = userEvent.setup();
    const host = createResourceHost();
    const stage = vi.fn(host.client.resources.stage);
    const onStaged = vi.fn();
    renderInResourceContext(
      withResourceProcedures(host.client, { stage }),
      host.protocolId,
      <ResourceUploadControl kind="network" onStaged={onStaged} />,
    );
    await user.upload(
      screen.getByLabelText(CHOOSE_FILE),
      new File([contents], name),
    );
    return { stage, onStaged };
  };

  it('does not look pressable while its input is disabled', async () => {
    const { client, protocolId } = createResourceHost();

    renderInResourceContext(
      client,
      protocolId,
      <ResourceUploadControl kind="image" onStaged={vi.fn()} disabled />,
    );

    const input = screen.getByLabelText(CHOOSE_FILE);
    expect(input).toBeDisabled();
    expect(input).toHaveClass('peer');

    const label = screen.getByText(CHOOSE_FILE).closest('label');
    expect(label).toBe(input.nextElementSibling);
    expect(label).not.toHaveAttribute('aria-disabled');
    expect(label).toHaveClass(
      'peer-disabled:cursor-not-allowed',
      'peer-disabled:opacity-50',
      'peer-disabled:active:translate-y-0!',
      'peer-disabled:active:elevation-low!',
    );
  });

  describe('a roster holding a character no export can carry', () => {
    it('is refused before anything is staged, naming the row and column', async () => {
      const { stage, onStaged } = await chooseRoster(
        `name,notes\nAlice,ok\nBob,b${BELL}d\n`,
        'roster.csv',
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Row 3 of the “notes” column contains a character that can’t be used (U+0007). Delete it from the file, then import the file again.',
      );
      expect(stage).not.toHaveBeenCalled();
      expect(onStaged).not.toHaveBeenCalled();
    });

    it('names the node and attribute of a JSON roster, and counts the other places', async () => {
      const { stage } = await chooseRoster(
        JSON.stringify({
          nodes: [
            { attributes: { name: `A${BELL}` } },
            { attributes: { name: 'B', notes: `b${BELL}d` } },
          ],
        }),
        'roster.json',
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The “name” attribute of node 1 contains a character that can’t be used (U+0007). Delete it from the file, then import the file again. The same problem appears in 1 other place in the file.',
      );
      expect(stage).not.toHaveBeenCalled();
    });

    it('is put in the same words when the host is the one that refuses it', async () => {
      const user = userEvent.setup();
      const host = createResourceHost();
      // A host reads the bytes it is given, which can differ from what this
      // control read: it answers with a code and a place, not a sentence.
      const stage = vi.fn(async () => ({
        status: 'failed' as const,
        failure: {
          reason: 'invalid-content' as const,
          message: 'the roster holds a character an export cannot carry',
          retryable: false,
          detail: {
            code: 'roster-characters' as const,
            problem: {
              kind: 'cell' as const,
              row: 4,
              column: 'notes',
              character: 'U+0008',
            },
            total: 3,
          },
        },
      }));
      const onStaged = vi.fn();
      renderInResourceContext(
        withResourceProcedures(host.client, { stage }),
        host.protocolId,
        <ResourceUploadControl kind="network" onStaged={onStaged} />,
      );

      await user.upload(
        screen.getByLabelText(CHOOSE_FILE),
        new File(['name,notes\nAlice,ok\n'], 'roster.csv'),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Row 4 of the “notes” column contains a character that can’t be used (U+0008). Delete it from the file, then import the file again. The same problem appears in 2 other places in the file.',
      );
      expect(stage).toHaveBeenCalledTimes(1);
      expect(onStaged).not.toHaveBeenCalled();
    });

    it('is not what a tab or a line break inside a quoted cell is', async () => {
      const { onStaged } = await chooseRoster(
        'name,notes\r\nAlice,"one\ttwo"\r\nBob,"line one\r\nline two"\r\n',
        'roster.csv',
      );

      await vi.waitFor(() => expect(onStaged).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('a roster whose headings the interview could not match', () => {
    it('is refused before anything is staged when two headings are one name written two ways', async () => {
      const { stage, onStaged } = await chooseRoster(
        'caf\u00e9,cafe\u0301\nAda,36\n',
        'roster.csv',
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'the "cafe\u0301" and "caf\u00e9" attributes are the same name written in two different ways, such as an accented letter typed as one character in one and as two in the other',
      );
      expect(stage).not.toHaveBeenCalled();
      expect(onStaged).not.toHaveBeenCalled();
    });

    it('is refused before anything is staged when a heading ends with a space', async () => {
      const { stage, onStaged } = await chooseRoster(
        '"name ",age\nAda,36\n',
        'roster.csv',
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'the "name " attribute cannot be used as a variable name: a name cannot be empty, start or end with a space, or contain line breaks, tabs or other control characters',
        { normalizeWhitespace: false },
      );
      expect(stage).not.toHaveBeenCalled();
      expect(onStaged).not.toHaveBeenCalled();
    });
  });
});
