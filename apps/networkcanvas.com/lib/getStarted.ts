export type Workflow = 'design' | 'collect';
export type WebAppId = 'architect' | 'interviewer' | 'fresco';
export type ClassicAppId = 'architect-classic' | 'interviewer-classic';
export type PlatformId = 'apple-silicon' | 'apple-intel' | 'windows' | 'linux';

type AppAction = {
  label: string;
  href: string;
};

type WebApp = {
  id: WebAppId;
  workflow: Workflow;
  name: string;
  status: string;
  description: string;
  bestFor: readonly string[];
  actions: readonly AppAction[];
  treatment: 'featured' | 'fresco';
};

type PlatformLink = {
  id: PlatformId;
  label: string;
  href: string;
};

type ClassicApp = {
  id: ClassicAppId;
  workflow: Workflow;
  name: string;
  status: string;
  description: string;
  bestFor: readonly string[];
  version: '6.6.0';
  platforms: readonly PlatformLink[];
  treatment: 'classic';
};

export const GET_STARTED_PATH = '/get-started';

export const webDestinations = {
  architect: 'https://architect.networkcanvas.com/',
  interviewer: 'https://interviewer.networkcanvas.com/',
  frescoSandbox: 'https://fresco-sandbox.networkcanvas.com/',
  frescoDeployment:
    'https://documentation.networkcanvas.com/en/fresco/deployment/guide',
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
    workflow: 'design',
    name: 'Architect',
    status: 'Recommended for New Studies',
    description:
      'Turn your research ideas into engaging Network Canvas interviews. Architect gives your team a visual, approachable design workspace that runs entirely in the browser, with nothing to install.',
    bestFor: [
      'Turning research ideas into structured interview protocols',
      'Designing engaging experiences for participants',
      'Working in the browser with no setup',
      'Preparing studies for Interviewer or Fresco',
    ],
    actions: [{ label: 'Open Architect', href: webDestinations.architect }],
    treatment: 'featured',
  },
  {
    id: 'interviewer',
    workflow: 'collect',
    name: 'Interviewer',
    status: 'In Person · Recommended',
    description:
      'Run polished, interviewer-led Network Canvas sessions on a desktop or tablet. Interviewer keeps the experience focused, responsive, and ready for fieldwork, even when connectivity is limited.',
    bestFor: [
      'In-person, interviewer-assisted research',
      'Guiding participants through complex network questions',
      'Data collection on a trusted research device',
      'Fieldwork where reliable connectivity cannot be assumed',
    ],
    actions: [{ label: 'Open Interviewer', href: webDestinations.interviewer }],
    treatment: 'featured',
  },
  {
    id: 'fresco',
    workflow: 'collect',
    name: 'Fresco',
    status: 'Large Teams · Remote Administration · Recommended',
    description:
      'Take Network Canvas studies beyond the lab. Fresco lets participants complete interviews remotely while your team manages studies, participants, and data from one centralized web dashboard.',
    bestFor: [
      'Reaching participants wherever they are',
      'Remote, self-administered interviews',
      'Coordinating large research teams',
      'Managing participants and data from a shared dashboard',
    ],
    actions: [
      {
        label: 'Try the Fresco Sandbox',
        href: webDestinations.frescoSandbox,
      },
      {
        label: 'Deployment Guide',
        href: webDestinations.frescoDeployment,
      },
    ],
    treatment: 'fresco',
  },
] satisfies readonly WebApp[];

export const classicApps = [
  {
    id: 'architect-classic',
    workflow: 'design',
    name: 'Architect Classic',
    status: 'Classic · Maintenance mode',
    description:
      'Use only when your study must remain compatible with Interviewer Classic and schema 7.',
    bestFor: [
      'An existing study that must remain compatible with Interviewer Classic',
      'A schema 7 protocol that must continue to be edited without migration',
    ],
    version: '6.6.0',
    platforms: [
      {
        id: 'apple-silicon',
        label: 'Apple Silicon',
        href: `${classicDestinations.architectDownload}/Network%20Canvas%20Architect-6.6.0-mac-arm64.dmg`,
      },
      {
        id: 'apple-intel',
        label: 'Apple Intel',
        href: `${classicDestinations.architectDownload}/Network%20Canvas%20Architect-6.6.0-mac-x64.dmg`,
      },
      {
        id: 'windows',
        label: 'Windows',
        href: `${classicDestinations.architectDownload}/Network%20Canvas%20Architect-6.6.0-win-x64.exe`,
      },
      {
        id: 'linux',
        label: 'Linux',
        href: classicDestinations.architectRelease,
      },
    ],
    treatment: 'classic',
  },
  {
    id: 'interviewer-classic',
    workflow: 'collect',
    name: 'Interviewer Classic',
    status: 'Classic · Existing studies',
    description:
      'For established schema 7 studies and offline desktop or tablet workflows. Maintained for compatibility and bug fixes.',
    bestFor: [
      'An established study that depends on schema 7',
      'Preserving an existing desktop or tablet workflow',
      'Studies requiring the older offline collection workflow',
    ],
    version: '6.6.0',
    platforms: [
      {
        id: 'apple-silicon',
        label: 'Apple Silicon',
        href: `${classicDestinations.interviewerDownload}/Network%20Canvas%20Interviewer-6.6.0-arm64.dmg`,
      },
      {
        id: 'apple-intel',
        label: 'Apple Intel',
        href: `${classicDestinations.interviewerDownload}/Network%20Canvas%20Interviewer-6.6.0.dmg`,
      },
      {
        id: 'windows',
        label: 'Windows',
        href: `${classicDestinations.interviewerDownload}/Network%20Canvas%20Interviewer%20Setup%206.6.0.exe`,
      },
      {
        id: 'linux',
        label: 'Linux',
        href: classicDestinations.interviewerRelease,
      },
    ],
    treatment: 'classic',
  },
] satisfies readonly ClassicApp[];

export const compatibilityWarning = {
  title: 'Classic compatibility is one-way.',
  description:
    'Architect can upgrade a schema 7 protocol to schema 8, but schema 8 protocols cannot be opened in Classic apps. Keep the original file if your study still depends on Classic.',
} as const;
