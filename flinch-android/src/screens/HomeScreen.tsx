import React, { useState, useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, PermissionsAndroid, Platform, AppState, NativeEventEmitter, NativeModules, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import GlassContainer from '../components/GlassContainer';
import { StatusBar } from 'expo-status-bar';
import { Device } from 'react-native-ble-plx';
import * as ExpoDevice from 'expo-device';
import { TransferService } from '../services/TransferService';
import { BleService } from '../services/BleService';
import * as DocumentPicker from 'expo-document-picker';
import { decode as atob } from 'base-64';
import CustomAlert from '../components/CustomAlert';
import TransferRequestAlert from '../components/TransferRequestAlert';
import TransferProgressModal from '../components/TransferProgressModal';

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
    const [sending, setSending] = useState(false);

    // Alert State
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'info' as 'info' | 'success' | 'error' });

    // Transfer Request State
    const [requestVisible, setRequestVisible] = useState(false);
    const [requestData, setRequestData] = useState({ requestId: '', fileName: '', fileSize: '0' });

    // Transfer Progress State
    const [progressVisible, setProgressVisible] = useState(false);
    const [isPicking, setIsPicking] = useState(false);
    const [transferProgress, setTransferProgress] = useState(0);
    const [transferFileName, setTransferFileName] = useState('');
    const [isReceiving, setIsReceiving] = useState(true);

    const showAlert = (title: string, message: string, type: 'info' | 'success' | 'error' = 'info') => {
        setAlertConfig({ title, message, type });
        setAlertVisible(true);
    };

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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                        const now = Date.now();
                        const existingIndex = prev.findIndex(d => d.id === device.id);

                        if (existingIndex >= 0) {
                            // Update lastSeen
                            const updated = [...prev];
                            updated[existingIndex] = { ...updated[existingIndex], lastSeen: now };
                            return updated;
                        } else {
                            console.log("Found Flinch Device:", deviceName, device.id);
                            return [...prev, {
                                id: device.id,
                                name: deviceName === "Unknown" ? "Flinch Mac" : deviceName,
                                originalDevice: device,
                                lastSeen: now
                            }];
                        }
                    });
                }
            }
        });
    };

    // Prune stale devices
    useEffect(() => {
        const interval = setInterval(() => {
            setDevices(prev => {
                const now = Date.now();
                return prev.filter(d => {
                    const lastSeen = (d as any).lastSeen || 0;
                    return now - lastSeen < 10000;
                });
            });
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleRequestResponse = async (accept: boolean) => {
        if (accept) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        setRequestVisible(false);
        if (accept) {
            setIsReceiving(true);
            setTransferFileName(requestData.fileName);
            setTransferProgress(0);
            setProgressVisible(true);
        }
        await TransferService.resolveTransferRequest(requestData.requestId, accept, requestData.fileName, requestData.fileSize);
    };

    const handleCancel = async () => {
        console.log("Cancelling transfer...");
        await TransferService.cancelTransfer();
        setProgressVisible(false);
        setTransferProgress(0);
        showAlert("Cancelled", "Transfer cancelled by user.", 'info');
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

        // New Handshake Events
        const requestSub = eventEmitter.addListener('Flinch:TransferRequest', (data) => {
            console.log("Transfer Request:", data);
            setRequestData({
                requestId: data.requestId,
                fileName: data.fileName,
                fileSize: data.fileSize
            });
            setRequestVisible(true);
        });

        const progressSub = eventEmitter.addListener('Flinch:TransferProgress', (data) => {
            // console.log("Progress:", data.progress);
            setTransferProgress(data.progress);
            if (!progressVisible) setProgressVisible(true);
        });

        const receivedSub = eventEmitter.addListener('Flinch:FileReceived', (msg) => {
            console.log("Received:", msg);
            setProgressVisible(false);
            showAlert("File Received", msg, 'success');
        });

        const errorSub = eventEmitter.addListener('Flinch:FileError', (msg) => {
            console.error("File Error:", msg);
            setProgressVisible(false);
            showAlert("Transfer Error", msg, 'error');
        });

        return () => {
            subscription.remove();
            requestSub.remove();
            progressSub.remove();
            receivedSub.remove();
            errorSub.remove();
            bleManager.stopDeviceScan();
            TransferService.stopAdvertising();
        };
    }, []);

    const handleDevicePress = async (device: DiscoveredDevice) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        console.log("Connecting to device:", device.name);
        try {
            // setSending(true); // Don't show generic loading, show progress modal
            setIsReceiving(false);
            setTransferFileName("Sending file...");
            setTransferProgress(0);

            // 1. Connect to BLE Device
            const connectedDevice = await device.originalDevice.connect();
            await connectedDevice.discoverAllServicesAndCharacteristics();

            // 2. Read Connection Info Characteristic
            const CONNECTION_CHAR_UUID = "12345678-1234-1234-1234-1234567890AC";
            const characteristic = await connectedDevice.readCharacteristicForService(SERVICE_UUID, CONNECTION_CHAR_UUID);

            if (!characteristic.value) {
                console.error("No connection info found");
                showAlert("Connection Error", "No connection info found on device.", 'error');
                return;
            }

            const infoString = atob(characteristic.value);
            console.log("Received Connection Info:", infoString);

            const [ip, portStr] = infoString.split(':');
            const port = parseInt(portStr);

            if (!ip || !port) {
                console.error("Invalid connection info:", infoString);
                showAlert("Connection Error", "Invalid connection info received.", 'error');
                return;
            }

            // 3. Pick File
            if (isPicking) return;
            setIsPicking(true);

            let result;
            try {
                result = await DocumentPicker.getDocumentAsync({
                    type: '*/*',
                    copyToCacheDirectory: false,
                });
            } catch (err) {
                console.log("Picker error:", err);
                setIsPicking(false);
                return;
            } finally {
                setIsPicking(false);
            }

            if (result.canceled) {
                console.log("File selection canceled");
                return;
            }

            const file = result.assets[0];
            console.log("Sending file:", file.name, "to", ip, port);

            setTransferFileName(file.name);
            setProgressVisible(true); // Show progress modal for sending

            // 4. Send File via TCP
            // Note: sendFileTCP in native module should emit progress events now
            const status = await TransferService.sendFile(ip, port, file.uri);

            if (status === "SUCCESS") {
                console.log("File sent successfully!");
                setProgressVisible(false);
                showAlert("Success", "File sent successfully!", 'success');
            } else if (status === "CANCELLED") {
                console.log("File transfer cancelled");
                setProgressVisible(false);
                // No alert for cancellation
            } else {
                console.error("Failed to send file");
                setProgressVisible(false);
                showAlert("Error", "Failed to send file.", 'error');
            }

            // Disconnect BLE
            await connectedDevice.cancelConnection();

        } catch (error) {
            console.error("Transfer failed:", error);
            setProgressVisible(false);
            showAlert("Transfer Failed", (error as Error).message, 'error');
        }
    };

    const handleOpen = async () => {
        if (!transferFileName) return;

        try {
            const fileUri = "file:///storage/emulated/0/Download/" + transferFileName;
            const contentUri = await FileSystem.getContentUriAsync(fileUri);
            await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                data: contentUri,
                flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
            });
        } catch (e) {
            console.error("Error opening file:", e);
            Alert.alert("Error", "Could not open file. It is saved in your Downloads folder.");
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <View style={styles.content}>
                <View style={styles.header}>
                    <Text style={styles.title}>Nearby Devices</Text>

                </View>


                {devices.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <View style={styles.radarContainer}>
                            <Ionicons name="radio-outline" size={80} color="#333" />
                            <View style={[styles.radarRing, { width: 120, height: 120 }]} />
                            <View style={[styles.radarRing, { width: 160, height: 160 }]} />
                        </View>
                        <Text style={styles.emptyText}>Scanning for devices...</Text>
                        <Text style={styles.emptySubText}>Make sure Flinch is open on your other device.</Text>
                    </View>

                ) : (
                    <FlatList
                        data={devices}
                        keyExtractor={item => item.id}
                        numColumns={2}
                        columnWrapperStyle={styles.row}
                        contentContainerStyle={styles.gridContent}
                        renderItem={({ item }) => {
                            const name = item.name.toLowerCase();
                            console.log(`Rendering device: "${item.name}" (lower: "${name}")`); // DEBUG LOG
                            const isDesktop = name.includes('mac') ||
                                name.includes('book') ||
                                name.includes('imac') ||
                                name.includes('laptop') ||
                                name.includes('desktop') ||
                                name.includes('pc') ||
                                name.includes('flinch'); // Added 'flinch' based on logs

                            return (

                                <TouchableOpacity
                                    style={styles.gridItem}
                                    onPress={() => handleDevicePress(item)}
                                    activeOpacity={0.7}
                                >
                                    <GlassContainer style={styles.card}>
                                        <View style={styles.iconContainer}>
                                            <Ionicons
                                                name={isDesktop ? "desktop-outline" : "phone-portrait-outline"}
                                                size={40}
                                                color="#000000"
                                            />
                                        </View>
                                        <View style={{ alignItems: 'center', width: '100%' }}>
                                            <Text style={[styles.deviceName, { textAlign: 'center' }]} numberOfLines={1}>
                                                {item.name}
                                            </Text>
                                            <Text style={[styles.devicePlatform, { textAlign: 'center' }]}>
                                                Tap to Send
                                            </Text>
                                        </View>
                                    </GlassContainer>
                                </TouchableOpacity>
                            );
                        }}
                    />
                )}
                <TouchableOpacity style={styles.loadingFab}>
                    {scanning && <ActivityIndicator size="small" color="#000000" style={{ marginLeft: 10 }} />}
                </TouchableOpacity>

                <TouchableOpacity style={styles.fab} onPress={startScan}>
                    <Ionicons name="refresh" size={24} color="#000000" />
                </TouchableOpacity>
            </View>

            {/* Removed generic sending overlay, using TransferProgressModal instead */}

            <CustomAlert
                visible={alertVisible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onClose={() => setAlertVisible(false)}
            />

            <TransferRequestAlert
                visible={requestVisible}
                fileName={requestData.fileName}
                fileSize={requestData.fileSize}
                onAccept={() => handleRequestResponse(true)}
                onDecline={() => handleRequestResponse(false)}
            />

            <TransferProgressModal
                visible={progressVisible}
                progress={transferProgress}
                fileName={transferFileName}
                isReceiving={isReceiving}
                onCancel={handleCancel}
                onOpen={handleOpen}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    content: {
        flex: 1,
        paddingTop: 20,
    },
    header: {
        flexDirection: 'row',
        paddingHorizontal: 24,
        marginBottom: 20,
        paddingVertical: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 14,
        fontWeight: '700',
        color: '#000000',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        overflow: 'hidden',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 100,
    },
    radarContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    radarRing: {
        position: 'absolute',
        borderWidth: 1,
        borderColor: '#333',
        borderRadius: 100,
    },
    emptyText: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '600',
        marginTop: 50,
    },
    emptySubText: {
        color: '#666666',
        fontSize: 16,
        marginTop: 8,
        textAlign: 'center',
    },
    gridContent: {
        paddingHorizontal: 16,
        paddingBottom: 100, // Space for TabBar
    },
    row: {
        justifyContent: 'space-between',
    },
    gridItem: {
        width: '48%',
        marginBottom: 16,
    },
    card: {
        padding: 16,
        alignItems: 'center',
        borderRadius: 16,
        height: 140,
        justifyContent: 'center',
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    deviceName: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    devicePlatform: {
        color: '#0A84FF',
        fontSize: 12,
        fontWeight: '500',
    },
    fab: {
        position: 'absolute',
        bottom: 120, // Increased to avoid overlap with floating navbar (25 + 70 + padding)
        right: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.30,
        shadowRadius: 4.65,
        elevation: 8,
    },
    loadingFab: {
        position: 'absolute',
        bottom: 210, // Increased to avoid overlap with floating navbar (25 + 70 + padding)
        right: 24,
        width: 56,
        alignItems: 'center',
        shadowColor: "#000",
        marginRight: 4
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)', // Slightly lighter dim
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    loadingContainer: {
        padding: 24,
        alignItems: 'center',
        width: 160, // Fixed small width
        height: 160, // Fixed small height (square)
        borderRadius: 24,
        justifyContent: 'center',
        backgroundColor: 'rgba(30, 30, 30, 0.9)', // Fallback for glass
    },
    loadingText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        marginTop: 16,
        textAlign: 'center',
    },
});
