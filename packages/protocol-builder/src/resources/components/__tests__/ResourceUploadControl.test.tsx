import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ResourceUploadControl from '../ResourceUploadControl.tsx';
import { renderInResourceContext } from './resourceContext.tsx';
import { createResourceHost, withResourceProcedures } from './resourceHost.ts';

const CHOOSE_FILE = 'Choose a file from your computer';
const BELL = String.fromCharCode(0x7);

describe('ResourceUploadControl', () => {
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

    it('is not what a tab or a line break inside a quoted cell is', async () => {
      const { onStaged } = await chooseRoster(
        'name,notes\r\nAlice,"one\ttwo"\r\nBob,"line one\r\nline two"\r\n',
        'roster.csv',
      );

      await vi.waitFor(() => expect(onStaged).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
