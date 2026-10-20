// Example studies offered on the start page.

export type Example = {
  id: string;
  label: string;
  dot: string;
  questions: string[];
  population: string;
  synopsis: string;
};

export const EXAMPLES: Example[] = [
  {
    id: 'friends',
    label: 'Peer influence on drinking',
    dot: 'bg-neon-coral',
    questions: [
      'How do first-year undergraduates form friendship networks during their first semester?',
      "Is the drinking behaviour of a student's close friends associated with the student's own alcohol use and wellbeing?",
      'Do students whose friends are densely interconnected report higher wellbeing than students with sparse networks?',
    ],
    population:
      'First-year undergraduates aged 18 to 21 at a large public university, recruited from residence halls.',
    synopsis:
      'A cross-sectional egocentric network survey administered in week 10 of the first semester. Alcohol use is measured with the AUDIT-C and wellbeing with the WHO-5. Perceived alter drinking and the social settings in which students socialise are secondary measures.',
  },
  {
    id: 'aging',
    label: 'Support in assisted living',
    dot: 'bg-sea-green',
    questions: [
      'How does the composition of older adults’ support networks change after a move into assisted living?',
      'Is geographic proximity to support providers associated with the frequency of contact and the type of support received?',
    ],
    population:
      'Adults aged 70 and over who moved into an assisted living facility within the past six months.',
    synopsis:
      'Interviewer-administered personal network interviews. Participants describe who provides practical, emotional and informational support, and where each person lives.',
  },
  {
    id: 'prep',
    label: 'Sexual networks and PrEP',
    dot: 'bg-slate-blue',
    questions: [
      'How do overlapping sexual and drug-use partnerships structure HIV risk among young men who have sex with men?',
      'Is awareness of PrEP among partners associated with condom use within each partnership?',
    ],
    population:
      'Young men who have sex with men, aged 18 to 29, recruited through community organisations.',
    synopsis:
      'The reference period is the past six months. Data are collected by computer-assisted self-interview.',
  },
  {
    id: 'ward',
    label: 'Advice seeking among nurses',
    dot: 'bg-mustard',
    questions: [
      'Which nurses occupy central positions in the clinical advice network of a hospital ward?',
      'Do advice-seeking ties cross professional role and shift boundaries?',
    ],
    population: 'All registered and enrolled nurses on one acute medical ward.',
    synopsis:
      'A sociocentric study. A staff roster is available, so participants select colleagues from a list rather than recalling names.',
  },
];
