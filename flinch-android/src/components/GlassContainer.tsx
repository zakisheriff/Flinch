import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';

interface GlassProps {
    children: React.ReactNode;
    style?: ViewStyle;
}

const GlassContainer: React.FC<GlassProps> = ({ children, style }) => {
    return (
        <View style={[styles.container, style]}>
            <BlurView intensity={20} tint="dark" style={styles.blur}>
                {children}
            </BlurView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderRadius: 16,
        overflow: 'hidden',
    },
    blur: {
        padding: 16,
        width: '100%',
    }
});

export default GlassContainer;
