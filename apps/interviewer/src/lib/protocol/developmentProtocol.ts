// Card-facing metadata for the dev-only Development protocol teaser.
// Deliberately NOT imported from bundledDevelopmentProtocol.ts: that module
// statically inlines the protocol's large media (a 23MB video), and is only
// ever loaded via the dynamic `import()` behind the `import.meta.env.DEV`
// guard in useProtocolImport.ts. The name must match the one
// loadBundledDevelopmentProtocol returns so the pending-import card and the
// installed protocol shadow this teaser's deck slot.
export const DEVELOPMENT_PROTOCOL = {
  name: 'Development Protocol',
  description:
    'The Network Canvas development protocol — exercises every stage type ' +
    'and is bundled into development builds for testing.',
} as const;
