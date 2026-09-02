'use client';

// fresco-ui's NativeLink composes Base UI's `useRender`, which needs a client
// boundary; re-exporting it here lets server components render it.
export { NativeLink } from '@codaco/fresco-ui/NativeLink';
