import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from 'fresco-schema-8/interview/protocol-schema-version';

/**
 * The schema version the bundled previous interview runs. Fresco keeps
 * protocols stored at this version exactly as they were imported and runs
 * their interviews at `/v8/interview/<id>`, in the interview released for
 * this schema (`fresco-schema-8`), rather than upgrading them.
 *
 * Read from that interview package, like the current version is read from
 * `@codaco/interview`, so the two cannot disagree with what actually runs.
 */
export const LEGACY_SCHEMA_VERSION = COMPATIBLE_PROTOCOL_SCHEMA_VERSION;

/** Whether a stored protocol runs in the bundled previous interview. */
export function isLegacySchemaVersion(
  schemaVersion: number,
): schemaVersion is typeof LEGACY_SCHEMA_VERSION {
  return schemaVersion === LEGACY_SCHEMA_VERSION;
}

/** Where a participant takes part in an interview of a protocol stored at
 * `schemaVersion`. */
export function interviewPath(
  interviewId: string,
  schemaVersion: number,
): `/interview/${string}` | `/v8/interview/${string}` {
  return isLegacySchemaVersion(schemaVersion)
    ? `/v8/interview/${interviewId}`
    : `/interview/${interviewId}`;
}
