import type { KnownUnnamedControl } from '@codaco/e2e-helpers/accessible-name-audit';

/**
 * Controls in the matrix ARIA baselines that are missing an accessible name
 * **today**, keyed by `<snapshotSlug>-<label>` (the baseline file's basename).
 * Every entry is a source defect the audit found and that has not been fixed
 * yet — not an exemption, and never the right place to record a new one.
 *
 * The audit compares observed roles to an entry's roles for **exact**
 * equality, so a newly unnamed control fails, and so does fixing a recorded
 * one until its entry is deleted here.
 *
 * Each entry names the `key`, the `roles` of the unnamed nodes, the `reason`,
 * and optionally an `issue` link.
 */
export const KNOWN_UNNAMED_CONTROLS: readonly KnownUnnamedControl[] = [];
