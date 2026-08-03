export type ClassicDownloadApp = 'architect' | 'interviewer';
export type ClassicDownloadPlatform =
  | 'apple-silicon'
  | 'apple-intel'
  | 'windows';

export type ClassicDownloadAsset = {
  name: string;
  browserDownloadUrl: string;
};

export type ClassicDownloadDefinition = {
  app: ClassicDownloadApp;
  platform: ClassicDownloadPlatform;
  repository: 'Architect' | 'Interviewer';
  description: string;
  matches: (name: string) => boolean;
};

export const CLASSIC_DOWNLOAD_PATH_PREFIX = '/downloads/classic';

const classicDownloadDefinitions = [
  {
    app: 'architect',
    platform: 'apple-silicon',
    repository: 'Architect',
    description: 'Architect Apple Silicon DMG',
    matches: (name) => name.endsWith('-mac-arm64.dmg'),
  },
  {
    app: 'architect',
    platform: 'apple-intel',
    repository: 'Architect',
    description: 'Architect Apple Intel DMG',
    matches: (name) => name.endsWith('-mac-x64.dmg'),
  },
  {
    app: 'architect',
    platform: 'windows',
    repository: 'Architect',
    description: 'Architect Windows installer',
    matches: (name) => name.endsWith('-win-x64.exe'),
  },
  {
    app: 'interviewer',
    platform: 'apple-silicon',
    repository: 'Interviewer',
    description: 'Interviewer Apple Silicon DMG',
    matches: (name) => name.endsWith('-arm64.dmg'),
  },
  {
    app: 'interviewer',
    platform: 'apple-intel',
    repository: 'Interviewer',
    description: 'Interviewer Apple Intel DMG',
    matches: (name) => name.endsWith('.dmg') && !name.endsWith('-arm64.dmg'),
  },
  {
    app: 'interviewer',
    platform: 'windows',
    repository: 'Interviewer',
    description: 'Interviewer Windows installer',
    matches: (name) => name.endsWith('.exe'),
  },
] satisfies readonly ClassicDownloadDefinition[];

export function getClassicDownloadDefinition(app: string, platform: string) {
  return classicDownloadDefinitions.find(
    (definition) => definition.app === app && definition.platform === platform,
  );
}

export function getClassicDownloadPath(
  app: ClassicDownloadApp,
  platform: ClassicDownloadPlatform,
  version: string,
) {
  return `${CLASSIC_DOWNLOAD_PATH_PREFIX}/${app}/${version}/${platform}`;
}

export function getClassicReleaseTagUrl(
  repository: ClassicDownloadDefinition['repository'],
  version: string,
) {
  return `https://github.com/complexdatacollective/${repository}/releases/tag/v${version}`;
}

export function getClassicDownloadAssetUrl(
  definition: ClassicDownloadDefinition,
  assets: readonly ClassicDownloadAsset[],
) {
  const matchingAssets = assets.filter(({ name }) => definition.matches(name));

  if (matchingAssets.length !== 1) {
    throw new Error(
      `Expected one ${definition.description} asset for Classic ${definition.app} (${definition.platform}); found ${matchingAssets.length}.`,
    );
  }

  return matchingAssets[0]!.browserDownloadUrl;
}
