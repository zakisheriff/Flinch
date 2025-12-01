import React, { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, LayoutAnimation, Platform, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import GlassContainer from '../components/GlassContainer';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function SettingsScreen() {
    const [isHotspotEnabled, setIsHotspotEnabled] = useState(false);
    const [expandedSection, setExpandedSection] = useState<string | null>(null);

    const toggleSection = (section: string) => {
        Haptics.selectionAsync();
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedSection(expandedSection === section ? null : section);
    };

    const toggleHotspot = (value: boolean) => {
        Haptics.selectionAsync();
        setIsHotspotEnabled(value);
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Settings</Text>
            </View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={{ paddingBottom: 100 }} // Space for floating navbar
            >
                {/* General Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionHeader}>General</Text>
                    <GlassContainer style={styles.card}>
                        <View style={styles.row}>
                            <View style={styles.rowIcon}>
                                <Ionicons name="wifi" size={20} color="#000000" />
                            </View>
                            <View style={styles.rowContent}>
                                <Text style={styles.rowTitle}>Start Hotspot</Text>
                                <Text style={styles.rowSubtitle}>Create temporary Wi-Fi</Text>
                            </View>
                            <Switch
                                value={isHotspotEnabled}
                                onValueChange={toggleHotspot}
                                trackColor={{ false: '#333', true: '#FFFFFF' }}
                                thumbColor={isHotspotEnabled ? '#000000' : '#f4f3f4'}
                            />
                        </View>
                    </GlassContainer>
                </View>

                {/* How to Use Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionHeader}>How To Use</Text>
                    <GlassContainer style={styles.card}>
                        {/* Android Setup */}
                        <TouchableOpacity onPress={() => toggleSection('android')} style={styles.accordionRow}>
                            <Text style={styles.accordionTitle}>Android Setup</Text>
                            <Ionicons name={expandedSection === 'android' ? "chevron-up" : "chevron-down"} size={20} color="#666" />
                        </TouchableOpacity>
                        {expandedSection === 'android' && (
                            <View style={styles.accordionContent}>
                                <Text style={styles.step}>1. Enable Wi-Fi & Bluetooth</Text>
                                <Text style={[styles.step, { color: '#FF453A' }]}>2. Turn ON Location Services</Text>
                                <Text style={styles.note}>(Required for discovery)</Text>
                                <Text style={styles.step}>3. Grant Permissions</Text>
                                <Text style={styles.step}>4. Keep App Open</Text>
                            </View>
                        )}
                        <View style={styles.divider} />

                        {/* Mac Setup */}
                        <TouchableOpacity onPress={() => toggleSection('mac')} style={styles.accordionRow}>
                            <Text style={styles.accordionTitle}>Mac Setup</Text>
                            <Ionicons name={expandedSection === 'mac' ? "chevron-up" : "chevron-down"} size={20} color="#666" />
                        </TouchableOpacity>
                        {expandedSection === 'mac' && (
                            <View style={styles.accordionContent}>
                                <Text style={styles.step}>1. Enable Wi-Fi & Bluetooth</Text>
                                <Text style={styles.step}>2. App Advertises Automatically</Text>
                                <Text style={styles.step}>3. Select Device to Send</Text>
                            </View>
                        )}
                        <View style={styles.divider} />

                        {/* Troubleshooting */}
                        <TouchableOpacity onPress={() => toggleSection('trouble')} style={styles.accordionRow}>
                            <Text style={styles.accordionTitle}>Troubleshooting</Text>
                            <Ionicons name={expandedSection === 'trouble' ? "chevron-up" : "chevron-down"} size={20} color="#666" />
                        </TouchableOpacity>
                        {expandedSection === 'trouble' && (
                            <View style={styles.accordionContent}>
                                <Text style={styles.step}>• Toggle Wi-Fi off/on</Text>
                                <Text style={styles.step}>• Tap 'Rescan' & check Location</Text>
                                <Text style={styles.step}>• Ensure same network</Text>
                            </View>
                        )}
                    </GlassContainer>
                </View>

                {/* About Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionHeader}>About</Text>
                    <GlassContainer style={styles.card}>
                        <View style={styles.row}>
                            <Text style={styles.rowTitle}>Version </Text>
                            <Text style={styles.rowValue}>1.0.0 </Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.row}>
                            <Text style={styles.rowTitle}>Developer </Text>
                            <Text style={styles.rowValue}>The One Atom</Text>
                        </View>
                    </GlassContainer>
                </View>
            </ScrollView>
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
        paddingHorizontal: 16,
    },
    section: {
        marginBottom: 24,
    },
    sectionHeader: {
        fontSize: 13,
        fontWeight: '600',
        color: '#8E8E93',
        marginBottom: 8,
        marginLeft: 12,
    },
    card: {
        borderRadius: 12,
        overflow: 'hidden',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        justifyContent: 'space-between',
    },
    rowIcon: {
        width: 32,
        height: 32,
        borderRadius: 6,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    rowContent: {
        flex: 1,
    },
    rowTitle: {
        fontSize: 17,
        color: '#FFFFFF',
    },
    rowSubtitle: {
        fontSize: 13,
        color: '#8E8E93',
        marginTop: 2,
    },
    rowValue: {
        fontSize: 17,
        color: '#8E8E93',
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#38383A',
        marginLeft: 16,
    },
    accordionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
    },
    accordionTitle: {
        fontSize: 17,
        color: '#FFFFFF',
        fontWeight: '500',
    },
    accordionContent: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    step: {
        fontSize: 15,
        color: '#E5E5EA',
        marginBottom: 4,
    },
    note: {
        fontSize: 13,
        color: '#8E8E93',
        marginBottom: 8,
        marginLeft: 16,
    },
});
