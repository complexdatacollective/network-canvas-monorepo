import { readFileSync } from 'node:fs';
import path from 'node:path';

import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { createInitialNetwork } from '../../../src/contract/network.js';
import { expect, matrixTest } from '../../fixtures/matrix-test.js';

const protocolPath = path.resolve(
  import.meta.dirname,
  '../../../../protocols/e2e/perceived-family/protocol.json',
);

// The codebook is keyed by UUIDs, so the test finds the Person type and its
// variables by name.
const codebook = CurrentProtocolSchema.parse(
  JSON.parse(readFileSync(protocolPath, 'utf8')),
).codebook;
const [personTypeId, personType] =
  Object.entries(codebook.node ?? {}).find(
    ([, type]) => type.name === 'Person',
  ) ?? [];
if (!personTypeId || !personType) {
  throw new Error('The perceived-family protocol has no Person node type');
}
const variableIdByName = new Map(
  Object.entries(personType.variables ?? {}).map(([id, variable]) => [
    variable.name,
    id,
  ]),
);
const variableId = (name: string) => {
  const id = variableIdByName.get(name);
  if (!id) {
    throw new Error(`The Person node type has no "${name}" variable`);
  }
  return id;
};
const FAMILY_CATEGORIES = variableId('family_categories');
const CATEGORY_WORDS = variableId('category_words');

const person: NcNode = {
  _uid: 'jo',
  type: personTypeId,
  [entityAttributesProperty]: {
    [variableId('name')]: 'Jo',
    [variableId('family_layout')]: { x: 0.5, y: 0.5 },
  },
};

matrixTest.beforeEach(async ({ protocol, interview }) => {
  const installed = await protocol.installJson(protocolPath);
  interview.interviewId = await protocol.createInterview(
    installed.protocolId,
    'fictional-perceived-family',
    { network: { ...createInitialNetwork(), nodes: [person] } },
  );
});

matrixTest(
  'family categories overlap and coexist with participants own words',
  async ({ page, protocol, interview, stage }) => {
    await interview.goto(3);
    // The instructions are an Information stage before the form.
    await expect(
      page.getByRole('heading', { name: 'Your words for family' }),
    ).toBeVisible();
    await interview.next();
    await interview.waitForForm();
    await stage.form.selectCheckbox(FAMILY_CATEGORIES, 'Chosen family');
    await stage.form.selectCheckbox(
      FAMILY_CATEGORIES,
      "Partner or partner's family",
    );
    await stage.form.fillText(CATEGORY_WORDS, 'My chosen sibling and partner');
    await interview.next();

    const network = await protocol.getNetworkState(interview.interviewId);
    expect(network?.nodes).toHaveLength(1);
    expect(network?.nodes[0]?.[entityAttributesProperty]).toMatchObject({
      [FAMILY_CATEGORIES]: ['chosen', 'partner'],
      [CATEGORY_WORDS]: 'My chosen sibling and partner',
    });

    await page.getByRole('button', { name: 'Previous Step' }).click();
    await expect(page).toHaveURL(/step=4/);
    await interview.waitForForm();
    await expect(
      page.getByRole('checkbox', { name: 'Chosen family', exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole('checkbox', {
        name: "Partner or partner's family",
        exact: true,
      }),
    ).toBeChecked();
    await expect(
      stage.form.field(CATEGORY_WORDS).getByRole('textbox'),
    ).toHaveValue('My chosen sibling and partner');
  },
);

matrixTest(
  'all four family and support nominations save participant selections',
  async ({ page, protocol, interview, stage }) => {
    await interview.goto(6);
    await expect(
      page.getByText(
        'Place people on the map in a way that makes sense to you.',
        { exact: false },
      ),
    ).toBeVisible();
    await interview.nextButton.click();
    await expect(
      page.getByText(
        'Which people know one another? Connect them if you want to.',
      ),
    ).toBeVisible();

    const nominations = [
      {
        variable: variableId('feels_family'),
        prompt: 'Who on this map feels like family to you right now?',
      },
      {
        variable: variableId('emotional_support'),
        prompt:
          'Who can you turn to when you need to talk about something personal?',
      },
      {
        variable: variableId('practical_support'),
        prompt:
          'Who helps with everyday needs, such as a place to stay, transport or practical advice?',
      },
      {
        variable: variableId('identity_affirming'),
        prompt: 'Who helps you feel recognised and accepted as you are?',
      },
    ];

    for (const { variable, prompt } of nominations) {
      await interview.nextButton.click();
      await expect(page.getByText(prompt, { exact: true })).toBeVisible();
      await stage.sociogram.clickNode('Jo');
      await expect
        .poll(async () => {
          const network = await protocol.getNetworkState(interview.interviewId);
          return network?.nodes.find((node) => node._uid === 'jo')?.[
            entityAttributesProperty
          ][variable];
        })
        .toBe(true);
      await expect(stage.sociogram.getNode('Jo')).toHaveAttribute(
        'data-node-highlighted',
        'true',
      );
      await stage.sociogram.clickNode('Jo');
      await expect
        .poll(async () => {
          const network = await protocol.getNetworkState(interview.interviewId);
          return network?.nodes.find((node) => node._uid === 'jo')?.[
            entityAttributesProperty
          ][variable];
        })
        .toBe(false);
    }
  },
);
