import { expect, type Locator, type Page } from '@playwright/test';

type BackgroundImageStyle = {
  objectFit: string;
  objectPosition: string;
};

const getBackgroundImageStyle = (
  image: Locator,
): Promise<BackgroundImageStyle> =>
  image.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      objectFit: style.objectFit,
      objectPosition: style.objectPosition,
    };
  });

/**
 * Canvas backgrounds retain the existing edge-to-edge crop in landscape, but
 * portrait screens must show the whole image and keep it centred on both axes.
 * Leave the page in portrait so visual scenarios capture the requested state.
 */
export async function expectResponsiveCanvasBackgroundImage(
  page: Page,
  image: Locator,
): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect
    .poll(() => getBackgroundImageStyle(image))
    .toEqual({
      objectFit: 'cover',
      objectPosition: '50% 50%',
    });

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect
    .poll(() => getBackgroundImageStyle(image))
    .toEqual({
      objectFit: 'contain',
      objectPosition: '50% 50%',
    });
}
