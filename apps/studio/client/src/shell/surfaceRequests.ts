/**
 * The surface a launcher asked a destination screen to open on arrival
 * (everything-bar design §5.1's `{ kind: 'open', href, surface }`).
 *
 * The bar reports; the destination performs. This module is the reporting half
 * and nothing more: it records the surface identifier alongside the route it
 * was asked for, so a screen the request was not addressed to cannot mistake it
 * for its own.
 *
 * NOTHING CONSUMES IT YET, deliberately. The consuming half is the command
 * registry and the per-screen surface registrations of the everything-bar
 * design's slice 2, which land with the features that own those surfaces —
 * #1249 (create a study), #1263 (participant import), #1273 (the codebook),
 * #1324 (export). Until then a command launch is an ordinary navigation to the
 * owning screen plus this record, and the screen shows its normal self on
 * arrival rather than opening a dialog that does not exist.
 */

export type SurfaceRequest = { href: string; surface: string };

let pending: SurfaceRequest | undefined;

/** Records what the researcher asked for. Replaces any unread request. */
export function recordSurfaceRequest(request: SurfaceRequest): void {
  pending = request;
}

/** The outstanding request, if any. */
export function readSurfaceRequest(): SurfaceRequest | undefined {
  return pending;
}

/** Drops any outstanding request. */
export function clearSurfaceRequest(): void {
  pending = undefined;
}
