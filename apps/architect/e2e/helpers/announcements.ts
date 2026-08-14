import { type Page } from '@playwright/test';

const RECORDER_KEY = '__architectE2eAnnouncements';

type AnnouncementWindow = Window & {
  [RECORDER_KEY]?: string[];
};

/**
 * Starts recording everything the app writes into a live region.
 *
 * The timeline announces through fresco-ui's `useAccessibilityAnnouncements`,
 * which builds its region imperatively on `document.body` and BLANKS it a
 * second later. Polling the region's text is therefore a race the test can
 * lose, and a bare `getByRole('status')` locator becomes a strict-mode
 * violation the moment a second live-region consumer mounts on the same route.
 *
 * Recording every mutation up front removes both problems: the assertion runs
 * against the transcript of what was announced, not against whatever the region
 * happens to be holding when the assertion fires.
 *
 * Re-install after every navigation — the recorder lives on `window`.
 */
export async function recordAnnouncements(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scope = window as AnnouncementWindow;
    const transcript: string[] = [];
    scope.__architectE2eAnnouncements = transcript;

    const collect = () => {
      for (const region of document.querySelectorAll('[aria-live], output')) {
        const text = region.textContent?.trim();
        if (text && transcript[transcript.length - 1] !== text) {
          transcript.push(text);
        }
      }
    };

    new MutationObserver(collect).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
}

export function readAnnouncements(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as AnnouncementWindow).__architectE2eAnnouncements ?? [],
  );
}
