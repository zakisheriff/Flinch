import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, PermissionsAndroid, Platform, AppState, NativeEventEmitter, NativeModules, ActivityIndicator, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import GlassContainer from '../components/GlassContainer';
import { StatusBar } from 'expo-status-bar';
import { Device } from 'react-native-ble-plx';
import { TransferService } from '../services/TransferService';
import { BleService } from '../services/BleService';
import { decode as atob } from 'base-64';
import PairingInputModal from '../components/PairingInputModal';

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
    lastSeen?: number;
    ip?: string;
    port?: number;
}

export default function HomeScreen() {
    const router = useRouter();
    // ... (existing code)

    const [scanning, setScanning] = useState(false);
    const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(null);
    const [pairingVisible, setPairingVisible] = useState(false);
    const [isPairing, setIsPairing] = useState(false);
    const [pairingCodeVisible, setPairingCodeVisible] = useState(false);
    const [generatedCode, setGeneratedCode] = useState("");

    const currentConnection = useRef<{ ip: string; port: number } | null>(null);

    const SERVICE_UUID = "12345678-1234-1234-1234-1234567890AB";
    const DATA_UUID = "12345678-1234-1234-1234-1234567890AC";

    useEffect(() => {
        // Start Advertising so Mac can discover us even on Home Screen
        BleService.startAdvertising(SERVICE_UUID, "Flinch Android")
            .then(() => {
                console.log("HomeScreen: Advertising started");
                // Auto-start scanning
                startScan();
            })
            .catch(err => console.log("HomeScreen: Advertising error:", err));

        return () => {
            BleService.stopAdvertising();
        };
    }, []);

    const requestPermissions = async () => {
        if (Platform.OS === 'android') {
            if (Platform.Version >= 31) {
                const result = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                ]);
                return (
                    result['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
                    result['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
                    result['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
                );
            } else {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
                );
                return granted === PermissionsAndroid.RESULTS.GRANTED;
            }
        }
        return true;
    };

    const startScan = async () => {
        // ... (existing permissions checks)
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
        console.log("Starting scan... (Ensure Location Services are ON)");

        // Use default scan mode
        bleManager.startDeviceScan(null, null, (error, device) => {
            if (error) {
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

                // Check if it matches our service UUID OR has the name "Flinch"
                const isFlinch = (device.serviceUUIDs && device.serviceUUIDs.includes(SERVICE_UUID)) ||
                    (deviceName && deviceName.includes("Flinch"));

                if (isFlinch) {
                    // Parse Service Data for IP/Port
                    let ip: string | undefined;
                    let port: number | undefined;

                    if (device.serviceData && device.serviceData[DATA_UUID]) {
                        try {
                            const raw = atob(device.serviceData[DATA_UUID]);
                            if (raw.length >= 6) {
                                ip = `${raw.charCodeAt(0)}.${raw.charCodeAt(1)}.${raw.charCodeAt(2)}.${raw.charCodeAt(3)}`;
                                port = (raw.charCodeAt(4) << 8) | raw.charCodeAt(5);
                                console.log("Parsed Service Data:", ip, port);
                            }
                        } catch (e) {
                            console.log("Failed to parse service data:", e);
                        }
                    }

                    setDevices(prev => {
                        const now = Date.now();
                        const existingIndex = prev.findIndex(d => d.id === device.id);

                        if (existingIndex >= 0) {
                            // Update lastSeen and IP/Port if found
                            const updated = [...prev];
                            updated[existingIndex] = {
                                ...updated[existingIndex],
                                lastSeen: now,
                                ip: ip || updated[existingIndex].ip,
                                port: port || updated[existingIndex].port
                            };
                            return updated;
                        } else {
                            console.log("Found Flinch Device:", deviceName, device.id);
                            return [...prev, {
                                id: device.id,
                                name: deviceName === "Unknown" ? "Flinch Mac" : deviceName,
                                originalDevice: device,
                                lastSeen: now,
                                ip: ip,
                                port: port
                            }];
                        }
                    });
                }
            }
        });
    };

    const showAlert = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
        Alert.alert(title, message);
    };

    const handleDevicePress = async (device: DiscoveredDevice) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSelectedDevice(device);

        // Initiate Pairing Flow
        console.log("Initiating pairing with:", device.name);
        try {
            let ip = device.ip;
            let port = device.port;

            // Fallback: Connect to BLE Device to get IP/Port if not in advertisement
            if (!ip || !port) {
                console.log("IP/Port not in advertisement, connecting to read...");
                const connectedDevice = await device.originalDevice.connect();
                await connectedDevice.discoverAllServicesAndCharacteristics();

                const CONNECTION_CHAR_UUID = "12345678-1234-1234-1234-1234567890AC";
                const characteristic = await connectedDevice.readCharacteristicForService(SERVICE_UUID, CONNECTION_CHAR_UUID);

                if (!characteristic.value) {
                    throw new Error("No connection info found");
                }

                let infoString;
                try {
                    infoString = atob(characteristic.value);
                } catch (e) {
                    throw new Error("Failed to decode device info");
                }

                const [ipStr, portStr] = infoString.split(':');
                ip = ipStr;
                port = parseInt(portStr);

                // Disconnect BLE
                await connectedDevice.cancelConnection();
            }

            if (!ip || !port) {
                throw new Error("Invalid connection info");
            }

            // Save connection info
            currentConnection.current = { ip, port };

            // 2. Send Pairing Initiation Request (Triggers code on other device)
            console.log("Sending PAIR_REQUEST to", ip, port);
            const initiated = await TransferService.initiatePairing(ip, port);

            if (initiated) {
                // Show Input Modal
                setPairingVisible(true);
            } else {
                showAlert("Connection Failed", "Could not reach device to pair.", 'error');
            }

        } catch (error) {
            console.error("Pairing initiation error:", error);
            showAlert("Pairing Error", (error as Error).message, 'error');
        }
    };

    const handlePair = async (code: string) => {
        if (!currentConnection.current) return;

        setIsPairing(true);
        console.log("Verifying code:", code);

        try {
            const { ip, port } = currentConnection.current;

            const success = await TransferService.sendPairingRequest(ip, port, code);

            if (success) {
                setPairingVisible(false);
                router.push({
                    pathname: '/recent',
                    params: {
                        deviceName: selectedDevice?.name || "Linked Device",
                        ip: ip,
                        port: port.toString()
                    }
                });
            } else {
                showAlert("Pairing Failed", "Incorrect code.", 'error');
            }

        } catch (error) {
            console.error("Pairing verification error:", error);
            showAlert("Pairing Error", (error as Error).message, 'error');
        } finally {
            setIsPairing(false);
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

            {/* Removed generic sending overlay, using TransferProgressModal instead */}
            {/* All transfer logic moved to RecentScreen */}

            <PairingInputModal
                visible={pairingVisible}
                deviceName={selectedDevice?.name || "Device"}
                onClose={() => {
                    setPairingVisible(false);
                    setSelectedDevice(null);
                }}
                onPair={handlePair}
                isPairing={isPairing}
            />

            <Modal
                visible={pairingCodeVisible}
                transparent={true}
                animationType="fade"
            >
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)' }}>
                    <GlassContainer style={{ padding: 30, borderRadius: 20, alignItems: 'center' }}>
                        <Text style={{ color: '#FFF', fontSize: 18, marginBottom: 20 }}>Pairing Request</Text>
                        <Text style={{ color: '#AAA', marginBottom: 10 }}>Enter this code on the other device:</Text>
                        <Text style={{ color: '#0A84FF', fontSize: 48, fontWeight: 'bold', letterSpacing: 5 }}>{generatedCode}</Text>
                        <TouchableOpacity
                            style={{ marginTop: 30, padding: 10 }}
                            onPress={() => setPairingCodeVisible(false)}
                        >
                            <Text style={{ color: '#FFF' }}>Cancel</Text>
                        </TouchableOpacity>
                    </GlassContainer>
                </View>
            </Modal>


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
