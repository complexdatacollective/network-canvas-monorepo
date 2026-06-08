/* eslint-disable global-require */
const environments = require('./environments');

let hasWindow = false;
if (typeof window !== 'undefined' && window) {
  hasWindow = true;
}

let isElectron;
if (hasWindow) {
  isElectron = () => !!window.electron || !!window.require;
} else {
  // if no window object assume we are in nodejs environment (Electron main)
  isElectron = () => true;
}

let isCordova;
if (hasWindow) {
  isCordova = () => !!window.cordova;
} else {
  // if no window object assume we are in nodejs environment (Electron main)
  isCordova = () => false;
}

const getEnvironment = () => {
  if (isCordova()) return environments.CORDOVA;
  if (isElectron()) return environments.ELECTRON;
  return environments.WEB;
};

const inEnvironment =
  (tree) =>
  (...args) =>
    tree(getEnvironment())(...args);

module.exports = {
  inEnvironment,
  getEnvironment,
  isCordova,
  isElectron,
};
