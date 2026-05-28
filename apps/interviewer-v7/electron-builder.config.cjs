/**
 * Electron Builder configuration for Network Canvas Interviewer v7.
 * @see https://www.electron.build/configuration/configuration
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
  appId: 'Network-Canvas-Interviewer-7',
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
    // SQLCipher binding and its loader deps. Exclude electron-builder's
    // automatic production-dependency tree, then re-include just those.
    '!node_modules/**/*',
    'node_modules/better-sqlite3-multiple-ciphers/**/*',
    'node_modules/bindings/**/*',
    'node_modules/file-uri-to-path/**/*',
    '!**/*.{map,ts,md}',
    '!**/test/**',
    '!**/__tests__/**',
  ],
  asar: true,
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
