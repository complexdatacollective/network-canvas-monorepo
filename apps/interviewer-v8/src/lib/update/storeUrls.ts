import { Capacitor } from '@capacitor/core';

// Android package id (matches `capacitor.config.ts` appId). The Play Store
// listing URL is derivable from it.
const ANDROID_APP_ID = 'org.complexdatacollective.networkcanvas.interviewer';

// Numeric App Store app id (App Store Connect). Used to build the listing URL.
const APP_STORE_ID = '6781689516';

type StoreTarget = {
  url: string;
  label: string;
  // `false` when the listing isn't published yet — the action button is shown
  // disabled with a "coming soon" hint rather than opening a broken link.
  available: boolean;
};

export function getStoreTarget(): StoreTarget | null {
  const platform = Capacitor.getPlatform();

  if (platform === 'android') {
    return {
      url: `https://play.google.com/store/apps/details?id=${ANDROID_APP_ID}`,
      label: 'Open Google Play',
      available: true,
    };
  }

  if (platform === 'ios') {
    const hasAppStoreId = APP_STORE_ID.length > 0;
    return {
      url: hasAppStoreId ? `https://apps.apple.com/app/id${APP_STORE_ID}` : '',
      label: 'Open App Store',
      available: hasAppStoreId,
    };
  }

  return null;
}
