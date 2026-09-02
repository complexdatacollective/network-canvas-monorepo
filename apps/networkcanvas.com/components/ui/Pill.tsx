'use client';

// fresco-ui's Pill forwards a ref to its host element, which server components
// cannot do; re-exporting it here gives them a client reference instead.
export { default as Pill } from '@codaco/fresco-ui/Pill';
