import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, SafeAreaView, Platform, Alert, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { TransferService } from '../src/services/TransferService';
import { NativeEventEmitter, NativeModules } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import GlassContainer from '../src/components/GlassContainer';
import TransferProgressModal from '../src/components/TransferProgressModal';
import { BleService } from '../src/services/BleService';

// Interface for history items
interface HistoryItem {
    fileName: string;
    fileSize: string;
    isIncoming: boolean;
    filePath?: string;
}

export default function RecentScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const deviceName = params.deviceName as string || "Linked Device";
    const ip = params.ip as string;
    const port = params.port ? parseInt(params.port as string) : 0;

    console.log("RecentScreen Params:", { deviceName, ip, port, rawPort: params.port });

    const [progressVisible, setProgressVisible] = useState(false);
    const [transferProgress, setTransferProgress] = useState(0);
    const [transferFileName, setTransferFileName] = useState("");
    const [isReceiving, setIsReceiving] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<string[]>([]);

    const [history, setHistory] = useState<HistoryItem[]>([]);
    const queueRef = useRef<DocumentPicker.DocumentPickerAsset[]>([]);
    const isProcessingQueue = useRef(false);

    // Listeners
    useEffect(() => {
        const eventEmitter = new NativeEventEmitter(NativeModules.FlinchNetwork);

        // Start Advertising so Mac can discover us
        BleService.startAdvertising("12345678-1234-1234-1234-1234567890AB", "Flinch Android")
            .then(() => console.log("Advertising started"))
            .catch(err => console.log("Advertising error:", err));

        const fileSub = eventEmitter.addListener('Flinch:FileReceived', (data: any) => {
            console.log("File Received in RecentScreen:", data);

            let fileName = "";
            let filePath = "";

            if (data && data.filePath) {
                fileName = data.fileName;
                filePath = data.filePath;

                setHistory(prev => [...prev, {
                    fileName: fileName,
                    fileSize: "Received",
                    isIncoming: true,
                    filePath: filePath
                }]);
            }
        });

        const progressSub = eventEmitter.addListener('Flinch:TransferProgress', (data: any) => {
            setTransferProgress(Math.round(data.progress));
        });

        return () => {
            fileSub.remove();
            progressSub.remove();
            BleService.stopAdvertising();
        };
    }, []);

    const processQueueRef = async () => {
        if (isProcessingQueue.current) return;
        isProcessingQueue.current = true;

        if (!ip || !port) {
            Alert.alert("Error", `Lost connection to device. IP: ${ip}, Port: ${port}`);
            isProcessingQueue.current = false;
            return;
        }

        console.log(`Processing queue. Target: ${ip}:${port}`);

        setProgressVisible(true);
        setIsReceiving(false);

        while (queueRef.current.length > 0) {
            const file = queueRef.current[0];
            setTransferFileName(file.name);
            setPendingFiles(queueRef.current.slice(1).map(f => f.name));
            setTransferProgress(0);

            console.log(`Sending file: ${file.name} to ${ip}:${port}`);
            const status = await TransferService.sendFile(ip, port, file.uri);

            if (status === "SUCCESS") {
                queueRef.current.shift(); // Remove
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                Alert.alert("Error", `Failed to send ${file.name}`);
                break;
            }
        }

        setProgressVisible(false);
        isProcessingQueue.current = false;
    };

    const pickFiles = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: true, // Ensure we get a stable file path and size
                multiple: true,
            });

            if (!result.canceled && result.assets) {
                // Add to history immediately
                const newItems = result.assets.map(f => ({
                    fileName: f.name,
                    fileSize: f.size ? (f.size / 1024 / 1024).toFixed(1) + " MB" : "Unknown",
                    isIncoming: false
                }));
                setHistory(prev => [...prev, ...newItems]);

                // Add to queue
                queueRef.current.push(...result.assets);
                processQueueRef();
            }
        } catch (err) {
            console.log("Picker error:", err);
        }
    };

    const openFile = async (filePath?: string) => {
        if (!filePath) return;
        try {
            await TransferService.openFile(filePath);
        } catch (e) {
            Alert.alert("Error", "Could not open file.");
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar barStyle="light-content" />

            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={20} color="#FFF" />
                    </TouchableOpacity>
                    <View style={styles.headerTitleContainer}>
                        <Text style={styles.headerTitle}>Connected to</Text>
                        <Text style={styles.deviceName}>{deviceName}</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                {/* Content */}
                <View style={styles.content}>
                    <FlatList
                        data={history}
                        keyExtractor={(item, index) => index.toString()}
                        contentContainerStyle={styles.listContent}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                onPress={() => item.isIncoming && openFile(item.filePath)}
                                disabled={!item.isIncoming}
                            >
                                <GlassContainer style={StyleSheet.flatten([styles.messageRow, item.isIncoming ? styles.incomingRow : styles.outgoingRow])}>
                                    <View style={styles.bubbleContent}>
                                        <View style={styles.fileIcon}>
                                            <Ionicons
                                                name={item.isIncoming ? "arrow-down" : "arrow-up"}
                                                size={14}
                                                color="#FFF"
                                            />
                                        </View>
                                        <View style={styles.fileInfo}>
                                            <Text style={styles.fileName} numberOfLines={1}>{item.fileName}</Text>
                                            <Text style={styles.fileSize}>{item.fileSize}</Text>
                                        </View>
                                    </View>
                                </GlassContainer>
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <GlassContainer style={styles.emptyCard}>
                                    <Ionicons name="swap-horizontal" size={32} color="rgba(255,255,255,0.5)" />
                                    <Text style={styles.emptyText}>Session Active</Text>
                                    <Text style={styles.emptySubtext}>Share files instantly</Text>
                                </GlassContainer>
                            </View>
                        }
                    />
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <TouchableOpacity style={styles.sendButton} onPress={pickFiles}>
                        <Ionicons name="add" size={20} color="#000" />
                        <Text style={styles.sendButtonText}>Send Files</Text>
                    </TouchableOpacity>
                </View>

                <TransferProgressModal
                    visible={progressVisible}
                    progress={transferProgress}
                    fileName={transferFileName}
                    isReceiving={isReceiving}
                    onCancel={() => {
                        // Implement cancel logic if needed
                        setProgressVisible(false);
                    }}
                    pendingFiles={pendingFiles}
                />
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        marginTop: 30,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    headerTitleContainer: {
        alignItems: 'center',
    },
    headerTitle: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    deviceName: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
        marginTop: 2,
    },
    content: {
        flex: 1,
    },
    listContent: {
        padding: 20,
        paddingBottom: 100,
    },
    messageRow: {
        marginBottom: 12,
        padding: 12,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    incomingRow: {
        alignSelf: 'flex-start',
        borderBottomLeftRadius: 4,
    },
    outgoingRow: {
        alignSelf: 'flex-end',
        borderBottomRightRadius: 4,
    },
    bubbleContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    fileIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    fileInfo: {
        maxWidth: 200,
    },
    fileName: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '500',
    },
    fileSize: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 10,
        marginTop: 2,
    },
    emptyContainer: {
        alignItems: 'center',
        marginTop: 60,
    },
    emptyCard: {
        padding: 30,
        borderRadius: 24,
        alignItems: 'center',
        width: 200,
    },
    emptyText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
        marginTop: 12,
    },
    emptySubtext: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        marginTop: 4,
    },
    footer: {
        padding: 20,
        paddingBottom: 10,
    },
    sendButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        paddingVertical: 14,
        borderRadius: 25,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
    },
    sendButtonText: {
        color: '#000000',
        fontSize: 14,
        fontWeight: '600',
        marginLeft: 8,
    },
});
