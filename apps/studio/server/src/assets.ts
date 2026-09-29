// Walking-skeleton bound; revisit with real stimuli sizes and the presigned
// direct-upload question on #1278. Exported because it is what Studio will
// store for one file however the bytes arrive: the protocol-builder host
// stages through the RPC surface rather than the `/storage` route, and a
// second bound there would be a second answer to the same question.
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * The largest WebSocket message the process accepts: one staged asset at the
 * upload bound, and a mebibyte for the rpc envelope around it. The listener's
 * `maxPayload` and the `/ws` rpc parser's frame bound are both this, so the
 * listener's 1009 close is the one answer to an oversized frame.
 */
export const MAX_SOCKET_FRAME_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;
