import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, PermissionsAndroid, Platform, AppState, NativeEventEmitter, NativeModules } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import GlassContainer from '../components/GlassContainer';
import { StatusBar } from 'expo-status-bar';
import { Device } from 'react-native-ble-plx';
import * as ExpoDevice from 'expo-device';
import { TransferService } from '../services/TransferService';
import { BleService } from '../services/BleService';
import * as DocumentPicker from 'expo-document-picker';
import { decode as atob } from 'base-64';

// Polyfill for atob if needed, though 'base-64' package is better
if (!global.atob) {
    global.atob = atob;
}

const bleManager = BleService.getManager();

// Interface for the UI to display
interface DiscoveredDevice {
    id: string;
    name: string;
    originalDevice: Device; // Keep reference to original device for connection later
}

export default function HomeScreen() {
    const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
    const [scanning, setScanning] = useState(false);
    const appState = useRef(AppState.currentState);

    const requestPermissions = async () => {
        if (Platform.OS === 'android') {
            if ((ExpoDevice.platformApiLevel ?? 0) >= 31) {
                const result = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                ]);

                const allGranted = Object.values(result).every(
                    status => status === PermissionsAndroid.RESULTS.GRANTED
                );

                if (!allGranted) {
                    console.log("Some permissions were denied:", result);
                }
                return allGranted;
            } else {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
                );
                return granted === PermissionsAndroid.RESULTS.GRANTED;
            }
        }
        return true;
    };

    const SERVICE_UUID = "12345678-1234-1234-1234-1234567890AB";

    const startScan = async () => {
        const granted = await requestPermissions();
        if (!granted) {
            console.log("Permissions not granted");
            return;
        }

        console.log("Permissions granted:", granted);

        const state = await bleManager.state();
        console.log("BLE State:", state);
        if (state !== 'PoweredOn') {
            console.log("Bluetooth is not PoweredOn. Current state:", state);
            return;
        }

        if (scanning) {
            console.log("Already scanning, stopping first...");
            bleManager.stopDeviceScan();
        }

        setScanning(true);
        console.log("Starting scan for UUID:", SERVICE_UUID);

        // REMOVED: Redundant advertising call that was blocking execution
        // We already advertise in useEffect with payload.

        console.log("Starting scan... (Ensure Location Services are ON)");

        // Use default scan mode
        bleManager.startDeviceScan(null, null, (error, device) => {
            if (error) {
                // Ignore "Cannot start scanning operation" if we are just restarting
                if (error.message && error.message.includes("Cannot start scanning operation")) {
                    console.log("Scan start race condition ignored.");
                } else {
                    console.error("Scan error:", error);
                    setScanning(false);
                }
                return;
            }

            if (device) {
                const deviceName = device.name || device.localName || "Unknown";
                // console.log("Scanned:", deviceName, device.id, device.serviceUUIDs);

                // Check if it matches our service UUID OR has the name "Flinch"
                const isFlinch = (device.serviceUUIDs && device.serviceUUIDs.includes(SERVICE_UUID)) ||
                    (deviceName && deviceName.includes("Flinch"));

                if (isFlinch) {
                    setDevices(prev => {
                        if (!prev.find(d => d.id === device.id)) {
                            console.log("Found Flinch Device:", deviceName, device.id);
                            return [...prev, {
                                id: device.id,
                                name: deviceName === "Unknown" ? "Flinch Mac" : deviceName,
                                originalDevice: device
                            }];
                        }
                        return prev;
                    });
                }
            }
        });
    };

    useEffect(() => {
        const initialize = async () => {
            // 1. Start TCP Server
            try {
                const connectionInfo = await TransferService.startServer();
                console.log("Server started at:", connectionInfo);
                const [ip, portStr] = connectionInfo.split(':');
                const port = parseInt(portStr);

                if (ip && port) {
                    // 2. Start Advertising with IP/Port payload
                    await TransferService.startBleAdvertisingWithPayload(SERVICE_UUID, ip, port);
                    console.log("Advertising started with payload:", ip, port);
                }
            } catch (e) {
                console.error("Failed to start server:", e);
            }

            // 3. Start Scanning (optional, for two-way)
            startScan();
        };

        initialize();

        // Handle app state changes to stop/start scan
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
                console.log('App has come to the foreground! Restarting scan.');
                startScan();
            } else if (nextAppState.match(/inactive|background/)) {
                console.log('App going to background. Stopping scan.');
                bleManager.stopDeviceScan();
                setScanning(false);
            }
            appState.current = nextAppState;
        });

        // Listen for file events
        const eventEmitter = new NativeEventEmitter(NativeModules.FlinchNetwork);
        const receivingSub = eventEmitter.addListener('Flinch:FileReceiving', (msg) => {
            console.log("Receiving:", msg);
            alert(msg); // Simple feedback
        });
        const receivedSub = eventEmitter.addListener('Flinch:FileReceived', (msg) => {
            console.log("Received:", msg);
            alert(msg);
        });

        return () => {
            subscription.remove();
            receivingSub.remove();
            receivedSub.remove();
            bleManager.stopDeviceScan();
            TransferService.stopAdvertising();
        };
    }, []);

    const [sending, setSending] = useState(false);

    const handleDevicePress = async (device: DiscoveredDevice) => {
        console.log("Connecting to device:", device.name);
        try {
            setSending(true);
            // 1. Connect to BLE Device
            const connectedDevice = await device.originalDevice.connect();
            await connectedDevice.discoverAllServicesAndCharacteristics();

            // 2. Read Connection Info Characteristic
            const CONNECTION_CHAR_UUID = "12345678-1234-1234-1234-1234567890AC";
            const characteristic = await connectedDevice.readCharacteristicForService(SERVICE_UUID, CONNECTION_CHAR_UUID);

            if (!characteristic.value) {
                console.error("No connection info found");
                setSending(false);
                return;
            }

            const infoString = atob(characteristic.value);
            console.log("Received Connection Info:", infoString);

            const [ip, portStr] = infoString.split(':');
            const port = parseInt(portStr);

            if (!ip || !port) {
                console.error("Invalid connection info:", infoString);
                setSending(false);
                return;
            }

            // 3. Pick File
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: false,
            });

            if (result.canceled) {
                console.log("File selection canceled");
                setSending(false);
                return;
            }

            const file = result.assets[0];
            console.log("Sending file:", file.name, "to", ip, port);

            // 4. Send File via TCP
            const success = await TransferService.sendFile(ip, port, file.uri);

            if (success) {
                console.log("File sent successfully!");
                alert("File sent successfully!");
            } else {
                console.error("Failed to send file");
                alert("Failed to send file");
            }

            // Disconnect BLE
            await connectedDevice.cancelConnection();

        } catch (error) {
            console.error("Transfer failed:", error);
            alert("Transfer failed: " + (error as Error).message);
        } finally {
            setSending(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <View style={styles.content}>
                <View style={styles.header}>
                    <Text style={styles.title}>Flinch</Text>
                    <Text style={styles.subtitle}>High-Speed Transfer</Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Nearby Devices</Text>
                    {devices.length === 0 ? (
                        <GlassContainer style={styles.scanningContainer}>
                            <Text style={styles.scanningText}>
                                {scanning ? "Scanning for devices..." : "No devices found"}
                            </Text>
                        </GlassContainer>
                    ) : (
                        <FlatList
                            data={devices}
                            keyExtractor={item => item.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity onPress={() => handleDevicePress(item)}>
                                    <GlassContainer style={styles.deviceItemContainer}>
                                        <Text style={styles.deviceItemName}>{item.name || "Unknown Device"}</Text>
                                        <Text style={styles.deviceItemSub}>{item.id}</Text>
                                        <Text style={styles.deviceItemAction}>Tap to Send File</Text>
                                    </GlassContainer>
                                </TouchableOpacity>
                            )}
                        />
                    )}
                </View>

                <TouchableOpacity style={styles.buttonContainer} onPress={startScan}>
                    <LinearGradient
                        colors={['#4b90ff', '#4746ff']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.button}
                    >
                        <Text style={styles.buttonText}>Rescan</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>

            {sending && (
                <View style={styles.loadingOverlay}>
                    <GlassContainer style={styles.loadingContainer}>
                        <Text style={styles.loadingText}>Sending File...</Text>
                        <Text style={styles.loadingSubText}>Please wait</Text>
                    </GlassContainer>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A0A',
    },
    content: {
        flex: 1,
        padding: 24,
    },
    header: {
        marginBottom: 32,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 36,
        fontWeight: 'bold',
        letterSpacing: -1,
    },
    subtitle: {
        color: '#A0A0A0',
        fontSize: 18,
    },
    section: {
        marginBottom: 24,
        flex: 1,
    },
    sectionTitle: {
        color: '#E0E0E0',
        marginBottom: 16,
        fontSize: 14,
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
    scanningContainer: {
        height: 160,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scanningText: {
        color: '#A0A0A0',
    },
    deviceItemContainer: {
        padding: 16,
        marginBottom: 12,
    },
    deviceItemName: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '600',
    },
    deviceItemSub: {
        color: '#A0A0A0',
        fontSize: 12,
        marginTop: 4,
    },
    deviceItemAction: {
        color: '#4b90ff',
        fontSize: 12,
        marginTop: 8,
        fontWeight: 'bold',
    },
    buttonContainer: {
        marginTop: 'auto',
    },
    button: {
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    buttonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 18,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    loadingContainer: {
        padding: 32,
        alignItems: 'center',
        minWidth: 200,
    },
    loadingText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    loadingSubText: {
        color: '#A0A0A0',
        fontSize: 14,
    },
});
