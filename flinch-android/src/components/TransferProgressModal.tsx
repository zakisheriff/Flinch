import React from 'react';
import * as Haptics from 'expo-haptics';
import { View, Text, Modal, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

interface TransferProgressModalProps {
    visible: boolean;
    progress: number; // 0 to 100
    fileName: string;
    isReceiving: boolean; // true for receiving, false for sending
    onCancel: () => void;
    onOpen?: () => void;
}

const { width } = Dimensions.get('window');

export default function TransferProgressModal({ visible, progress, fileName, isReceiving, onCancel, onOpen }: TransferProgressModalProps) {
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
        backgroundColor: '#0A84FF',
        borderRadius: 4,
    },
    percentage: {
        fontSize: 14,
        color: '#8E8E93',
        fontWeight: '600',
    },
    cancelButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 24,
        paddingVertical: 12,
        paddingHorizontal: 24,
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
    },
    cancelText: {
        color: '#000000',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
    openButton: {
        backgroundColor: '#0A84FF',
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 24,
        marginTop: 12,
        width: '100%',
        alignItems: 'center',
    },
    openText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
});
