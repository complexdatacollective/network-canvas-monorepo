import {
  asEntityAttributeReference,
  CurrentProtocolSchema,
  createProtocolObjectId,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { typeIdNamed, variableIdNamed } from '../helpers/codebook-ids.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { readProtocolJson } from '../helpers/read-store.js';

test.use({ locale: 'es-MX' });

// An option label is standard markdown: emphasis is drawn, while tildes and
// HTML are shown as typed. The Spanish conjunction is chosen from what is
// shown ("e" before a sound of "i", otherwise "y").
for (const { kind, label, shown, conjunction, emphasised } of [
  {
    kind: 'emphasis',
    label: '*Isabel*',
    shown: 'Isabel',
    conjunction: 'e',
    emphasised: true,
  },
  {
    kind: 'tildes around emphasis',
    label: '~~*Isabel*~~',
    shown: '~~Isabel~~',
    conjunction: 'y',
    emphasised: true,
  },
  {
    kind: 'raw HTML',
    label: '<em>Isabel</em>',
    shown: '<em>Isabel</em>',
    conjunction: 'y',
    emphasised: false,
  },
  {
    kind: 'a script element',
    label: '<script>Zulu</script><em>Isabel</em>',
    shown: '<script>Zulu</script><em>Isabel</em>',
    conjunction: 'y',
    emphasised: false,
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
    const personTypeId = typeIdNamed(protocol, 'node', 'person');
    const contactTypeId = variableIdNamed(
      protocol,
      { entity: 'node', typeName: 'person' },
      'contactType',
    );
    const variable =
      protocol.codebook.node?.[personTypeId]?.variables?.[contactTypeId];
    if (!stage || !variable || variable.type !== 'categorical') {
      throw new Error('Expected the Information stage and contactType fixture');
    }
    const { defaultLocale } = protocol.localization;
    variable.options = [
      { value: 'in_person', label: { [defaultLocale]: 'Bravo' } },
      { value: 'call', label: { [defaultLocale]: 'Zulu' } },
      { value: 'text', label: { [defaultLocale]: label } },
    ];
    stage.skipLogic = {
      action: 'SKIP',
      filter: {
        rules: [
          {
            id: createProtocolObjectId(),
            type: 'node',
            options: {
              type: personTypeId,
              attribute: asEntityAttributeReference(contactTypeId),
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
    const switcher = settings.getByRole('combobox', {
      name: /^Interface language:/,
    });
    const language = settings.getByRole('dialog', {
      name: /^(Idioma de la interfaz|Interface language)$/,
    });
    const optionNames = {
      'es': /^Español/,
      'en': /^English$/,
      'en-GB': /^English \(UK\)/,
    } as const;
    for (const [locale, expected] of [
      ['es', `Bravo, Zulu ${conjunction} ${shown}`],
      ['en', `Bravo, Zulu, and ${shown}`],
      ['en-GB', `Bravo, Zulu and ${shown}`],
    ] as const) {
      await switcher.click();
      await language.getByRole('option', { name: optionNames[locale] }).click();
      await expect(language).toBeHidden();
      for (const surface of [page, summary]) {
        await expect(surface.locator('html')).toHaveAttribute('lang', locale);
        const values = surface.locator('[data-rule-part="value"]');
        await expect(values).toHaveText(['Bravo', 'Zulu', shown]);
        // The operand list names itself, because the editor's own rule card
        // and the printable summary wrap it in different markup.
        await expect(surface.locator('[data-rule-part="operand"]')).toHaveText(
          expected,
        );
        if (emphasised) {
          await expect(values.last().locator('em')).toHaveText('Isabel');
        } else {
          await expect(values.last().locator('em')).toHaveCount(0);
        }
        expect(await readProtocolJson(surface)).toEqual(before);
      }
    }
    await settings.close();
    await summary.close();
  });
}
