import { describe, expect, it } from 'vitest';

import {
  MalformedNetcanvasError,
  MigrationNotPossibleError,
} from '@codaco/protocol-validation';

import {
  describeImportFailure,
  PROTOCOL_OPEN_FAILURE_MESSAGE,
  STORAGE_FAILURE_MESSAGE,
  TEMPLATE_OPEN_FAILURE_MESSAGE,
} from '../protocolImportErrors';

/**
 * The regression gate for the filed leak: nothing a dialog LEADS with may
 * contain the archive library's name or documentation URL, its
 * central-directory wording, an internal filename, a JSON parser's cursor
 * position, or schema-version arithmetic.
 */
const IMPLEMENTATION_DETAIL =
  /jszip|stuk\.github\.io|central directory|protocol\.json|JSON at position|position \d+|schemaVersion|\d+ -> \d+/i;

describe('describeImportFailure', () => {
  it('describes a malformed archive without repeating the library that rejected it', () => {
    const jszipRejection = new Error(
      "Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html",
    );
    const { message } = describeImportFailure(
      new MalformedNetcanvasError(
        'not-an-archive',
        'The file could not be read as a .netcanvas archive',
        { cause: jszipRejection },
      ),
      PROTOCOL_OPEN_FAILURE_MESSAGE,
    );

    expect(message).not.toMatch(IMPLEMENTATION_DETAIL);
    expect(message).toContain('Network Canvas protocol');
  });

  it('keeps the underlying wording, including the cause chain, for technical details', () => {
    // Architect runs offline and a researcher may have exception reporting off.
    // Without this they would have nothing to quote when asking for help.
    const jszipRejection = new Error(
      "Can't find end of central directory : is this a zip file ?",
    );
    const { detail } = describeImportFailure(
      new MalformedNetcanvasError('not-an-archive', 'archive unreadable', {
        cause: jszipRejection,
      }),
      PROTOCOL_OPEN_FAILURE_MESSAGE,
    );

    expect(detail).toContain('archive unreadable');
    expect(detail).toContain('Caused by:');
    expect(detail).toContain('central directory');
  });

  it('does not spin on a self-referential cause chain', () => {
    const looping = new Error('outer');
    looping.cause = looping;

    const { detail } = describeImportFailure(looping, 'fallback');

    expect(detail).toBe('outer');
  });

  it('describes a migration failure rather than the version arithmetic', () => {
    const { message } = describeImportFailure(
      new MigrationNotPossibleError(5, 8),
      PROTOCOL_OPEN_FAILURE_MESSAGE,
    );

    expect(message).not.toMatch(IMPLEMENTATION_DETAIL);
    expect(message).not.toBe(PROTOCOL_OPEN_FAILURE_MESSAGE);
  });

  it('names storage, not the file, when the device cannot keep the protocol', () => {
    const quota = new DOMException('exceeded', 'QuotaExceededError');

    const { message } = describeImportFailure(
      quota,
      PROTOCOL_OPEN_FAILURE_MESSAGE,
    );

    expect(message).toBe(STORAGE_FAILURE_MESSAGE);
  });

  it("uses the caller's own default for an unrecognised failure", () => {
    expect(
      describeImportFailure(new Error('boom'), PROTOCOL_OPEN_FAILURE_MESSAGE)
        .message,
    ).toBe(PROTOCOL_OPEN_FAILURE_MESSAGE);
    expect(
      describeImportFailure('thrown as a string', TEMPLATE_OPEN_FAILURE_MESSAGE)
        .message,
    ).toBe(TEMPLATE_OPEN_FAILURE_MESSAGE);
  });

  it('never claims a file is damaged when nothing said so', () => {
    // A bundled template is never read from a file, and an unrecognised
    // internal failure is not evidence of corruption. Sending a researcher
    // looking for a backup they do not need is its own harm.
    //
    // Asserted through `describeImportFailure`, not against the copy constants
    // alone: what a researcher reads is this function's output, so a constants
    // -only check would miss a future branch that answered an unrecognised
    // failure with damage wording of its own.
    const unrecognised: unknown[] = [
      new Error('boom'),
      new TypeError("Cannot read properties of undefined (reading 'stages')"),
      new DOMException('aborted', 'AbortError'),
      'thrown as a string',
      undefined,
    ];

    for (const fallback of [
      PROTOCOL_OPEN_FAILURE_MESSAGE,
      TEMPLATE_OPEN_FAILURE_MESSAGE,
    ]) {
      expect(fallback).not.toMatch(/damaged|corrupt|incomplete/i);

      for (const error of unrecognised) {
        const { message } = describeImportFailure(error, fallback);
        expect(message).toBe(fallback);
        expect(message).not.toMatch(/damaged|corrupt|incomplete/i);
      }
    }
  });
});
