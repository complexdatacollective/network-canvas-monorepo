/**
 * Structured content for the Network Canvas marketing site. Text is a
 * faithful transcription of networkcanvas.com; links point at the same
 * destinations as the original Framer site.
 */

import type { Variant } from '~/components/ui/DeviceMockup';
import { webDestinations } from '~/lib/getStarted';

export const externalLinks = {
  community: 'https://community.networkcanvas.com/',
  documentation: 'https://documentation.networkcanvas.com/',
  github: 'https://github.com/complexdatacollective',
  twitter: 'https://twitter.com/networkcanvas?lang=en',
  youtube: 'https://www.youtube.com/@complexdatacollective2923',
  youtubeChannel: 'https://www.youtube.com/channel/UC3uFCh2HlR8iqiYhRNomUqQ',
  publications:
    'https://documentation.networkcanvas.com/en/get-started/project-information/citing-the-software',
  shareYourWork:
    'https://community.networkcanvas.com/t/share-your-work-using-network-canvas/149',
  collaboration:
    'https://documentation.networkcanvas.com/en/desktop/project-information/requests-for-collaboration',
  terms:
    'https://assets.networkcanvas.com/public/files/Website/terms-and-conditions.txt',
  privacy: 'https://assets.networkcanvas.com/public/files/Website/privacy.txt',
  architectApp: webDestinations.architect,
  interviewerApp: webDestinations.interviewer,
  frescoApp: webDestinations.frescoSandbox,
} as const;

export type Tool = {
  id: 'architect' | 'interviewer' | 'fresco';
  name: string;
  href: string;
  color: 'sea-green' | 'neon-coral' | 'cerulean-blue' | 'slate-blue';
  variant: Variant;
};

export const tools: Tool[] = [
  {
    id: 'architect',
    name: 'Architect',
    href: externalLinks.architectApp,
    color: 'sea-green',
    variant: 'architect',
  },
  {
    id: 'interviewer',
    name: 'Interviewer',
    href: externalLinks.interviewerApp,
    color: 'neon-coral',
    variant: 'interviewer',
  },
  {
    id: 'fresco',
    name: 'Fresco',
    href: externalLinks.frescoApp,
    color: 'slate-blue',
    variant: 'fresco',
  },
];

type Principle = {
  id:
    | 'ontologicalFlexibility'
    | 'interviewerAssisted'
    | 'emphasisOnDesign'
    | 'endToEndWorkflow'
    | 'openSourceCommunity';
  href: string;
};

export const principles: Principle[] = [
  {
    id: 'ontologicalFlexibility',
    href: 'https://documentation.networkcanvas.com/en/desktop/project-information/project-overview#ontological-flexibility',
  },
  {
    id: 'interviewerAssisted',
    href: 'https://documentation.networkcanvas.com/en/desktop/project-information/project-overview#in-person-and-interviewer-assisted',
  },
  {
    id: 'emphasisOnDesign',
    href: 'https://documentation.networkcanvas.com/en/desktop/project-information/project-overview#visuality-and-an-emphasis-on-user-experience',
  },
  {
    id: 'endToEndWorkflow',
    href: 'https://documentation.networkcanvas.com/en/desktop/project-information/project-overview#end-to-end-workflow',
  },
  {
    id: 'openSourceCommunity',
    href: 'https://documentation.networkcanvas.com/en/desktop/project-information/project-overview#open-source-development',
  },
];

export const scientificAdvisors = [
  'jimi adams',
  "Rich D'Aquilla",
  'Mike Bass',
  'Martin Everett',
  'Abel Kho',
  'Carl Latkin',
  'Brian Mustanski',
];

export const institutions = [
  { name: 'University of Oxford', logo: '/images/logos/oxford.png' },
  { name: 'Northwestern University', logo: '/images/logos/northwestern.svg' },
  { name: 'Complex Data Collective', logo: '/images/logos/codaco.png' },
];

export const footerLinks = [
  { id: 'privacy', href: externalLinks.privacy },
] as const;
