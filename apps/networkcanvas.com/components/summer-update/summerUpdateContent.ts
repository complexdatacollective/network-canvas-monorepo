const documentationRoot = 'https://documentation.networkcanvas.com/en';

export const interfaceFeatures = [
  {
    shortName: 'Geospatial',
    name: 'Geospatial interface',
    tag: 'New interface',
    summary:
      'Capture alter-level location data by asking participants to select an area on an interactive map.',
    details: [
      'Define selectable census tracts, ZIP codes, neighborhoods, or custom study regions with a GeoJSON file.',
      'Choose which GeoJSON property is saved with each person, so the response is ready to join with spatial data during analysis.',
      'Optionally add address search and public-transit context. Mapbox services require an internet connection during the interview.',
    ],
    href: `${documentationRoot}/design-protocols/interface-documentation/geospatial`,
    motif: 'geospatial',
  },
  {
    shortName: 'Anonymisation',
    name: 'Anonymisation interface',
    tag: 'New interface',
    summary:
      'Give participants direct control over sensitive identifiers by encrypting selected node or edge attributes on their device.',
    details: [
      'Each participant creates the passphrase used to protect their selected data, and that passphrase is never stored by the app.',
      'Researchers cannot decrypt the protected values; exports replace encrypted attributes with a clear marker instead.',
      'This is an experimental feature for studies where stronger privacy assurances may support trust and disclosure.',
    ],
    href: `${documentationRoot}/design-protocols/interface-documentation/anonymisation`,
    motif: 'anonymisation',
  },
  {
    shortName: 'One-to-many dyad census',
    name: 'One-to-many dyad census interface',
    tag: 'New interface',
    summary:
      'Create ties from one focal person to several other people on the same screen instead of considering every pair separately.',
    details: [
      'Use it when a network contains central figures who are likely to have relationships with many others.',
      'Collect one or more relationship types while keeping the focal person visible throughout the task.',
      'Decide whether each focal person returns to the list for another pass or is removed after they have been considered.',
    ],
    href: `${documentationRoot}/design-protocols/interface-documentation/one-to-many-dyad-census`,
    motif: 'one-to-many',
  },
  {
    shortName: 'Family pedigree',
    name: 'Family pedigree interface',
    tag: 'New interface',
    summary:
      'Guide participants through building a complex family structure in a dedicated visual workflow.',
    details: [
      'Create family members and relationships together, with automatic layout keeping the pedigree readable as it grows.',
      'Represent biological, social, adoptive, donor, surrogate, and partner relationships, and collect attributes for every family member.',
      'Add an optional disease-nomination step to record which relatives are affected by specific conditions for later visualisation.',
    ],
    href: `${documentationRoot}/design-protocols/interface-documentation/family-pedigree`,
    motif: 'family-pedigree',
  },
  {
    shortName: 'Narrative pedigree',
    name: 'Narrative pedigree interface',
    tag: 'New interface',
    summary:
      'Turn an earlier Family Pedigree into a read-only visualisation that uses standard clinical pedigree notation.',
    details: [
      'Show affected relatives and definite carriers for one or more conditions across supported inheritance patterns.',
      'Optionally display possible at-risk statuses when the study is designed for appropriately guided interpretation.',
      'Focus on one person’s contributing lineage and export a printable snapshot. The visualisation is an aid, not a diagnosis.',
    ],
    href: `${documentationRoot}/design-protocols/interface-documentation/narrative-pedigree`,
    motif: 'narrative-pedigree',
  },
  {
    shortName: 'Network composer',
    name: 'Network composer interface',
    tag: 'New interface',
    summary:
      'Build and edit a participant’s whole personal network on one free-form canvas.',
    details: [
      'Add people, complete person and relationship attributes, draw several relationship types, and reposition the network as the conversation develops.',
      'Use lasso selection, groups, automatic layout, keyboard shortcuts, and undo or redo to construct dense networks efficiently.',
      'Treat it as a researcher- or interviewer-led network notepad rather than a step-by-step self-administered task.',
    ],
    href: `${documentationRoot}/design-protocols/interface-documentation/network-composer`,
    motif: 'network-composer',
  },
  {
    shortName: 'Validation & skip logic',
    name: 'Richer validation & skip logic',
    tag: 'New feature',
    summary:
      'Create more responsive interview flows with richer validation rules and more precise destinations for skip logic.',
    details: [
      'Compare a numeric response with another variable instead of relying only on a fixed threshold.',
      'Use “contains” and “does not contain” for text, and match several selected values in one categorical rule.',
      'Continue normally, jump forward to a chosen later stage, or route directly to the interview finish screen.',
    ],
    href: `${documentationRoot}/get-started/advanced-topics/protocol-schema-information#whats-new-in-schema-8`,
    motif: 'validation',
  },
  {
    shortName: 'Node shapes & form hints',
    name: 'Configurable node shapes & form hints',
    tag: 'New feature',
    summary:
      'Use stronger visual and written cues to make dense interfaces and form questions easier to interpret.',
    details: [
      'Choose circles, squares, or diamonds as a default shape for each person type.',
      'Map shapes dynamically from categorical, ordinal, boolean, number, or scalar variables when the visual distinction carries data.',
      'Place markdown-formatted guidance beside a form question and show automatic hints derived from its validation rules.',
    ],
    href: `${documentationRoot}/get-started/advanced-topics/protocol-schema-information#whats-new-in-schema-8`,
    motif: 'node-shapes',
  },
  {
    shortName: 'Protocol templates',
    name: 'Protocol templates',
    tag: 'Architect feature',
    summary:
      'Start from a research-grounded protocol instead of an empty timeline, then adapt it to your study.',
    details: [
      'Explore templates for transnational, mental-health, social-isolation, behavioural-influence, care-and-support, and sexual or injection-risk networks.',
      'Use the general Sample Protocol to learn how key Network Canvas features and techniques fit together.',
      'Edit every stage, prompt, variable, and visual choice; your adapted protocols remain stored locally in your browser.',
    ],
    href: `${documentationRoot}/design-protocols/getting-started#your-protocol-library`,
    motif: 'templates',
  },
  {
    shortName: 'Synthetic data',
    name: 'Synthetic interview data',
    tag: 'New feature',
    summary:
      'Generate realistic test interviews before recruitment so you can inspect the complete data workflow without putting participant data at risk.',
    details: [
      'Create up to 1,000 synthetic interviews at once and inspect how responses appear in study tables and exports.',
      'Optionally simulate participant drop-out and respect the protocol’s skip logic and network filters.',
      'Synthetic records are flagged separately and can be removed in bulk without touching real interviews.',
    ],
    href: `${documentationRoot}/collect-data/fresco/using-fresco#generating-synthetic-test-data`,
    motif: 'synthetic-data',
  },
] as const;

export type InterfaceMotif = (typeof interfaceFeatures)[number]['motif'];

export const compatibilityRows = [
  {
    group: "Current ('Classic') generation",
    app: 'Interviewer Classic',
    version: '6.6.0',
    platform: 'Desktop & tablet',
    schema7: 'native',
    schema8: 'unsupported',
    note: 'Interviewer Classic runs Schema 7 natively, but cannot open Schema 8 protocols. Continue using it for in-progress Schema 7 studies — it remains supported with bug fixes.',
  },
  {
    group: "Current ('Classic') generation",
    app: 'Architect Classic',
    version: '6.6.0',
    platform: 'Desktop',
    schema7: 'native',
    schema8: 'unsupported',
    note: 'Architect Classic continues to produce Schema 7 protocols, in maintenance mode. Use it only if you need to keep running older versions of Interviewer (e.g. 6.6.0).',
  },
  {
    group: "Current ('Classic') generation",
    app: 'Fresco',
    version: '3.1.2',
    platform: 'Browser',
    schema7: 'native',
    schema8: 'unsupported',
    note: 'Fresco 3.1.2 runs Schema 7 natively but will not open Schema 8 protocols. Upgrade to Fresco 4.0.0 to use the new format.',
  },
  {
    group: 'New generation',
    app: 'Interviewer',
    version: undefined,
    platform: 'Browser & PWA',
    schema7: 'migrates',
    schema8: 'native',
    note: 'The new Interviewer opens Schema 8 natively. Opening a Schema 7 protocol migrates it to Schema 8 automatically — and one way.',
  },
  {
    group: 'New generation',
    app: 'Architect',
    version: undefined,
    platform: 'Browser & PWA',
    schema7: 'migrates',
    schema8: 'native',
    note: 'The new Architect builds Schema 8 protocols, and opens and automatically upgrades older Schema 7 protocols created in Architect Classic.',
  },
  {
    group: 'New generation',
    app: 'Fresco',
    version: '4.0.0',
    platform: 'Browser',
    schema7: 'migrates',
    schema8: 'native',
    note: 'Fresco 4.0.0 runs Schema 8 natively; uploaded Schema 7 protocols are migrated to Schema 8 automatically — and one way.',
  },
] as const;

export type CompatibilityStatus = (typeof compatibilityRows)[number][
  | 'schema7'
  | 'schema8'];

export const destinationLinks = [
  {
    title: 'Open Architect',
    category: 'Design protocols',
    description:
      'Build, validate, and preview Schema 8 protocols directly in your browser, with a local library that stays on your device.',
    detail: 'architect.networkcanvas.com',
    href: 'https://architect.networkcanvas.com/',
    color: 'sea-green',
    icon: '/images/summer-2026/architect-icon.png',
  },
  {
    title: 'Open Interviewer',
    category: 'Collect in person',
    description:
      'Run secure, offline-capable interviews on desktop and tablet, then export completed sessions from the same local app.',
    detail: 'interviewer.networkcanvas.com',
    href: 'https://interviewer.networkcanvas.com/',
    color: 'sea-serpent',
    icon: '/images/summer-2026/interviewer-icon.svg',
  },
  {
    title: 'Deploy Fresco 4.0.0',
    category: 'Collect remotely',
    description:
      'Set up the multi-user platform for remote self-administered studies, centralized data management, and research teams.',
    detail: 'deployment guide',
    href: `${documentationRoot}/collect-data/fresco/guide`,
    color: 'paradise-pink',
    icon: '/images/summer-2026/fresco-icon.png',
  },
  {
    title: 'Explore the docs',
    category: 'Learn the workflow',
    description:
      'Follow task-focused guidance for choosing tools, designing protocols, collecting data, and understanding every interface.',
    detail: 'latest interfaces & features',
    href: documentationRoot,
    color: 'mustard',
    icon: '/images/icons/docs.png',
  },
] as const;
