const DOCS_BASE_URL = 'https://documentation.networkcanvas.com/en';

export const interfaceDocumentationUrl = (slug: string) =>
  `${DOCS_BASE_URL}/design-protocols/interface-documentation/${slug}/`;

export const documentationLinks = {
  home: DOCS_BASE_URL,
  skipLogic: `${DOCS_BASE_URL}/design-protocols/key-concepts/skip-logic/`,
  networkFiltering: `${DOCS_BASE_URL}/design-protocols/key-concepts/network-filtering/`,
  resources: `${DOCS_BASE_URL}/design-protocols/key-concepts/resources/`,
  supportedResourceTypes: `${DOCS_BASE_URL}/design-protocols/key-concepts/resources/#supported-resource-types`,
  inputControls: `${DOCS_BASE_URL}/design-protocols/key-concepts/input-controls/`,
  variableNaming: `${DOCS_BASE_URL}/design-protocols/key-concepts/variables/#variable-naming-best-practices`,
  geospatialInterface: interfaceDocumentationUrl('geospatial'),
  protocolSchema: `${DOCS_BASE_URL}/get-started/advanced-topics/protocol-schema-information/`,
  protocolGallery: `${DOCS_BASE_URL}/design-protocols/protocol-gallery/`,
} as const;
