import path from 'node:path';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

const DEV_PROTOCOL_ASSETS = path.resolve(
  import.meta.dirname,
  '../../../development-protocol/assets',
);

export const informationScenarios: InterfaceScenarios = {
  interfaceType: 'Information',
  scenarios: [
    {
      id: 'text-markdown-and-sanitization',
      covers: [
        'title',
        'items[].type=text',
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
          items: [
            {
              id: 'item-1',
              type: 'text',
              content:
                '## Section\n\nA paragraph with **bold** and *italic* text.\n\n- first\n- second',
            },
            {
              id: 'item-2',
              type: 'text',
              content: '<script>window.__pwned=1</script> plain tail text',
            },
          ],
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
        // Sanitization: no script execution, no script element
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
      covers: ['items[].type=asset(image)', 'items[].size'],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        synth.addAsset({
          id: 'img-1',
          name: 'quadrant',
          type: 'image',
          source: 'quadrant.png',
        });
        synth.addInformationStage({
          title: 'Image sizes',
          items: [
            {
              id: 'item-s',
              type: 'asset',
              content: 'img-1',
              size: 'SMALL',
              description: 'Small image',
            },
            {
              id: 'item-m',
              type: 'asset',
              content: 'img-1',
              size: 'MEDIUM',
              description: 'Medium image',
            },
            {
              id: 'item-l',
              type: 'asset',
              content: 'img-1',
              size: 'LARGE',
              description: 'Large image',
            },
          ],
        });
        return synth;
      },
      assets: [
        {
          assetId: 'img-1',
          name: 'quadrant',
          type: 'image',
          source: 'quadrant.png',
          localPath: path.join(DEV_PROTOCOL_ASSETS, 'quadrant.png'),
        },
      ],
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
        const heights = await Promise.all(
          [0, 1, 2].map(async (i) => {
            const box = await images.nth(i).boundingBox();
            return box?.height ?? 0;
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
      id: 'audio-asset-description-aria',
      covers: ['items[].type=asset(audio)', 'items[].description'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addAsset({
          id: 'audio-1',
          name: 'clip',
          type: 'audio',
          source: 'click_the_thing.mp3',
        });
        synth.addInformationStage({
          title: 'Audio stage',
          items: [
            {
              id: 'item-1',
              type: 'asset',
              content: 'audio-1',
              description: 'Intro narration',
            },
            { id: 'item-2', type: 'asset', content: 'audio-1' },
          ],
        });
        return synth;
      },
      assets: [
        {
          assetId: 'audio-1',
          name: 'clip',
          type: 'audio',
          source: 'click_the_thing.mp3',
          localPath: path.join(DEV_PROTOCOL_ASSETS, 'click_the_thing.mp3'),
        },
      ],
      run: async ({ page }) => {
        const audios = page.locator('main audio');
        await expect(audios).toHaveCount(2);
        await expect(audios.nth(0)).toHaveAttribute(
          'aria-label',
          'Intro narration',
        );
        // description fallback: the asset NAME labels the second player
        await expect(audios.nth(1)).toHaveAttribute('aria-label', 'clip');
        await expect(audios.nth(0)).toHaveAttribute('controls', '');
      },
    },
    {
      id: 'video-asset-e2e-mode',
      covers: ['items[].type=asset(video)'],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        synth.addAsset({
          id: 'video-1',
          name: 'intro',
          type: 'video',
          source: 'withSound.mp4',
        });
        synth.addInformationStage({
          title: 'Video stage',
          items: [
            {
              id: 'item-1',
              type: 'asset',
              content: 'video-1',
              size: 'MEDIUM',
              description: 'Ignored under video',
            },
          ],
        });
        return synth;
      },
      assets: [
        {
          assetId: 'video-1',
          name: 'intro',
          type: 'video',
          source: 'withSound.mp4',
          localPath: path.join(DEV_PROTOCOL_ASSETS, 'withSound.mp4'),
        },
      ],
      run: async ({ page }) => {
        const video = page.locator('main video');
        await expect(video).toBeVisible();
        // isE2E branch: controls without autoplay so captures are stable
        await expect(video).toHaveAttribute('controls', '');
        await expect(video).not.toHaveAttribute('autoplay');
        await expect(video).toHaveAttribute('aria-label', 'intro');
      },
    },
    {
      id: 'missing-and-unsupported-asset-fallback',
      covers: ['missing-asset-fallback', 'unsupported-asset-fallback'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addAsset({
          id: 'roster-1',
          name: 'roster',
          type: 'network',
          source: 'roster.json',
        });
        synth.addInformationStage({
          title: 'Fallback stage',
          items: [
            { id: 'item-1', type: 'asset', content: 'does-not-exist' },
            { id: 'item-2', type: 'asset', content: 'roster-1' },
          ],
        });
        return synth;
      },
      assets: [
        {
          assetId: 'roster-1',
          name: 'roster',
          type: 'network',
          source: 'roster.json',
          localPath: path.resolve(
            import.meta.dirname,
            '../../.storybook/static/storybook/roster-50.json',
          ),
        },
      ],
      run: async ({ page, interview }) => {
        // Unresolvable and unsupported (network) assets both fall back
        await expect(page.getByTestId('information-item-fallback')).toHaveCount(
          2,
        );
        // No crash: navigation stays available
        await expect(interview.nextButton).toBeEnabled();
      },
    },
    {
      id: 'items-ordering-mixed-types',
      covers: ['items-ordering'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addAsset({
          id: 'img-1',
          name: 'quadrant',
          type: 'image',
          source: 'quadrant.png',
        });
        synth.addInformationStage({
          title: 'Ordered stage',
          items: [
            { id: 'item-a', type: 'text', content: 'Alpha block' },
            { id: 'item-b', type: 'asset', content: 'img-1', size: 'SMALL' },
            { id: 'item-c', type: 'text', content: 'Omega block' },
          ],
        });
        return synth;
      },
      assets: [
        {
          assetId: 'img-1',
          name: 'quadrant',
          type: 'image',
          source: 'quadrant.png',
          localPath: path.join(DEV_PROTOCOL_ASSETS, 'quadrant.png'),
        },
      ],
      run: async ({ page }) => {
        // Items render in config order: text, image, text
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
      id: 'external-link-new-tab',
      covers: ['external-links'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          title: 'Link stage',
          items: [
            {
              id: 'item-1',
              type: 'text',
              content: 'Read the [docs](https://example.com) first.',
            },
          ],
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
      id: 'empty-items-and-empty-title',
      covers: ['items=[]', 'title-empty'],
      build: () => {
        const synth = new SyntheticInterview();
        // label must be non-empty (schema); title-empty is the case under test
        synth.addInformationStage({
          label: 'Empty stage',
          title: '',
          items: [],
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
  ],
};
