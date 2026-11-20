// Capacitor: the Android app wraps the web build (dist/, from npm run build).
// The appId is the app's name on the Play Store: it never changes once published.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.krristouf.carambolage',
  appName: 'Carambolage',
  webDir: 'dist',
  android: {
    backgroundColor: '#1b1530', // the colour behind the game while it loads
  },
};

export default config;
