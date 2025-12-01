import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';
import GlassContainer from './GlassContainer';

interface SessionScreenProps {
    deviceName: string;
    onDisconnect: () => void;
    onSendFiles: (files: DocumentPicker.DocumentPickerAsset[]) => void;
    history: any[]; // Define proper type
}

export default function SessionScreen({ deviceName, onDisconnect, onSendFiles, history }: SessionScreenProps) {

    const pickFiles = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: false,
                multiple: true,
            });

            if (!result.canceled) {
                onSendFiles(result.assets);
            }
        } catch (err) {
            console.log("Picker error:", err);
        }
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <BlurView intensity={80} tint="dark" style={styles.header}>
                <SafeAreaView>
                    <View style={styles.headerContent}>
                        <View>
                            <Text style={styles.headerTitle}>Connected to</Text>
                            <Text style={styles.deviceName}>{deviceName}</Text>
                        </View>
                        <TouchableOpacity onPress={onDisconnect} style={styles.disconnectButton}>
                            <Text style={styles.disconnectText}>End Session</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </BlurView>

            {/* History / Chat */}
            <FlatList
                data={history}
                keyExtractor={(item, index) => index.toString()}
                contentContainerStyle={styles.listContent}
                inverted // Chat style, newest at bottom? No, usually newest at bottom means inverted if data is reversed.
                // Let's assume history is appended, so we want to scroll to bottom.
                renderItem={({ item }) => (
                    <View style={[styles.messageRow, item.isIncoming ? styles.incomingRow : styles.outgoingRow]}>
                        <View style={[styles.bubble, item.isIncoming ? styles.incomingBubble : styles.outgoingBubble]}>
                            <View style={styles.fileIcon}>
                                <Ionicons
                                    name={item.isIncoming ? "arrow-down" : "arrow-up"}
                                    size={16}
                                    color={item.isIncoming ? "#FFF" : "#FFF"}
                                />
                            </View>
                            <View>
                                <Text style={styles.fileName} numberOfLines={1}>{item.fileName}</Text>
                                <Text style={styles.fileSize}>{item.fileSize}</Text>
                            </View>
                        </View>
                    </View>
                )}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>Session Started</Text>
                        <Text style={styles.emptySubtext}>Files you send or receive will appear here.</Text>
                    </View>
                }
            />

            {/* Footer */}
            <BlurView intensity={80} tint="dark" style={styles.footer}>
                <SafeAreaView>
                    <TouchableOpacity style={styles.sendButton} onPress={pickFiles}>
                        <Ionicons name="add" size={24} color="#FFF" />
                        <Text style={styles.sendButtonText}>Send Files</Text>
                    </TouchableOpacity>
                </SafeAreaView>
            </BlurView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    header: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    headerTitle: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
    },
    deviceName: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '600',
    },
    disconnectButton: {
        backgroundColor: 'rgba(255,59,48,0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    disconnectText: {
        color: '#FF3B30',
        fontSize: 14,
        fontWeight: '600',
    },
    listContent: {
        padding: 20,
        paddingBottom: 100,
    },
    messageRow: {
        marginBottom: 16,
        flexDirection: 'row',
    },
    incomingRow: {
        justifyContent: 'flex-start',
    },
    outgoingRow: {
        justifyContent: 'flex-end',
    },
    bubble: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 16,
        maxWidth: '80%',
    },
    incomingBubble: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderBottomLeftRadius: 4,
    },
    outgoingBubble: {
        backgroundColor: '#0A84FF',
        borderBottomRightRadius: 4,
    },
    fileIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    fileName: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '500',
    },
    fileSize: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
    },
    emptyContainer: {
        alignItems: 'center',
        marginTop: 40,
    },
    emptyText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
    },
    emptySubtext: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    sendButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0A84FF',
        margin: 20,
        padding: 16,
        borderRadius: 16,
    },
    sendButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '600',
        marginLeft: 8,
    },
});
