import React from 'react';
import * as Haptics from 'expo-haptics';
import { View, Text, Modal, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';


interface TransferProgressModalProps {
    visible: boolean;
    progress: number; // 0 to 100
    fileName: string;
    isReceiving: boolean; // true for receiving, false for sending
    onCancel: () => void;
    onOpen?: () => void;
    onAddFiles?: () => void;
    pendingFiles?: string[];
}

const { width } = Dimensions.get('window');

export default function TransferProgressModal({ visible, progress, fileName, isReceiving, onCancel, onOpen, onAddFiles, pendingFiles }: TransferProgressModalProps) {
    const handleCancel = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onCancel();
    };

    const handleOpen = () => {
        Haptics.selectionAsync();
        onOpen?.();
    };

    const isComplete = progress >= 100;

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={() => { if (isComplete) handleCancel(); }}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.iconContainer}>
                        <Ionicons
                            name={isComplete ? "checkmark-circle" : (isReceiving ? "download-outline" : "send-outline")}
                            size={48}
                            color={isComplete ? "#32D74B" : "#000000"}
                        />
                    </View>
                    <Text style={styles.title}>
                        {isComplete ? "Transfer Complete" : (isReceiving ? "Receiving File..." : "Sending File...")}
                    </Text>
                    <Text style={styles.fileName} numberOfLines={1}>
                        {fileName}
                    </Text>

                    {!isComplete && pendingFiles && pendingFiles.length > 0 && (
                        <View style={styles.queueContainer}>
                            <Text style={styles.queueTitle}>Next up:</Text>
                            {pendingFiles.slice(0, 3).map((file, index) => (
                                <Text key={index} style={styles.queueItem} numberOfLines={1}>
                                    • {file}
                                </Text>
                            ))}
                            {pendingFiles.length > 3 && (
                                <Text style={styles.queueMore}>+{pendingFiles.length - 3} more</Text>
                            )}
                        </View>
                    )}

                    {!isComplete && (
                        <>
                            <View style={styles.progressBarContainer}>
                                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                            </View>

                            <Text style={styles.percentage}>
                                {Math.round(progress)}%
                            </Text>
                        </>
                    )}

                    {isComplete && isReceiving && onOpen ? (
                        <TouchableOpacity style={styles.openButton} onPress={handleOpen}>
                            <Text style={styles.openText}>Open</Text>
                        </TouchableOpacity>
                    ) : null}

                    {!isComplete && !isReceiving && onAddFiles && (
                        <TouchableOpacity style={styles.addButton} onPress={onAddFiles}>
                            <Ionicons name="add-circle" size={24} color="#007AFF" />
                            <Text style={styles.addText}>Add More Files</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                        <Ionicons name="close-circle" size={24} color="#000000" />
                        <Text style={styles.cancelText}>{isComplete ? "Close" : "Cancel"}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    container: {
        width: width * 0.8,
        maxWidth: 320,
        padding: 24,
        borderRadius: 24,
        alignItems: 'center',
        backgroundColor: '#1C1C1E',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        elevation: 8,
    },
    iconContainer: {
        marginBottom: 16,
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 8,
    },
    fileName: {
        fontSize: 14,
        color: '#A0A0A0',
        marginBottom: 24,
        textAlign: 'center',
    },
    progressBarContainer: {
        width: '100%',
        height: 8,
        backgroundColor: '#2C2C2E',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 12,
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#007AFF',
    },
    percentage: {
        fontSize: 14,
        color: '#FFFFFF',
        marginBottom: 24,
        fontWeight: '600',
    },
    openButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#32D74B',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
        marginBottom: 12,
        width: '100%',
    },
    openText: {
        color: '#000000',
        fontSize: 16,
        fontWeight: '600',
    },
    queueContainer: {
        width: '100%',
        marginBottom: 24,
        padding: 12,
        backgroundColor: '#2C2C2E',
        borderRadius: 12,
    },
    queueTitle: {
        color: '#8E8E93',
        fontSize: 12,
        marginBottom: 8,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    queueItem: {
        color: '#FFFFFF',
        fontSize: 13,
        marginBottom: 4,
    },
    queueMore: {
        color: '#007AFF',
        fontSize: 12,
        marginTop: 4,
        fontWeight: '500',
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 122, 255, 0.15)',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
        marginBottom: 12,
        width: '100%',
    },
    addText: {
        color: '#007AFF',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
    cancelButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        width: '100%',
    },
    cancelText: {
        color: '#000000',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
});
