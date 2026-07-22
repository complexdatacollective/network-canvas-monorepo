const documentationRoot = 'https://documentation.networkcanvas.com/en';

export const interfaceFeatures = [
  {
    shortName: 'Geospatial',
    name: 'Geospatial interface',
    tag: 'New interface',
    description:
      'Presents a configurable map upon which participants may assign alters to locations specified in GeoJSON shape files — census tracts, ZIP codes, neighborhoods, or any boundaries you choose.',
    href: `${documentationRoot}/design-protocols/interface-documentation/geospatial`,
    motif: 'geospatial',
  },
  {
    shortName: 'Anonymisation',
    name: 'Anonymisation interface',
    tag: 'New interface',
    description:
      'Allows for participant-centered local encryption of interview data, to increase trust and facilitate disclosure in sensitive settings.',
    href: `${documentationRoot}/design-protocols/interface-documentation/anonymisation`,
    motif: 'anonymisation',
  },
  {
    shortName: 'One-to-many dyad census',
    name: 'One-to-many dyad census interface',
    tag: 'New interface',
    description:
      'Offers a variation on the dyad census that allows participants to create edges between one alter and multiple other alters at once.',
    href: `${documentationRoot}/design-protocols/interface-documentation/one-to-many-dyad-census`,
    motif: 'one-to-many',
  },
  {
    shortName: 'Family pedigree',
    name: 'Family pedigree interface',
    tag: 'New interface',
    description:
      'Allows participants to visually create complex and fully inclusive family trees.',
    href: `${documentationRoot}/design-protocols/interface-documentation/family-pedigree`,
    motif: 'family-pedigree',
  },
  {
    shortName: 'Narrative pedigree',
    name: 'Narrative pedigree interface',
    tag: 'New interface',
    description:
      'Displays data collected on the Family Pedigree stage, and utilizes standard pedigree notation to depict inheritance information for one or more health conditions.',
    href: `${documentationRoot}/design-protocols/interface-documentation/narrative-pedigree`,
    motif: 'narrative-pedigree',
  },
  {
    shortName: 'Network composer',
    name: 'Network composer interface',
    tag: 'New interface',
    description:
      'Provides researchers a single screen for constructing a participant’s whole personal network in one place — creating alters, adding attributes, drawing multiple edge types, and repositioning network nodes.',
    href: `${documentationRoot}/design-protocols/interface-documentation/network-composer`,
    motif: 'network-composer',
  },
  {
    shortName: 'Validation & skip logic',
    name: 'Richer validation & skip logic',
    tag: 'New feature',
    description:
      'Compare one answer against another variable, and use new “contains” / “does not contain” conditions in your validation and skip logic.',
    href: `${documentationRoot}/get-started/advanced-topics/protocol-schema-information#whats-new-in-schema-8`,
    motif: 'validation',
  },
  {
    shortName: 'Node shapes & form hints',
    name: 'Configurable node shapes & form hints',
    tag: 'New feature',
    description:
      'Choose from multiple node shape options, and add markdown-formatted hints to forms — additional context that helps guide understanding for participants.',
    href: `${documentationRoot}/get-started/advanced-topics/protocol-schema-information#whats-new-in-schema-8`,
    motif: 'node-shapes',
  },
  {
    shortName: 'Protocol templates',
    name: 'Protocol templates',
    tag: 'Architect feature',
    description:
      'In Architect, explore and adapt a selection of domain-specific protocol templates informed by current literature.',
    href: `${documentationRoot}/design-protocols/getting-started#your-protocol-library`,
    motif: 'templates',
  },
  {
    shortName: 'Synthetic data',
    name: 'Synthetic interview data',
    tag: 'New feature',
    description:
      'Instantaneously create synthetic interview data for testing your protocol before going into the field.',
    href: `${documentationRoot}/collect-data/fresco/using-fresco#generating-synthetic-test-data`,
    motif: 'synthetic-data',
  },
] as const;

export type InterfaceMotif = (typeof interfaceFeatures)[number]['motif'];

export const compatibilityRows = [
  {
    group: 'Former generation',
    app: 'Interviewer Classic',
    version: '6.6.0',
    platform: 'Desktop & tablet',
    schema7: 'native',
    schema8: 'unsupported',
    note: 'Interviewer Classic runs Schema 7 natively, but cannot open Schema 8 protocols. Continue using it for in-progress Schema 7 studies — it remains supported with bug fixes.',
  },
  {
    group: 'Former generation',
    app: 'Architect Classic',
    version: '6.6.0',
    platform: 'Desktop',
    schema7: 'native',
    schema8: 'unsupported',
    note: 'Architect Classic continues to produce Schema 7 protocols, in maintenance mode. Use it only if you need to keep running older versions of Interviewer (e.g. 6.6.0).',
  },
  {
    group: 'Former generation',
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
    detail: 'architect.networkcanvas.com',
    href: 'https://architect.networkcanvas.com/',
    color: 'green',
  },
  {
    title: 'Open Interviewer',
    detail: 'interviewer.networkcanvas.com',
    href: 'https://interviewer.networkcanvas.com/',
    color: 'cyan',
  },
  {
    title: 'Deploy Fresco 4.0.0',
    detail: 'deployment guide',
    href: `${documentationRoot}/collect-data/fresco/guide`,
    color: 'pink',
  },
  {
    title: 'Explore the docs',
    detail: 'latest interfaces & features',
    href: documentationRoot,
    color: 'mustard',
  },
] as const;
