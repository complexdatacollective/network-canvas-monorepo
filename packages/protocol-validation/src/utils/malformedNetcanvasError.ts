/**
 * Why a `.netcanvas` could not be read.
 *
 * Each reason names a distinct thing the researcher can act on, so a host can
 * say something useful without repeating any of the archive library's or the
 * JSON engine's internal vocabulary.
 */
export type MalformedNetcanvasReason =
  /** The file is not a zip archive at all — wrong file, or a truncated download. */
  | 'not-an-archive'
  /** A readable archive with no `protocol.json` entry. */
  | 'missing-protocol'
  /** `protocol.json` is present but is not parseable JSON. */
  | 'unreadable-protocol-json'
  /** The manifest names a media file the archive does not contain. */
  | 'missing-asset'
  /** A manifest entry is not a shape this version understands. */
  | 'invalid-asset-definition';

type MalformedNetcanvasOptions = {
  cause?: unknown;
  /** For `missing-asset`: the resource the manifest named. */
  assetName?: string;
};

/**
 * A `.netcanvas` archive could not be read.
 *
 * `message` stays technical on purpose — it is what a developer sees in the
 * console and what an app may offer behind a "technical details" disclosure.
 * Anything shown to a researcher without them asking should come from
 * `describeProtocolFileError` instead, which is exhaustive over `reason`.
 */
export class MalformedNetcanvasError extends Error {
  readonly reason: MalformedNetcanvasReason;
  readonly assetName?: string;

  constructor(
    reason: MalformedNetcanvasReason,
    message: string,
    options: MalformedNetcanvasOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'MalformedNetcanvasError';
    this.reason = reason;
    this.assetName = options.assetName;
  }
}
