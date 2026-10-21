import { describe, expect, it } from 'vitest';

import {
  INTERVIEWER_HANDOFF_VERSION,
  interviewerHandoffReady,
  interviewerHandoffResult,
  interviewerHandoffUrl,
  interviewerOriginFor,
  isAllowedArchitectOrigin,
  parseInterviewerHandoffPayload,
  readInterviewerHandoffReply,
} from '../interviewer-handoff.ts';

const payload = (overrides: Record<string, unknown> = {}) => ({
  type: 'interviewer-handoff:payload',
  version: INTERVIEWER_HANDOFF_VERSION,
  fileName: 'Study.netcanvas',
  file: new Blob(['zip']),
  ...overrides,
});

describe('parseInterviewerHandoffPayload', () => {
  it('accepts a well-formed payload', () => {
    const parsed = parseInterviewerHandoffPayload(payload());
    expect(parsed.kind).toBe('payload');
    if (parsed.kind !== 'payload') return;
    expect(parsed.payload.fileName).toBe('Study.netcanvas');
    expect(parsed.payload.file).toBeInstanceOf(Blob);
  });

  it.each([
    ['null', null],
    ['a string', 'interviewer-handoff:payload'],
    ['another type', { type: 'preview:payload' }],
    ['our own ready', interviewerHandoffReady],
  ])('ignores %s', (_label, data) => {
    expect(parseInterviewerHandoffPayload(data)).toEqual({ kind: 'ignore' });
  });

  it.each([
    ['an unknown version', payload({ version: 2 })],
    ['a missing file', payload({ file: undefined })],
    ['a file that is not a Blob', payload({ file: 'zip' })],
    ['a name without the extension', payload({ fileName: 'Study.zip' })],
    ['a missing name', payload({ fileName: undefined })],
  ])('refuses %s as invalid', (_label, data) => {
    expect(parseInterviewerHandoffPayload(data)).toEqual({ kind: 'invalid' });
  });
});

describe('readInterviewerHandoffReply', () => {
  it('reads ready and both results', () => {
    expect(readInterviewerHandoffReply(interviewerHandoffReady)).toBe('ready');
    expect(
      readInterviewerHandoffReply(interviewerHandoffResult('received')),
    ).toBe('received');
    expect(readInterviewerHandoffReply(interviewerHandoffResult('error'))).toBe(
      'error',
    );
  });

  it('ignores another version, another type and non-objects', () => {
    expect(
      readInterviewerHandoffReply({ ...interviewerHandoffReady, version: 2 }),
    ).toBeUndefined();
    expect(readInterviewerHandoffReply(payload())).toBeUndefined();
    expect(readInterviewerHandoffReply('ready')).toBeUndefined();
  });
});

describe('interviewerOriginFor', () => {
  it('pairs production with production', () => {
    expect(
      interviewerOriginFor('https://architect.networkcanvas.com', {
        dev: false,
      }),
    ).toBe('https://interviewer.networkcanvas.com');
  });

  it.each([
    'https://architect.networkcanvas.dev',
    'https://deploy-preview-12--architect-dev.netlify.app',
    'http://localhost:4173',
  ])('sends %s to the developer site', (origin) => {
    expect(interviewerOriginFor(origin, { dev: false })).toBe(
      'https://interviewer.networkcanvas.dev',
    );
  });

  it('sends a development build to the local dev server', () => {
    expect(interviewerOriginFor('http://localhost:5173', { dev: true })).toBe(
      'http://localhost:5180',
    );
  });

  it('builds the address Architect opens', () => {
    expect(interviewerHandoffUrl('https://interviewer.networkcanvas.com')).toBe(
      'https://interviewer.networkcanvas.com/?from=architect',
    );
  });
});

describe('isAllowedArchitectOrigin', () => {
  const production = {
    interviewerOrigin: 'https://interviewer.networkcanvas.com',
    dev: false,
  };
  const developer = {
    interviewerOrigin: 'https://interviewer.networkcanvas.dev',
    dev: false,
  };

  it.each([
    'https://architect.networkcanvas.com',
    'https://architect.networkcanvas.dev',
    'https://architect-dev.netlify.app',
  ])('trusts %s everywhere', (origin) => {
    expect(isAllowedArchitectOrigin(origin, production)).toBe(true);
    expect(isAllowedArchitectOrigin(origin, developer)).toBe(true);
  });

  it('trusts an Architect preview only outside production', () => {
    const preview = 'https://deploy-preview-12--architect-dev.netlify.app';
    expect(isAllowedArchitectOrigin(preview, production)).toBe(false);
    expect(isAllowedArchitectOrigin(preview, developer)).toBe(true);
    expect(
      isAllowedArchitectOrigin(preview, {
        interviewerOrigin:
          'https://deploy-preview-3--interviewer-pwa-dev.netlify.app',
        dev: false,
      }),
    ).toBe(true);
  });

  it('trusts a local Architect only in a development build', () => {
    const local = 'http://localhost:5173';
    expect(isAllowedArchitectOrigin(local, developer)).toBe(false);
    expect(
      isAllowedArchitectOrigin(local, {
        interviewerOrigin: 'http://localhost:5180',
        dev: true,
      }),
    ).toBe(true);
  });

  it.each([
    'https://architect.networkcanvas.com.evil.example',
    'https://evil.example',
    'http://architect.networkcanvas.com',
    'https://x.y--architect-dev.netlify.app',
    'https://deploy-preview-1--architect-dev.netlify.app.evil.example',
    'null',
  ])('refuses %s', (origin) => {
    expect(isAllowedArchitectOrigin(origin, developer)).toBe(false);
    expect(
      isAllowedArchitectOrigin(origin, {
        interviewerOrigin: 'http://localhost:5180',
        dev: true,
      }),
    ).toBe(false);
  });
});
