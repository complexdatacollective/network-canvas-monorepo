import type { CapacitorConfig } from '@capacitor/cli';

const devServerUrl = process.env.CAP_DEV_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'org.complexdatacollective.networkcanvas.interviewer',
  appName: 'Network Canvas Interviewer',
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
};

export default config;
