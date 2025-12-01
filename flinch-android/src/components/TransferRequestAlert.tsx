import React from 'react';
import * as Haptics from 'expo-haptics';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TransferRequestAlertProps {
    visible: boolean;
    fileName: string;
    fileSize: string;
    onAccept: () => void;
    onDecline: () => void;
}

const { width } = Dimensions.get('window');

export default function TransferRequestAlert({ visible, fileName, fileSize, onAccept, onDecline }: TransferRequestAlertProps) {
    // Format file size
    const formatSize = (bytes: string) => {
        const size = parseInt(bytes);
        if (isNaN(size)) return bytes;
        if (size < 1024) return size + ' B';
        if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
        return (size / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const handleAccept = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onAccept();
    };

    const handleDecline = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        onDecline();
    };

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={handleDecline}
        >
            <View style={styles.overlay}>
                <View style={styles.alertContainer}>
                    <View style={styles.iconContainer}>
                        <Ionicons name="document-text-outline" size={48} color="#000000" />
                    </View>
                    <Text style={styles.title}>Receive File?</Text>
                    <Text style={styles.message}>
                        <Text style={{ fontWeight: 'bold', color: 'white' }}>{fileName}</Text>
                        {'\n'}
                        <Text style={{ fontSize: 14, color: '#888' }}>{formatSize(fileSize)}</Text>
                    </Text>

                    <View style={styles.buttonContainer}>
                        <TouchableOpacity onPress={handleDecline} style={[styles.button, styles.declineButton]}>
                            <Text style={styles.declineText}>Decline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleAccept} style={[styles.button, styles.acceptButton]}>
                            <Text style={styles.acceptText}>Accept</Text>
                        </TouchableOpacity>
                    </View>
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
    alertContainer: {
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
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 8,
        textAlign: 'center',
    },
    message: {
        fontSize: 16,
        color: '#A0A0A0',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        gap: 12,
    },
    button: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 16,
        alignItems: 'center',
    },
    acceptButton: {
        backgroundColor: '#FFFFFF',
    },
    declineButton: {
        backgroundColor: '#FFFFFF',
    },
    acceptText: {
        color: '#000000',
        fontSize: 16,
        fontWeight: '600',
    },
    declineText: {
        color: '#FF453A',
        fontSize: 16,
        fontWeight: '600',
    },
});
