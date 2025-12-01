import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlassContainer from './GlassContainer';
import { TransferService } from '../services/TransferService';

interface PairingModalProps {
    visible: boolean;
    requestId: string;
    remotePort: number;
    code: string; // Add code prop
    onClose: () => void;
}

export default function PairingModal({ visible, requestId, remotePort, code, onClose }: PairingModalProps) {
    // Removed internal state for code generation


    // We need to listen for the verification event from the Native Module
    // But the event listener is in _layout.tsx.
    // We can pass a callback or use a global store, but for now, let's assume _layout.tsx
    // will pass the verification code to us via props or we can listen here too.
    // Actually, it's better if _layout.tsx handles the event and passes the verified code here?
    // Or we can listen here. Let's listen here for simplicity, but we need to be careful about multiple listeners.
    // Ideally, _layout.tsx should control this modal.

    // Let's change the design: _layout.tsx controls the modal.
    // This component just displays the code.

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <GlassContainer style={styles.container}>
                    <View style={styles.content}>
                        <View style={styles.iconContainer}>
                            <Ionicons name="link" size={32} color="#FFF" />
                        </View>

                        <Text style={styles.title}>Pairing Request</Text>
                        <Text style={styles.subtitle}>Enter this code on your Mac</Text>

                        <View style={styles.codeContainer}>
                            <Text style={styles.code}>{code}</Text>
                        </View>

                        <Text style={styles.instruction}>
                            Waiting for verification...
                        </Text>

                        <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </GlassContainer>
            </View>
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
    },
    codeContainer: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 30,
        paddingVertical: 15,
        borderRadius: 16,
        marginBottom: 30,
        minWidth: 200,
        alignItems: 'center',
    },
    code: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#FFF',
        letterSpacing: 4,
    },
    instruction: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginBottom: 20,
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
