import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';

import {
  chooseImportRoute,
  confirmProtocolUpgrade,
  LegacyProtocolInfo,
  MigrationNotes,
} from '../legacyProtocolDialogs';

type OpenDialog = DialogContextType['openDialog'];

// A dialog that answers with `value`, and remembers what it was asked to show.
const answering = (value: unknown) => {
  const shown: { children?: ReactNode; actions?: unknown }[] = [];
  const openDialog = vi.fn((dialog: { children?: ReactNode }) => {
    shown.push(dialog);
    return Promise.resolve(value);
  }) as unknown as OpenDialog;
  return { openDialog, shown };
};

describe('MigrationNotes', () => {
  it("shows what the upgrade from schema 8 changes, in the migration's own notes", () => {
    render(<MigrationNotes fromVersion={8} />);
    expect(
      screen.getByRole('heading', { name: 'Changes in schema version 9:' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Changes in schema version 8:' }),
    ).not.toBeInTheDocument();
    // One of schema 9's notes, as the protocol-validation catalog words it.
    expect(screen.getByText(/Finish Screen stage/)).toBeInTheDocument();
  });

  it('shows every step from schema 7', () => {
    render(<MigrationNotes fromVersion={7} />);
    expect(
      screen.getByRole('heading', { name: 'Changes in schema version 8:' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Changes in schema version 9:' }),
    ).toBeInTheDocument();
  });

  it('shows nothing for a version it does not know', () => {
    const { container } = render(<MigrationNotes fromVersion={42} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('confirmProtocolUpgrade', () => {
  it('is confirmed only by the Upgrade action', async () => {
    expect(
      await confirmProtocolUpgrade(answering('upgrade').openDialog, {
        fromVersion: 8,
        source: 'legacy-library',
      }),
    ).toBe(true);
    for (const other of [null, true, 'keep']) {
      expect(
        await confirmProtocolUpgrade(answering(other).openDialog, {
          fromVersion: 8,
          source: 'file',
        }),
      ).toBe(false);
    }
  });

  it("says a library upgrade leaves Interviewer 8's protocol and interviews alone", async () => {
    const { openDialog, shown } = answering(null);
    await confirmProtocolUpgrade(openDialog, {
      fromVersion: 8,
      source: 'legacy-library',
    });
    render(<>{shown[0]?.children}</>);
    expect(
      screen.getByText(
        /The schema 8 protocol and its interviews stay unchanged in Interviewer 8, and no interviews are copied\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Changes in schema version 9:' }),
    ).toBeInTheDocument();
  });
});

describe('chooseImportRoute', () => {
  it('passes on Keep and Upgrade, and nothing else', async () => {
    expect(
      await chooseImportRoute(answering('keep').openDialog, {
        schemaVersion: 8,
      }),
    ).toBe('keep');
    expect(
      await chooseImportRoute(answering('upgrade').openDialog, {
        schemaVersion: 8,
      }),
    ).toBe('upgrade');
    expect(
      await chooseImportRoute(answering(true).openDialog, { schemaVersion: 8 }),
    ).toBeNull();
    expect(
      await chooseImportRoute(answering(null).openDialog, { schemaVersion: 8 }),
    ).toBeNull();
  });

  it('leads with keeping the protocol on schema 8', async () => {
    const { openDialog, shown } = answering(null);
    await chooseImportRoute(openDialog, { schemaVersion: 7 });
    expect(shown[0]?.actions).toMatchObject({
      primary: { value: 'keep' },
      secondary: { value: 'upgrade' },
      cancel: { value: null },
    });
  });
});

describe('LegacyProtocolInfo', () => {
  it('lists the schema, the interviews and where they are kept', () => {
    render(
      <LegacyProtocolInfo
        protocol={{
          id: 'row',
          hash: 'hash',
          name: 'Wave One',
          schemaVersion: 8,
          importedAt: '2025-05-20T10:00:00.000Z',
          sessionCount: 12,
        }}
      />,
    );
    expect(screen.getByText('Schema version').nextSibling).toHaveTextContent(
      '8',
    );
    expect(screen.getByText('Interviews').nextSibling).toHaveTextContent('12');
    expect(screen.queryByText('Last changed')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /runs in Interviewer 8, which also keeps its interviews/,
      ),
    ).toBeInTheDocument();
  });
});
