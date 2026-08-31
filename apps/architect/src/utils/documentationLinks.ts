import {
  DOCS_BASE_URL,
  interfaceDocumentationUrl,
  protocolAuthoringLinks,
} from '@codaco/protocol-builder/interfaces/documentation';

export { interfaceDocumentationUrl };

export const documentationLinks = {
  home: DOCS_BASE_URL,
  skipLogic: protocolAuthoringLinks.skipLogic,
  networkFiltering: `${DOCS_BASE_URL}/design-protocols/key-concepts/network-filtering/`,
  resources: `${DOCS_BASE_URL}/design-protocols/key-concepts/resources/`,
  supportedResourceTypes: `${DOCS_BASE_URL}/design-protocols/key-concepts/resources/#supported-resource-types`,
  responsiveSvgBackgrounds: `${DOCS_BASE_URL}/design-protocols/key-concepts/responsive-svg-backgrounds/`,
  inputControls: `${DOCS_BASE_URL}/design-protocols/key-concepts/input-controls/`,
  variableNaming: `${DOCS_BASE_URL}/design-protocols/key-concepts/variables/#variable-naming-best-practices`,
  geospatialInterface: interfaceDocumentationUrl('geospatial'),
  protocolSchema: `${DOCS_BASE_URL}/get-started/advanced-topics/protocol-schema-information/`,
  protocolGallery: `${DOCS_BASE_URL}/design-protocols/protocol-gallery/`,
  savingAndBackingUp: `${DOCS_BASE_URL}/design-protocols/saving-and-backing-up/`,
} as const;
