import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  MigrationError,
  MigrationNotPossibleError,
  MigrationStepError,
  SchemaVersionDetectionError,
  ValidationError,
  VersionMismatchError,
} from '../../migration/errors.ts';
import { describeProtocolFileError } from '../describeProtocolFileError.ts';
import {
  extractProtocol,
  NetcanvasInflationLimitError,
} from '../extractProtocol.ts';
import {
  MalformedNetcanvasError,
  type MalformedNetcanvasReason,
} from '../malformedNetcanvasError.ts';

/**
 * Anything a host must never put in front of a researcher: the archive
 * library's name and documentation URL, its central-directory wording, the
 * JSON parser's cursor position, internal filenames, and schema version
 * arithmetic.
 */
const IMPLEMENTATION_DETAIL =
  /jszip|stuk\.github\.io|central directory|protocol\.json|JSON at position|position \d+|schemaVersion|\d+ -> \d+/i;

const ALL_REASONS: MalformedNetcanvasReason[] = [
  'not-an-archive',
  'missing-protocol',
  'unreadable-protocol-json',
  'missing-asset',
  'invalid-asset-definition',
];

describe('describeProtocolFileError', () => {
  it('describes every malformed-archive reason', () => {
    for (const reason of ALL_REASONS) {
      const described = describeProtocolFileError(
        new MalformedNetcanvasError(reason, 'technical text', {
          assetName: 'Village map',
        }),
      );
      expect(described, `reason: ${reason}`).toBeTypeOf('string');
      expect(described, `reason: ${reason}`).not.toMatch(IMPLEMENTATION_DETAIL);
      expect(described!.length, `reason: ${reason}`).toBeGreaterThan(0);
    }
  });

  it('names the resource a protocol is missing', () => {
    const described = describeProtocolFileError(
      new MalformedNetcanvasError('missing-asset', 'technical text', {
        assetName: 'Village map',
      }),
    );
    expect(described).toContain('Village map');
  });

  it('still says something useful when the missing resource has no name', () => {
    const described = describeProtocolFileError(
      new MalformedNetcanvasError('missing-asset', 'technical text'),
    );
    expect(described).toBeTypeOf('string');
    expect(described).not.toContain('undefined');
  });

  it('describes every migration failure without version arithmetic', () => {
    const migrationErrors = [
      new MigrationNotPossibleError(5, 8),
      new VersionMismatchError(8, 5),
      new MigrationStepError(6),
      new SchemaVersionDetectionError(),
      new ValidationError('name: Required', 8),
      new MigrationError('something else entirely'),
    ];

    for (const error of migrationErrors) {
      const described = describeProtocolFileError(error);
      expect(described, error.name).toBeTypeOf('string');
      expect(described, error.name).not.toMatch(IMPLEMENTATION_DETAIL);
    }
  });

  it('passes through the inflation-limit message, which is already written for a researcher', () => {
    const error = new NetcanvasInflationLimitError(
      'This protocol file expands to more data than can be opened safely.',
    );
    expect(describeProtocolFileError(error)).toBe(error.message);
  });

  it('declines errors it does not recognise, rather than guessing', () => {
    // The host knows about failures this package cannot see (storage quota, a
    // dead network) and must be free to describe those itself.
    expect(describeProtocolFileError(new Error('boom'))).toBeNull();
    expect(describeProtocolFileError('a thrown string')).toBeNull();
    expect(describeProtocolFileError(undefined)).toBeNull();
  });

  it('sanitises the real failure a non-archive file produces end to end', async () => {
    // The filed reproduction: a small non-zip file named .netcanvas.
    const error = await extractProtocol(
      Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    ).catch((thrown: unknown) => thrown);

    const described = describeProtocolFileError(error);
    expect(described).not.toMatch(IMPLEMENTATION_DETAIL);
    expect(described).toContain('Network Canvas protocol');
  });

  it('sanitises the real failure an empty archive produces end to end', async () => {
    const empty = await new JSZip().generateAsync({ type: 'nodebuffer' });

    const error = await extractProtocol(empty).catch(
      (thrown: unknown) => thrown,
    );

    expect(describeProtocolFileError(error)).not.toMatch(IMPLEMENTATION_DETAIL);
  });

  it('sanitises the real failure a truncated protocol.json produces end to end', async () => {
    const zip = new JSZip();
    zip.file('protocol.json', '{"schemaVersion": 8, "na');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const error = await extractProtocol(buffer).catch(
      (thrown: unknown) => thrown,
    );

    expect(describeProtocolFileError(error)).not.toMatch(IMPLEMENTATION_DETAIL);
  });
});
