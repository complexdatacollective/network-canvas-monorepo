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

const classicVersion = '6.5.4' as const;

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
    | 'platforms.android';
  href: string;
};

type ClassicApp = {
  id: ClassicAppId;
  messageKey: 'architectClassic' | 'interviewerClassic';
  workflow: Workflow;
  name: string;
  bestFor: readonly BestForKey[];
  version: typeof classicVersion;
  platforms: readonly PlatformLink[];
  treatment: 'classic';
};

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

const classicDestinations = {
  architectRelease: `https://github.com/complexdatacollective/architect/releases/tag/v${classicVersion}`,
  interviewerRelease: `https://github.com/complexdatacollective/interviewer/releases/tag/v${classicVersion}`,
  architectDownload: `https://github.com/complexdatacollective/architect/releases/download/v${classicVersion}`,
  interviewerDownload: `https://github.com/complexdatacollective/interviewer/releases/download/v${classicVersion}`,
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
    version: classicVersion,
    platforms: [
      {
        id: 'apple-silicon',
        labelKey: 'platforms.appleSilicon',
        href: `${classicDestinations.architectDownload}/Network.Canvas.Architect-${classicVersion}.dmg`,
      },
      {
        id: 'apple-intel',
        labelKey: 'platforms.appleIntel',
        href: `${classicDestinations.architectDownload}/Network.Canvas.Architect-${classicVersion}.dmg`,
      },
      {
        id: 'windows',
        labelKey: 'platforms.windows',
        href: `${classicDestinations.architectDownload}/Network.Canvas.Architect.Setup.${classicVersion}.exe`,
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
    version: classicVersion,
    platforms: [
      {
        id: 'apple-silicon',
        labelKey: 'platforms.appleSilicon',
        href: `${classicDestinations.interviewerDownload}/Network.Canvas.Interviewer-${classicVersion}.dmg`,
      },
      {
        id: 'apple-intel',
        labelKey: 'platforms.appleIntel',
        href: `${classicDestinations.interviewerDownload}/Network.Canvas.Interviewer-${classicVersion}.dmg`,
      },
      {
        id: 'windows',
        labelKey: 'platforms.windows',
        href: `${classicDestinations.interviewerDownload}/Network.Canvas.Interviewer.Setup.${classicVersion}.exe`,
      },
      {
        id: 'linux',
        labelKey: 'platforms.linux',
        href: classicDestinations.interviewerRelease,
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
