#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import xcode from 'xcode';
// Deep-import the file model; xcode's top-level `addResourceFile` blows up on
// Capacitor projects because it assumes a Cordova-style "Resources" group.
import pbxFile from 'xcode/lib/pbxFile.js';

const APP_ICON_NAME = 'AppIcon.icon';
const ICON_FILE_TYPE = 'folder.iconcomposer.icon';
const DEFAULT_SOURCE = 'build-resources/icon.icon';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const destPath = path.join(appRoot, 'ios', 'App', 'App', APP_ICON_NAME);
const pbxprojPath = path.join(
  appRoot,
  'ios',
  'App',
  'App.xcodeproj',
  'project.pbxproj',
);

// No iOS project — silently no-op. Lets `capacitor:sync:after` fire harmlessly
// during Android-only syncs or before `cap add ios` has been run.
if (!(await fileExists(pbxprojPath))) {
  process.exit(0);
}

const srcPath = path.resolve(appRoot, process.argv[2] ?? DEFAULT_SOURCE);
const srcStat = await fs.stat(srcPath).catch(() => null);
if (!srcStat?.isDirectory()) {
  console.error(`source must be a .icon bundle directory: ${srcPath}`);
  process.exit(1);
}

await fs.rm(destPath, { recursive: true, force: true });
await fs.cp(srcPath, destPath, { recursive: true });
console.log(
  `copied ${path.relative(appRoot, srcPath)} → ${path.relative(appRoot, destPath)}`,
);

const project = xcode.project(pbxprojPath);
await new Promise((resolve, reject) => {
  project.parse((err) => (err ? reject(err) : resolve()));
});

if (project.hasFile(APP_ICON_NAME)) {
  console.log(`pbxproj already references ${APP_ICON_NAME} — no changes`);
  process.exit(0);
}

const appGroupKey =
  project.findPBXGroupKey({ path: 'App' }) ??
  project.findPBXGroupKey({ name: 'App' });
if (!appGroupKey) {
  console.error('could not locate the App group in pbxproj');
  process.exit(1);
}

const file = new pbxFile(APP_ICON_NAME, { lastKnownFileType: ICON_FILE_TYPE });
file.uuid = project.generateUuid();
file.fileRef = project.generateUuid();

project.addToPbxBuildFileSection(file);
project.addToPbxResourcesBuildPhase(file);
project.addToPbxFileReferenceSection(file);
project.addToPbxGroup(file, appGroupKey);

await fs.writeFile(pbxprojPath, project.writeSync());
console.log(`added ${APP_ICON_NAME} to App target (Resources)`);

async function fileExists(p) {
  return fs
    .access(p)
    .then(() => true)
    .catch(() => false);
}
