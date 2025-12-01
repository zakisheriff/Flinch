import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlassContainer from './GlassContainer';

interface PairingInputModalProps {
    visible: boolean;
    deviceName: string;
    onClose: () => void;
    onPair: (code: string) => void;
    isPairing: boolean;
}

export default function PairingInputModal({ visible, deviceName, onClose, onPair, isPairing }: PairingInputModalProps) {
    const [code, setCode] = useState("");

    const handlePair = () => {
        if (code.length === 4) {
            onPair(code);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.overlay}
            >
                <GlassContainer style={styles.container}>
                    <View style={styles.content}>
                        <View style={styles.iconContainer}>
                            <Ionicons name="keypad" size={32} color="#FFF" />
                        </View>

                        <Text style={styles.title}>Enter Pairing Code</Text>
                        <Text style={styles.subtitle}>Enter the code displayed on {deviceName}</Text>

                        <TextInput
                            style={styles.input}
                            value={code}
                            onChangeText={setCode}
                            placeholder="0000"
                            placeholderTextColor="rgba(255,255,255,0.3)"
                            keyboardType="number-pad"
                            maxLength={4}
                            autoFocus
                        />

                        <TouchableOpacity
                            style={[styles.pairButton, (code.length !== 4 || isPairing) && styles.disabledButton]}
                            onPress={handlePair}
                            disabled={code.length !== 4 || isPairing}
                        >
                            {isPairing ? (
                                <ActivityIndicator color="#000" />
                            ) : (
                                <Text style={styles.pairButtonText}>Pair Device</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={isPairing}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </GlassContainer>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    container: {
        width: '100%',
        maxWidth: 340,
        borderRadius: 24,
        overflow: 'hidden',
    },
    content: {
        padding: 30,
        alignItems: 'center',
    },
    iconContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFF',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 30,
        textAlign: 'center',
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        width: '100%',
        borderRadius: 16,
        padding: 16,
        fontSize: 24,
        color: '#FFF',
        textAlign: 'center',
        letterSpacing: 8,
        marginBottom: 30,
        fontWeight: 'bold',
    },
    pairButton: {
        backgroundColor: '#FFF',
        width: '100%',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        marginBottom: 16,
    },
    disabledButton: {
        opacity: 0.5,
    },
    pairButtonText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '600',
    },
    cancelButton: {
        paddingVertical: 12,
        paddingHorizontal: 30,
    },
    cancelText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
    },
});
