const documentationRoot = 'https://documentation.networkcanvas.com/en';

export const interfaceFeatures = [
  {
    group: 'interfaces',
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
    group: 'interfaces',
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
    group: 'interfaces',
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
    group: 'interfaces',
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
    group: 'interfaces',
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
    group: 'interfaces',
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
    group: 'schema',
    shortName: 'Validation',
    name: 'Richer field validation',
    tag: 'New feature',
    summary:
      'Express relationships between answers directly in the protocol, so forms can catch inconsistent responses while the interview is still in progress.',
    details: [
      'Compare a numeric response with another variable using the new greater-than-variable and less-than-variable rules.',
      'Combine these relative checks with existing required, range, uniqueness, and cross-field rules to describe the answers your study can accept.',
      'Preview the form in Architect and test edge cases before deployment; the same protocol rules run in Interviewer and Fresco.',
    ],
    href: `${documentationRoot}/design-protocols/key-concepts/field-validation`,
    motif: 'validation',
  },
  {
    group: 'schema',
    shortName: 'Enhanced skip logic',
    name: 'Enhanced skip logic',
    tag: 'New feature',
    summary:
      'Build more precise interview routes with expanded comparison rules and explicit destinations for each skipped stage.',
    details: [
      'Use “contains” and “does not contain” with text responses, and match several selected values in categorical and ordinal rules.',
      'Continue at the next available stage, jump forward to a chosen later stage, or route directly to the interview finish screen.',
      'Keep every destination forward-moving, making complex paths predictable and avoiding loops during data collection.',
    ],
    href: `${documentationRoot}/design-protocols/key-concepts/skip-logic`,
    motif: 'enhanced-skip-logic',
  },
  {
    group: 'schema',
    shortName: 'Node shapes',
    name: 'Configurable node shapes',
    tag: 'New feature',
    summary:
      'Use shape as an additional visual channel, making different kinds of people easier to distinguish in dense network interfaces.',
    details: [
      'Choose circles, squares, or diamonds as a default shape for each person type.',
      'Map shapes dynamically from categorical, ordinal, boolean, number, or scalar variables when the visual distinction carries data.',
      'Combine shape with color and size so important categories remain legible without depending on a single visual cue.',
    ],
    href: `${documentationRoot}/design-protocols/key-concepts/codebook#mapping-a-node-variable-to-shape`,
    motif: 'node-shapes',
  },
  {
    group: 'schema',
    shortName: 'Form hints',
    name: 'Form hints and validation guidance',
    tag: 'New feature',
    summary:
      'Place concise guidance beside an individual question, giving participants context exactly where they need it.',
    details: [
      'Add a markdown-formatted hint to a form field without lengthening the main stage prompt.',
      'Use hints to clarify expected formats, unfamiliar terms, or how a response will be interpreted.',
      'Optionally show automatic guidance derived from the field’s validation rules, such as acceptable ranges or required responses.',
    ],
    href: `${documentationRoot}/get-started/protocol-schema-information#whats-new-in-schema-8`,
    motif: 'form-hints',
  },
  {
    group: 'architect',
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
    group: 'architect',
    shortName: 'Responsive SVG backgrounds',
    name: 'Responsive SVG sociogram backgrounds',
    tag: 'Architect feature',
    summary:
      'Create sociogram backgrounds whose regions, axes, and labels adapt to both portrait and landscape interview canvases.',
    details: [
      'Upload an SVG whose elements are positioned relative to the available canvas instead of a fixed pixel grid.',
      'Keep labels readable and regions extended to the canvas edges when participants rotate a tablet or use a different screen shape.',
      'Use the provided social-context template as a starting point for quadrants, independent axes, categories, or overlapping contexts.',
    ],
    href: `${documentationRoot}/design-protocols/responsive-svg-backgrounds`,
    motif: 'responsive-sociogram-backgrounds',
  },
  {
    group: 'interviewer',
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
    href: `${documentationRoot}/collect-data/interviewer/using-interviewer#settings`,
    motif: 'synthetic-data',
  },
  {
    group: 'interviewer',
    shortName: 'Encryption at rest',
    name: 'On-device encryption at rest',
    tag: 'Interviewer feature',
    summary:
      'Protect protocols, interviews, and settings stored on the device whenever you configure an Interviewer app lock.',
    details: [
      'Choose a PIN, passphrase, or supported biometric method during setup; the same authentication unlocks the key used to decrypt local data.',
      'Keep the decryption key only in memory while Interviewer is unlocked. Reloading, locking, closing, or reaching the idle timeout removes it.',
      'Use this app-level protection alongside full-device encryption and regular exports as part of a layered data-security plan.',
    ],
    href: `${documentationRoot}/collect-data/interviewer/using-interviewer#security-and-locking`,
    motif: 'encryption-at-rest',
  },
  {
    group: 'interviewer',
    shortName: 'Authorisation checks',
    name: 'Configurable authorisation checks',
    tag: 'Interviewer feature',
    summary:
      'Require a fresh unlock at sensitive workflow boundaries instead of relying only on the app’s general idle lock.',
    details: [
      'Independently require re-authentication before entering an interview, leaving it for the dashboard, or exporting collected data.',
      'Use the already configured PIN, passphrase, or biometric method, without introducing a second set of credentials.',
      'Keep protocol names, session counts, and stored data hidden whenever Interviewer is locked.',
    ],
    href: `${documentationRoot}/collect-data/interviewer/using-interviewer#locking-and-unlocking`,
    motif: 'authorisation-checks',
  },
  {
    group: 'fresco',
    shortName: 'Multi-user',
    name: 'Multi-user administration',
    tag: 'Fresco 4.0.0 feature',
    summary:
      'Give each researcher a separate administrator account instead of sharing one set of dashboard credentials.',
    details: [
      'Add and remove multiple administrator accounts from settings; every current account has equal administrative access.',
      'Choose password authentication with optional TOTP two-factor protection, or use passkeys for password-free sign-in.',
      'Attribute dashboard activity to usernames in the shared audit feed, including authentication, protocol, export, and account-management events.',
    ],
    href: `${documentationRoot}/collect-data/fresco/it-faq#what-authentication-does-fresco-use`,
    motif: 'multi-user',
  },
  {
    group: 'fresco',
    shortName: 'Advanced export filtering',
    name: 'Advanced export filtering',
    tag: 'Fresco 4.0.0 feature',
    summary:
      'Find and export precisely the interviews you need, even when a large study spans many pages of results.',
    details: [
      'Filter server-side by protocol, date, progress, network size, export status, or participant identifier across the complete dataset.',
      'Select every interview matching the active filters, not only the rows currently visible on screen.',
      'Export all, completed, or unexported interviews within the filtered result set while leaving unrelated records untouched.',
    ],
    href: `${documentationRoot}/collect-data/fresco/using-fresco#finding-and-filtering-interviews`,
    motif: 'advanced-export-filtering',
  },
  {
    group: 'fresco',
    shortName: 'Secure data API',
    name: 'Secure Interview Data API',
    tag: 'Fresco 4.0.0 feature',
    summary:
      'Connect analysis tools directly to a Fresco deployment through a versioned, read-only JSON API.',
    details: [
      'Keep the API disabled until it is needed, then create bearer tokens from the authenticated dashboard.',
      'List and retrieve interview networks and protocol metadata without exposing any endpoint that can modify study data.',
      'Revoke tokens, review when each token was last used, and build repeatable R, Python, dashboard, or reporting workflows.',
    ],
    href: `${documentationRoot}/analyze-data/fresco-api`,
    motif: 'secure-data-api',
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
    color: 'neon-coral',
    icon: '/images/summer-2026/interviewer-icon.svg',
  },
  {
    title: 'Deploy Fresco 4.0.0',
    category: 'Collect remotely',
    description:
      'Set up the multi-user platform for remote self-administered studies, centralized data management, and research teams.',
    detail: 'deployment guide',
    href: `${documentationRoot}/collect-data/fresco/guide`,
    color: 'slate-blue',
    icon: '/images/summer-2026/fresco-icon.png',
  },
  {
    title: 'Explore the docs',
    category: 'Learn the workflow',
    description:
      'Follow task-focused guidance for choosing tools, designing protocols, collecting data, and understanding every interface.',
    detail: 'latest interfaces & features',
    href: documentationRoot,
    color: 'sea-serpent',
    icon: '/images/icons/docs.png',
  },
] as const;
