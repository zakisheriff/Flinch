import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import GlassContainer from '../components/GlassContainer';

export default function RecentsScreen() {
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Recents</Text>
            </View>

            <View style={styles.content}>
                <View style={styles.emptyState}>
                    <Ionicons name="time-outline" size={64} color="#333" />
                    <Text style={styles.emptyText}>No Recent Transfers</Text>
                    <Text style={styles.emptySubText}>Files you send or receive will appear here.</Text>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    header: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
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
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '600',
        marginTop: 16,
    },
    emptySubText: {
        color: '#666666',
        fontSize: 16,
        marginTop: 8,
        textAlign: 'center',
    },
});
