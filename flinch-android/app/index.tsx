import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { StyleSheet, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics'; // <--- 1. Import Haptics

import HomeScreen from '../src/screens/HomeScreen';
import RecentsScreen from '../src/screens/RecentsScreen';
import SettingsScreen from '../src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export default function Index() {
    return (
        <>
            <StatusBar style="light" />
            <Tab.Navigator
                // 2. Add this block to trigger haptics on any tab press
                screenListeners={() => ({
                    tabPress: () => {
                        Haptics.selectionAsync();
                    },
                })}
                screenOptions={({ route }) => ({
                    headerShown: false,
                    tabBarStyle: {
                        position: 'absolute',
                        bottom: 50,
                        left: 80,
                        right: 80,
                        elevation: 10,
                        height: 60,
                        backgroundColor: 'transparent',
                        borderRadius: 30,
                        borderTopWidth: 0,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.15)',
                        shadowColor: '#000',
                        shadowOffset: {
                            width: 0,
                            height: 8,
                        },
                        shadowOpacity: 0.4,
                        shadowRadius: 8,
                        zIndex: 9999,
                        paddingTop: 10,
                        marginHorizontal: 50,
                        display: route.name === 'Flinch' ? 'flex' : 'flex' // We will hide it dynamically in HomeScreen if needed, but actually HomeScreen renders full screen SessionScreen which covers it? No, TabBar is outside.
                        // To hide tab bar from inside HomeScreen, we need to use navigation.setOptions or similar.
                        // Or we can just hide it here if we pass a param? No.
                        // Let's use getFocusedRouteNameFromRoute or similar?
                        // Actually, since SessionScreen is rendered conditionally inside HomeScreen, the TabBar is still visible.
                        // We can use `tabBarStyle: { display: 'none' }` if we know the state.
                        // But we don't know the state here.
                        // Better approach: In HomeScreen, use `navigation.setOptions({ tabBarStyle: { display: 'none' } })` when sessionActive is true.
                    },
                    tabBarBackground: () => (
                        Platform.OS === 'ios' ? (
                            <View style={{ borderRadius: 30, overflow: 'hidden', flex: 1 }}>
                                <BlurView tint="dark" intensity={80} style={StyleSheet.absoluteFill} />
                            </View>
                        ) : (
                            <View style={{
                                borderRadius: 30,
                                flex: 1,
                                backgroundColor: 'rgba(20, 20, 20, 0.85)',
                                borderWidth: 1,
                                borderColor: 'rgba(255,255,255,0.05)'
                            }} />
                        )
                    ),
                    tabBarActiveTintColor: '#0A84FF',
                    tabBarInactiveTintColor: '#8E8E93',
                    tabBarShowLabel: false,
                    tabBarItemStyle: {
                        justifyContent: 'center',
                        alignItems: 'center',
                        paddingTop: 0,
                    },
                    tabBarIcon: ({ focused, color, size }) => {
                        let iconName: keyof typeof Ionicons.glyphMap;

                        if (route.name === 'Flinch') {
                            iconName = focused ? 'radio' : 'radio-outline';
                        } else if (route.name === 'Recents') {
                            iconName = focused ? 'swap-horizontal' : 'swap-horizontal-outline';
                        } else if (route.name === 'Settings') {
                            iconName = focused ? 'settings' : 'settings-outline';
                        } else {
                            iconName = 'alert';
                        }

                        return <Ionicons name={iconName} size={26} color={color} />;
                    },
                })}
            >
                <Tab.Screen
                    name="Flinch"
                    component={HomeScreen}
                    options={{ tabBarLabel: 'Nearby' }}
                />
                <Tab.Screen
                    name="Recents"
                    component={RecentsScreen}
                    options={{ tabBarLabel: 'Transfers' }}
                />
                <Tab.Screen
                    name="Settings"
                    component={SettingsScreen}
                    options={{ tabBarLabel: 'Settings' }}
                />
            </Tab.Navigator>
        </>
    );
}