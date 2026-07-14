import { type Page } from '@playwright/test';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import { entityPrimaryKeyProperty } from '@codaco/shared-consts';

import { SlidesFormFixture } from '../fixtures/slides-form-fixture.js';
import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

// AlterEdgeForm's EdgeHeader renders TWO endpoint node buttons inside the
// sticky slide header (AlterEdgeForm.tsx:39-57), so the single-header helpers
// on SlidesFormFixture (getCurrentItemLabel/previousSlide) throw a strict-mode
// violation here. These scenarios read the endpoints via nth(0)/nth(1) directly
// and drive advancement/backwards navigation with the label-aware helpers below.
const HEADER_SELECTOR =
  '[data-stage-section="form"] .sticky.top-0 button[aria-label]';

/** Current edge slide's "from" endpoint label (header button nth 0). */
function edgeFromLabel(page: Page): Promise<string | null> {
  return page.locator(HEADER_SELECTOR).nth(0).getAttribute('aria-label');
}

/**
 * Advance one edge slide. Reads the current "from" endpoint and passes it to
 * nextSlide() so the fixture waits for a genuine slide change (distinct "from"
 * endpoints per slide) — or, on the final slide, for the URL step change when
 * the stage is left.
 */
async function advanceEdgeSlide(
  page: Page,
  slides: SlidesFormFixture,
): Promise<void> {
  const from = await edgeFromLabel(page);
  await slides.nextSlide(from);
}

/** Assert (retrying) that the active edge slide connects `from` → `to`. */
async function expectEdgeSlide(
  page: Page,
  from: string,
  to: string,
): Promise<void> {
  await expect(page.locator(HEADER_SELECTOR).nth(0)).toHaveAttribute(
    'aria-label',
    from,
  );
  await expect(page.locator(HEADER_SELECTOR).nth(1)).toHaveAttribute(
    'aria-label',
    to,
  );
}

/**
 * Click the previous-button and wait for either the intro to reappear (from
 * slide 0) or a valid dirty slide to auto-submit and step back (the "from"
 * endpoint label changes). Unlike the fixture's previousSlide(), this never
 * calls getCurrentItemLabel(), which throws on AlterEdgeForm's two-button
 * header. Pass the current "from" endpoint (or null when returning to intro).
 */
async function goBackEdgeSlide(
  page: Page,
  fromLabelBefore: string | null,
): Promise<void> {
  const beforeUrl = page.url();
  await page.getByTestId('previous-button').click();
  await page.waitForFunction(
    ({ beforeUrl, prev, selector }) => {
      if (window.location.href !== beforeUrl) return true;
      if (document.querySelector('[data-stage-section="intro"]') !== null) {
        return true;
      }
      if (prev == null) return false;
      const header = document.querySelector(selector);
      return header?.getAttribute('aria-label') !== prev;
    },
    { beforeUrl, prev: fromLabelBefore, selector: HEADER_SELECTOR },
    { timeout: 10_000 },
  );
}

function stepParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get('step');
}

export const alterEdgeFormScenarios: InterfaceScenarios = {
  interfaceType: 'AlterEdgeForm',
  scenarios: [
    {
      id: 'intro-and-transition',
      covers: [
        'id',
        'type',
        'label',
        'interviewScript',
        'introductionPanel.title',
        'introductionPanel.text',
      ],
      smoke: true,
      visual: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nt = synth.addNodeType({ name: 'Person' });
        const personName = nt.addVariable({ name: 'name', type: 'text' });
        const et = synth.addEdgeType({ name: 'Friendship' });
        et.addVariable({
          id: 'story',
          name: 'story',
          type: 'text',
          component: 'TextArea',
        });
        const stage = synth.addStage('AlterEdgeForm', {
          subject: { entity: 'edge', type: et.id },
          label: 'Internal: edge form',
          interviewScript: 'Ask about each tie.',
          introductionPanel: {
            title: 'Relationship details',
            text: 'This section asks about **each relationship** you noted.',
          },
        });
        stage.addFormField({
          component: 'TextArea',
          variable: 'story',
          prompt: 'Describe this relationship.',
        });
        synth.addManualNode(stage.id, nt.id, 'n0', { [personName.id]: 'Alex' });
        synth.addManualNode(stage.id, nt.id, 'n1', { [personName.id]: 'Sam' });
        synth.addManualNode(stage.id, nt.id, 'n2', { [personName.id]: 'Jo' });
        synth.addManualEdge(et.id, 'e0', 'n0', 'n1', {});
        synth.addManualEdge(et.id, 'e1', 'n1', 'n2', {});
        synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
        return synth;
      },
      run: async ({ page, interview }) => {
        const slides = new SlidesFormFixture(page);

        // Intro: ready (updateReady(true) on intro), title + markdown rendered.
        await expect(
          page.locator('[data-stage-section="intro"][data-stage-ready="true"]'),
        ).toBeVisible();
        await expect(
          page.getByRole('heading', { name: 'Relationship details' }),
        ).toBeVisible();
        await expect(
          page.locator('strong', { hasText: 'each relationship' }),
        ).toBeVisible();
        // label and interviewScript are author-facing only: never rendered.
        await expect(page.getByText('Internal: edge form')).toHaveCount(0);
        await expect(page.getByText('Ask about each tie.')).toHaveCount(0);
        await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

        // One click switches intro→form WITHOUT changing the stage step
        // (useBeforeNext returns false on the first forward from intro).
        const stepBefore = stepParam(page);
        await interview.dismissIntro();
        await expect(slides.isOnIntro()).resolves.toBe(false);
        await expect(
          page.locator('[data-stage-section="form"][data-stage-ready="true"]'),
        ).toBeVisible();
        expect(stepParam(page)).toBe(stepBefore);
      },
    },

    {
      id: 'subject-edge-type-scoping',
      covers: ['subject', 'variable.component=Text'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nt = synth.addNodeType({ name: 'Person' });
        const personName = nt.addVariable({ name: 'name', type: 'text' });
        const et = synth.addEdgeType({ name: 'Friendship' });
        const et2 = synth.addEdgeType({ name: 'Coworker' });
        et.addVariable({
          id: 'met-at',
          name: 'metAt',
          type: 'text',
          component: 'Text',
        });
        const stage = synth.addStage('AlterEdgeForm', {
          subject: { entity: 'edge', type: et.id },
          introductionPanel: {
            title: 'Relationship details',
            text: 'Answer the following.',
          },
        });
        stage.addFormField({
          component: 'Text',
          variable: 'met-at',
          prompt: 'Where did you meet?',
        });
        synth.addManualNode(stage.id, nt.id, 'n0', { [personName.id]: 'Alex' });
        synth.addManualNode(stage.id, nt.id, 'n1', { [personName.id]: 'Sam' });
        synth.addManualNode(stage.id, nt.id, 'n2', { [personName.id]: 'Jo' });
        synth.addManualEdge(et.id, 'f1', 'n0', 'n1', {});
        synth.addManualEdge(et.id, 'f2', 'n1', 'n2', {});
        // A Coworker edge proves subject scoping: it never appears as a slide.
        synth.addManualEdge(et2.id, 'c1', 'n0', 'n2', {});
        synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();

        await expectEdgeSlide(page, 'Alex', 'Sam');
        await stage.form.fillText('met-at', 'Work');
        await advanceEdgeSlide(page, slides);

        await expectEdgeSlide(page, 'Sam', 'Jo');
        await stage.form.fillText('met-at', 'School');
        await advanceEdgeSlide(page, slides);

        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        const edges = network?.edges ?? [];
        const byUid = (uid: string) =>
          edges.find((e) => e[entityPrimaryKeyProperty] === uid);
        expect(byUid('f1')?.attributes['met-at']).toBe('Work');
        expect(byUid('f2')?.attributes['met-at']).toBe('School');
        // The out-of-subject Coworker edge is never touched.
        expect(byUid('c1')?.attributes).not.toHaveProperty('met-at');
      },
    },

    {
      // `filter` itself is claimed via shared-claims.ts (Task 26); this scenario
      // exercises the node-rule → trimEdges behaviour for completeness.
      id: 'filter-excludes-node',
      covers: [],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nt = synth.addNodeType({ name: 'Person' });
        const personName = nt.addVariable({ name: 'name', type: 'text' });
        nt.addVariable({ id: 'excluded', name: 'excluded', type: 'boolean' });
        const et = synth.addEdgeType({ name: 'Friendship' });
        et.addVariable({
          id: 'met-at',
          name: 'metAt',
          type: 'text',
          component: 'Text',
        });
        const stage = synth.addStage('AlterEdgeForm', {
          subject: { entity: 'edge', type: et.id },
          // Keep only non-excluded nodes; trimEdges then drops any edge whose
          // endpoint was filtered out (network-query filter.ts trimEdges).
          filter: {
            rules: [
              {
                type: 'node',
                id: 'keep-included',
                options: {
                  type: nt.id,
                  attribute: 'excluded',
                  operator: 'EXACTLY',
                  value: false,
                },
              },
            ],
          },
          introductionPanel: {
            title: 'Relationship details',
            text: 'Answer the following.',
          },
        });
        stage.addFormField({
          component: 'Text',
          variable: 'met-at',
          prompt: 'Where did you meet?',
        });
        synth.addManualNode(stage.id, nt.id, 'a', {
          [personName.id]: 'Avery',
          excluded: false,
        });
        synth.addManualNode(stage.id, nt.id, 'b', {
          [personName.id]: 'Blair',
          excluded: false,
        });
        synth.addManualNode(stage.id, nt.id, 'c', {
          [personName.id]: 'Cameron',
          excluded: true,
        });
        synth.addManualEdge(et.id, 'ab', 'a', 'b', {});
        synth.addManualEdge(et.id, 'bc', 'b', 'c', {});
        synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();

        // Only the A–B edge survives the filter: C (excluded) and its edge B–C
        // are trimmed from the view, so Cameron never appears.
        await expectEdgeSlide(page, 'Avery', 'Blair');
        await expect(
          page.locator('[data-stage-section="form"]').getByText('Cameron'),
        ).toHaveCount(0);

        await stage.form.fillText('met-at', 'Work');
        await advanceEdgeSlide(page, slides);

        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();

        // Stored network is unfiltered: both edges persist, B–C untouched.
        const network = await protocol.getNetworkState(interview.interviewId);
        const edges = network?.edges ?? [];
        const ab = edges.find((e) => e[entityPrimaryKeyProperty] === 'ab');
        const bc = edges.find((e) => e[entityPrimaryKeyProperty] === 'bc');
        expect(ab?.attributes['met-at']).toBe('Work');
        expect(bc?.attributes).not.toHaveProperty('met-at');
        expect(edges).toHaveLength(2);
      },
    },

    {
      id: 'zero-edges-auto-skip',
      covers: ['zero-edges auto-skip'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nt = synth.addNodeType({ name: 'Person' });
        const personName = nt.addVariable({ name: 'name', type: 'text' });
        const et = synth.addEdgeType({ name: 'Friendship' });
        et.addVariable({
          id: 'met-at',
          name: 'metAt',
          type: 'text',
          component: 'Text',
        });
        const stage = synth.addStage('AlterEdgeForm', {
          subject: { entity: 'edge', type: et.id },
          introductionPanel: {
            title: 'Relationship details',
            text: 'Answer the following.',
          },
        });
        stage.addFormField({
          component: 'Text',
          variable: 'met-at',
          prompt: 'Where did you meet?',
        });
        // Three nodes but zero edges of the subject type.
        synth.addManualNode(stage.id, nt.id, 'a', { [personName.id]: 'Avery' });
        synth.addManualNode(stage.id, nt.id, 'b', { [personName.id]: 'Blair' });
        synth.addManualNode(stage.id, nt.id, 'c', { [personName.id]: 'Cameron' });
        synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        // Intro is shown; the form section never paints (AlterEdgeForm returns
        // null then moveForward()s), so dismissIntro()'s wait would hang —
        // advance with next() and observe the following stage.
        await expect(
          page.locator('[data-stage-section="intro"]'),
        ).toBeVisible();
        await expect(
          page.locator('[data-stage-section="form"]'),
        ).toHaveCount(0);

        await interview.next();

        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();
        await expect(
          page.locator('[data-stage-section="form"][data-stage-ready="true"]'),
        ).toHaveCount(0);

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.nodes ?? []).toHaveLength(3);
        expect(network?.edges ?? []).toHaveLength(0);
      },
    },

    {
      id: 'text-and-textarea-fields',
      covers: [
        'variable.component=Text',
        'variable.component=TextArea',
        'form',
        'form.fields[].variable',
        'form.fields[].prompt',
        'form.fields[].id', // dead: Architect reorder key, ignored at runtime
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nt = synth.addNodeType({ name: 'Person' });
        const personName = nt.addVariable({ name: 'name', type: 'text' });
        const et = synth.addEdgeType({ name: 'Friendship' });
        et.addVariable({
          id: 'met-at',
          name: 'metAt',
          type: 'text',
          component: 'Text',
        });
        et.addVariable({
          id: 'story',
          name: 'story',
          type: 'text',
          component: 'TextArea',
        });
        const stage = synth.addStage('AlterEdgeForm', {
          subject: { entity: 'edge', type: et.id },
          introductionPanel: {
            title: 'Relationship details',
            text: 'Answer the following.',
          },
        });
        stage.addFormField({
          component: 'Text',
          variable: 'met-at',
          prompt: 'Where did you meet?',
        });
        stage.addFormField({
          component: 'TextArea',
          variable: 'story',
          prompt: 'Tell the story.',
        });
        synth.addManualNode(stage.id, nt.id, 'a', { [personName.id]: 'Alex' });
        synth.addManualNode(stage.id, nt.id, 'b', { [personName.id]: 'Sam' });
        synth.addManualEdge(et.id, 'e1', 'a', 'b', {});
        synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();

        await stage.form.fillText('met-at', 'Work');
        await stage.form.fillText('story', 'A long story about how we met.');
        await advanceEdgeSlide(page, slides);

        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        const edge = (network?.edges ?? [])[0];
        expect(edge?.attributes['met-at']).toBe('Work');
        expect(edge?.attributes.story).toBe('A long story about how we met.');
      },
    },

    {
      id: 'number-coercion',
      covers: ['variable.component=Number'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nt = synth.addNodeType({ name: 'Person' });
        const personName = nt.addVariable({ name: 'name', type: 'text' });
        const et = synth.addEdgeType({ name: 'Friendship' });
        et.addVariable({
          id: 'years-known',
          name: 'yearsKnown',
          type: 'number',
          component: 'Number',
        });
        const stage = synth.addStage('AlterEdgeForm', {
          subject: { entity: 'edge', type: et.id },
          introductionPanel: {
            title: 'Relationship details',
            text: 'Answer the following.',
          },
        });
        stage.addFormField({
          component: 'Number',
          variable: 'years-known',
          prompt: 'How many years have you known each other?',
        });
        synth.addManualNode(stage.id, nt.id, 'a', { [personName.id]: 'Alex' });
        synth.addManualNode(stage.id, nt.id, 'b', { [personName.id]: 'Sam' });
        synth.addManualEdge(et.id, 'e1', 'a', 'b', {});
        synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();

        await stage.form.fillNumber('years-known', '42');
        await advanceEdgeSlide(page, slides);

        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        const edge = (network?.edges ?? [])[0];
        // coerceFormValues turned the raw string into a number.
        expect(edge?.attributes['years-known']).toBe(42);
        expect(typeof edge?.attributes['years-known']).toBe('number');
      },
    },

    {
      id: 'boolean-toggle-radio-likert',
      covers: [
        'variable.component=Boolean',
        'variable.options(boolean)+negative',
        'variable.component=Toggle',
        'variable.component=RadioGroup',
        'variable.component=LikertScale',
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nt = synth.addNodeType({ name: 'Person' });
        const personName = nt.addVariable({ name: 'name', type: 'text' });
        const et = synth.addEdgeType({ name: 'Friendship' });
        et.addVariable({
          id: 'have-met',
          name: 'haveMet',
          type: 'boolean',
          component: 'Boolean',
          options: [
            { label: 'Yes, we have', value: true },
            { label: 'No, never', value: false, negative: true },
          ],
        });
        et.addVariable({
          id: 'see-regularly',
          name: 'seeRegularly',
          type: 'boolean',
          component: 'Toggle',
        });
        et.addVariable({
          id: 'closeness',
          name: 'closeness',
          type: 'ordinal',
          component: 'RadioGroup',
          options: [
            { label: 'Very close', value: 3 },
            { label: 'Close', value: 2 },
            { label: 'Distant', value: 1 },
          ],
        });
        et.addVariable({
          id: 'trust',
          name: 'trust',
          type: 'ordinal',
          component: 'LikertScale',
          options: [
            { label: 'One', value: 1 },
            { label: 'Two', value: 2 },
            { label: 'Three', value: 3 },
            { label: 'Four', value: 4 },
            { label: 'Five', value: 5 },
          ],
        });
        const stage = synth.addStage('AlterEdgeForm', {
          subject: { entity: 'edge', type: et.id },
          introductionPanel: {
            title: 'Relationship details',
            text: 'Answer the following.',
          },
        });
        stage.addFormField({
          component: 'Boolean',
          variable: 'have-met',
          prompt: 'Have you ever worked together?',
        });
        stage.addFormField({
          component: 'Toggle',
          variable: 'see-regularly',
          prompt: 'Do you see each other regularly?',
        });
        stage.addFormField({
          component: 'RadioGroup',
          variable: 'closeness',
          prompt: 'How close is this relationship?',
        });
        stage.addFormField({
          component: 'LikertScale',
          variable: 'trust',
          prompt: 'How much do you trust this person?',
        });
        synth.addManualNode(stage.id, nt.id, 'a', { [personName.id]: 'Alex' });
        synth.addManualNode(stage.id, nt.id, 'b', { [personName.id]: 'Sam' });
        synth.addManualEdge(et.id, 'e1', 'a', 'b', {});
        synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();

        // Both custom Boolean labels render; the Toggle is a role=switch.
        await expect(page.getByText('Yes, we have')).toBeVisible();
        await expect(page.getByText('No, never')).toBeVisible();
        const toggle = page
          .locator('[data-field-name="see-regularly"]')
          .getByRole('switch');
        await expect(toggle).toBeVisible();

        await page
          .locator('[data-field-name="have-met"]')
          .getByRole('radio', { name: 'No, never' })
          .click();
        await toggle.click();
        await stage.form.selectRadio('closeness', 'Close');
        await stage.form.selectLikert('trust', 'Three');
        await advanceEdgeSlide(page, slides);

        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        const edge = (network?.edges ?? [])[0];
        expect(edge?.attributes['have-met']).toBe(false);
        expect(edge?.attributes['see-regularly']).toBe(true);
        // Ordinal values persist as scalars, not arrays.
        expect(edge?.attributes.closeness).toBe(2);
        expect(edge?.attributes.trust).toBe(3);
      },
    },

    {
      id: 'checkbox-and-togglebutton-arrays',
      covers: [
        'variable.component=CheckboxGroup',
        'variable.component=ToggleButtonGroup',
        'variable.options(ordinal/categorical)',
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nt = synth.addNodeType({ name: 'Person' });
        const personName = nt.addVariable({ name: 'name', type: 'text' });
        const et = synth.addEdgeType({ name: 'Friendship' });
        et.addVariable({
          id: 'contexts',
          name: 'contexts',
          type: 'categorical',
          component: 'CheckboxGroup',
          options: [
            { label: 'Work', value: 'work' },
            { label: 'Social', value: 'social' },
            { label: 'Family', value: 'family' },
          ],
        });
        et.addVariable({
          id: 'channels',
          name: 'channels',
          type: 'categorical',
          component: 'ToggleButtonGroup',
          options: [
            { label: 'Call', value: 'call' },
            { label: 'Text', value: 'text' },
            { label: 'In person', value: 'in-person' },
          ],
        });
        const stage = synth.addStage('AlterEdgeForm', {
          subject: { entity: 'edge', type: et.id },
          introductionPanel: {
            title: 'Relationship details',
            text: 'Answer the following.',
          },
        });
        stage.addFormField({
          component: 'CheckboxGroup',
          variable: 'contexts',
          prompt: 'In what contexts do you interact?',
        });
        stage.addFormField({
          component: 'ToggleButtonGroup',
          variable: 'channels',
          prompt: 'How do you keep in touch?',
        });
        synth.addManualNode(stage.id, nt.id, 'a', { [personName.id]: 'Alex' });
        synth.addManualNode(stage.id, nt.id, 'b', { [personName.id]: 'Sam' });
        synth.addManualEdge(et.id, 'e1', 'a', 'b', {});
        synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();

        // ToggleButtonGroup options render as role=checkbox toggle buttons.
        await expect(
          page
            .locator('[data-field-name="channels"]')
            .getByRole('checkbox', { name: 'Call', exact: true }),
        ).toBeVisible();

        await stage.form.selectCheckbox('contexts', 'Work');
        await stage.form.selectCheckbox('contexts', 'Family');
        await stage.form.selectToggleButton('channels', 'Call');
        await stage.form.selectToggleButton('channels', 'Text');
        await advanceEdgeSlide(page, slides);

        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        const edge = (network?.edges ?? [])[0];
        expect(edge?.attributes.contexts).toEqual(['work', 'family']);
        expect(edge?.attributes.channels).toEqual(['call', 'text']);
      },
    },

    {
      id: 'columns-auto-layout',
      covers: ['useColumns auto-layout (>6 options)'],
      visual: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nt = synth.addNodeType({ name: 'Person' });
        const personName = nt.addVariable({ name: 'name', type: 'text' });
        const et = synth.addEdgeType({ name: 'Friendship' });
        et.addVariable({
          id: 'frequency',
          name: 'frequency',
          type: 'ordinal',
          component: 'RadioGroup',
          options: [
            { label: 'Never', value: 1 },
            { label: 'Yearly', value: 2 },
            { label: 'Monthly', value: 3 },
            { label: 'Weekly', value: 4 },
            { label: 'Several times a week', value: 5 },
            { label: 'Daily', value: 6 },
            { label: 'Several times a day', value: 7 },
            { label: 'Constantly', value: 8 },
          ],
        });
        const stage = synth.addStage('AlterEdgeForm', {
          subject: { entity: 'edge', type: et.id },
          introductionPanel: {
            title: 'Relationship details',
            text: 'Answer the following.',
          },
        });
        stage.addFormField({
          component: 'RadioGroup',
          variable: 'frequency',
          prompt: 'How often do you interact?',
        });
        synth.addManualNode(stage.id, nt.id, 'a', { [personName.id]: 'Alex' });
        synth.addManualNode(stage.id, nt.id, 'b', { [personName.id]: 'Sam' });
        synth.addManualEdge(et.id, 'e1', 'a', 'b', {});
        synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
        return synth;
      },
      run: async ({ page, interview }) => {
        await interview.dismissIntro();

        // >6 options auto-enables the multi-column grid layout: the RadioGroup
        // fieldset (data-field-name is on the outer container, the grid is on
        // the fieldset it wraps) carries a CSS grid with >1 column track.
        await expect
          .poll(() =>
            page
              .locator('[data-field-name="frequency"] fieldset')
              .evaluate(
                (el) =>
                  getComputedStyle(el)
                    .gridTemplateColumns.trim()
                    .split(/\s+/).length,
              ),
          )
          .toBeGreaterThan(1);
      },
    },

    {
      id: 'vas-with-clamped-range-and-datepickers',
      covers: [
        'variable.component=VisualAnalogScale',
        'variable.parameters(VAS minLabel/maxLabel)',
        'variable.component=DatePicker',
        'variable.parameters(DatePicker type/min/max)',
        'variable.component=RelativeDatePicker',
        'variable.parameters(RelativeDatePicker anchor/before/after)',
        'variable.validation.minValue/maxValue',
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nt = synth.addNodeType({ name: 'Person' });
        const personName = nt.addVariable({ name: 'name', type: 'text' });
        const et = synth.addEdgeType({ name: 'Friendship' });
        et.addVariable({
          id: 'importance',
          name: 'importance',
          type: 'scalar',
          component: 'VisualAnalogScale',
          parameters: { minLabel: 'Not at all', maxLabel: 'Extremely' },
          validation: { minValue: 10, maxValue: 90 },
        });
        et.addVariable({
          id: 'met-month',
          name: 'metMonth',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'month', min: '2020-01', max: '2026-12' },
        });
        et.addVariable({
          id: 'last-contact',
          name: 'lastContact',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '2026-07-01', before: 30, after: 0 },
        });
        const stage = synth.addStage('AlterEdgeForm', {
          subject: { entity: 'edge', type: et.id },
          label: 'Relationship details',
          introductionPanel: {
            title: 'Relationship details',
            text: 'A few more questions about this relationship.',
          },
        });
        stage.addFormField({
          component: 'VisualAnalogScale',
          variable: 'importance',
          prompt: 'How important is this relationship?',
        });
        stage.addFormField({
          component: 'DatePicker',
          variable: 'met-month',
          prompt: 'Roughly when did you first meet?',
        });
        stage.addFormField({
          component: 'RelativeDatePicker',
          variable: 'last-contact',
          prompt: 'When did you last speak?',
        });
        synth.addManualNode(stage.id, nt.id, 'alex', { [personName.id]: 'Alex' });
        synth.addManualNode(stage.id, nt.id, 'sam', { [personName.id]: 'Sam' });
        synth.addManualEdge(et.id, 'e1', 'alex', 'sam', {});
        synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();

        // VAS parameter labels render; validation min/max clamp the slider.
        await expect(page.getByText('Not at all')).toBeVisible();
        await expect(page.getByText('Extremely')).toBeVisible();
        const vasSlider = page
          .locator('[data-field-name="importance"]')
          .getByRole('slider');
        await expect(vasSlider).toHaveAttribute('min', '10');
        await expect(vasSlider).toHaveAttribute('max', '90');
        await vasSlider.focus();
        await vasSlider.press('End'); // drives to the clamped max (90)

        const monthField = page.locator('[data-field-name="met-month"]');
        await monthField.locator('select').first().selectOption('2024');
        await monthField.locator('select').nth(1).selectOption('06');

        const relDateInput = page
          .locator('[data-field-name="last-contact"]')
          .locator('input[type="date"]');
        await relDateInput.fill('2026-08-15'); // after anchor+after → invalid
        await interview.nextButton.click();
        await expect(stage.form.getFieldError('last-contact')).toBeVisible();
        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).not.toBeVisible();

        await relDateInput.fill('2026-06-15'); // within 2026-06-01..2026-07-01
        await advanceEdgeSlide(page, slides);

        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        const edge = (network?.edges ?? [])[0];
        const importance = edge?.attributes.importance;
        expect(typeof importance).toBe('number');
        expect(importance).toBeGreaterThanOrEqual(10);
        expect(importance).toBeLessThanOrEqual(90);
        expect(edge?.attributes['met-month']).toBe('2024-06');
        expect(edge?.attributes['last-contact']).toBe('2026-06-15');
      },
    },

    {
      id: 'required-and-length-and-selection-validation',
      covers: [
        'variable.validation.required',
        'variable.validation.minLength/maxLength',
        'variable.validation.minSelected/maxSelected',
        'form.fields[].hint',
        'form.fields[].showValidationHints',
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nt = synth.addNodeType({ name: 'Person' });
        const personName = nt.addVariable({ name: 'name', type: 'text' });
        const et = synth.addEdgeType({ name: 'Friendship' });
        et.addVariable({
          id: 'closeness',
          name: 'closeness',
          type: 'ordinal',
          component: 'RadioGroup',
          options: [
            { label: 'Very close', value: 3 },
            { label: 'Close', value: 2 },
            { label: 'Distant', value: 1 },
          ],
          validation: { required: true },
        });
        et.addVariable({
          id: 'story',
          name: 'story',
          type: 'text',
          component: 'TextArea',
          validation: { minLength: 5, maxLength: 10 },
        });
        et.addVariable({
          id: 'contexts',
          name: 'contexts',
          type: 'categorical',
          component: 'CheckboxGroup',
          options: [
            { label: 'Work', value: 'work' },
            { label: 'Social', value: 'social' },
            { label: 'Family', value: 'family' },
          ],
          // minSelected treats an empty array as "unset" (no error), so use a
          // floor of 2 and select exactly 1 to trigger the min-selected error.
          validation: { minSelected: 2, maxSelected: 2 },
        });
        const stage = synth.addStage('AlterEdgeForm', {
          subject: { entity: 'edge', type: et.id },
          introductionPanel: {
            title: 'Relationship details',
            text: 'Answer the following.',
          },
        });
        stage.addFormField({
          component: 'RadioGroup',
          variable: 'closeness',
          prompt: 'How close is this relationship?',
        });
        stage.addFormField({
          component: 'TextArea',
          variable: 'story',
          prompt: 'Describe this relationship.',
          hint: 'Keep it short.',
          showValidationHints: true,
        });
        stage.addFormField({
          component: 'CheckboxGroup',
          variable: 'contexts',
          prompt: 'In what contexts do you interact?',
        });
        synth.addManualNode(stage.id, nt.id, 'a', { [personName.id]: 'Alex' });
        synth.addManualNode(stage.id, nt.id, 'b', { [personName.id]: 'Sam' });
        synth.addManualEdge(et.id, 'e1', 'a', 'b', {});
        synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();

        // The plain hint and the validation-rule summary both render up front.
        await expect(page.getByText('Keep it short.')).toBeVisible();
        await expect(
          page.getByText('Enter at least 5 characters.'),
        ).toBeVisible();

        // Interactions run bottom-to-top (contexts, then story, then closeness)
        // so a field that errors on blur only ever shifts the fields BELOW it —
        // never a control that is about to be clicked, which would make the
        // click miss.

        // Attempt 1: required radio empty, text too short, only 1 selected
        // (below the min of 2).
        await stage.form.selectCheckbox('contexts', 'Work');
        await stage.form.fillText('story', 'abc');
        await interview.nextButton.click();
        await expect(stage.form.getFieldError('closeness')).toBeVisible();
        await expect(stage.form.getFieldError('story')).toBeVisible();
        await expect(stage.form.getFieldError('contexts')).toBeVisible();
        const before = await protocol.getNetworkState(interview.interviewId);
        expect(
          (before?.edges ?? [])[0]?.attributes.closeness,
        ).toBeUndefined();

        // Attempt 2: too many selected (3 > 2); text too long; radio now valid.
        await stage.form.selectCheckbox('contexts', 'Social');
        await stage.form.selectCheckbox('contexts', 'Family');
        await stage.form.fillText('story', 'abcdefghijk');
        await stage.form.selectRadio('closeness', 'Close');
        await interview.nextButton.click();
        await expect(stage.form.getFieldError('story')).toBeVisible();
        await expect(stage.form.getFieldError('contexts')).toBeVisible();
        await expect(stage.form.getFieldError('closeness')).toHaveCount(0);

        // Attempt 3: all within bounds (2 selected, 6-char story).
        const family = page
          .locator('[data-field-name="contexts"]')
          .getByRole('checkbox', { name: 'Family', exact: true });
        await family.click(); // deselect back down to 2
        await expect(family).not.toBeChecked();
        await stage.form.fillText('story', 'abcdef');
        await advanceEdgeSlide(page, slides);

        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();
        const network = await protocol.getNetworkState(interview.interviewId);
        const edge = (network?.edges ?? [])[0];
        expect(edge?.attributes.closeness).toBe(2);
        expect(edge?.attributes.story).toBe('abcdef');
        expect(edge?.attributes.contexts).toEqual(['work', 'social']);
      },
    },

    {
      id: 'cross-field-and-unique-validation',
      covers: [
        'variable.validation.unique',
        'variable.validation.sameAs/differentFrom',
        'variable.validation.greaterThanVariable/lessThanVariable/etc',
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nt = synth.addNodeType({ name: 'Person' });
        const personName = nt.addVariable({ name: 'name', type: 'text' });
        const et = synth.addEdgeType({ name: 'Friendship' });
        et.addVariable({
          id: 'code-name',
          name: 'codeName',
          type: 'text',
          component: 'Text',
          validation: { unique: true },
        });
        et.addVariable({
          id: 'field-a',
          name: 'fieldA',
          type: 'text',
          component: 'Text',
        });
        et.addVariable({
          id: 'field-b',
          name: 'fieldB',
          type: 'text',
          component: 'Text',
          validation: { differentFrom: 'field-a' },
        });
        et.addVariable({
          id: 'field-c',
          name: 'fieldC',
          type: 'text',
          component: 'Text',
          validation: { sameAs: 'field-a' },
        });
        et.addVariable({
          id: 'start',
          name: 'start',
          type: 'number',
          component: 'Number',
        });
        et.addVariable({
          id: 'end',
          name: 'end',
          type: 'number',
          component: 'Number',
          validation: { greaterThanVariable: 'start' },
        });
        et.addVariable({
          id: 'floor',
          name: 'floor',
          type: 'number',
          component: 'Number',
        });
        et.addVariable({
          id: 'ceiling',
          name: 'ceiling',
          type: 'number',
          component: 'Number',
          validation: { greaterThanOrEqualToVariable: 'floor' },
        });
        et.addVariable({
          id: 'cap',
          name: 'cap',
          type: 'number',
          component: 'Number',
          validation: { lessThanVariable: 'end' },
        });
        et.addVariable({
          id: 'cap-eq',
          name: 'capEq',
          type: 'number',
          component: 'Number',
          validation: { lessThanOrEqualToVariable: 'end' },
        });
        const stage = synth.addStage('AlterEdgeForm', {
          subject: { entity: 'edge', type: et.id },
          introductionPanel: {
            title: 'Relationship details',
            text: 'Answer the following for each relationship.',
          },
        });
        for (const [variable, prompt] of [
          ['code-name', 'Give this relationship a code name.'],
          ['field-a', 'Field A'],
          ['field-b', 'Field B'],
          ['field-c', 'Field C'],
        ] as const) {
          stage.addFormField({ component: 'Text', variable, prompt });
        }
        for (const [variable, prompt] of [
          ['start', 'Start value'],
          ['end', 'End value'],
          ['floor', 'Floor value'],
          ['ceiling', 'Ceiling value'],
          ['cap', 'Cap value'],
          ['cap-eq', 'Cap-equal value'],
        ] as const) {
          stage.addFormField({ component: 'Number', variable, prompt });
        }
        synth.addManualNode(stage.id, nt.id, 'alex', { [personName.id]: 'Alex' });
        synth.addManualNode(stage.id, nt.id, 'sam', { [personName.id]: 'Sam' });
        synth.addManualNode(stage.id, nt.id, 'jo', { [personName.id]: 'Jo' });
        synth.addManualEdge(et.id, 'e1', 'alex', 'sam', {});
        synth.addManualEdge(et.id, 'e2', 'sam', 'jo', {});
        synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();

        // Slide 0 (Alex–Sam): every constraint satisfied.
        await stage.form.fillText('code-name', 'same');
        await stage.form.fillText('field-a', 'alpha');
        await stage.form.fillText('field-b', 'beta'); // differs from A: OK
        await stage.form.fillText('field-c', 'alpha'); // sameAs A: OK
        await stage.form.fillNumber('start', '10');
        await stage.form.fillNumber('end', '15'); // > start: OK
        await stage.form.fillNumber('floor', '10');
        await stage.form.fillNumber('ceiling', '10'); // >= floor: OK
        await stage.form.fillNumber('cap', '5'); // < end: OK
        await stage.form.fillNumber('cap-eq', '15'); // <= end: OK
        await advanceEdgeSlide(page, slides);

        // Slide 1 (Sam–Jo): reuse the code name (unique) and break every
        // cross-field rule.
        await expectEdgeSlide(page, 'Sam', 'Jo');
        await stage.form.fillText('code-name', 'same'); // collides: unique
        await stage.form.fillText('field-a', 'alpha');
        await stage.form.fillText('field-b', 'alpha'); // == A: differentFrom
        await stage.form.fillText('field-c', 'zzz'); // != A: sameAs
        await stage.form.fillNumber('start', '10');
        await stage.form.fillNumber('end', '5'); // < start: greaterThanVariable
        await stage.form.fillNumber('floor', '10');
        await stage.form.fillNumber('ceiling', '9'); // < floor: GTE variable
        await stage.form.fillNumber('cap', '6'); // !< end: lessThanVariable
        await stage.form.fillNumber('cap-eq', '6'); // !<= end: LTE variable
        await interview.nextButton.click();
        await expect(stage.form.getFieldError('code-name')).toBeVisible();
        await expect(stage.form.getFieldError('field-b')).toBeVisible();
        await expect(stage.form.getFieldError('field-c')).toBeVisible();
        await expect(stage.form.getFieldError('end')).toBeVisible();
        await expect(stage.form.getFieldError('ceiling')).toBeVisible();
        await expect(stage.form.getFieldError('cap')).toBeVisible();
        await expect(stage.form.getFieldError('cap-eq')).toBeVisible();
        const before = await protocol.getNetworkState(interview.interviewId);
        expect(
          (before?.edges ?? []).find(
            (e) => e[entityPrimaryKeyProperty] === 'e2',
          )?.attributes['code-name'],
        ).toBeUndefined();

        // Fix every violation.
        await stage.form.fillText('code-name', 'different');
        await stage.form.fillText('field-b', 'gamma');
        await stage.form.fillText('field-c', 'alpha');
        await stage.form.fillNumber('end', '15');
        await stage.form.fillNumber('ceiling', '10');
        await stage.form.fillNumber('cap', '4');
        await stage.form.fillNumber('cap-eq', '5');
        await advanceEdgeSlide(page, slides);

        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();
        const network = await protocol.getNetworkState(interview.interviewId);
        const edges = network?.edges ?? [];
        const e1 = edges.find((e) => e[entityPrimaryKeyProperty] === 'e1');
        const e2 = edges.find((e) => e[entityPrimaryKeyProperty] === 'e2');
        expect(e1?.attributes['code-name']).toBe('same');
        expect(e2?.attributes['code-name']).toBe('different');
        expect(e2?.attributes['field-b']).toBe('gamma');
        expect(e2?.attributes['field-c']).toBe('alpha');
        expect(e2?.attributes.end).toBe(15);
        expect(e2?.attributes.ceiling).toBe(10);
        expect(e2?.attributes.cap).toBe(4);
        expect(e2?.attributes['cap-eq']).toBe(5);
      },
    },

    {
      id: 'multi-slide-persistence-and-colors',
      covers: [
        'multi-slide iteration + per-edge persistence',
        'codebook.edge[type].color',
        'codebook.node[type].color/shape/labelVariable',
        'initial values from existing edge attributes',
        'form title absence (TitlelessFormSchema)',
      ],
      visual: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nt = synth.addNodeType({
          name: 'Person',
          color: 'node-color-seq-2',
        });
        const personName = nt.addVariable({ name: 'name', type: 'text' });
        const et = synth.addEdgeType({
          name: 'Friendship',
          color: 'edge-color-seq-3',
        });
        et.addVariable({
          id: 'met-at',
          name: 'metAt',
          type: 'text',
          component: 'Text',
        });
        const stage = synth.addStage('AlterEdgeForm', {
          subject: { entity: 'edge', type: et.id },
          introductionPanel: {
            title: 'Relationship details',
            text: 'Answer the following for each relationship.',
          },
        });
        stage.addFormField({
          component: 'Text',
          variable: 'met-at',
          prompt: 'Where did you meet?',
        });
        synth.addManualNode(stage.id, nt.id, 'n0', { [personName.id]: 'Alex' });
        synth.addManualNode(stage.id, nt.id, 'n1', { [personName.id]: 'Sam' });
        synth.addManualNode(stage.id, nt.id, 'n2', { [personName.id]: 'Jo' });
        synth.addManualNode(stage.id, nt.id, 'n3', { [personName.id]: 'Kai' });
        // First edge pre-seeded so its value is present at load.
        synth.addManualEdge(et.id, 'e01', 'n0', 'n1', { 'met-at': 'kept' });
        synth.addManualEdge(et.id, 'e12', 'n1', 'n2', {});
        synth.addManualEdge(et.id, 'e23', 'n2', 'n3', {});
        synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();

        // Slide 0 (pre-seeded): endpoints + colours + prefill.
        await expectEdgeSlide(page, 'Alex', 'Sam');
        await expect(page.locator(HEADER_SELECTOR).nth(0)).toHaveClass(
          /outline-node-2/,
        );
        const connector = page
          .locator('[data-stage-section="form"] .sticky.top-0 .w-32')
          .first();
        await expect(connector).toBeVisible();
        const edgeColor = await connector.evaluate((el) =>
          getComputedStyle(el).getPropertyValue('--edge-color').trim(),
        );
        expect(edgeColor).not.toBe('');
        const connectorBg = await connector.evaluate(
          (el) => getComputedStyle(el).backgroundColor,
        );
        expect(connectorBg).not.toBe('rgba(0, 0, 0, 0)');
        // Pre-seeded value is restored into the input before any edit.
        await expect(
          page.locator('[data-field-name="met-at"] input'),
        ).toHaveValue('kept');
        await advanceEdgeSlide(page, slides);

        // Slide 1 (Sam–Jo): own value unset; fill it. Wait for the outgoing
        // slide to unmount so the input locator resolves to a single element.
        await expectEdgeSlide(page, 'Sam', 'Jo');
        await expect(
          page.locator('[data-field-name="met-at"] input'),
        ).toHaveCount(1);
        await expect(
          page.locator('[data-field-name="met-at"] input'),
        ).toHaveValue('');
        await stage.form.fillText('met-at', 'reunion');
        await advanceEdgeSlide(page, slides);

        // Slide 2 (Jo–Kai): fill and leave the stage.
        await expectEdgeSlide(page, 'Jo', 'Kai');
        await stage.form.fillText('met-at', 'conference');
        await advanceEdgeSlide(page, slides);

        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        const edges = network?.edges ?? [];
        const byUid = (uid: string) =>
          edges.find((e) => e[entityPrimaryKeyProperty] === uid);
        // Each edge keeps its own value, including the untouched pre-seed.
        expect(byUid('e01')?.attributes['met-at']).toBe('kept');
        expect(byUid('e12')?.attributes['met-at']).toBe('reunion');
        expect(byUid('e23')?.attributes['met-at']).toBe('conference');
      },
    },

    {
      id: 'backwards-navigation-and-discard',
      covers: [
        'backwards navigation (intro/slide)',
        'backwards valid-dirty auto-submit',
        'backwards invalid-dirty discard dialog',
        'ready-for-next scroll-to-bottom gating',
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nt = synth.addNodeType({ name: 'Person' });
        const personName = nt.addVariable({ name: 'name', type: 'text' });
        const et = synth.addEdgeType({ name: 'Friendship' });
        // Many fields so the slide overflows the viewport and the ready-state
        // pulse only appears once the ScrollArea reaches the bottom sentinel.
        // Only note-0 is required (so it gates validity and, when emptied,
        // makes the slide invalid-dirty for the discard-dialog branch); the
        // rest are optional and valid on mount (formStore isValid = !validation).
        for (let i = 0; i < 20; i++) {
          et.addVariable({
            id: `note-${i}`,
            name: `note${i}`,
            type: 'text',
            component: 'Text',
            ...(i === 0 ? { validation: { required: true } } : {}),
          });
        }
        const stage = synth.addStage('AlterEdgeForm', {
          subject: { entity: 'edge', type: et.id },
          introductionPanel: {
            title: 'Relationship details',
            text: 'Answer the following for each relationship.',
          },
        });
        for (let i = 0; i < 20; i++) {
          stage.addFormField({
            component: 'Text',
            variable: `note-${i}`,
            prompt: `Note ${i + 1}`,
          });
        }
        synth.addManualNode(stage.id, nt.id, 'n0', { [personName.id]: 'Alex' });
        synth.addManualNode(stage.id, nt.id, 'n1', { [personName.id]: 'Sam' });
        synth.addManualNode(stage.id, nt.id, 'n2', { [personName.id]: 'Jo' });
        synth.addManualEdge(et.id, 'e1', 'n0', 'n1', {});
        synth.addManualEdge(et.id, 'e2', 'n1', 'n2', {});
        synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();

        // Backwards from slide 0 returns to the intro panel.
        await expectEdgeSlide(page, 'Alex', 'Sam');
        await goBackEdgeSlide(page, null);
        await expect(
          page.locator('[data-stage-section="intro"]'),
        ).toBeVisible();
        await interview.dismissIntro();

        // Before completing the slide, the pulse is off (form incomplete).
        expect(await interview.nextButtonHasPulse()).toBe(false);

        // Complete every field so the form is valid (each field registers
        // invalid until blurred, so all must be touched), then scroll the
        // ScrollArea to its bottom sentinel: the ready-state pulse only turns
        // on once BOTH conditions hold.
        for (let i = 0; i < 20; i++) {
          await stage.form.fillText(`note-${i}`, `value ${i}`);
        }
        await page.locator('[data-field-name="note-19"] input').blur();
        await page
          .locator('[data-field-name="note-19"] input')
          .evaluate((el) => {
            let node = el.parentElement;
            while (node) {
              const style = getComputedStyle(node);
              if (
                (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                node.scrollHeight > node.clientHeight
              ) {
                node.scrollTop = node.scrollHeight;
                return;
              }
              node = node.parentElement;
            }
          });
        await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);
        await advanceEdgeSlide(page, slides); // → slide 1

        // Slide 1: fill validly, navigate backwards — auto-submits, no dialog.
        await expectEdgeSlide(page, 'Sam', 'Jo');
        await stage.form.fillText('note-0', 'slide1 valid');
        await goBackEdgeSlide(page, 'Sam');
        await expectEdgeSlide(page, 'Alex', 'Sam');
        await expect(
          page.locator('[data-field-name="note-0"] input'),
        ).toHaveCount(1);
        await expect(
          page.locator('[data-field-name="note-0"] input'),
        ).toHaveValue('value 0');
        let network = await protocol.getNetworkState(interview.interviewId);
        expect(
          (network?.edges ?? []).find(
            (e) => e[entityPrimaryKeyProperty] === 'e2',
          )?.attributes['note-0'],
        ).toBe('slide1 valid'); // persisted despite going back

        // Return to slide 1, make it invalid-dirty, go back → discard dialog.
        await advanceEdgeSlide(page, slides);
        await expectEdgeSlide(page, 'Sam', 'Jo');
        await stage.form.fillText('note-0', ''); // violates required
        const dialog = await slides.previousSlideExpectingDiscardDialog();
        await expect(
          dialog.getByRole('heading', { name: 'Discard changes?' }),
        ).toBeVisible();
        await slides.discardCancelButton.click();
        await expect(dialog).toBeHidden();
        await expect(
          page.locator('[data-field-name="note-0"] input'),
        ).toHaveValue('');

        // Go back again and confirm this time.
        await slides.previousSlideExpectingDiscardDialog();
        await slides.discardConfirmButton.click();
        await expectEdgeSlide(page, 'Alex', 'Sam');
        await expect(
          page.locator('[data-field-name="note-0"] input'),
        ).toHaveCount(1);
        await expect(
          page.locator('[data-field-name="note-0"] input'),
        ).toHaveValue('value 0');
        network = await protocol.getNetworkState(interview.interviewId);
        expect(
          (network?.edges ?? []).find(
            (e) => e[entityPrimaryKeyProperty] === 'e2',
          )?.attributes['note-0'],
        ).toBe('slide1 valid'); // discard did not overwrite the earlier persist
      },
    },
  ],
};
