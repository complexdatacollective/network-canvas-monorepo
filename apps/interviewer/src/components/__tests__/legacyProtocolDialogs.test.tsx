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

const COPY_LINE =
  'Upgrading makes a copy of this protocol on schema 9 and imports that copy into this version of Interviewer. The original file is left unchanged.';
const PLEASE_NOTE =
  'Please note: upgrading may change the interview experience for participants.';
const CHANGES_INTRO =
  'If you upgrade, the following changes will be made to your protocol:';

describe('confirmProtocolUpgrade', () => {
  it('is confirmed only by the Upgrade action', async () => {
    expect(
      await confirmProtocolUpgrade(answering('upgrade').openDialog, {
        fromVersion: 8,
        legacyInterviewerBundled: true,
      }),
    ).toBe(true);
    for (const other of [null, true, 'keep']) {
      expect(
        await confirmProtocolUpgrade(answering(other).openDialog, {
          fromVersion: 8,
          legacyInterviewerBundled: true,
        }),
      ).toBe(false);
    }
  });

  it('says the upgrade imports a copy and leaves the file unchanged, then what changes', async () => {
    const { openDialog, shown } = answering(null);
    await confirmProtocolUpgrade(openDialog, {
      fromVersion: 7,
      legacyInterviewerBundled: true,
    });
    render(<>{shown[0]?.children}</>);
    const paragraphs = screen
      .getAllByText(/./, { selector: 'p' })
      .map((p) => p.textContent);
    expect(paragraphs.slice(0, 2)).toEqual([COPY_LINE, CHANGES_INTRO]);
    // The import choice before it gave the intro and the caution.
    expect(screen.queryByText(/Please note:/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Changes in schema version 9:' }),
    ).toBeInTheDocument();
  });

  const unavailableIntro =
    'This protocol uses an older version of the Network Canvas protocol schema (more information). Interviews cannot be started with it in this version of Interviewer, but you can upgrade it to the latest version, which will unlock new features and functionality.';

  it('gives a file the intro, the docs link, the caution and the copy line in a build without Interviewer 8', async () => {
    const { openDialog, shown } = answering(null);
    await confirmProtocolUpgrade(openDialog, {
      fromVersion: 8,
      legacyInterviewerBundled: false,
    });
    render(<>{shown[0]?.children}</>);
    const paragraphs = screen
      .getAllByText(/./, { selector: 'p' })
      .map((p) => p.textContent);
    expect(paragraphs.slice(0, 4)).toEqual([
      unavailableIntro,
      PLEASE_NOTE,
      COPY_LINE,
      CHANGES_INTRO,
    ]);
    expect(screen.getAllByText(COPY_LINE)).toHaveLength(1);
    expect(screen.getByText('Please note:').tagName).toBe('STRONG');
    expect(
      screen.getByRole('link', { name: 'more information' }),
    ).toHaveAttribute(
      'href',
      'https://documentation.networkcanvas.com/en/get-started/protocol-schema-information',
    );
    expect(screen.queryByText(/Interviewer 8/)).not.toBeInTheDocument();
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

  it('offers both in the words the product owner set', async () => {
    const { openDialog, shown } = answering(null);
    await chooseImportRoute(openDialog, { schemaVersion: 8 });
    render(<>{shown[0]?.children}</>);
    const paragraphs = screen
      .getAllByText(/./, { selector: 'p' })
      .map((p) => p.textContent);
    expect(paragraphs).toEqual([
      'This protocol uses an older version of the Network Canvas protocol schema (more information). You can either import it and use it as normal, or you can upgrade it to the latest version, which will unlock new features and functionality.',
      PLEASE_NOTE,
      COPY_LINE,
    ]);
    expect(
      screen.getByRole('link', { name: 'more information' }),
    ).toHaveAttribute(
      'href',
      'https://documentation.networkcanvas.com/en/get-started/protocol-schema-information',
    );
  });
});

describe('LegacyProtocolInfo', () => {
  it('lists the schema and the interviews, and names no other place for them', () => {
    render(
      <LegacyProtocolInfo
        protocol={{
          id: 'row',
          hash: 'hash',
          name: 'Wave One',
          schemaVersion: 8,
          importedAt: '2025-05-20T10:00:00.000Z',
          codebook: {},
          protocol: { schemaVersion: 8, codebook: {}, stages: [] },
          sessionCount: 12,
        }}
      />,
    );
    expect(screen.getByText('Schema version').nextSibling).toHaveTextContent(
      '8',
    );
    expect(screen.getByText('Interviews').nextSibling).toHaveTextContent('12');
    expect(screen.queryByText('Last changed')).not.toBeInTheDocument();
    expect(screen.queryByText(/Interviewer 8/)).not.toBeInTheDocument();
  });
});
