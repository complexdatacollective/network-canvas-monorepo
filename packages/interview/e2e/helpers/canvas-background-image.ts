import { expect, type Locator, type Page } from '@playwright/test';

type BackgroundImageStyle = {
  objectFit: string;
  objectPosition: string;
};

type Orientation = 'landscape' | 'portrait';

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

const getFullBleedChecks = (image: Locator, orientation: Orientation) =>
  image.evaluate((element, expectedOrientation) => {
    const interfaceRoot = element.closest('.interface');
    const canvasRoot = element.closest('[role="application"]');
    const navigation = document.querySelector('[role="navigation"]');

    if (!(interfaceRoot instanceof HTMLElement)) {
      throw new Error('Background image is not inside an interface root.');
    }

    if (!(canvasRoot instanceof HTMLElement)) {
      throw new Error('Background image is not inside a canvas.');
    }

    if (!(navigation instanceof HTMLElement)) {
      throw new Error('Interview navigation was not found.');
    }

    const imageRect = element.getBoundingClientRect();
    const interfaceRect = interfaceRoot.getBoundingClientRect();
    const canvasRect = canvasRoot.getBoundingClientRect();
    const navigationRect = navigation.getBoundingClientRect();
    const close = (first: number, second: number) =>
      Math.abs(first - second) <= 1;

    return {
      fillsInterface:
        close(imageRect.left, interfaceRect.left) &&
        close(imageRect.top, interfaceRect.top) &&
        close(imageRect.right, interfaceRect.right) &&
        close(imageRect.bottom, interfaceRect.bottom),
      fillsCanvas:
        close(imageRect.left, canvasRect.left) &&
        close(imageRect.top, canvasRect.top) &&
        close(imageRect.right, canvasRect.right) &&
        close(imageRect.bottom, canvasRect.bottom),
      excludesOnlyNavigation:
        expectedOrientation === 'landscape'
          ? close(imageRect.left, navigationRect.right) &&
            close(imageRect.top, 0) &&
            close(imageRect.right, window.innerWidth) &&
            close(imageRect.bottom, window.innerHeight)
          : close(imageRect.left, 0) &&
            close(imageRect.top, 0) &&
            close(imageRect.right, window.innerWidth) &&
            close(imageRect.bottom, navigationRect.top),
    };
  }, orientation);

/**
 * Canvas backgrounds must show the whole image and keep it centred on both
 * axes in every orientation. Leave the page in portrait so visual scenarios
 * capture both landscape (initial) and portrait (final) states.
 */
export async function expectResponsiveCanvasBackgroundImage(
  page: Page,
  image: Locator,
): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect
    .poll(() => getBackgroundImageStyle(image))
    .toEqual({
      objectFit: 'contain',
      objectPosition: '50% 50%',
    });
  await expect
    .poll(() => getFullBleedChecks(image, 'landscape'))
    .toEqual({
      fillsInterface: true,
      fillsCanvas: true,
      excludesOnlyNavigation: true,
    });

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect
    .poll(() => getBackgroundImageStyle(image))
    .toEqual({
      objectFit: 'contain',
      objectPosition: '50% 50%',
    });
  await expect
    .poll(() => getFullBleedChecks(image, 'portrait'))
    .toEqual({
      fillsInterface: true,
      fillsCanvas: true,
      excludesOnlyNavigation: true,
    });
}
