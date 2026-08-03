import {
  getClassicDownloadAssetUrl,
  getClassicDownloadDefinition,
  getClassicDownloadPath,
  type ClassicDownloadApp,
  type ClassicDownloadPlatform,
} from '~/lib/classicDownloads';
import { documentationUrl } from '~/lib/siteUrls';

export type Workflow = 'design' | 'collect';
export type WebAppId = 'architect' | 'interviewer' | 'fresco';
export type ClassicAppId = 'architect-classic' | 'interviewer-classic';
export type PlatformId =
  | 'apple-silicon'
  | 'apple-intel'
  | 'windows'
  | 'linux'
  | 'android';

type AppAction = {
  labelKey:
    | 'apps.architect.actions.open'
    | 'apps.interviewer.actions.open'
    | 'apps.fresco.actions.sandbox'
    | 'apps.fresco.actions.deployment';
  href: string;
};

type BestForKey =
  | 'apps.architect.bestFor.newStudy'
  | 'apps.architect.bestFor.latestFeatures'
  | 'apps.architect.bestFor.interviewerOrFresco'
  | 'apps.architect.bestFor.upgradeClassic'
  | 'apps.interviewer.bestFor.inPerson'
  | 'apps.interviewer.bestFor.guided'
  | 'apps.interviewer.bestFor.researcherDevice'
  | 'apps.interviewer.bestFor.latestFeatures'
  | 'apps.fresco.bestFor.remoteBrowser'
  | 'apps.fresco.bestFor.centralManagement'
  | 'apps.fresco.bestFor.sharedDashboard'
  | 'apps.fresco.bestFor.selfHosted'
  | 'apps.architectClassic.bestFor.classicCompatibility'
  | 'apps.architectClassic.bestFor.editWithoutMigration'
  | 'apps.interviewerClassic.bestFor.schema7Study'
  | 'apps.interviewerClassic.bestFor.desktopTablet'
  | 'apps.interviewerClassic.bestFor.offlineCollection';

export type WebApp = {
  id: WebAppId;
  messageKey: 'architect' | 'interviewer' | 'fresco';
  workflow: Workflow;
  name: string;
  bestFor: readonly BestForKey[];
  actions: readonly AppAction[];
  treatment: 'featured' | 'fresco';
};

type PlatformLink = {
  id: PlatformId;
  labelKey:
    | 'platforms.appleSilicon'
    | 'platforms.appleIntel'
    | 'platforms.windows'
    | 'platforms.linux'
    | 'platforms.android';
  href: string;
};

export type ClassicApp = {
  id: ClassicAppId;
  messageKey: 'architectClassic' | 'interviewerClassic';
  workflow: Workflow;
  name: string;
  bestFor: readonly BestForKey[];
  version: string;
  platforms: readonly PlatformLink[];
  treatment: 'classic';
};

export type AppRecord = WebApp | ClassicApp;

export type ClassicRelease = {
  version: string;
  latestUrl: string;
  assets: readonly {
    name: string;
    browserDownloadUrl: string;
  }[];
};

function getReleaseAssetPath(
  release: ClassicRelease,
  app: ClassicDownloadApp,
  platform: ClassicDownloadPlatform,
) {
  const definition = getClassicDownloadDefinition(app, platform);
  if (!definition) {
    throw new Error(
      `Missing Classic download definition for ${app} (${platform}).`,
    );
  }

  void getClassicDownloadAssetUrl(definition, release.assets);

  return getClassicDownloadPath(app, platform, release.version);
}

export const GET_STARTED_PATH = '/get-started';

export const webDestinations = {
  architect: 'https://architect.networkcanvas.com/',
  interviewer: 'https://interviewer.networkcanvas.com/',
  frescoSandbox: 'https://fresco-sandbox.networkcanvas.com/',
  frescoSandboxGuide: documentationUrl('/en/collect-data/fresco/sandbox'),
  frescoDeployment: documentationUrl('/en/collect-data/fresco/guide'),
} as const;

export const documentationDestinations = {
  schemaVersions: documentationUrl(
    '/en/get-started/protocol-schema-information',
  ),
} as const;

export const webApps = [
  {
    id: 'architect',
    messageKey: 'architect',
    workflow: 'design',
    name: 'Architect',
    bestFor: [
      'apps.architect.bestFor.newStudy',
      'apps.architect.bestFor.latestFeatures',
      'apps.architect.bestFor.interviewerOrFresco',
      'apps.architect.bestFor.upgradeClassic',
    ],
    actions: [
      {
        labelKey: 'apps.architect.actions.open',
        href: webDestinations.architect,
      },
    ],
    treatment: 'featured',
  },
  {
    id: 'interviewer',
    messageKey: 'interviewer',
    workflow: 'collect',
    name: 'Interviewer',
    bestFor: [
      'apps.interviewer.bestFor.inPerson',
      'apps.interviewer.bestFor.guided',
      'apps.interviewer.bestFor.researcherDevice',
      'apps.interviewer.bestFor.latestFeatures',
    ],
    actions: [
      {
        labelKey: 'apps.interviewer.actions.open',
        href: webDestinations.interviewer,
      },
    ],
    treatment: 'featured',
  },
  {
    id: 'fresco',
    messageKey: 'fresco',
    workflow: 'collect',
    name: 'Fresco',
    bestFor: [
      'apps.fresco.bestFor.remoteBrowser',
      'apps.fresco.bestFor.centralManagement',
      'apps.fresco.bestFor.sharedDashboard',
      'apps.fresco.bestFor.selfHosted',
    ],
    actions: [
      {
        labelKey: 'apps.fresco.actions.sandbox',
        href: webDestinations.frescoSandboxGuide,
      },
      {
        labelKey: 'apps.fresco.actions.deployment',
        href: webDestinations.frescoDeployment,
      },
    ],
    treatment: 'fresco',
  },
] satisfies readonly WebApp[];

export function createClassicApps({
  architect,
  interviewer,
}: {
  architect: ClassicRelease;
  interviewer: ClassicRelease;
}): readonly ClassicApp[] {
  return [
    {
      id: 'architect-classic',
      messageKey: 'architectClassic',
      workflow: 'design',
      name: 'Architect Classic',
      bestFor: [
        'apps.architectClassic.bestFor.classicCompatibility',
        'apps.architectClassic.bestFor.editWithoutMigration',
      ],
      version: architect.version,
      platforms: [
        {
          id: 'apple-silicon',
          labelKey: 'platforms.appleSilicon',
          href: getReleaseAssetPath(architect, 'architect', 'apple-silicon'),
        },
        {
          id: 'apple-intel',
          labelKey: 'platforms.appleIntel',
          href: getReleaseAssetPath(architect, 'architect', 'apple-intel'),
        },
        {
          id: 'windows',
          labelKey: 'platforms.windows',
          href: getReleaseAssetPath(architect, 'architect', 'windows'),
        },
        {
          id: 'linux',
          labelKey: 'platforms.linux',
          href: architect.latestUrl,
        },
      ],
      treatment: 'classic',
    },
    {
      id: 'interviewer-classic',
      messageKey: 'interviewerClassic',
      workflow: 'collect',
      name: 'Interviewer Classic',
      bestFor: [
        'apps.interviewerClassic.bestFor.schema7Study',
        'apps.interviewerClassic.bestFor.desktopTablet',
        'apps.interviewerClassic.bestFor.offlineCollection',
      ],
      version: interviewer.version,
      platforms: [
        {
          id: 'apple-silicon',
          labelKey: 'platforms.appleSilicon',
          href: getReleaseAssetPath(
            interviewer,
            'interviewer',
            'apple-silicon',
          ),
        },
        {
          id: 'apple-intel',
          labelKey: 'platforms.appleIntel',
          href: getReleaseAssetPath(interviewer, 'interviewer', 'apple-intel'),
        },
        {
          id: 'windows',
          labelKey: 'platforms.windows',
          href: getReleaseAssetPath(interviewer, 'interviewer', 'windows'),
        },
        {
          id: 'linux',
          labelKey: 'platforms.linux',
          href: interviewer.latestUrl,
        },
        {
          id: 'android',
          labelKey: 'platforms.android',
          href: 'https://play.google.com/store/apps/details?id=org.codaco.NetworkCanvasInterviewer6',
        },
      ],
      treatment: 'classic',
    },
  ];
}
