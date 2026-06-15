const fs = require('node:fs');
const path = require('node:path');

// The biometric-keystore unlock mode requires the keychain-access-groups
// entitlement (see build-resources/entitlements.mac.plist). That entitlement
// is restricted: AMFI will refuse to launch the signed app unless an embedded
// provisioning profile authorizes the access group. The profile is downloaded
// from the Apple Developer portal for App ID `Network-Canvas-Interviewer-8`
// (Keychain Sharing capability enabled) and dropped at the path below. When
// the file is absent the build still succeeds — producing an app whose
// biometric mode is unusable (-34018 on enrol) but PIN / passphrase / none
// still work and the app launches — so Windows / Linux builds and
// profile-less CI stay green.
const MAC_PROVISIONING_PROFILE = 'build-resources/embedded.provisionprofile';

/**
 * Electron Builder configuration for Network Canvas Interviewer v8.
 * @see https://www.electron.build/configuration/configuration
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
  appId: 'Network-Canvas-Interviewer-8',
  productName: 'Network Canvas Interviewer',
  copyright: `Copyright © ${new Date().getFullYear()} Complex Data Collective`,
  directories: {
    buildResources: 'build-resources',
    output: 'release-builds',
  },
  files: [
    'dist-electron/**/*',
    // The renderer and main process are fully bundled by electron-vite, so the
    // only node_modules the packaged app needs at runtime are the native
    // SQLCipher binding, the biometric-keystore native module, and their
    // loader deps. Exclude electron-builder's automatic production-dependency
    // tree, then re-include just those.
    '!node_modules/**/*',
    'node_modules/better-sqlite3-multiple-ciphers/package.json',
    'node_modules/better-sqlite3-multiple-ciphers/lib/**',
    'node_modules/better-sqlite3-multiple-ciphers/build/Release/better_sqlite3.node',
    'node_modules/bindings/**/*',
    'node_modules/file-uri-to-path/**/*',
    'node_modules/@codaco/biometric-keystore/package.json',
    'node_modules/@codaco/biometric-keystore/index.cjs',
    'node_modules/@codaco/biometric-keystore/*.node',
    '!**/*.{map,ts,md}',
    '!**/test/**',
    '!**/__tests__/**',
  ],
  asar: true,
  // .node binaries cannot be loaded from inside the asar archive; unpack the
  // native modules so dlopen() can find them on disk.
  asarUnpack: [
    'node_modules/better-sqlite3-multiple-ciphers/**/*.node',
    'node_modules/@codaco/biometric-keystore/*.node',
  ],
  fileAssociations: [
    {
      ext: 'netcanvas',
      name: 'Network Canvas Protocol',
      description: 'Network Canvas interview protocol',
      mimeType: 'application/x-netcanvas',
      role: 'Viewer',
    },
  ],
  mac: {
    category: 'public.app-category.education',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    icon: 'build-resources/icon.icon',
    entitlements: 'build-resources/entitlements.mac.plist',
    entitlementsInherit: 'build-resources/entitlements.mac.inherit.plist',
    ...(fs.existsSync(path.join(__dirname, MAC_PROVISIONING_PROFILE))
      ? { provisioningProfile: MAC_PROVISIONING_PROFILE }
      : {}),
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },
    ],
    notarize: Boolean(process.env.APPLE_API_KEY),
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  linux: {
    category: 'Education',
    target: ['AppImage', 'deb'],
  },
};
