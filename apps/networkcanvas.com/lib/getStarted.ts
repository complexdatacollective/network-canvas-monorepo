export type Workflow = 'design' | 'collect';
export type WebAppId = 'architect' | 'interviewer' | 'fresco';
export type ClassicAppId = 'architect-classic' | 'interviewer-classic';
export type PlatformId =
  | 'apple-silicon'
  | 'apple-intel'
  | 'windows'
  | 'linux'
  | 'ios'
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

type WebApp = {
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
    | 'platforms.ios'
    | 'platforms.android';
  href: string;
};

type ClassicApp = {
  id: ClassicAppId;
  messageKey: 'architectClassic' | 'interviewerClassic';
  workflow: Workflow;
  name: string;
  bestFor: readonly BestForKey[];
  version: '6.6.0';
  platforms: readonly PlatformLink[];
  treatment: 'classic';
};

export const GET_STARTED_PATH = '/get-started';

export const webDestinations = {
  architect: 'https://architect.networkcanvas.com/',
  interviewer: 'https://interviewer.networkcanvas.com/',
  frescoSandbox: 'https://fresco-sandbox.networkcanvas.com/',
  frescoSandboxGuide:
    'https://documentation.networkcanvas.com/en/collect-data/fresco/sandbox',
  frescoDeployment:
    'https://documentation.networkcanvas.com/en/collect-data/fresco/guide',
} as const;

export const documentationDestinations = {
  schemaVersions:
    'https://documentation.networkcanvas.com/en/get-started/advanced-topics/protocol-schema-information',
} as const;

const classicDestinations = {
  architectRelease:
    'https://github.com/complexdatacollective/architect/releases/tag/v6.6.0',
  interviewerRelease:
    'https://github.com/complexdatacollective/interviewer/releases/tag/v6.6.0',
  architectDownload:
    'https://github.com/complexdatacollective/architect/releases/download/v6.6.0',
  interviewerDownload:
    'https://github.com/complexdatacollective/interviewer/releases/download/v6.6.0',
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

export const classicApps = [
  {
    id: 'architect-classic',
    messageKey: 'architectClassic',
    workflow: 'design',
    name: 'Architect Classic',
    bestFor: [
      'apps.architectClassic.bestFor.classicCompatibility',
      'apps.architectClassic.bestFor.editWithoutMigration',
    ],
    version: '6.6.0',
    platforms: [
      {
        id: 'apple-silicon',
        labelKey: 'platforms.appleSilicon',
        href: `${classicDestinations.architectDownload}/Network%20Canvas%20Architect-6.6.0-mac-arm64.dmg`,
      },
      {
        id: 'apple-intel',
        labelKey: 'platforms.appleIntel',
        href: `${classicDestinations.architectDownload}/Network%20Canvas%20Architect-6.6.0-mac-x64.dmg`,
      },
      {
        id: 'windows',
        labelKey: 'platforms.windows',
        href: `${classicDestinations.architectDownload}/Network%20Canvas%20Architect-6.6.0-win-x64.exe`,
      },
      {
        id: 'linux',
        labelKey: 'platforms.linux',
        href: classicDestinations.architectRelease,
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
    version: '6.6.0',
    platforms: [
      {
        id: 'apple-silicon',
        labelKey: 'platforms.appleSilicon',
        href: `${classicDestinations.interviewerDownload}/Network%20Canvas%20Interviewer-6.6.0-arm64.dmg`,
      },
      {
        id: 'apple-intel',
        labelKey: 'platforms.appleIntel',
        href: `${classicDestinations.interviewerDownload}/Network%20Canvas%20Interviewer-6.6.0.dmg`,
      },
      {
        id: 'windows',
        labelKey: 'platforms.windows',
        href: `${classicDestinations.interviewerDownload}/Network%20Canvas%20Interviewer%20Setup%206.6.0.exe`,
      },
      {
        id: 'linux',
        labelKey: 'platforms.linux',
        href: classicDestinations.interviewerRelease,
      },
      {
        id: 'ios',
        labelKey: 'platforms.ios',
        href: 'https://apps.apple.com/us/app/network-canvas-interviewer/id1538673677',
      },
      {
        id: 'android',
        labelKey: 'platforms.android',
        href: 'https://play.google.com/store/apps/details?id=org.codaco.NetworkCanvasInterviewer6',
      },
    ],
    treatment: 'classic',
  },
] satisfies readonly ClassicApp[];
