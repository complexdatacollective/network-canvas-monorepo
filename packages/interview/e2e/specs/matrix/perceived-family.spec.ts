import path from 'node:path';

import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { createInitialNetwork } from '../../../src/contract/network.js';
import { expect, matrixTest } from '../../fixtures/matrix-test.js';

const protocolPath = path.resolve(
  import.meta.dirname,
  '../../../../protocols/documentation/pedigree-collaboration/queer-perceived-family/protocol.json',
);

const person: NcNode = {
  _uid: 'jo',
  type: 'person',
  [entityAttributesProperty]: {
    name: 'Jo',
    family_layout: { x: 0.5, y: 0.5 },
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
    await expect(
      page.getByRole('heading', { name: 'Your words for family' }),
    ).toBeVisible();
    await interview.dismissIntro();
    await stage.form.selectCheckbox('family_categories', 'Chosen family');
    await stage.form.selectCheckbox(
      'family_categories',
      "Partner or partner's family",
    );
    await stage.form.fillText(
      'category_words',
      'My chosen sibling and partner',
    );
    await interview.next();

    const network = await protocol.getNetworkState(interview.interviewId);
    expect(network?.nodes).toHaveLength(1);
    expect(network?.nodes[0]?.[entityAttributesProperty]).toMatchObject({
      family_categories: ['chosen', 'partner'],
      category_words: 'My chosen sibling and partner',
    });

    await page.getByRole('button', { name: 'Previous Step' }).click();
    await expect(page).toHaveURL(/step=3/);
    await expect(
      page.getByRole('heading', { name: 'Your words for family' }),
    ).toBeVisible();
    await interview.dismissIntro();
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
      stage.form.field('category_words').getByRole('textbox'),
    ).toHaveValue('My chosen sibling and partner');
  },
);

matrixTest(
  'all four family and support nominations save participant selections',
  async ({ page, protocol, interview, stage }) => {
    await interview.goto(5);
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
        variable: 'feels_family',
        prompt: 'Who on this map feels like family to you right now?',
      },
      {
        variable: 'emotional_support',
        prompt:
          'Who can you turn to when you need to talk about something personal?',
      },
      {
        variable: 'practical_support',
        prompt:
          'Who helps with everyday needs, such as a place to stay, transport or practical advice?',
      },
      {
        variable: 'identity_affirming',
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
