import React, { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';
import GlassContainer from './GlassContainer';

interface DeviceTransferModalProps {
    visible: boolean;
    device: { name: string; id: string } | null;
    onClose: () => void;
    onSend: (files: DocumentPicker.DocumentPickerAsset[]) => void;
}

export default function DeviceTransferModal({ visible, device, onClose, onSend }: DeviceTransferModalProps) {
    const [files, setFiles] = useState<DocumentPicker.DocumentPickerAsset[]>([]);

    useEffect(() => {
        if (visible) {
            setFiles([]); // Reset on open
        }
    }, [visible]);

    const pickFiles = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: false,
                multiple: true,
            });

            if (!result.canceled) {
                setFiles(prev => [...prev, ...result.assets]);
            }
        } catch (err) {
            console.log("Picker error:", err);
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSend = () => {
        onSend(files);
        // We don't close immediately, the parent will handle progress/closing
    };

    if (!visible || !device) return null;

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />

                <View style={styles.container}>
                    <GlassContainer style={styles.glassContent}>
                        {/* Header */}
                        <View style={styles.header}>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <Ionicons name="close" size={24} color="#FFFFFF" />
                            </TouchableOpacity>
                            <Text style={styles.title}>Send to {device.name}</Text>
                            <View style={{ width: 24 }} />
                        </View>

                        <View style={styles.divider} />

                        {/* File List or Empty State */}
                        {files.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <Ionicons name="documents-outline" size={64} color="rgba(255,255,255,0.3)" />
                                <Text style={styles.emptyText}>No files selected</Text>
                                <TouchableOpacity style={styles.addButton} onPress={pickFiles}>
                                    <Ionicons name="add" size={20} color="#000" />
                                    <Text style={styles.addButtonText}>Add Files</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={{ flex: 1 }}>
                                <FlatList
                                    data={files}
                                    keyExtractor={(item, index) => index.toString()}
                                    contentContainerStyle={styles.listContent}
                                    renderItem={({ item, index }) => (
                                        <View style={styles.fileItem}>
                                            <View style={styles.fileIcon}>
                                                <Ionicons name="document" size={20} color="#0A84FF" />
                                            </View>
                                            <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                                            <Text style={styles.fileSize}>{(item.size ? (item.size / 1024 / 1024).toFixed(1) : '0')} MB</Text>
                                            <TouchableOpacity onPress={() => removeFile(index)} style={styles.removeButton}>
                                                <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.5)" />
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                />
                                <View style={styles.footer}>
                                    <TouchableOpacity style={styles.addMoreButton} onPress={pickFiles}>
                                        <Text style={styles.addMoreText}>Add More</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.sendButton, files.length === 0 && styles.disabledButton]}
                                        onPress={handleSend}
                                        disabled={files.length === 0}
                                    >
                                        <Text style={styles.sendButtonText}>Send {files.length} Files</Text>
                                        <Ionicons name="arrow-up" size={16} color="#FFF" style={{ marginLeft: 4 }} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </GlassContainer>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end', // Bottom sheet style or center? Let's do center for now or full screen
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    container: {
        flex: 1,
        justifyContent: 'center',
        padding: 20,
        marginTop: 40, // Safe area
        marginBottom: 20,
    },
    glassContent: {
        flex: 1,
        borderRadius: 24,
        overflow: 'hidden',
        padding: 0, // We manage padding inside
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
    },
    closeButton: {
        padding: 4,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '600',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 16,
        marginTop: 16,
        marginBottom: 24,
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 30,
    },
    addButtonText: {
        color: '#000000',
        fontWeight: '600',
        marginLeft: 8,
    },
    listContent: {
        padding: 20,
    },
    fileItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 12,
        borderRadius: 12,
        marginBottom: 8,
    },
    fileIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(10, 132, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    fileName: {
        flex: 1,
        color: '#FFFFFF',
        fontSize: 14,
        marginRight: 8,
    },
    fileSize: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        marginRight: 12,
    },
    removeButton: {
        padding: 4,
    },
    footer: {
        flexDirection: 'row',
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    addMoreButton: {
        padding: 12,
    },
    addMoreText: {
        color: '#0A84FF',
        fontSize: 16,
        fontWeight: '500',
    },
    sendButton: {
        backgroundColor: '#0A84FF',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 30,
    },
    disabledButton: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    sendButtonText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 16,
    },
});
