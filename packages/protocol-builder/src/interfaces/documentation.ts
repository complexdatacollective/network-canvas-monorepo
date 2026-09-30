import type { StageType } from '@codaco/protocol-validation';

/** The documentation site every Network Canvas host points a researcher at. */
export const DOCS_BASE_URL = 'https://documentation.networkcanvas.com/en';

/** Where an interface is documented. */
export const interfaceDocumentationUrl = (slug: string): string =>
  `${DOCS_BASE_URL}/design-protocols/interface-documentation/${slug}/`;

/**
 * Where each interface is documented, keyed by the stage type it collects.
 * Typed total, so an interface added to the schema cannot reach a researcher
 * with nothing to read. The slugs are the documentation site's, not
 * derivations of the stage type: `AlterForm` is filed under `per-alter-form`.
 */
const INTERFACE_DOCUMENTATION_SLUGS: Record<StageType, string> = {
  AlterEdgeForm: 'per-alter-edge-form',
  AlterForm: 'per-alter-form',
  Anonymisation: 'anonymisation',
  CategoricalBin: 'categorical-bin',
  DyadCensus: 'dyad-census',
  EgoForm: 'ego-form',
  FamilyPedigree: 'family-pedigree',
  Geospatial: 'geospatial',
  Information: 'information',
  NameGenerator: 'name-generator-using-forms',
  NameGeneratorQuickAdd: 'name-generator-using-quick-add',
  NameGeneratorRoster: 'name-generator-roster',
  Narrative: 'narrative',
  NarrativePedigree: 'narrative-pedigree',
  NetworkComposer: 'network-composer',
  OneToManyDyadCensus: 'one-to-many-dyad-census',
  OrdinalBin: 'ordinal-bin',
  Sociogram: 'sociogram',
  TieStrengthCensus: 'tie-strength-census',
};

/** Where the interface a stage of this type is edited by is documented. */
export const stageTypeDocumentationUrl = (stageType: StageType): string =>
  interfaceDocumentationUrl(INTERFACE_DOCUMENTATION_SLUGS[stageType]);

/** Key concepts a stage editor's own sections link to. */
export const protocolAuthoringLinks = {
  skipLogic: `${DOCS_BASE_URL}/design-protocols/key-concepts/skip-logic/`,
  networkFiltering: `${DOCS_BASE_URL}/design-protocols/key-concepts/network-filtering/`,
  responsiveSvgBackgrounds: `${DOCS_BASE_URL}/design-protocols/key-concepts/responsive-svg-backgrounds/`,
  inputControls: `${DOCS_BASE_URL}/design-protocols/key-concepts/input-controls/`,
  attributeNaming: `${DOCS_BASE_URL}/design-protocols/key-concepts/variables/#variable-naming-best-practices`,
} as const;
