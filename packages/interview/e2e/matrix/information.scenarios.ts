import path from 'node:path';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  assetBlockMarkdown,
  dynamicValueNameFor,
} from '@codaco/protocol-validation';

import { expect } from '../fixtures/matrix-test.js';
import { DEV_PROTOCOL_ASSETS_DIR } from '../helpers/protocol-paths.js';
import type { SyntheticAssetSpec } from '../helpers/synthetic-payload.js';
import type { InterfaceScenarios } from './types.js';

// The files the scenarios' blocks name. Each scenario registers the ones it
// uses with its interview (`addFiles`) and lists them as its `assets`, which
// is where the payload's manifest and the files served are taken from.
const IMAGE = {
  assetId: 'img-1',
  name: 'quadrant',
  type: 'image',
  source: 'quadrant.png',
  localPath: path.join(DEV_PROTOCOL_ASSETS_DIR, 'quadrant.png'),
} satisfies SyntheticAssetSpec;

const AUDIO = {
  assetId: 'audio-1',
  name: 'clip',
  type: 'audio',
  source: 'click_the_thing.mp3',
  localPath: path.join(DEV_PROTOCOL_ASSETS_DIR, 'click_the_thing.mp3'),
} satisfies SyntheticAssetSpec;

const VIDEO = {
  assetId: 'video-1',
  name: 'welcome',
  type: 'video',
  source: 'withSound.mp4',
  localPath: path.join(DEV_PROTOCOL_ASSETS_DIR, 'withSound.mp4'),
} satisfies SyntheticAssetSpec;

/** `VIDEO`, under the name a researcher filed it as for one scenario. */
const INTRO_VIDEO = { ...VIDEO, name: 'intro' } satisfies SyntheticAssetSpec;

type FileAsset = Extract<SyntheticAssetSpec, { localPath: string }>;

/** Registers `files` with the interview, as `synth.addAsset` takes them. */
function addFiles(synth: SyntheticInterview, ...files: FileAsset[]): void {
  for (const { assetId, name, type, source } of files) {
    synth.addAsset({ id: assetId, name, type, source });
  }
}

export const informationScenarios: InterfaceScenarios = {
  interfaceType: 'Information',
  scenarios: [
    {
      id: 'text-markdown-and-sanitization',
      covers: [
        'content',
        'content.heading',
        'markdown-allowlist',
        'label',
        'interviewScript',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          label: 'Menu-only label',
          title: 'Welcome to the study',
          interviewScript: 'INTERVIEWER: read aloud slowly',
          text: '## Section\n\nA paragraph with **bold** and *italic* text.\n\n- first\n- second\n\n<script>window.__pwned=1</script> plain tail text',
        });
        return synth;
      },
      run: async ({ page, interview }) => {
        await expect(
          page.getByRole('heading', { name: 'Welcome to the study' }),
        ).toBeVisible();
        // Markdown renders as elements, not literal syntax
        await expect(
          page.getByRole('heading', { name: 'Section' }),
        ).toBeVisible();
        await expect(page.locator('strong', { hasText: 'bold' })).toBeVisible();
        await expect(page.locator('em', { hasText: 'italic' })).toBeVisible();
        await expect(page.locator('main li')).toHaveCount(2);
        // HTML is not part of protocol text: the tag is shown as the
        // characters typed, and nothing runs.
        await expect(
          page.getByText('<script>window.__pwned=1</script> plain tail text'),
        ).toBeVisible();
        await expect(page.locator('main script')).toHaveCount(0);
        const pwned = await page.evaluate(
          () => (window as { __pwned?: number }).__pwned,
        );
        expect(pwned).toBeUndefined();
        // Dead config renders nowhere: label is menu-only, interviewScript
        // is authoring-only by design (base.ts)
        await expect(page.getByText('Menu-only label')).toHaveCount(0);
        await expect(
          page.getByText('INTERVIEWER: read aloud slowly'),
        ).toHaveCount(0);
        // Information stages are immediately navigable
        await expect(interview.nextButton).toBeEnabled();
      },
    },
    {
      id: 'image-asset-and-size-bands',
      covers: ['asset-block.image', 'asset-block.size'],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        addFiles(synth, IMAGE);
        synth.addInformationStage({
          title: 'Image sizes',
          blocks: [
            { assetId: 'img-1', size: 'small', description: 'Small image' },
            { assetId: 'img-1', size: 'medium', description: 'Medium image' },
            { assetId: 'img-1', size: 'large', description: 'Large image' },
          ],
        });
        return synth;
      },
      assets: [IMAGE],
      run: async ({ page }) => {
        const images = page.locator('main img[src*="quadrant.png"]');
        await expect(images).toHaveCount(3);
        // All three actually loaded from the asset server
        for (let i = 0; i < 3; i++) {
          await expect
            .poll(() =>
              images
                .nth(i)
                .evaluate((el) => (el as HTMLImageElement).naturalWidth),
            )
            .toBeGreaterThan(0);
        }
        // Size bands produce non-decreasing rendered heights; SMALL is
        // strictly smallest. (MEDIUM and LARGE can cap at the same height
        // when the image's aspect ratio hits the shared width constraint.)
        // Round to whole pixels: when MEDIUM and LARGE cap equal, sub-pixel
        // layout rounding (notably in Firefox) can make LARGE fractionally
        // SMALLER than MEDIUM, which a raw `>=` would spuriously reject.
        const heights = await Promise.all(
          [0, 1, 2].map(async (i) => {
            const box = await images.nth(i).boundingBox();
            return Math.round(box?.height ?? 0);
          }),
        );
        expect(heights[0]!).toBeLessThan(heights[1]!);
        expect(heights[2]!).toBeGreaterThanOrEqual(heights[1]!);
        // No fallback rendered for a resolvable asset
        await expect(page.getByTestId('information-item-fallback')).toHaveCount(
          0,
        );
      },
    },
    {
      id: 'media-asset-description-and-kind-fallback',
      covers: ['asset-block.audio', 'asset-block.description'],
      build: () => {
        const synth = new SyntheticInterview();
        addFiles(synth, AUDIO, VIDEO);
        synth.addInformationStage({
          title: 'Media stage',
          blocks: [
            { assetId: 'audio-1', description: 'Intro narration' },
            { assetId: 'audio-1' },
            { assetId: 'video-1' },
          ],
        });
        return synth;
      },
      assets: [AUDIO, VIDEO],
      run: async ({ page }) => {
        const audios = page.locator('main audio');
        await expect(audios).toHaveCount(2);
        await expect(audios.nth(0)).toHaveAttribute(
          'aria-label',
          'Intro narration',
        );
        // description fallback: an undescribed player is named for its kind,
        // never after the asset's name ("clip"), which is only the
        // researcher's filing label
        await expect(audios.nth(1)).toHaveAttribute('aria-label', 'Audio');
        await expect(audios.nth(0)).toHaveAttribute('controls', '');
        // a video with no description takes the same fallback
        await expect(page.locator('main video')).toHaveAttribute(
          'aria-label',
          'Video',
        );
      },
    },
    {
      id: 'video-asset-e2e-mode',
      covers: ['asset-block.video', 'asset-block.description'],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        addFiles(synth, INTRO_VIDEO);
        synth.addInformationStage({
          title: 'Video stage',
          blocks: [
            {
              assetId: 'video-1',
              size: 'medium',
              description: 'A welcome from the research team',
            },
          ],
        });
        return synth;
      },
      assets: [INTRO_VIDEO],
      run: async ({ page }) => {
        const video = page.locator('main video');
        await expect(video).toBeVisible();
        // isE2E branch: controls without autoplay so captures are stable
        await expect(video).toHaveAttribute('controls', '');
        await expect(video).not.toHaveAttribute('autoplay');
        // the researcher's description names the player, as it does for an
        // image's alt text and an audio player; without one the player is
        // named for its kind (covered by media-asset-description-and-kind-fallback)
        await expect(video).toHaveAttribute(
          'aria-label',
          'A welcome from the research team',
        );
      },
    },
    {
      id: 'asset-block-ordering-mixed-content',
      covers: ['asset-block-ordering'],
      build: () => {
        const synth = new SyntheticInterview();
        addFiles(synth, IMAGE);
        synth.addInformationStage({
          title: 'Ordered stage',
          text: [
            'Alpha block',
            assetBlockMarkdown({ assetId: 'img-1', size: 'small' }),
            'Omega block',
          ].join('\n\n'),
        });
        return synth;
      },
      assets: [IMAGE],
      run: async ({ page }) => {
        // The page shows what its text holds in the order it holds it: text,
        // image, text
        const alpha = page.getByText('Alpha block');
        const omega = page.getByText('Omega block');
        await expect(alpha).toBeVisible();
        await expect(omega).toBeVisible();
        const order = await page.evaluate(() => {
          const alphaEl = [...document.querySelectorAll('main p')].find((p) =>
            p.textContent?.includes('Alpha block'),
          );
          const img = document.querySelector('main img');
          const omegaEl = [...document.querySelectorAll('main p')].find((p) =>
            p.textContent?.includes('Omega block'),
          );
          if (!alphaEl || !img || !omegaEl) return 'missing';
          const alphaBeforeImg = !!(
            alphaEl.compareDocumentPosition(img) &
            Node.DOCUMENT_POSITION_FOLLOWING
          );
          const imgBeforeOmega = !!(
            img.compareDocumentPosition(omegaEl) &
            Node.DOCUMENT_POSITION_FOLLOWING
          );
          return alphaBeforeImg && imgBeforeOmega ? 'ordered' : 'unordered';
        });
        expect(order).toBe('ordered');
      },
    },
    {
      id: 'asset-block-alignment',
      covers: ['asset-block.align'],
      build: () => {
        const synth = new SyntheticInterview();
        addFiles(synth, IMAGE, AUDIO);
        synth.addInformationStage({
          title: 'Alignment',
          // Long enough that the page is wider than an audio player, which has
          // nowhere to move across a page no wider than itself.
          text: 'The page is as wide as its widest line, so this paragraph is long enough to give the page its full width, which leaves a recording room to sit at the start, the centre or the end of it.',
          blocks: [
            {
              assetId: 'img-1',
              size: 'small',
              align: 'start',
              description: 'Image at the start',
            },
            {
              assetId: 'img-1',
              size: 'small',
              description: 'Image at the centre',
            },
            {
              assetId: 'img-1',
              size: 'small',
              align: 'end',
              description: 'Image at the end',
            },
            {
              assetId: 'audio-1',
              autoplay: false,
              align: 'start',
              description: 'Audio at the start',
            },
            {
              assetId: 'audio-1',
              autoplay: false,
              description: 'Audio at the centre',
            },
            {
              assetId: 'audio-1',
              autoplay: false,
              align: 'end',
              description: 'Audio at the end',
            },
          ],
        });
        return synth;
      },
      assets: [IMAGE, AUDIO],
      run: async ({ page }) => {
        // An image held to a height is drawn in a box as wide as the page, so
        // where it sits is where the picture sits inside that box.
        const position = (name: string) =>
          page
            .getByRole('img', { name })
            .evaluate((el) => getComputedStyle(el).objectPosition);
        await expect.poll(() => position('Image at the start')).toBe('0% 50%');
        await expect
          .poll(() => position('Image at the centre'))
          .toBe('50% 50%');
        await expect.poll(() => position('Image at the end')).toBe('100% 50%');

        // An audio player keeps the width the browser draws it at, so its box
        // moves across the page.
        const left = async (name: string) => {
          const box = await page
            .locator(`audio[aria-label="${name}"]`)
            .boundingBox();
          expect(box, `${name} is laid out`).not.toBeNull();
          return box?.x ?? 0;
        };
        const start = await left('Audio at the start');
        const centre = await left('Audio at the centre');
        const end = await left('Audio at the end');
        expect(start).toBeLessThan(centre);
        expect(centre).toBeLessThan(end);
      },
    },
    {
      id: 'asset-block-autoplay-and-loop',
      covers: ['asset-block.autoplay', 'asset-block.loop'],
      build: () => {
        const synth = new SyntheticInterview();
        addFiles(synth, AUDIO, VIDEO);
        synth.addInformationStage({
          title: 'Playback',
          blocks: [
            { assetId: 'audio-1', description: 'Audio by default' },
            {
              assetId: 'audio-1',
              autoplay: false,
              loop: false,
              description: 'Audio set not to play or repeat',
            },
            { assetId: 'video-1', description: 'Video by default' },
            {
              assetId: 'video-1',
              loop: false,
              description: 'Video set not to repeat',
            },
          ],
        });
        return synth;
      },
      assets: [AUDIO, VIDEO],
      run: async ({ page }) => {
        const player = (name: string) => page.locator(`[aria-label="${name}"]`);
        await expect(player('Audio by default')).toHaveAttribute(
          'autoplay',
          '',
        );
        await expect(player('Audio by default')).toHaveAttribute('loop', '');
        await expect(
          player('Audio set not to play or repeat'),
        ).not.toHaveAttribute('autoplay');
        await expect(
          player('Audio set not to play or repeat'),
        ).not.toHaveAttribute('loop');
        await expect(player('Video by default')).toHaveAttribute('loop', '');
        await expect(player('Video set not to repeat')).not.toHaveAttribute(
          'loop',
        );
        // The E2E host never starts a video by itself, whatever the setting
        // (see video-asset-e2e-mode), so a video's autoplay is proved by the
        // unit tests rather than here.
      },
    },
    {
      id: 'non-asset-image-not-shown',
      covers: ['asset-block.asset-only'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          title: 'Web image',
          text: 'Before\n\n![A picture on the web](https://example.com/picture.png)\n\nAfter',
        });
        return synth;
      },
      run: async ({ page }) => {
        await expect(page.getByText('Before')).toBeVisible();
        await expect(page.getByText('After')).toBeVisible();
        await expect(page.locator('main img')).toHaveCount(0);
        await expect(page.locator('main [data-asset-block]')).toHaveCount(0);
      },
    },
    {
      id: 'external-link-new-tab',
      covers: ['external-links'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          title: 'Link stage',
          text: 'Read the [docs](https://example.com) first.',
        });
        return synth;
      },
      run: async ({ page }) => {
        const link = page.locator('main a[href="https://example.com"]');
        await expect(link).toBeVisible();
        await page.evaluate(() => {
          (window as { __openCalls?: unknown[] }).__openCalls = [];
          window.open = (...args: unknown[]) => {
            (window as { __openCalls?: unknown[] }).__openCalls?.push(args);
            return null;
          };
        });
        await link.click();
        const calls = await page.evaluate(
          () => (window as { __openCalls?: unknown[][] }).__openCalls,
        );
        expect(calls?.[0]?.[0]).toBe('https://example.com');
        // In-app navigation was prevented
        expect(page.url()).toContain('step=0');
      },
    },
    {
      id: 'heading-only-page',
      covers: ['content.heading-only'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          label: 'Heading-only stage',
          title: 'Heading-only stage',
        });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        // Renders without an error boundary and stays navigable
        await expect(page.locator('main[data-theme-interview]')).toBeVisible();
        await expect(interview.nextButton).toBeEnabled();
        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.nodes).toEqual([]);
      },
    },

    {
      id: 'dynamic-values-carried-from-earlier-stage',
      covers: ['dynamicValues'],
      build: () => {
        const synth = new SyntheticInterview();
        const nameVar = synth.addEgoVariable({
          type: 'text',
          component: 'Text',
          name: 'name',
        });
        synth
          .addStage('EgoForm', {
            introductionPanel: { title: 'About you' },
          })
          .addFormField({
            variable: nameVar.id,
            component: 'Text',
            prompt: 'What is your name?',
          });
        const name = dynamicValueNameFor({
          kind: 'attribute',
          role: 'ego',
          variableId: nameVar.id,
        });
        synth.addInformationStage({
          label: 'Welcome',
          title: {
            'en-US': `{${name}, select, missing {Welcome} other {Welcome, {${name}}}}`,
          },
          text: {
            'en-US': `Thanks for **joining**{${name}, select, missing {.} other {, {${name}}.}}`,
          },
        });
        return synth;
      },
      run: async ({ page, interview }) => {
        // A name that would become markdown, HTML or a link if it were ever
        // parsed rather than shown as text.
        const hostile =
          '**bold** [link](https://example.com) <img src=x onerror=window.__pwned=1>';
        await page
          .getByRole('textbox', { name: 'What is your name?' })
          .fill(hostile);
        await interview.next();
        await expect(page).toHaveURL(/step=1/);

        await expect(
          page.getByRole('heading', {
            level: 1,
            name: `Welcome, ${hostile}`,
          }),
        ).toBeVisible();
        // Only the researcher's own emphasis renders; the value stays text.
        await expect(page.locator('main strong')).toHaveCount(1);
        await expect(page.locator('main strong')).toHaveText('joining');
        await expect(page.locator('main a')).toHaveCount(0);
        await expect(page.locator('main img')).toHaveCount(0);
        await expect(
          page.locator('main [data-dynamic-value]', { hasText: hostile }),
        ).toHaveCount(2);
        const pwned = await page.evaluate(
          () => (window as { __pwned?: number }).__pwned,
        );
        expect(pwned).toBeUndefined();
      },
    },
  ],
};
