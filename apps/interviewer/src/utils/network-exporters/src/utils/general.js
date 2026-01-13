const { first } = require('lodash');
const sanitizeFilename = require('sanitize-filename');
const { dialog, shell, BrowserWindow } = require('electron');
const fse = require('fs-extra');
const { ExportError, ErrorMessages } = require('../errors/ExportError');
const {
  caseProperty,
  sessionProperty,
  protocolProperty,
  entityAttributesProperty,
  sessionExportTimeProperty,
  codebookHashProperty,
} = require('./reservedAttributes');

const verifySessionVariables = (sessionVariables) => {
  if (
    !sessionVariables[caseProperty]
    || !sessionVariables[sessionProperty]
    || !sessionVariables[protocolProperty]
    || !sessionVariables[sessionExportTimeProperty]
    || !sessionVariables[codebookHashProperty]
  ) {
    throw new ExportError(ErrorMessages.MissingParameters);
  }

  return true;
};

const getEntityAttributes = (entity) => (entity && entity[entityAttributesProperty]) || {};

const escapeFilePart = (part) => part.replace(/\W/g, '');

const sleep = (time = 2000) => (passThrough) => (
  new Promise((resolve) => setTimeout(() => resolve(passThrough), time))
);

const makeFilename = (prefix, entityType, exportFormat, extension) => {
  let name = prefix;
  if (extension !== `.${exportFormat}`) {
    name += name ? '_' : '';
    name += exportFormat;
  }
  if (entityType) {
    name += `_${escapeFilePart(entityType)}`;
  }
  return `${name}${extension}`;
};

const extensions = {
  graphml: '.graphml',
  csv: '.csv',
};

const getFileExtension = (formatterType) => {
  switch (formatterType) {
    case 'graphml':
      return extensions.graphml;
    case 'adjacencyMatrix':
    case 'edgeList':
    case 'attributeList':
    case 'ego':
      return extensions.csv;
    default:
      return null;
  }
};

const getFilePrefix = (session, protocol, unifyNetworks) => {
  if (unifyNetworks) {
    return sanitizeFilename(protocol.name);
  }

  return `${sanitizeFilename(session.sessionVariables[caseProperty])}_${session.sessionVariables[sessionProperty]}`;
};

const extensionPattern = new RegExp(`${Object.values(extensions).join('|')}$`);

const handlePlatformSaveDialog = (zipLocation, filename) => new Promise((resolve, reject) => {
  if (!zipLocation) {
    reject();
    return;
  }

  const browserWindow = first(BrowserWindow.getAllWindows());

  dialog.showSaveDialog(
    browserWindow,
    {
      filters: [{ name: 'zip', extensions: ['zip'] }],
      defaultPath: filename,
    },
  )
    .then(({ canceled, filePath }) => {
      if (canceled) {
        resolve(true);
        return;
      }

      fse.copy(zipLocation, filePath)
        .then(() => {
          shell.showItemInFolder(filePath);
          resolve();
        })
        .catch(reject);
    });
});

class ObservableValue {
  constructor(value) {
    this.valueInternal = value;
    this.valueListener = () => { };
  }

  set value(val) {
    this.valueInternal = val;
    this.valueListener(val);
  }

  get value() {
    return this.valueInternal;
  }

  registerListener(listener) {
    this.valueListener = listener;
  }
}

module.exports = {
  escapeFilePart,
  extensionPattern,
  extensions,
  getEntityAttributes,
  getFileExtension,
  getFilePrefix,
  makeFilename,
  verifySessionVariables,
  sleep,
  handlePlatformSaveDialog,
  ObservableValue,
};
