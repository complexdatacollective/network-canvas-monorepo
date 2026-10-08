import { describe, expect, test } from 'vitest';

import type { NcEdge, NcNode } from '@codaco/shared-consts';

import { participantsFamily } from '../../pedigree-common/membership';
import { readFamily } from '../model';
import {
  relationshipsToParticipant,
  relationshipWrites,
} from '../relationshipToParticipant';
import { config, link, person } from './fixtures';

const relationshipsOf = (nodes: NcNode[], edges: NcEdge[]) =>
  Object.fromEntries(
    relationshipsToParticipant(
      participantsFamily(readFamily(nodes, edges, config)),
    ),
  );

const ego = person('ego', { isEgo: true });

describe('relationshipsToParticipant', () => {
  test('names every kind of parent, child and partner, neutrally', () => {
    expect(
      relationshipsOf(
        [
          ego,
          person('mum', { sex: ['female'], gender: ['woman'] }),
          person('adoptiveDad', { sex: ['male'] }),
          person('stepmum'),
          person('donor'),
          person('surrogate'),
          person('kid'),
          person('adoptedKid'),
          person('stepkid'),
          person('donorKid'),
          person('surrogacyKid'),
          person('wife'),
          person('ex'),
        ],
        [
          link('mum', 'ego', 'biological'),
          link('adoptiveDad', 'ego', 'adoptive'),
          link('stepmum', 'ego', 'social'),
          link('donor', 'ego', 'donor'),
          link('surrogate', 'ego', 'surrogate', { carrier: true }),
          link('ego', 'kid', 'biological'),
          link('ego', 'adoptedKid', 'adoptive'),
          link('ego', 'stepkid', 'social'),
          link('ego', 'donorKid', 'donor'),
          link('ego', 'surrogacyKid', 'surrogate'),
          link('ego', 'wife', 'partner'),
          link('ego', 'ex', 'partner', { current: false }),
        ],
      ),
    ).toEqual({
      mum: 'parent',
      adoptiveDad: 'adoptiveParent',
      stepmum: 'stepParent',
      donor: 'donor',
      surrogate: 'surrogate',
      kid: 'child',
      adoptedKid: 'adoptiveChild',
      stepkid: 'stepChild',
      donorKid: 'donorConceivedChild',
      surrogacyKid: 'surrogacyChild',
      wife: 'partner',
      ex: 'formerPartner',
    });
  });

  test('tells full, half, adoptive and step siblings apart', () => {
    expect(
      relationshipsOf(
        [
          ego,
          person('mum'),
          person('dad'),
          person('stepdad'),
          person('full'),
          person('half'),
          person('adopted'),
          person('step'),
        ],
        [
          link('mum', 'ego', 'biological'),
          link('dad', 'ego', 'biological'),
          link('mum', 'full', 'biological'),
          link('dad', 'full', 'biological'),
          link('mum', 'half', 'biological'),
          link('mum', 'adopted', 'adoptive'),
          link('dad', 'adopted', 'adoptive'),
          link('mum', 'stepdad', 'partner'),
          link('stepdad', 'step', 'biological'),
        ],
      ),
    ).toMatchObject({
      full: 'sibling',
      half: 'halfSibling',
      adopted: 'adoptiveSibling',
      step: 'stepSibling',
      stepdad: 'stepParent',
    });
  });

  test('names relatives further out, and in-laws, with no side of the family', () => {
    expect(
      relationshipsOf(
        [
          ego,
          person('mum'),
          person('nan', { sex: ['female'] }),
          person('greatNan'),
          person('aunt'),
          person('cousin'),
          person('greatAunt'),
          person('sis'),
          person('niece'),
          person('kid'),
          person('grandkid'),
          person('greatGrandkid'),
          person('wife'),
          person('wifesMum'),
          person('wifesBrother'),
          person('kidsPartner'),
          person('cousinsChild'),
        ],
        [
          link('mum', 'ego', 'biological'),
          link('nan', 'mum', 'biological'),
          link('greatNan', 'nan', 'biological'),
          link('nan', 'aunt', 'biological'),
          link('aunt', 'cousin', 'biological'),
          link('greatNan', 'greatAunt', 'biological'),
          link('mum', 'sis', 'biological'),
          link('sis', 'niece', 'biological'),
          link('ego', 'kid', 'biological'),
          link('kid', 'grandkid', 'biological'),
          link('grandkid', 'greatGrandkid', 'biological'),
          link('ego', 'wife', 'partner'),
          link('wifesMum', 'wife', 'biological'),
          link('wifesMum', 'wifesBrother', 'biological'),
          link('kid', 'kidsPartner', 'partner'),
          link('cousin', 'cousinsChild', 'biological'),
        ],
      ),
    ).toEqual({
      mum: 'parent',
      nan: 'grandparent',
      greatNan: 'greatGrandparent',
      aunt: 'parentsSibling',
      cousin: 'cousin',
      greatAunt: 'grandparentsSibling',
      sis: 'sibling',
      niece: 'siblingsChild',
      kid: 'child',
      grandkid: 'grandchild',
      greatGrandkid: 'greatGrandchild',
      wife: 'partner',
      wifesMum: 'parentInLaw',
      wifesBrother: 'siblingInLaw',
      kidsPartner: 'childInLaw',
      cousinsChild: 'otherRelative',
    });
  });

  test('keeps the closest biological or legal tie where someone is related in several ways', () => {
    expect(
      relationshipsOf(
        [
          ego,
          person('dad'),
          person('stepmum'),
          person('auntDonor'),
          person('nanSurrogate'),
          person('sis'),
          person('uncle'),
          person('cousin'),
        ],
        [
          // Dad's sister gave the egg: a donor before a parent's sibling.
          link('dad', 'ego', 'biological'),
          link('auntDonor', 'ego', 'donor'),
          link('nanSurrogate', 'dad', 'biological'),
          link('nanSurrogate', 'auntDonor', 'biological'),
          // Nan also carried ego: a grandparent before a surrogate.
          link('nanSurrogate', 'ego', 'surrogate', { carrier: true }),
          // Dad's partner adopted ego's sister and raised ego: a step-parent,
          // and the sister, adopted by both, an adoptive sibling.
          link('dad', 'stepmum', 'partner'),
          link('stepmum', 'ego', 'social'),
          link('dad', 'sis', 'adoptive'),
          // A cousin who is also the sister's partner: a cousin before a
          // sibling-in-law.
          link('nanSurrogate', 'uncle', 'biological'),
          link('uncle', 'cousin', 'biological'),
          link('sis', 'cousin', 'partner'),
        ],
      ),
    ).toMatchObject({
      dad: 'parent',
      auntDonor: 'donor',
      nanSurrogate: 'grandparent',
      stepmum: 'stepParent',
      sis: 'adoptiveSibling',
      uncle: 'parentsSibling',
      cousin: 'cousin',
    });
    // A biological parent who is also the other parent's partner is a
    // parent, not a step-parent.
    expect(
      relationshipsOf(
        [ego, person('mum'), person('dad')],
        [
          link('mum', 'ego', 'biological'),
          link('dad', 'ego', 'biological'),
          link('mum', 'dad', 'partner'),
        ],
      ),
    ).toEqual({ mum: 'parent', dad: 'parent' });
  });

  test('gives the participant nothing, and leaves out anyone not connected to them', () => {
    const result = relationshipsOf(
      [ego, person('mum'), person('stranger')],
      [link('mum', 'ego', 'biological')],
    );
    expect(result).toEqual({ mum: 'parent' });
  });
});

describe('relationshipWrites', () => {
  test('writes what changed, and clears it from the participant and anyone no longer connected', () => {
    const nodes = [
      person('ego', { isEgo: true, rel: ['child'] }),
      person('mum', { rel: ['parent'] }),
      person('dad', { rel: ['partner'] }),
      person('kid'),
      person('former', { rel: ['sibling'] }),
      person('neverFamily'),
    ];
    const family = participantsFamily(
      readFamily(
        nodes,
        [
          link('mum', 'ego', 'biological'),
          link('dad', 'ego', 'biological'),
          link('ego', 'kid', 'biological'),
        ],
        config,
      ),
    );
    expect(relationshipWrites(nodes, family, config, 'rel')).toEqual([
      { personId: 'ego', relationship: undefined },
      { personId: 'dad', relationship: 'parent' },
      { personId: 'kid', relationship: 'child' },
      { personId: 'former', relationship: undefined },
    ]);
  });
});
