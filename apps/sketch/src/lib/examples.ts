// Example descriptions offered on the start page.

export type Example = {
  id: string;
  label: string;
  dot: string;
  text: string;
};

export const EXAMPLES: Example[] = [
  {
    id: 'friends',
    label: 'Friendship and drinking',
    dot: 'bg-neon-coral',
    text: 'I study how first-year university students form friendships during their first semester, and whether having friends who drink heavily is linked to their own drinking and wellbeing. I want to ask about close friends and the people they go out with, which of those people know each other, and where they usually socialise. I also need some basic questions about the student themselves.',
  },
  {
    id: 'aging',
    label: 'Support after a move',
    dot: 'bg-sea-green',
    text: 'We interview adults over 70 who recently moved into assisted living. We want to map who gives them practical help, emotional support and advice, where those people live, and how often they are in contact.',
  },
  {
    id: 'prep',
    label: 'Sexual and drug-use partners',
    dot: 'bg-slate-blue',
    text: 'A study of young men who have sex with men, mapping sexual partners and drug-use partners in the last six months, condom use and PrEP awareness with each partner, and which partners know each other.',
  },
  {
    id: 'ward',
    label: 'Advice on a hospital ward',
    dot: 'bg-mustard',
    text: 'Nurses on a hospital ward name the colleagues they go to for clinical advice and for emotional support, the role and shift of each colleague, and who works closely with whom.',
  },
];
