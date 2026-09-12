import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { protocolAuthoringLinks } from '../../../interfaces/documentation.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { exactlyText } from '../../../testing/text.ts';
import { background } from '../background.tsx';
import {
  canvasImageAssets,
  stageWithImageBackground,
} from './canvasImageFixture.ts';

const Background = background();

/**
 * How to make a background that works on every screen the interview runs on.
 *
 * Architect 8.2.5 gives the picker two paragraphs: what the image is for, and
 * a link to the page explaining how to author an SVG that spans the canvas in
 * either orientation. The package had kept the first and dropped the second,
 * which leaves a researcher with no way to find out why their backdrop is
 * cropped on a tablet held the other way up.
 */
describe('the guidance under the background image', () => {
  it('sends the researcher to the documentation about responsive SVG backgrounds', async () => {
    renderStageEditor({
      stage: stageWithImageBackground('sociogram-1'),
      sections: <Background />,
      assets: canvasImageAssets,
    });

    const link = await screen.findByRole('link', {
      name: 'Learn how to create a responsive SVG background',
    });
    expect(link).toHaveAttribute(
      'href',
      protocolAuthoringLinks.responsiveSvgBackgrounds,
    );
    // The whole sentence the link sits in, so a link left dangling off a hint
    // that no longer says what it is for still fails.
    expect(
      screen.getByText(
        exactlyText(
          'A responsive SVG can span the canvas in portrait and landscape while keeping labels readable. Learn how to create a responsive SVG background.',
        ),
      ),
    ).toBeVisible();
    // The paragraph above it is the one the link's sentence follows on from.
    expect(
      screen.getByText(
        exactlyText(
          'Choose an image to use as the background for this prompt. The image will be scaled to fit the canvas.',
        ),
      ),
    ).toBeVisible();
  });

  /**
   * A stage drawing concentric circles has no image to choose, so it has no
   * image guidance either — and the link belongs to the guidance, not to the
   * section.
   */
  it('says nothing about SVG backgrounds where the canvas draws circles', async () => {
    renderStageEditor({
      stageId: 'sociogram-1',
      sections: <Background />,
      assets: canvasImageAssets,
    });

    expect(
      await screen.findByRole('spinbutton', {
        name: 'Number of concentric circles',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', {
        name: 'Learn how to create a responsive SVG background',
      }),
    ).not.toBeInTheDocument();
  });
});
