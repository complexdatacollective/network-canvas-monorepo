/**
 * The families whose drawings the coverage tests check (see
 * `drawingCoverage.test.tsx`): between them, every kind of tie and every
 * arrangement of helpers, co-parents and twins the interface draws. The
 * layout budget holds each of them to its time budget as well
 * (`layoutBudget.test.ts`).
 */
import type { PedigreeLink } from '../types';

const parent = (
  source: string,
  kind: 'biological' | 'social' | 'adoptive' | 'donor' | 'surrogate',
  target: string,
  carrier = false,
): PedigreeLink => ({ source, target, kind, isGestationalCarrier: carrier });
const partners = (a: string, b: string, isActive = true): PedigreeLink => ({
  source: a,
  target: b,
  kind: 'partner',
  isActive,
});
const twins = (
  a: string,
  b: string,
  kind: 'identicalTwin' | 'fraternalTwin' | 'unknownZygosityTwin',
): PedigreeLink => ({ source: a, target: b, kind });

export const coverageFamilies: Record<
  string,
  { people: string[]; links: PedigreeLink[] }
> = {
  'a surrogate of twins': {
    people: ['ego', 'mum', 'dad', 'arjun', 'lena'],
    links: [
      parent('mum', 'biological', 'ego'),
      parent('dad', 'biological', 'ego'),
      parent('mum', 'biological', 'arjun'),
      parent('dad', 'biological', 'arjun'),
      partners('mum', 'dad'),
      parent('lena', 'surrogate', 'ego', true),
      parent('lena', 'surrogate', 'arjun', true),
      twins('ego', 'arjun', 'unknownZygosityTwin'),
    ],
  },
  'identical twins with different recorded fathers': {
    people: ['ego', 'paul', 'jane', 'gran', 'grandad', 'peter', 'other'],
    links: [
      parent('paul', 'biological', 'ego'),
      parent('jane', 'biological', 'ego', true),
      partners('gran', 'grandad'),
      parent('gran', 'biological', 'paul', true),
      parent('grandad', 'biological', 'paul'),
      parent('gran', 'biological', 'peter', true),
      parent('other', 'biological', 'peter'),
      twins('paul', 'peter', 'identicalTwin'),
    ],
  },
  'a step parent and a donor': {
    people: ['ego', 'beth', 'jo', 'tom'],
    links: [
      parent('beth', 'biological', 'ego', true),
      parent('jo', 'social', 'ego'),
      partners('beth', 'jo'),
      parent('tom', 'donor', 'ego'),
    ],
  },
  'an adopted child’s birth parents and their new partners': {
    people: ['ego', 'chloe', 'tyler', 'helen', 'mark', 'sam', 'amber'],
    links: [
      parent('chloe', 'biological', 'ego', true),
      parent('tyler', 'biological', 'ego'),
      partners('chloe', 'tyler', false),
      parent('helen', 'adoptive', 'ego'),
      parent('mark', 'adoptive', 'ego'),
      partners('helen', 'mark'),
      partners('chloe', 'sam'),
      partners('tyler', 'amber'),
    ],
  },
  'a child adopted by their grandparents': {
    people: ['ego', 'kayla', 'tyler', 'patricia', 'ronald'],
    links: [
      parent('kayla', 'biological', 'ego', true),
      parent('tyler', 'biological', 'ego'),
      partners('kayla', 'tyler', false),
      parent('patricia', 'biological', 'kayla', true),
      parent('ronald', 'biological', 'kayla'),
      partners('patricia', 'ronald'),
      parent('patricia', 'adoptive', 'ego'),
      parent('ronald', 'adoptive', 'ego'),
    ],
  },
  'a child adopted by their brother': {
    people: ['ego', 'rosa', 'luis', 'marco', 'pat'],
    links: [
      parent('rosa', 'biological', 'ego', true),
      parent('luis', 'biological', 'ego'),
      partners('rosa', 'luis'),
      parent('rosa', 'biological', 'marco', true),
      parent('luis', 'biological', 'marco'),
      parent('marco', 'adoptive', 'ego'),
      partners('ego', 'pat'),
    ],
  },
  'step parents and adoptive parents who separated': {
    people: [
      'ego',
      'karen',
      'mike',
      'shannon',
      'egoFather',
      'lauren',
      'denise',
      'jack',
    ],
    links: [
      parent('egoFather', 'biological', 'ego'),
      parent('karen', 'adoptive', 'ego'),
      parent('mike', 'adoptive', 'ego'),
      partners('karen', 'mike', false),
      parent('shannon', 'biological', 'ego', true),
      partners('mike', 'lauren'),
      parent('lauren', 'social', 'ego'),
      partners('karen', 'denise'),
      parent('denise', 'social', 'ego'),
      parent('mike', 'biological', 'jack'),
      parent('lauren', 'biological', 'jack', true),
    ],
  },
  'one donor to a mother and a father': {
    people: [
      'ego',
      'emma',
      'liam',
      'claire',
      'donor',
      'julie',
      'kate',
      'liamFather',
    ],
    links: [
      parent('liamFather', 'biological', 'liam'),
      parent('emma', 'biological', 'ego', true),
      parent('liam', 'biological', 'ego'),
      partners('emma', 'liam'),
      parent('claire', 'biological', 'emma', true),
      parent('donor', 'donor', 'emma'),
      parent('julie', 'biological', 'liam', true),
      parent('kate', 'social', 'liam'),
      partners('julie', 'kate'),
      parent('donor', 'donor', 'liam'),
    ],
  },
  // A parent and their adult child have a child together: the two cannot
  // share a row, so the line of descent can come from the lower of them
  // only, and the other's tie is drawn by a line of their own.
  'a child of a parent and their adult child': {
    people: ['grandma', 'grandad', 'son', 'baby'],
    links: [
      partners('grandma', 'grandad'),
      parent('grandma', 'biological', 'son', true),
      parent('grandad', 'biological', 'son'),
      parent('grandma', 'biological', 'baby', true),
      parent('son', 'biological', 'baby'),
    ],
  },
  // A woman who is the surrogate for one child and raises another. Drawn
  // within the work allowed for bettering a drawing, her surrogate line
  // crossed her own social line; work is kept for finding a drawing that
  // breaks no hard constraint, and it finds one.
  'a woman who carries her parents’ child and raises a friend’s': {
    people: [
      'cal',
      'gma',
      'friendB',
      'ben',
      'dad',
      'friendA',
      'eve',
      'jo',
      'sam',
      'amy',
      'young',
      'dee',
      'gpa',
      'mum',
    ],
    links: [
      partners('gma', 'gpa'),
      partners('mum', 'dad'),
      partners('jo', 'sam'),
      partners('friendA', 'friendB'),
      parent('gma', 'biological', 'mum'),
      parent('gpa', 'biological', 'mum'),
      parent('gma', 'biological', 'jo', true),
      parent('gpa', 'biological', 'jo'),
      parent('jo', 'biological', 'dee', true),
      parent('sam', 'biological', 'dee'),
      parent('gma', 'biological', 'young'),
      parent('gpa', 'biological', 'young'),
      parent('friendA', 'biological', 'amy'),
      parent('friendB', 'biological', 'amy'),
      parent('friendA', 'biological', 'ben'),
      parent('friendB', 'biological', 'ben'),
      parent('friendA', 'biological', 'cal', true),
      parent('friendB', 'biological', 'cal'),
      parent('jo', 'biological', 'eve', true),
      parent('sam', 'biological', 'eve'),
      parent('jo', 'surrogate', 'young', true),
      parent('jo', 'social', 'cal'),
    ],
  },
  'a donor to two of three half-siblings': {
    people: ['ego', 'hannah', 'paul', 'ruby', 'theo', 'theoDonor'],
    links: [
      parent('hannah', 'biological', 'ego', true),
      parent('paul', 'donor', 'ego'),
      parent('hannah', 'biological', 'ruby', true),
      parent('paul', 'donor', 'ruby'),
      parent('hannah', 'biological', 'theo', true),
      parent('theoDonor', 'donor', 'theo'),
    ],
  },
  'a sperm donor and a surrogate for two of three half-siblings': {
    people: ['ego', 'hannah', 'paul', 'carrier', 'ruby', 'theo', 'theoDonor'],
    links: [
      parent('hannah', 'biological', 'ego'),
      parent('paul', 'donor', 'ego'),
      parent('carrier', 'surrogate', 'ego', true),
      parent('hannah', 'biological', 'ruby'),
      parent('paul', 'donor', 'ruby'),
      parent('carrier', 'surrogate', 'ruby', true),
      parent('hannah', 'biological', 'theo', true),
      parent('theoDonor', 'donor', 'theo'),
    ],
  },
  'an egg donor, a sperm donor and a surrogate for two of three children Hannah raises':
    {
      people: ['ego', 'hannah', 'egg', 'sperm', 'carrier', 'ruby', 'theo'],
      links: [
        ...['ego', 'ruby'].flatMap((child) => [
          parent('hannah', 'social', child),
          parent('egg', 'donor', child),
          parent('sperm', 'donor', child),
          parent('carrier', 'surrogate', child, true),
        ]),
        parent('hannah', 'social', 'theo'),
      ],
    },
  'a surrogate for one of a donor’s two children, the other recorded first': {
    people: ['ruby', 'theo', 'ego', 'hannah', 'paul', 'carrier'],
    links: [
      parent('hannah', 'biological', 'ruby', true),
      parent('paul', 'donor', 'ruby'),
      parent('hannah', 'biological', 'theo', true),
      parent('hannah', 'biological', 'ego'),
      parent('paul', 'donor', 'ego'),
      parent('carrier', 'surrogate', 'ego', true),
    ],
  },
  'a surrogate for two of a donor’s three children': {
    people: ['ego', 'hannah', 'paul', 'carrier', 'ruby', 'theo', 'mia'],
    links: [
      ...['ego', 'ruby'].flatMap((child) => [
        parent('hannah', 'biological', child),
        parent('paul', 'donor', child),
        parent('carrier', 'surrogate', child, true),
      ]),
      parent('hannah', 'biological', 'theo', true),
      parent('paul', 'donor', 'theo'),
      parent('hannah', 'biological', 'mia', true),
    ],
  },
  'a granddaughter adopted by her grandparents, with a former partner': {
    people: ['ego', 'margaret', 'hugh', 'ian', 'chloe', 'formerPartner'],
    links: [
      parent('margaret', 'biological', 'ego', true),
      parent('hugh', 'biological', 'ego'),
      partners('margaret', 'hugh'),
      parent('margaret', 'biological', 'ian', true),
      parent('hugh', 'biological', 'ian'),
      parent('ego', 'biological', 'chloe', true),
      parent('formerPartner', 'biological', 'chloe'),
      partners('ego', 'formerPartner', false),
      parent('margaret', 'adoptive', 'chloe'),
      parent('hugh', 'adoptive', 'chloe'),
    ],
  },
  'a younger sister adopted by her married brother': {
    people: ['ego', 'mum', 'dad', 'tom', 'pat', 'sis', 'kid'],
    links: [
      partners('mum', 'dad'),
      parent('mum', 'biological', 'ego', true),
      parent('dad', 'biological', 'ego'),
      parent('mum', 'biological', 'tom', true),
      parent('dad', 'biological', 'tom'),
      parent('mum', 'biological', 'sis', true),
      parent('dad', 'biological', 'sis'),
      partners('tom', 'pat'),
      parent('pat', 'biological', 'kid', true),
      parent('tom', 'biological', 'kid'),
      parent('tom', 'adoptive', 'sis'),
      parent('pat', 'adoptive', 'sis'),
    ],
  },
  'a niece adopted by her aunt and uncle, who have no children': {
    people: ['ego', 'gran', 'grandad', 'mum', 'dad', 'aunt', 'uncle', 'niece'],
    links: [
      partners('gran', 'grandad'),
      parent('gran', 'biological', 'mum', true),
      parent('grandad', 'biological', 'mum'),
      parent('gran', 'biological', 'aunt', true),
      parent('grandad', 'biological', 'aunt'),
      partners('mum', 'dad'),
      partners('aunt', 'uncle'),
      parent('mum', 'biological', 'ego', true),
      parent('dad', 'biological', 'ego'),
      parent('mum', 'biological', 'niece', true),
      parent('dad', 'biological', 'niece'),
      parent('aunt', 'adoptive', 'niece'),
      parent('uncle', 'adoptive', 'niece'),
    ],
  },
  'co-parents who were never partners': {
    people: ['ego', 'ann', 'bob', 'sib'],
    links: [
      parent('ann', 'biological', 'ego', true),
      parent('bob', 'biological', 'ego'),
      parent('ann', 'biological', 'sib', true),
      parent('bob', 'biological', 'sib'),
    ],
  },
  'a stand-in and a recorded parent, whose partner also raises the child': {
    people: ['ego', 'mum', 'standIn', 'stepdad'],
    links: [
      parent('mum', 'biological', 'ego', true),
      parent('standIn', 'biological', 'ego'),
      parent('stepdad', 'social', 'ego'),
      partners('mum', 'stepdad'),
    ],
  },
  'a stand-in for a half-sibling’s other parent': {
    people: ['ego', 'mum', 'dad', 'half', 'standIn'],
    links: [
      parent('mum', 'biological', 'ego', true),
      parent('dad', 'biological', 'ego'),
      partners('mum', 'dad'),
      parent('mum', 'biological', 'half', true),
      parent('standIn', 'biological', 'half'),
    ],
  },
  // Families no test drew before the rule set, where the engine's special
  // cases broke the constraints (rules-audit.md section 4).
  'two siblings adopted together, with different birth parents': {
    people: ['ego', 'sib', 'helen', 'mark', 'chloe', 'tyler', 'amy', 'ben'],
    links: [
      partners('helen', 'mark'),
      ...['ego', 'sib'].flatMap((child) => [
        parent('helen', 'adoptive', child),
        parent('mark', 'adoptive', child),
      ]),
      parent('chloe', 'biological', 'ego', true),
      parent('tyler', 'biological', 'ego'),
      parent('amy', 'biological', 'sib', true),
      parent('ben', 'biological', 'sib'),
    ],
  },
  'two siblings adopted together, with the same birth parents': {
    people: ['ego', 'sib', 'helen', 'mark', 'chloe', 'tyler'],
    links: [
      partners('helen', 'mark'),
      ...['ego', 'sib'].flatMap((child) => [
        parent('helen', 'adoptive', child),
        parent('mark', 'adoptive', child),
        parent('chloe', 'biological', child, true),
        parent('tyler', 'biological', child),
      ]),
    ],
  },
  'a stepfather who raises all his partner’s children': {
    people: ['ego', 'sib', 'mum', 'dad', 'stepdad'],
    links: [
      partners('mum', 'dad', false),
      partners('mum', 'stepdad'),
      ...['ego', 'sib'].flatMap((child) => [
        parent('mum', 'biological', child, true),
        parent('dad', 'biological', child),
        parent('stepdad', 'social', child),
      ]),
    ],
  },
  'an adopter whose partner is a social parent': {
    people: ['ego', 'helen', 'mark', 'chloe', 'tyler'],
    links: [
      partners('helen', 'mark'),
      parent('helen', 'adoptive', 'ego'),
      parent('mark', 'social', 'ego'),
      parent('chloe', 'biological', 'ego', true),
      parent('tyler', 'biological', 'ego'),
    ],
  },
};
