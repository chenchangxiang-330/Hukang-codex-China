const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withOfflineAndroid(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const app = manifest.application[0];
    // expo-image-picker declares an optional Google Play photo-picker backport.
    // OCR Lab uses the system document picker and never requests this download.
    app.service = (app.service || []).filter((service) => service.$['android:name'] !== 'com.google.android.gms.metadata.ModuleDependencies');
    app.service.push({ $: { 'android:name': 'com.google.android.gms.metadata.ModuleDependencies', 'tools:node': 'remove' } });
    app['meta-data'] = (app['meta-data'] || []).filter((item) => !item.$['android:name'].startsWith('expo.modules.updates.'));
    app['meta-data'].push({ $: { 'android:name': 'expo.modules.updates.ENABLED', 'android:value': 'false' } });
    app.$['android:allowBackup'] = 'false';
    return mod;
  });
};
