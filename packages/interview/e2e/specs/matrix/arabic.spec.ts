import path from 'node:path';

import type { Page } from '@playwright/test';

import { auditArabicPage } from '@codaco/e2e-helpers/arabic-page-audit';
import { SyntheticInterview } from '@codaco/protocol-utilities';

import { expect, matrixTest as test } from '../../fixtures/matrix-test.js';
import {
  buildSyntheticPayload,
  type SyntheticAssetSpec,
} from '../../helpers/synthetic-payload.js';

/**
 * An interview in Arabic, one stage of every interface, checked by
 * `auditArabicPage`: the interview is marked Arabic and laid out right to
 * left, no box runs off the window, and no Latin text is left untranslated or
 * shown without its own direction. The protocol is written in Arabic only, so
 * every word the participant sees comes from it; names the participant gave
 * are Latin on purpose (“team-b!”), so a name shown without its own direction
 * is caught.
 *
 * The interview is mounted in the test host, whose own page stays English, so
 * the audit is of the interview's region.
 */

const INTERVIEW = 'main[data-theme-interview]';

/**
 * Latin words an interview shows as they are in every language: product
 * names, and the name printed on a key.
 */
const UNTRANSLATED = ['Network Canvas', 'Mapbox', 'WebGL', 'Enter'];

const DATA_DIR = path.resolve(import.meta.dirname, '../../fixtures/data');

const ROSTER_ASSET: SyntheticAssetSpec = {
  assetId: 'roster',
  name: 'قائمة الأسماء',
  type: 'network',
  source: 'roster-small.json',
  localPath: path.join(DATA_DIR, 'roster-small.json'),
};
const TOKEN_ASSET: SyntheticAssetSpec = {
  assetId: 'mapbox-token',
  name: 'مفتاح الخريطة',
  type: 'apikey',
  value: 'pk.test-token-e2e',
};
const AREAS_ASSET: SyntheticAssetSpec = {
  assetId: 'areas',
  name: 'المناطق',
  type: 'geojson',
  source: 'two-tracts.geojson',
  localPath: path.join(DATA_DIR, 'two-tracts.geojson'),
};

type Stage = {
  /** The interface, for the report. */
  name: string;
  /** Text the stage shows once it is ready. */
  shows: string;
  /** What the stage opens on demand, each opened in turn and checked. */
  opens?: { name: string; open: (page: Page) => Promise<void> }[];
};

/**
 * One stage of every interface in an Arabic-only protocol, with people
 * already named, placed and connected, so each stage has someone to show.
 */
function arabicInterview() {
  const synth = new SyntheticInterview();
  synth.setLocalization({ defaultLocale: 'ar', locales: ['ar'] });
  const stages: Stage[] = [];

  const person = synth.addNodeType({ name: 'شخص' });
  const name = person.addVariable({ id: 'name', type: 'text', name: 'name' });
  const layout = person.addVariable({ type: 'layout', name: 'layout' });
  const nickname = person.addVariable({
    id: 'nickname',
    name: 'nickname',
    type: 'text',
    component: 'Text',
  });
  const closeness = person.addVariable({
    name: 'closeness',
    type: 'ordinal',
    options: [
      { label: 'بعيد', value: 1 },
      { label: 'قريب', value: 2 },
      { label: 'قريب جدا', value: 3 },
    ],
  });
  const circle = person.addVariable({
    name: 'circle',
    type: 'categorical',
    options: [
      { label: 'العائلة', value: 1 },
      { label: 'العمل', value: 2 },
    ],
  });
  const home = person.addVariable({ name: 'home', type: 'location' });
  const friendship = synth.addEdgeType({ name: 'صداقة' });
  const strength = friendship.addVariable({
    id: 'strength',
    name: 'strength',
    type: 'ordinal',
    options: [
      { label: 'ضعيفة', value: 1 },
      { label: 'قوية', value: 2 },
    ],
  });
  const met = friendship.addVariable({
    id: 'met',
    name: 'met',
    type: 'text',
    component: 'Text',
  });
  const subject = { entity: 'node' as const, type: person.id };

  const information = synth.addInformationStage({
    title: 'مرحبا بكم في الدراسة',
    text: 'شكرا لمشاركتكم.',
  });
  stages.push({
    name: 'Information',
    shows: 'مرحبا بكم في الدراسة',
    opens: [
      {
        name: 'the interview settings',
        open: async (page) => {
          await page.getByTestId('settings-button').click();
          await expect(
            page.getByRole('dialog', { name: 'Interview settings' }),
          ).toBeVisible();
        },
      },
    ],
  });

  const egoName = synth.addEgoVariable({
    name: 'egoName',
    type: 'text',
    component: 'Text',
  });
  synth
    .addStage('EgoForm', {
      introductionPanel: { title: 'عنك', text: 'أجب عن السؤال التالي.' },
    })
    .addFormField({ variable: egoName.id, component: 'Text', prompt: 'الاسم' });
  stages.push({ name: 'EgoForm', shows: 'أجب عن السؤال التالي.' });

  const nameGenerator = synth.addStage('NameGenerator', {
    subject,
    form: { title: 'إضافة شخص', fields: [] },
  });
  nameGenerator.addFormField({
    variable: nickname.id,
    component: 'Text',
    prompt: 'الاسم',
  });
  nameGenerator.addPrompt({ text: 'مع من تقضي وقت فراغك؟' });
  stages.push({
    name: 'NameGenerator',
    shows: 'مع من تقضي وقت فراغك؟',
    opens: [
      {
        name: 'the form for a new person',
        open: async (page) => {
          await page.getByRole('button', { name: 'Add a person' }).click();
          await expect(page.getByRole('dialog')).toBeVisible();
        },
      },
    ],
  });

  synth
    .addStage('NameGeneratorQuickAdd', { subject, quickAdd: name.id })
    .addPrompt({ text: 'من تعرف؟' });
  stages.push({
    name: 'NameGeneratorQuickAdd',
    shows: 'من تعرف؟',
    opens: [
      {
        name: 'a name being typed',
        open: async (page) => {
          await page.getByTestId('quick-add-toggle').click();
          // An Arabic name, previewed in the button as it is typed, is in
          // the interview's language.
          await page.getByTestId('quick-add-input').fill('ليلى');
          await expect(page.getByTestId('quick-add-toggle')).toContainText(
            'ليلى',
          );
        },
      },
    ],
  });

  synth.addAsset({
    id: ROSTER_ASSET.assetId,
    name: ROSTER_ASSET.name,
    type: 'network',
    source: 'roster-small.json',
  });
  synth
    .addStage('NameGeneratorRoster', {
      subject,
      dataSource: ROSTER_ASSET.assetId,
      panelTitle: 'يمكن إضافتهم',
      cardOptions: {
        additionalProperties: [{ label: 'المدينة', variable: 'location' }],
      },
    })
    .addPrompt({ text: 'من تعرف من هذه القائمة؟' });
  stages.push({
    name: 'NameGeneratorRoster',
    shows: 'من تعرف من هذه القائمة؟',
  });

  synth.addStage('Sociogram', { subject }).addPrompt({
    text: 'ضع الأشخاص على الخريطة',
    layout: { layoutVariable: layout.id },
  });
  stages.push({ name: 'Sociogram', shows: 'ضع الأشخاص على الخريطة' });

  synth
    .addStage('DyadCensus', { subject })
    .addPrompt({ text: 'هل يعرف أحدهما الآخر؟', createEdge: friendship.id });
  stages.push({ name: 'DyadCensus', shows: 'هل يعرف أحدهما الآخر؟' });

  synth
    .addStage('OneToManyDyadCensus', {
      subject,
      behaviours: { removeAfterConsideration: false },
    })
    .addPrompt({ text: 'من يعرف هذا الشخص؟', createEdge: friendship.id });
  stages.push({ name: 'OneToManyDyadCensus', shows: 'من يعرف هذا الشخص؟' });

  synth.addStage('TieStrengthCensus', { subject }).addPrompt({
    text: 'ما مدى قوة صداقتهما؟',
    createEdge: friendship.id,
    edgeVariable: strength.id,
    negativeLabel: 'لا صداقة بينهما',
  });
  stages.push({ name: 'TieStrengthCensus', shows: 'ما مدى قوة صداقتهما؟' });

  synth
    .addStage('OrdinalBin', { subject })
    .addPrompt({ text: 'ما مدى قربك منهم؟', variable: closeness.id });
  stages.push({ name: 'OrdinalBin', shows: 'ما مدى قربك منهم؟' });

  synth
    .addStage('CategoricalBin', { subject })
    .addPrompt({ text: 'أين تعرفت إليهم؟', variable: circle.id });
  stages.push({ name: 'CategoricalBin', shows: 'أين تعرفت إليهم؟' });

  synth.addStage('AlterForm', { subject }).addFormField({
    variable: nickname.id,
    component: 'Text',
    prompt: 'اللقب',
  });
  stages.push({ name: 'AlterForm', shows: 'اللقب' });

  synth
    .addStage('AlterEdgeForm', {
      subject: { entity: 'edge', type: friendship.id },
    })
    .addFormField({
      variable: met.id,
      component: 'Text',
      prompt: 'أين تعارفا؟',
    });
  stages.push({ name: 'AlterEdgeForm', shows: 'أين تعارفا؟' });

  synth
    .addStage('Narrative', { subject })
    .addPreset({ label: 'عرض الصداقات', layoutVariable: layout.id });
  stages.push({ name: 'Narrative', shows: 'عرض الصداقات' });

  synth.addStage('NetworkComposer', {
    subject,
    quickAdd: name.id,
    layoutVariable: layout.id,
  });
  stages.push({ name: 'NetworkComposer', shows: 'team-b!' });

  synth.addAsset({
    id: TOKEN_ASSET.assetId,
    name: TOKEN_ASSET.name,
    type: 'apikey',
    value: 'pk.test-token-e2e',
  });
  synth.addAsset({
    id: AREAS_ASSET.assetId,
    name: AREAS_ASSET.name,
    type: 'geojson',
    source: 'two-tracts.geojson',
  });
  synth
    .addStage('Geospatial', {
      subject,
      mapOptions: {
        tokenAssetId: TOKEN_ASSET.assetId,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-87.6298, 41.8781],
        initialZoom: 11,
        dataSourceAssetId: AREAS_ASSET.assetId,
        color: 'ord-color-seq-1',
        targetFeatureProperty: 'census_tra',
      },
    })
    .addPrompt({ text: 'أين يسكن هذا الشخص؟', variable: home.id });
  stages.push({ name: 'Geospatial', shows: 'أين يسكن هذا الشخص؟' });

  const relative = synth.addNodeType({ name: 'قريب' });
  const pedigree = synth.addStage('FamilyPedigree', {
    subject: { entity: 'node', type: relative.id },
    framing: 'gamete',
    askGenderIdentity: false,
    prompt: 'ارسم شجرة عائلتك.',
    nominationPrompts: [{ text: 'من في عائلتك مصاب بالسكري؟' }],
  });
  relative.setShape({
    default: 'diamond',
    dynamic: {
      variable: pedigree.sexAssignedAtBirth,
      type: 'discrete',
      map: [
        { value: 'male', shape: 'square' },
        { value: 'female', shape: 'circle' },
      ],
    },
  });
  stages.push({
    name: 'FamilyPedigree',
    shows: 'ارسم شجرة عائلتك.',
    opens: [
      {
        name: 'the menu for a relative',
        open: async (page) => {
          // The person holding focus shows their menu.
          await page
            .getByTestId('pedigree-person')
            .getByLabel('مريم', { exact: true })
            .focus();
          await expect(page.getByTestId('pedigree-menu-parent')).toBeVisible();
        },
      },
    ],
  });

  const diabetes = pedigree.nominations[0];
  if (!diabetes) throw new Error('The pedigree records no condition');
  const relativeOf = (
    uid: string,
    relativeName: string,
    sex: 'male' | 'female',
    extra: Record<string, unknown> = {},
  ) =>
    synth.addManualNode(pedigree.id, relative.id, uid, {
      [pedigree.ego]: false,
      [diabetes]: false,
      [pedigree.name]: relativeName,
      [pedigree.sexAssignedAtBirth]: [sex],
      ...extra,
    });
  relativeOf('mother', 'مريم', 'female', { [diabetes]: true });
  relativeOf('father', 'Sam', 'male');
  relativeOf('me', 'نور', 'female', { [pedigree.ego]: true });
  const relate = (
    uid: string,
    from: string,
    to: string,
    kind: 'biological' | 'partner',
  ) =>
    synth.addManualEdge(pedigree.edgeType, uid, from, to, {
      [pedigree.kind]: [kind],
      ...(kind === 'partner'
        ? { [pedigree.currentPartner]: true }
        : { [pedigree.gestationalCarrier]: false }),
    });
  relate('parents', 'mother', 'father', 'partner');
  relate('from-mother', 'mother', 'me', 'biological');
  relate('from-father', 'father', 'me', 'biological');

  synth.addStage('NarrativePedigree', {
    sourceStageId: pedigree.id,
    showAtRiskStatuses: false,
    diseases: [
      {
        id: 'diabetes',
        label: 'السكري',
        color: 'node-color-seq-1',
        attribute: diabetes,
        inheritancePattern: 'autosomalDominant',
      },
    ],
  });
  stages.push({
    name: 'NarrativePedigree',
    shows: 'مريم',
    opens: [
      {
        name: 'a condition and its key',
        open: async (page) => {
          await page.getByTestId('narrative-pedigree-condition').click();
          await page
            .getByRole('menuitemradio', { name: 'السكري', exact: true })
            .click();
          await expect(
            page.getByTestId('narrative-pedigree-condition'),
          ).toHaveText('السكري');
        },
      },
    ],
  });

  synth.addStage('Anonymisation', {
    explanationText: '# احمِ بياناتك\n\nاختر عبارة مرور.',
  });
  stages.push({ name: 'Anonymisation', shows: 'احمِ بياناتك' });

  stages.push({ name: 'FinishSession', shows: 'إنهاء المقابلة' });

  // Participants named on the first stage, placed and connected: Latin and
  // Arabic names side by side.
  ['team-b!', 'سارة', 'Bob', 'ليلى'].forEach((personName, index) =>
    synth.addManualNode(information.id, person.id, `p${index}`, {
      [name.id]: personName,
      [nickname.id]: personName,
      [layout.id]: { x: 0.2 + index * 0.2, y: 0.3 + index * 0.1 },
      [closeness.id]: null,
      [circle.id]: [],
      [home.id]: null,
    }),
  );
  synth.addManualEdge(friendship.id, 'f0', 'p0', 'p1', {});
  synth.addManualEdge(friendship.id, 'f1', 'p2', 'p3', {});

  return { synth, stages };
}

const audit = async (page: Page, screen: string) => {
  // Boxes are measured in the Arabic typeface, not a fallback.
  await page.evaluate(() => document.fonts.ready);
  expect
    .soft(
      await page.evaluate(auditArabicPage, {
        root: INTERVIEW,
        untranslated: UNTRANSLATED,
      }),
      screen,
    )
    .toEqual([]);
};

test('every interface of an interview reads right to left in Arabic @smoke', async ({
  page,
  protocol,
  interview,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const { synth, stages } = arabicInterview();
  const built = buildSyntheticPayload(synth, {
    protocolName: 'دراسة الشبكات',
    seedNetwork: true,
    assets: [ROSTER_ASSET, TOKEN_ASSET, AREAS_ASSET],
  });
  const { protocolId } = await protocol.installPayload(built);
  interview.interviewId = await protocol.createInterview(protocolId, 'ar', {
    network: built.session.network,
  });

  for (const [step, stage] of stages.entries()) {
    await page.goto(`/?interviewId=${interview.interviewId}&step=${step}`);
    await expect(page.locator(INTERVIEW)).toHaveAttribute('lang', 'ar');
    await expect(
      page.locator(INTERVIEW).getByText(stage.shows).first(),
      stage.name,
    ).toBeVisible();
    await audit(page, stage.name);
    for (const { name, open } of stage.opens ?? []) {
      await open(page);
      await audit(page, `${stage.name}: ${name}`);
    }
  }

  expect(errors).toEqual([]);
});
