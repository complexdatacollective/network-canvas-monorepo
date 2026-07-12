/**
 * Structured content for the Network Canvas marketing site. Text is a
 * faithful transcription of networkcanvas.com; links point at the same
 * destinations as the original Framer site.
 */

import type { Variant } from '~/components/ui/DeviceMockup';

export const externalLinks = {
  community: 'https://community.networkcanvas.com/',
  documentation: 'https://documentation.networkcanvas.com/',
  github: 'https://github.com/complexdatacollective',
  twitter: 'https://twitter.com/networkcanvas?lang=en',
  youtube: 'https://www.youtube.com/@complexdatacollective2923',
  youtubeChannel: 'https://www.youtube.com/channel/UC3uFCh2HlR8iqiYhRNomUqQ',
  fresco: 'https://documentation.networkcanvas.com/en/fresco',
  partnerServices: 'https://partnerservices.networkcanvas.com',
  studio:
    'https://community.networkcanvas.com/t/introducing-network-canvas-studio-an-exciting-new-direction/95',
  publications: 'https://networkcanvas.com/publications/',
  shareYourWork:
    'https://community.networkcanvas.com/t/share-your-work-using-network-canvas/149',
  collaboration:
    'https://documentation.networkcanvas.com/en/desktop/project-information/requests-for-collaboration',
  terms:
    'https://assets.networkcanvas.com/public/files/Website/terms-and-conditions.txt',
  privacy: 'https://assets.networkcanvas.com/public/files/Website/privacy.txt',
} as const;

export const navLinks = [
  { label: 'Community', href: externalLinks.community, external: true },
  { label: 'Documentation', href: externalLinks.documentation, external: true },
  { label: 'Projects', href: '/#projects', external: false },
  { label: 'Download', href: '/download', external: false },
] as const;

export const newsItems = [
  {
    title: 'Social Network Influence in Public Health and How to Map It',
    href: 'https://www.feinberg.northwestern.edu/sites/ipham/news/Social-network-influence-in-public-health-and-how-to-map-it.html',
  },
  {
    title: 'Network Canvas wins INSNA Award',
    href: 'https://www.insna.org/richards-awards',
  },
] as const;

export type Tool = {
  name: string;
  description: string;
  cta: { label: string; href: string };
  color: 'sea-green' | 'neon-coral' | 'cerulean-blue' | 'slate-blue';
  variant: Variant;
};

export const tools: Tool[] = [
  {
    name: 'Architect',
    description:
      'A desktop (macOS, Windows, Linux) tool for visually designing Network Canvas interviews. Architect allows subject experts to focus on the design and implementation of their study, without needing to learn complex new technology.',
    cta: { label: 'Download Architect', href: '/download' },
    color: 'sea-green',
    variant: 'architect',
  },
  {
    name: 'Interviewer',
    description:
      'A desktop/tablet app for administering Network Canvas interviews in the field. Interviewer provides minimalist, participant-centric interfaces for all the data collection tasks associated with personal network interviewing.',
    cta: { label: 'Download Interviewer', href: '/download' },
    color: 'neon-coral',
    variant: 'interviewer',
  },
  {
    name: 'Fresco',
    description:
      'Bringing Network Canvas interviews to the web! Fresco is a pilot project that allows researchers to conduct Network Canvas interviews in a web browser.',
    cta: { label: 'Learn More', href: externalLinks.fresco },
    color: 'slate-blue',
    variant: 'fresco',
  },
];

export type Principle = {
  title: string;
  emphasis: string;
  body: string[];
  href: string;
};

export const principles: Principle[] = [
  {
    title: 'Ontological flexibility',
    emphasis: 'ontological flexibility',
    body: [
      'The software is designed with fundamental ontological flexibility. Simply put, this means that we do not presuppose anything about the nature of your interview.',
      'Researchers are free to define the nodes and edges of their interviews, their attributes, the sequence of data collection tasks, as well as the way these tasks are explained to the participant.',
    ],
    href: 'https://documentation.networkcanvas.com/en/desktop/project-information/project-overview#ontological-flexibility',
  },
  {
    title: 'In-person and interviewer-assisted',
    emphasis: 'the presence of a trained interviewer',
    body: [
      'We believe that the presence of a trained interviewer who can facilitate the data collection task enables the collection of higher quality data.',
      'The Network Canvas tools are therefore designed on the assumption that interviews occur in the presence of an interviewer, on an interviewer-controlled machine, and with the interviewer having been specifically trained in guiding the interview process.',
    ],
    href: 'https://documentation.networkcanvas.com/en/desktop/project-information/project-overview#in-person-and-interviewer-assisted',
  },
  {
    title: 'An emphasis on design',
    emphasis: 'engaging and low burden',
    body: [
      'Our software has been designed from the ground up to be as visually engaging and low burden as possible for participants.',
      'We take design extremely seriously, and have drawn on HCI literature, as well as papers from the network analysis community, to create an interview experience that is simple for participants to understand, with clear, consistent, and tactile interactions guiding the data collection.',
    ],
    href: 'https://documentation.networkcanvas.com/en/desktop/project-information/project-overview#visuality-and-an-emphasis-on-user-experience',
  },
  {
    title: 'End-to-end workflow',
    emphasis: 'an end-to-end workflow',
    body: [
      'Simplifying the process of collecting complex structural data requires not just an interview tool, but also a tool for designing these interviews. Together, these tools provide an end-to-end workflow which lowers the costs (both material and technical) of collecting network data.',
      'Importantly, our tools do not require a high degree of technical knowledge to operate. Rather, they allow researchers to focus on using their subject expertise to design an effective interview experience.',
    ],
    href: 'https://documentation.networkcanvas.com/en/desktop/project-information/project-overview#end-to-end-workflow',
  },
  {
    title: 'Open-source community driven development',
    emphasis: 'free to use and completely open-source',
    body: [
      'Key to sustaining this effort is input and collaboration with the community, both inside and outside of academia. For this reason, the network canvas tools are free to use and completely open-source (licensed under the GPL version 3).',
      'We have implemented a community driven development program, and are eager to encourage feature development or other contributions from any interested third parties.',
    ],
    href: 'https://documentation.networkcanvas.com/en/desktop/project-information/project-overview#open-source-development',
  },
];

export type Project = {
  name: string;
  description: string;
  href: string;
  illustration: string;
  color: 'slate-blue' | 'cerulean-blue' | 'neon-coral';
};

export const projects: Project[] = [
  {
    name: 'Partner Services',
    description:
      'A project to map the needs of Partner Services, and evaluate the utility of Network Canvas as a public health tool to aid disease investigation and increase data quality.',
    href: externalLinks.partnerServices,
    illustration: '/images/illustrations/partner-services.svg',
    color: 'slate-blue',
  },
  {
    name: 'Fresco',
    description:
      'Bringing Network Canvas interviews to the web! Fresco is a pilot project that allows researchers to conduct Network Canvas interviews in a web browser.',
    href: externalLinks.fresco,
    illustration: '/images/illustrations/fresco.svg',
    color: 'cerulean-blue',
  },
  {
    name: 'Studio',
    description:
      'Taking Network Canvas to the cloud for the first time, Studio will enable remote interview deployment and collaborative protocol building in a browser, while also providing a data analysis API.',
    href: externalLinks.studio,
    illustration: '/images/illustrations/studio.svg',
    color: 'neon-coral',
  },
];

export type Grant = {
  title: string;
  pis: string;
  description: string;
  logo: string;
  logoAlt: string;
  href: string;
};

export const grants: Grant[] = [
  {
    title:
      'Community network-driven COVID-19 testing of vulnerable populations in the Central US',
    pis: 'PIs: Pollack, Pho, Schneider (3UG1DA050066-02S1)',
    description:
      'This project will implement and evaluate a COVID-19 testing approach that combines an evidence-based Social Network Testing Strategy (SNS) with community developed COVID-19 public health messages (SNS+).',
    logo: '/images/logos/uchicago.png',
    logoAlt: 'The University of Chicago',
    href: 'https://reporter.nih.gov/project-details/10715902',
  },
  {
    title: 'Justice Community Opioid Innovation Network (JCOIN)',
    pis: 'PI: Staton (UG1DA050069), PI: Wang (UG1DA050072), MPI: Pollack, Pho, Schneider (UG1DA050066)',
    description:
      'JCOIN utilizes Network Canvas for network data capture to examine how participants’ social support networks influence treatment outcomes for justice-involved participants across three JCOIN hubs.',
    logo: '/images/logos/kentucky.png',
    logoAlt: 'University of Kentucky',
    href: 'https://reporter.nih.gov/project-details/9306043',
  },
  {
    title:
      "Understanding how social connectedness protects older adults' cognitive health: the role of social cognition",
    pis: 'PIs: Krendl, Perry (R01AG070931)',
    description:
      'This project utilizes Network Canvas to examine the relationship between older adults’ social networks and their social cognitive function, as well as the possibility that having better social cognitive function may be protective for general cognitive function.',
    logo: '/images/logos/indiana.png',
    logoAlt: 'Indiana University',
    href: 'https://reporter.nih.gov/search/-MFdjvPbM0SvDXxFjozkcw/project-details/10386802',
  },
  {
    title: 'Geographic variation in Addiction Treatment Experiences (GATE)',
    pis: 'PI: Oser (R01DA048876)',
    description:
      'The GATE study uses Network Canvas to identify the social network influences on the use of medication treatment for opioid use disorder (both in prison and after release) and adverse outcomes (i.e., relapse, overdose, recidivism) among both rural and urban persons with opioid use disorder over time.',
    logo: '/images/logos/kentucky.png',
    logoAlt: 'University of Kentucky',
    href: 'https://reporter.nih.gov/search/CwDpMfV-KEiJF8BW1z5i3A/project-details/10642747',
  },
];

export type Publication = {
  title: string;
  source: string;
  authors: string;
  href: string;
};

export const publications: Publication[] = [
  {
    title: "The role of networks in ESOL young learners' education",
    source: 'Networks and Urban Systems Centre',
    authors: 'Da Gama F, Bui K, Conaldi G',
    href: 'https://gala.gre.ac.uk/id/eprint/50359/13/50359%20DA%20GAMA_The_Role_Of_Networks_In_ESOL_Young_Learners_Education_%28MONOGRAPH%29_2025.pdf',
  },
  {
    title:
      'How Social-Relational Context Impacts the Mental Health of Adolescent and Young Adults Living with and Without HIV in Mozambique: A Social Network Analysis Study',
    source: 'Journal of Epidemiology and Global Health',
    authors:
      'Benoni R, Sartorello A, Malesani C, Cardoso H, Chaguruca I, Matope MD, Putoto G, Giaquinto C, Gatta M',
    href: 'https://link.springer.com/article/10.1007/s44197-025-00417-7',
  },
  {
    title:
      'Invisible Illness and the Self: Exploring the Interplay of Migraine, Social Networks, and Identity',
    source: 'ProQuest Dissertation',
    authors: 'Brooks CV',
    href: 'https://www.proquest.com/docview/3224178836',
  },
  {
    title:
      'Birth and household exposures are associated with changes to skin bacterial communities during infancy',
    source: 'Evolution, Medicine, and Public Health',
    authors:
      'Manus MB, Sardaro MLS, Dada O, Davis M, Romoff MR, Torello SG, Ubadigbo E, Wu RC, Domingeuz-Bello MG, Melby MK, Miller ES, Amato KR',
    href: 'https://academic.oup.com/emph/article/13/1/49/7759654',
  },
];

export type TeamMember = {
  name: string;
  institution: string;
  photo: string;
};

export const coreTeam: TeamMember[] = [
  {
    name: 'Kate Banner',
    institution: 'Northwestern University',
    photo: '/images/team/kate-banner.png',
  },
  {
    name: 'Michelle Birkett',
    institution: 'Northwestern University',
    photo: '/images/team/michelle-birkett.png',
  },
  {
    name: 'Caden Buckhalt',
    institution: 'Northwestern University',
    photo: '/images/team/caden-buckhalt.jpg',
  },
  {
    name: 'Noshir Contractor',
    institution: 'Northwestern University',
    photo: '/images/team/noshir-contractor.jpg',
  },
  {
    name: 'Bernie Hogan',
    institution: 'University of Oxford',
    photo: '/images/team/bernie-hogan.png',
  },
  {
    name: 'Patrick Janulis',
    institution: 'Northwestern University',
    photo: '/images/team/patrick-janulis.jpg',
  },
  {
    name: 'Joshua Melville',
    institution: 'Northwestern University',
    photo: '/images/team/joshua-melville.jpg',
  },
  {
    name: 'Gregory Phillips II',
    institution: 'Northwestern University',
    photo: '/images/team/gregory-phillips.jpg',
  },
];

export const previousContractors = [
  {
    name: 'Mirfayz Karimoff',
    note: 'Worked with the team during the Fresco and Studio projects.',
  },
  {
    name: 'Jabulani Mpofu',
    note: 'Worked with the team during the start of the Fresco and Studio projects.',
  },
  {
    name: 'Jamie Chung',
    note: 'Played an important role in bootstrapping the project, and establishing our styling system.',
  },
  {
    name: 'Sunjay Kumar',
    note: 'Implemented several features within Interviewer.',
  },
  {
    name: 'Bryan Fox',
    note: 'Made significant technical contributions across all aspects of our software.',
  },
  {
    name: 'Rebecca Madsen',
    note: 'A key long-term collaborator and expert in finding and fixing quality issues within the software.',
  },
  {
    name: 'Steve Mckellar',
    note: 'Senior developer and key long-term collaborator who played a vital role in designing and implementing Architect, as well as implementing testing strategies.',
  },
  {
    name: 'Matt Meshulam',
    note: 'Established our dev-ops workflow for deploying and managing our infrastructure.',
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

export const interns = [
  {
    name: 'Xiaowei Chen',
    period: "Summer '22 Intern",
    photo: '/images/team/xiaowei-chen.jpg',
    note: 'Xiaowei (a Computer Science undergraduate at Northwestern) helped our team to explore enhancements to the user experience of Architect.',
  },
  {
    name: 'Anika Wilsnack',
    period: "Summer '23 Intern",
    photo: '/images/team/anika-wilsnack.jpg',
    note: 'Anika used her knowledge of psychology and music production to develop interaction sounds for the Interviewer app. She also helped create content for the Studio project website.',
    href: 'https://linkedin.com/in/anikawilsnack',
  },
];

export const institutions = [
  { name: 'University of Oxford', logo: '/images/logos/oxford.png' },
  { name: 'Northwestern University', logo: '/images/logos/northwestern.svg' },
  { name: 'Complex Data Collective', logo: '/images/logos/codaco.png' },
];

export const footerLinks = [
  { label: 'Terms of Use', href: externalLinks.terms },
  { label: 'Privacy Policy', href: externalLinks.privacy },
] as const;
