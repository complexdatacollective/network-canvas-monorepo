import { useTranslations } from 'next-intl';

import type { AccentColor } from './summerUpdateColors';

const documentationRoot = 'https://documentation.networkcanvas.com/en';

export type FeatureGroup =
  | 'interfaces'
  | 'schema'
  | 'architect'
  | 'interviewer'
  | 'fresco';

export type InterfaceMotif =
  | 'geospatial'
  | 'anonymisation'
  | 'one-to-many'
  | 'family-pedigree'
  | 'narrative-pedigree'
  | 'network-composer'
  | 'validation'
  | 'enhanced-skip-logic'
  | 'node-shapes'
  | 'form-hints'
  | 'templates'
  | 'responsive-sociogram-backgrounds'
  | 'synthetic-data'
  | 'encryption-at-rest'
  | 'authorisation-checks'
  | 'multi-user'
  | 'advanced-export-filtering'
  | 'secure-data-api';

type ScreenshotType =
  | 'Geospatial'
  | 'Anonymisation'
  | 'OneToManyDyadCensus'
  | 'FamilyPedigree'
  | 'NarrativePedigree'
  | 'NetworkComposer';

type FeatureDefinition = {
  id: string;
  group: FeatureGroup;
  href: string;
  motif: InterfaceMotif;
  screenshotType?: ScreenshotType;
};

const featureDefinitions = [
  {
    id: 'geospatial',
    group: 'interfaces',
    href: `${documentationRoot}/design-protocols/interface-documentation/geospatial`,
    motif: 'geospatial',
    screenshotType: 'Geospatial',
  },
  {
    id: 'anonymisation',
    group: 'interfaces',
    href: `${documentationRoot}/design-protocols/interface-documentation/anonymisation`,
    motif: 'anonymisation',
    screenshotType: 'Anonymisation',
  },
  {
    id: 'oneToMany',
    group: 'interfaces',
    href: `${documentationRoot}/design-protocols/interface-documentation/one-to-many-dyad-census`,
    motif: 'one-to-many',
    screenshotType: 'OneToManyDyadCensus',
  },
  {
    id: 'familyPedigree',
    group: 'interfaces',
    href: `${documentationRoot}/design-protocols/interface-documentation/family-pedigree`,
    motif: 'family-pedigree',
    screenshotType: 'FamilyPedigree',
  },
  {
    id: 'narrativePedigree',
    group: 'interfaces',
    href: `${documentationRoot}/design-protocols/interface-documentation/narrative-pedigree`,
    motif: 'narrative-pedigree',
    screenshotType: 'NarrativePedigree',
  },
  {
    id: 'networkComposer',
    group: 'interfaces',
    href: `${documentationRoot}/design-protocols/interface-documentation/network-composer`,
    motif: 'network-composer',
    screenshotType: 'NetworkComposer',
  },
  {
    id: 'validation',
    group: 'schema',
    href: `${documentationRoot}/design-protocols/key-concepts/field-validation`,
    motif: 'validation',
  },
  {
    id: 'enhancedSkipLogic',
    group: 'schema',
    href: `${documentationRoot}/design-protocols/key-concepts/skip-logic`,
    motif: 'enhanced-skip-logic',
  },
  {
    id: 'nodeShapes',
    group: 'schema',
    href: `${documentationRoot}/design-protocols/key-concepts/codebook#mapping-a-node-variable-to-shape`,
    motif: 'node-shapes',
  },
  {
    id: 'formHints',
    group: 'schema',
    href: `${documentationRoot}/get-started/protocol-schema-information#whats-new-in-schema-8`,
    motif: 'form-hints',
  },
  {
    id: 'protocolTemplates',
    group: 'architect',
    href: `${documentationRoot}/design-protocols/getting-started#your-protocol-library`,
    motif: 'templates',
  },
  {
    id: 'responsiveSvg',
    group: 'architect',
    href: `${documentationRoot}/design-protocols/responsive-svg-backgrounds`,
    motif: 'responsive-sociogram-backgrounds',
  },
  {
    id: 'syntheticData',
    group: 'interviewer',
    href: `${documentationRoot}/collect-data/interviewer/using-interviewer#settings`,
    motif: 'synthetic-data',
  },
  {
    id: 'encryptionAtRest',
    group: 'interviewer',
    href: `${documentationRoot}/collect-data/interviewer/using-interviewer#security-and-locking`,
    motif: 'encryption-at-rest',
  },
  {
    id: 'authorisationChecks',
    group: 'interviewer',
    href: `${documentationRoot}/collect-data/interviewer/using-interviewer#locking-and-unlocking`,
    motif: 'authorisation-checks',
  },
  {
    id: 'multiUser',
    group: 'fresco',
    href: `${documentationRoot}/collect-data/fresco/it-faq#what-authentication-does-fresco-use`,
    motif: 'multi-user',
  },
  {
    id: 'advancedExportFiltering',
    group: 'fresco',
    href: `${documentationRoot}/collect-data/fresco/using-fresco#finding-and-filtering-interviews`,
    motif: 'advanced-export-filtering',
  },
  {
    id: 'secureDataApi',
    group: 'fresco',
    href: `${documentationRoot}/analyze-data/fresco-api`,
    motif: 'secure-data-api',
  },
] as const satisfies readonly FeatureDefinition[];

export type CompatibilityStatus = 'migrates' | 'native' | 'unsupported';

type CompatibilityDefinition = {
  id: string;
  app: string;
  version?: string;
  schema7: CompatibilityStatus;
  schema8: CompatibilityStatus;
};

const compatibilityDefinitions = [
  {
    id: 'interviewerClassic',
    app: 'Interviewer Classic',
    version: '6.6.0',
    schema7: 'native',
    schema8: 'unsupported',
  },
  {
    id: 'architectClassic',
    app: 'Architect Classic',
    version: '6.6.0',
    schema7: 'native',
    schema8: 'unsupported',
  },
  {
    id: 'frescoClassic',
    app: 'Fresco',
    version: '3.1.2',
    schema7: 'native',
    schema8: 'unsupported',
  },
  {
    id: 'interviewer',
    app: 'Interviewer',
    schema7: 'migrates',
    schema8: 'native',
  },
  {
    id: 'architect',
    app: 'Architect',
    schema7: 'migrates',
    schema8: 'native',
  },
  {
    id: 'fresco',
    app: 'Fresco',
    version: '4.0.0',
    schema7: 'migrates',
    schema8: 'native',
  },
] as const satisfies readonly CompatibilityDefinition[];

export type Destination = {
  title: string;
  category: string;
  description: string;
  detail: string;
  href: string;
  color: AccentColor;
  icon: string;
};

const destinationDefinitions = [
  {
    id: 'architect',
    href: 'https://architect.networkcanvas.com/',
    color: 'sea-green',
    icon: '/images/summer-2026/architect-icon.png',
  },
  {
    id: 'interviewer',
    href: 'https://interviewer.networkcanvas.com/',
    color: 'neon-coral',
    icon: '/images/summer-2026/interviewer-icon.svg',
  },
  {
    id: 'fresco',
    href: `${documentationRoot}/collect-data/fresco/guide`,
    color: 'slate-blue',
    icon: '/images/summer-2026/fresco-icon.png',
  },
  {
    id: 'documentation',
    href: documentationRoot,
    color: 'sea-serpent',
    icon: '/images/icons/docs.png',
  },
] as const;

export function useSummerUpdateContent() {
  const t = useTranslations('SummerUpdate');

  const interfaceFeatures = featureDefinitions.map((feature) => ({
    ...feature,
    shortName: t(`features.${feature.id}.shortName`),
    name: t(`features.${feature.id}.name`),
    summary: t(`features.${feature.id}.summary`),
    details: [
      t(`features.${feature.id}.details.0`),
      t(`features.${feature.id}.details.1`),
      t(`features.${feature.id}.details.2`),
    ],
  }));

  const firstNewGenerationIndex = compatibilityDefinitions.findIndex(
    ({ schema7 }) => schema7 === 'migrates',
  );
  const compatibilityRows = compatibilityDefinitions.map((row, index) => ({
    ...row,
    version: 'version' in row ? row.version : undefined,
    group: t(
      index < firstNewGenerationIndex
        ? 'compatibility.groups.classic'
        : 'compatibility.groups.new',
    ),
    platform: t(`compatibility.rows.${row.id}.platform`),
    note: t(`compatibility.rows.${row.id}.note`),
  }));

  const destinationLinks: Destination[] = destinationDefinitions.map(
    (destination) => ({
      ...destination,
      title: t(`destinations.${destination.id}.title`),
      category: t(`destinations.${destination.id}.category`),
      description: t(`destinations.${destination.id}.description`),
      detail: t(`destinations.${destination.id}.detail`),
    }),
  );

  return { compatibilityRows, destinationLinks, interfaceFeatures };
}
