/**
 * Electron Builder configuration for Network Canvas Interviewer v7.
 * @see https://www.electron.build/configuration/configuration
 */
module.exports = {
  appId: 'org.complexdatacollective.networkcanvas.interviewer',
  productName: 'Network Canvas Interviewer v7',
  copyright: `Copyright © ${new Date().getFullYear()} Complex Data Collective`,
  directories: {
    buildResources: 'build-resources',
    output: 'release-builds',
  },
  files: [
    'dist-electron/**/*',
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
      role: 'Editor',
    },
  ],
  mac: {
    category: 'public.app-category.education',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },
    ],
    notarize: false,
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  linux: {
    category: 'Education',
    target: ['AppImage', 'deb'],
  },
};
