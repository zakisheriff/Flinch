import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlassContainer from './GlassContainer';

interface AlertModalProps {
    visible: boolean;
    title: string;
    message: string;
    type?: 'success' | 'error' | 'info';
    onClose: () => void;
}

export default function AlertModal({ visible, title, message, type = 'info', onClose }: AlertModalProps) {
    const getIconName = () => {
        switch (type) {
            case 'success': return 'checkmark-circle';
            case 'error': return 'alert-circle';
            default: return 'information-circle';
        }
    };

    const getIconColor = () => {
        switch (type) {
            case 'success': return '#4CAF50';
            case 'error': return '#FF5252';
            default: return '#2196F3';
        }
    };

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
                        <View style={[styles.iconContainer, { backgroundColor: `${getIconColor()}20` }]}>
                            <Ionicons name={getIconName()} size={32} color={getIconColor()} />
                        </View>

                        <Text style={styles.title}>{title}</Text>
                        <Text style={styles.message}>{message}</Text>

                        <TouchableOpacity style={styles.button} onPress={onClose}>
                            <Text style={styles.buttonText}>OK</Text>
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
        maxWidth: 320,
        borderRadius: 24,
        overflow: 'hidden',
    },
    content: {
        padding: 24,
        alignItems: 'center',
    },
    iconContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFF',
        marginBottom: 8,
        textAlign: 'center',
    },
    message: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    button: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 12,
        width: '100%',
        alignItems: 'center',
    },
    buttonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
    },
});
