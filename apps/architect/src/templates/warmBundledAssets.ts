import { sampleAssetUrls } from './sample-protocol';
import { templateAssetUrls } from './template-assets';

// Bundled assets that production templates and the Sample protocol fetch when
// instantiated into the library. The Development protocol is intentionally
// excluded: it is a dev-only entry (gated behind `import.meta.env.DEV` in
// LibraryPanel) and ships a large video that production users never open.
export const bundledTemplateAssetUrls: string[] = [
  ...sampleAssetUrls,
  ...templateAssetUrls,
];

const SW_CONTROL_TIMEOUT_MS = 8000;

// Resolves once the service worker controls the page, so that fetches are
// intercepted and cached. On first load the worker is `ready` (active) before it
// claims the page (clientsClaim fires a `controllerchange`); fetching in that gap
// bypasses the cache, so we wait for control. Resolves false if control is never
// taken (e.g. in dev, where the service worker is disabled).
const waitForController = async (): Promise<boolean> => {
  await navigator.serviceWorker.ready;
  if (navigator.serviceWorker.controller) return true;

  return new Promise<boolean>((resolve) => {
    function settle(controlled: boolean) {
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      resolve(controlled);
    }
    const onChange = () => settle(true);
    const timer = window.setTimeout(() => settle(false), SW_CONTROL_TIMEOUT_MS);
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
  });
};

// Warms the service-worker runtime cache with the bundled template/Sample assets
// so they can be installed into the library with no network. Best-effort, run at
// idle after first load.
export const warmBundledTemplateAssets = async (): Promise<void> => {
  if (!('serviceWorker' in navigator)) return;
  if (!(await waitForController())) return;

  await Promise.all(
    bundledTemplateAssetUrls.map((url) => fetch(url).catch(() => undefined)),
  );
};
