#!/usr/bin/env node
// Builds a classic app release candidate for the release-test walkers.
//
//   desktop  electron-vite build + electron-builder --dir for the host
//            platform and architecture, unsigned (CSC_IDENTITY_AUTO_DISCOVERY
//            off) — the same packaging the release job signs and notarizes
//   ios      Interviewer only: the Capacitor web build, `cap sync ios`, and a
//            Debug simulator build of the Xcode project
//   android  Interviewer only: the Capacitor web build, `cap sync android`,
//            and a debug APK (debug so the WebView is inspectable)
//
// It deliberately does not run `version:sync`: the walkers check that the
// native projects' version stamps already match package.json, which is what
// ships.
//
// Usage: node scripts/release-test/classic-release-build.mjs \
//          --app architect|interviewer --platform desktop|ios|android
// The final stdout line is JSON: { app, platform, artifact }.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { findPackagedBinary, repoRoot } from './classic-release-lib.mjs';

const { values: args } = parseArgs({
  options: {
    app: { type: 'string' },
    platform: { type: 'string', default: 'desktop' },
  },
});

const APPS = {
  architect: {
    dir: 'apps/architect-classic',
    builderConfig: 'electron-builder.config.js',
  },
  interviewer: {
    dir: 'apps/interviewer-classic',
    builderConfig: 'electron-builder.config.cjs',
  },
};
const app = APPS[args.app];
if (!app) {
  console.error('--app must be architect or interviewer');
  process.exit(2);
}
if (args.platform !== 'desktop' && args.app !== 'interviewer') {
  console.error('only Interviewer has mobile builds');
  process.exit(2);
}
const appDir = path.join(repoRoot, app.dir);

function run(command, commandArgs, { cwd = appDir, env } = {}) {
  console.log(`$ ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    console.error(`${command} exited with ${result.status ?? result.signal}`);
    process.exit(1);
  }
}

// Homebrew's JDK and command-line tools, when the environment names neither.
function androidEnv() {
  const env = {};
  const jdk = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
  if (!process.env.JAVA_HOME && fs.existsSync(jdk)) env.JAVA_HOME = jdk;
  const sdk = '/opt/homebrew/share/android-commandlinetools';
  if (!process.env.ANDROID_HOME && fs.existsSync(sdk)) {
    env.ANDROID_HOME = sdk;
    env.ANDROID_SDK_ROOT = sdk;
  }
  return env;
}

let artifact;
if (args.platform === 'desktop') {
  fs.rmSync(path.join(appDir, 'release-builds'), {
    recursive: true,
    force: true,
  });
  run('pnpm', ['exec', 'electron-vite', 'build']);
  const platformFlag = { darwin: '--mac', linux: '--linux', win32: '--win' }[
    process.platform
  ];
  run(
    'pnpm',
    [
      'exec',
      'electron-builder',
      platformFlag,
      `--${process.arch}`,
      '--dir',
      '--config',
      app.builderConfig,
    ],
    { env: { CSC_IDENTITY_AUTO_DISCOVERY: 'false' } },
  );
  artifact = findPackagedBinary(appDir);
} else {
  run('pnpm', ['exec', 'vite', 'build', '--config', 'vite.web.config.js']);
  run('pnpm', ['exec', 'cap', 'sync', args.platform]);
  if (args.platform === 'ios') {
    const derivedData = path.join(appDir, 'release-builds', 'ios-derived-data');
    run('xcodebuild', [
      '-project',
      'ios/App/App.xcodeproj',
      '-scheme',
      'App',
      '-configuration',
      'Debug',
      '-sdk',
      'iphonesimulator',
      '-destination',
      'generic/platform=iOS Simulator',
      '-derivedDataPath',
      derivedData,
      'build',
    ]);
    artifact = path.join(
      derivedData,
      'Build/Products/Debug-iphonesimulator/App.app',
    );
  } else if (args.platform === 'android') {
    run('./gradlew', ['assembleDebug'], {
      cwd: path.join(appDir, 'android'),
      env: androidEnv(),
    });
    artifact = path.join(
      appDir,
      'android/app/build/outputs/apk/debug/app-debug.apk',
    );
  } else {
    console.error(`unknown --platform ${args.platform}`);
    process.exit(2);
  }
}

if (!fs.existsSync(artifact)) {
  console.error(`build finished but ${artifact} is missing`);
  process.exit(1);
}
console.log(
  JSON.stringify({ app: args.app, platform: args.platform, artifact }),
);
