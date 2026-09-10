import {
  asEntityAttributeReference,
  CurrentProtocolSchema,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { readProtocolJson } from '../helpers/read-store.js';

test.use({ locale: 'es-MX' });

for (const { kind, label } of [
  { kind: 'GFM and HTML', label: '~~<em>Isabel</em>~~' },
  { kind: 'raw HTML', label: '<em>Isabel</em>' },
  {
    kind: 'sanitized HTML',
    label: '<script>Zulu</script><em>Isabel</em>',
  },
]) {
  test(`updates the actual rule editor and printed operand lists for ${kind} without changing authored values`, async ({
    architectPage: page,
    seed,
  }) => {
    const { protocol, assets } = loadAllInterfacesFixture();
    const stage = protocol.stages.find(
      (candidate) => candidate.type === 'Information',
    );
    const variable = protocol.codebook.node?.person?.variables?.contactType;
    if (!stage || !variable || variable.type !== 'categorical') {
      throw new Error('Expected the Information stage and contactType fixture');
    }
    variable.options = [
      { value: 'in_person', label: 'Bravo' },
      { value: 'call', label: 'Zulu' },
      { value: 'text', label },
    ];
    stage.skipLogic = {
      action: 'SKIP',
      filter: {
        rules: [
          {
            id: 'authored-rule',
            type: 'node',
            options: {
              type: 'person',
              attribute: asEntityAttributeReference('contactType'),
              operator: 'INCLUDES',
              value: ['in_person', 'call', 'text'],
            },
          },
        ],
      },
    };
    expect(CurrentProtocolSchema.safeParse(protocol).success).toBe(true);
    await seed(protocol, { name: 'Authored_Rule_List', assets });
    await gotoProtocol(page);
    const before = await readProtocolJson(page);
    await page.goto(`/protocol/stage/${stage.id}`);

    const summary = await page.context().newPage();
    // The active protocol is tab-scoped. Open this existing library entry in
    // the second tab before navigating to its printable summary.
    await summary.goto('/');
    await summary.getByText('Authored_Rule_List', { exact: true }).click();
    await expect(summary).toHaveURL(/\/protocol$/);
    await summary.goto('/protocol/summary');
    const settings = await page.context().newPage();
    await settings.goto('/');
    await settings.getByRole('button', { name: 'Ajustes de idioma' }).click();
    const language = settings.getByRole('combobox', {
      name: /^(Idioma de Architect|Architect language)$/,
    });
    for (const [locale, expected] of [
      ['es', 'Bravo, Zulu e Isabel'],
      ['en', 'Bravo, Zulu, and Isabel'],
      ['en-GB', 'Bravo, Zulu and Isabel'],
    ]) {
      if (!locale || !expected) throw new Error('Missing locale expectation');
      await language.selectOption(locale);
      for (const surface of [page, summary]) {
        await expect(surface.locator('html')).toHaveAttribute('lang', locale);
        const values = surface.locator('[data-rule-part="value"]');
        await expect(values).toHaveText(['Bravo', 'Zulu', 'Isabel']);
        await expect(values.first().locator('..')).toHaveText(expected);
        await expect(values.last().locator('em')).toHaveText('Isabel');
        expect(await readProtocolJson(surface)).toEqual(before);
      }
    }
    await settings.close();
    await summary.close();
  });
}
