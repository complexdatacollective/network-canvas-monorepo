import {
  DOCS_BASE_URL,
  interfaceDocumentationUrl,
  protocolAuthoringLinks,
} from '@codaco/protocol-builder/interfaces/documentation';

export const documentationLinks = {
  home: DOCS_BASE_URL,
  communityForum: 'https://community.networkcanvas.com/',
  skipLogic: protocolAuthoringLinks.skipLogic,
  networkFiltering: protocolAuthoringLinks.networkFiltering,
  resources: `${DOCS_BASE_URL}/design-protocols/key-concepts/resources/`,
  supportedResourceTypes: `${DOCS_BASE_URL}/design-protocols/key-concepts/resources/#supported-resource-types`,
  responsiveSvgBackgrounds: `${DOCS_BASE_URL}/design-protocols/tutorials/responsive-svg-backgrounds/`,
  inputControls: `${DOCS_BASE_URL}/design-protocols/key-concepts/input-controls/`,
  variableNaming: protocolAuthoringLinks.attributeNaming,
  geospatialInterface: interfaceDocumentationUrl('geospatial'),
  protocolSchema: `${DOCS_BASE_URL}/get-started/advanced-topics/protocol-schema-information/`,
  savingAndBackingUp: `${DOCS_BASE_URL}/design-protocols/saving-and-backing-up/`,
  whichTranslationParticipantsSee: `${DOCS_BASE_URL}/design-protocols/tutorials/translating-your-protocol/#the-default-language-and-which-translation-participants-see`,
} as const;
