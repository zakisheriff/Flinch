const { withAndroidManifest } = require('@expo/config-plugins');

const withBLE = (config) => {
    return withAndroidManifest(config, async (config) => {
        const androidManifest = config.modResults;

        // Add permissions
        if (!androidManifest.manifest['uses-permission']) {
            androidManifest.manifest['uses-permission'] = [];
        }

        const permissions = [
            'android.permission.BLUETOOTH',
            'android.permission.BLUETOOTH_ADMIN',
            'android.permission.BLUETOOTH_SCAN',
            'android.permission.BLUETOOTH_CONNECT',
            'android.permission.ACCESS_FINE_LOCATION',
        ];

        permissions.forEach(permission => {
            if (!androidManifest.manifest['uses-permission'].find(p => p.$['android:name'] === permission)) {
                androidManifest.manifest['uses-permission'].push({
                    $: { 'android:name': permission }
                });
            }
        });

        return config;
    });
};

module.exports = withBLE;
