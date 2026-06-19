import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';

const devServerUrl = process.env.CAP_DEV_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'org.complexdatacollective.networkcanvas.interviewer',
  appName: 'Network Canvas Interviewer 8',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    ...(devServerUrl ? { url: devServerUrl, cleartext: true } : {}),
  },
  ios: {
    // Edge-to-edge so iPadOS 26's window controls sit over the app's own
    // content (a transparent titlebar) rather than a system-coloured bar. The
    // app keeps its top content clear of the controls via env(safe-area-inset).
    // backgroundColor avoids a white flash before the web content paints.
    contentInset: 'never',
    backgroundColor: '#000000',
  },
  android: {
    allowMixedContent: Boolean(devServerUrl),
  },
  plugins: {
    Keyboard: {
      // Resize the whole native Web View when the software keyboard shows or
      // hides. This shrinks the visual viewport so the app's dvh/100%-based
      // layouts (the interview Shell and the dashboard) reflow above the
      // keyboard instead of inputs being obscured behind it. The alternative
      // `body` mode leaves the viewport unchanged, so dvh-sized containers
      // would keep the focused field under the keyboard. (iOS only.)
      resize: KeyboardResize.Native,
      // The app is dark-only (scheme-dark), so pin the keyboard chrome to dark
      // rather than tracking the (irrelevant) system appearance. (iOS only.)
      style: KeyboardStyle.Dark,
      // The app draws edge-to-edge (StatusBar overlays the web content), which
      // trips an Android bug where the Web View isn't resized for the keyboard.
      // This opts into the workaround so Android resizes too. (Android only.)
      resizeOnFullScreen: true,
    },
  },
};

export default config;
