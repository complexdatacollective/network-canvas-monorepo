// The largest file Studio stores as one resource, however the bytes arrive:
// the asset route and the protocol-builder host both refuse above it, and the
// editor is told it so it refuses before reading a file it would only send to
// be refused. Walking-skeleton bound; revisit with real stimuli sizes and the
// presigned direct-upload question on #1278.
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
