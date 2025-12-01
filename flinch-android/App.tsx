import React from 'react';
import * as Haptics from 'expo-haptics';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { StyleSheet, Platform, View, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import HomeScreen from './src/screens/HomeScreen';
import RecentsScreen from './src/screens/RecentsScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export default function App() {
    return (
        <NavigationContainer>
            <StatusBar style="light" />
            <Tab.Navigator
                screenOptions={({ route }) => ({
                    headerShown: false,
                    tabBarStyle: {
                        position: 'absolute',
                        bottom: 25,
                        left: 20,
                        right: 20,
                        elevation: 10, // Increased elevation further
                        height: 70,
                        backgroundColor: 'transparent',
                        borderRadius: 35,
                        borderTopWidth: 0,
                        borderWidth: 1, // Added border for visibility
                        borderColor: 'rgba(255,255,255,0.1)',
                        shadowColor: '#000',
                        shadowOffset: {
                            width: 0,
                            height: 10,
                        },
                        shadowOpacity: 0.5,
                        shadowRadius: 6,
                        zIndex: 9999, // Max z-index
                    },
                    tabBarBackground: () => (
                        Platform.OS === 'ios' ? (
                            <View style={{ borderRadius: 35, overflow: 'hidden', flex: 1 }}>
                                <BlurView tint="light" intensity={90} style={StyleSheet.absoluteFill} />
                            </View>
                        ) : (
                            <View style={{
                                borderRadius: 35,
                                flex: 1,
                                backgroundColor: '#FFFFFF' // White background for floating bar
                            }} />
                        )
                    ),
                    tabBarActiveTintColor: '#000000', // Black active
                    tabBarInactiveTintColor: '#8E8E93',
                    tabBarShowLabel: false, // Hiding labels for cleaner look as per "floating curved" aesthetic usually implies icons only
                    tabBarIcon: ({ focused, color, size }) => {
                        let iconName: keyof typeof Ionicons.glyphMap;

                        if (route.name === 'Flinch') {
                            iconName = focused ? 'radio' : 'radio-outline';
                        } else if (route.name === 'Recents') {
                            iconName = focused ? 'swap-horizontal' : 'swap-horizontal-outline'; // Changed to swap-horizontal for "Transfer"
                        } else if (route.name === 'Settings') {
                            iconName = focused ? 'settings' : 'settings-outline';
                        } else {
                            iconName = 'alert';
                        }

                        return (
                            <View style={{
                                alignItems: 'center',
                                justifyContent: 'center',
                                top: Platform.OS === 'ios' ? 10 : 0, // Center vertically since no labels
                            }}>
                                <Ionicons name={iconName} size={28} color={color} />
                            </View>
                        );
                    },
                })}
            >
                <Tab.Screen
                    name="Flinch"
                    component={HomeScreen}
                    options={{
                        tabBarLabel: 'Nearby',
                    }}
                    listeners={{
                        tabPress: () => {
                            Haptics.selectionAsync();
                        },
                    }}
                />
                <Tab.Screen
                    name="Recents"
                    component={RecentsScreen}
                    options={{
                        tabBarLabel: 'Transfers',
                    }}
                    listeners={{
                        tabPress: () => {
                            Haptics.selectionAsync();
                        },
                    }}
                />
                <Tab.Screen
                    name="Settings"
                    component={SettingsScreen}
                    options={{
                        tabBarLabel: 'Settings',
                    }}
                    listeners={{
                        tabPress: () => {
                            Haptics.selectionAsync();
                        },
                    }}
                />
            </Tab.Navigator>
        </NavigationContainer>
    );
}
