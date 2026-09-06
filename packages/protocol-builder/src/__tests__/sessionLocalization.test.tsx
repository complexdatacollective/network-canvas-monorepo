import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ecosystemLocales } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import CodebookSurface from '../codebook/components/CodebookSurface.tsx';
import { compoundRequestMessages } from '../compound-edit/compoundRequestMessages.ts';
import { protocolBuilderCatalogs } from '../locales/catalogs.ts';
import {
  protocolContextFromSections,
  type ProtocolContextIssue,
} from '../protocol-context.ts';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../session.ts';
import { enIntl, esIntl, readMessage } from '../testing/i18n.ts';

/**
 * Three of this package's refusal channels are plain strings, and deliberately
 * so: a HOST writes its own sentences into the same fields. These prove the
 * whole round trip — a descriptor survives the string, the reader's language is
 * applied where the string is read, and a message that is not this package's is
 * left exactly as it arrived.
 */

const STAGE_ID = 'stage-1';
const stageSection = sectionId({ kind: 'stage', stageId: STAGE_ID });

const stageDocument: SectionDoc = {
  id: STAGE_ID,
  type: 'Information',
  label: 'Welcome',
  title: 'Welcome',
  items: [],
};

const sections = (): Record<string, SectionDoc> => ({
  [sectionId({ kind: 'stageOrder' })]: { stages: [STAGE_ID, 'missing-stage'] },
  [stageSection]: stageDocument,
});

/** The one issue a broken stage order produces, so the test names its subject. */
const missingStageIssue = (
  issues: readonly ProtocolContextIssue[],
): ProtocolContextIssue => {
  const issue = issues.find((candidate) =>
    readMessage(candidate.message).startsWith('Stage order names missing'),
  );
  if (issue === undefined) {
    throw new Error('the broken stage order reported no missing-stage issue');
  }
  return issue;
};

describe('a protocol context issue', () => {
  it('reads in the reader’s language, and leaves a message from elsewhere alone', () => {
    const context = protocolContextFromSections(sections());
    const issue = missingStageIssue(context.issues);

    // Written by whoever built the section rather than by this package — a
    // host's own wording, or the protocol schema's. Decoding must pass it
    // through untouched in every locale.
    const foreign = 'Required entity appearance is missing.';
    const withForeign = {
      ...context,
      issues: [
        ...context.issues,
        {
          sectionId: 'codebook:node:missing',
          path: ['shape'],
          message: foreign,
        },
      ],
    };

    const english = readMessage(issue.message, enIntl);
    const spanish = readMessage(issue.message, esIntl);
    // The catalogs have to actually carry this one; equal strings would let
    // every assertion below pass over an untranslated message.
    expect(english).toBe('Stage order names missing stage missing-stage.');
    expect(spanish).not.toBe(english);

    const view = (locale: string) => (
      <AppI18nProvider
        locale={locale}
        locales={ecosystemLocales}
        messages={protocolBuilderCatalogs[locale]}
      >
        <CodebookSurface context={withForeign} />
      </AppI18nProvider>
    );

    const { rerender } = render(view('en'));
    expect(screen.getByText(english, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(foreign, { exact: false })).toBeInTheDocument();

    rerender(view('es'));
    expect(screen.getByText(spanish, { exact: false })).toBeInTheDocument();
    expect(
      screen.queryByText(english, { exact: false }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(foreign, { exact: false })).toBeInTheDocument();
  });

  it('reports a section id it cannot parse in the reader’s language', () => {
    // `parseSectionId` reports an id it does not recognise by throwing, and
    // the sentence it throws is written for whoever is reading a stack trace.
    // Passed through, that is what a Spanish codebook shows — so this asserts
    // on the words a researcher reads rather than on the fact that something
    // was reported. The developer sentence names the id, which the row prints
    // beside the message anyway, so nothing is lost by replacing it.
    const context = protocolContextFromSections({
      ...sections(),
      'not-a-section': { anything: true },
    });
    const issue = context.issues.find(
      (candidate) => candidate.sectionId === 'not-a-section',
    );
    if (issue === undefined) {
      throw new Error('an unparseable section id reported no issue');
    }

    const english = readMessage(issue.message, enIntl);
    const spanish = readMessage(issue.message, esIntl);
    expect(english).toBe('Unknown protocol section id.');
    expect(spanish).toBe('Identificador de sección del protocolo desconocido.');

    const view = (locale: string) => (
      <AppI18nProvider
        locale={locale}
        locales={ecosystemLocales}
        messages={protocolBuilderCatalogs[locale]}
      >
        <CodebookSurface context={context} />
      </AppI18nProvider>
    );

    const { rerender } = render(view('en'));
    expect(screen.getByText(english, { exact: false })).toBeInTheDocument();

    rerender(view('es'));
    expect(screen.getByText(spanish, { exact: false })).toBeInTheDocument();
    // The thrown sentence is not a descriptor, so it would survive the switch
    // to Spanish word for word. Naming it is what separates a translated row
    // from one that merely changed.
    expect(
      screen.queryByText('not a protocol-store section id', { exact: false }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('not-a-section', { exact: false })).toBeVisible();
  });
});

describe('a compound edit refusal', () => {
  it('carries its descriptor through the result’s plain-string message', async () => {
    const session = new ProtocolBuilderSessionStore({
      identity: createStageIdentity('Information', () => STAGE_ID),
      fields: { label: 'Welcome', title: 'Welcome', items: [] },
      protocolSections: sections(),
      manifestRevision: { sequence: 1n, hash: 'revision-1' },
      access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
      buildCandidate: () => ({}),
    });

    // No `onCompoundEdit`, so the session refuses before anything is sent.
    const result = await session.requestCompoundEdit({
      id: 'request-1',
      description: 'rename the person type',
      edits: [
        {
          kind: 'update',
          sectionId: sectionId({ kind: 'codebookNode', typeId: 'person' }),
          expectedContentHash: 'hash',
          commands: [{ op: 'set', key: 'name', value: 'People' }],
        },
      ],
    });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(readMessage(result.message, enIntl)).toBe(
      'compound editing is unavailable',
    );
    expect(readMessage(result.message, esIntl)).not.toBe(
      readMessage(result.message, enIntl),
    );
  });

  it('leaves a host’s own refusal exactly as the host wrote it', () => {
    const hostWrote = 'Ese cambio lo está haciendo otra persona ahora mismo.';
    expect(readMessage(hostWrote, enIntl)).toBe(hostWrote);
    expect(readMessage(hostWrote, esIntl)).toBe(hostWrote);
  });

  it('is translated for every refusal the session and the host both write', () => {
    // These have one home because both sides check the same things. The
    // catalogs carry them once, and this is what says the one copy covers both.
    for (const descriptor of Object.values(compoundRequestMessages)) {
      const values = { requestId: 'r-1' };
      expect(esIntl.formatMessage(descriptor, values), descriptor.id).not.toBe(
        enIntl.formatMessage(descriptor, values),
      );
    }
  });
});
