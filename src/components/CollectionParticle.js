/** Short native-driver collection feedback animation rendered above the AR view. */
import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Dimensions } from 'react-native';
import { COLORS } from '../../theme';

const { width } = Dimensions.get('window');

export default function CollectionParticle({ startX, startY, onAnimationEnd }) {
  // Fly toward a fixed upper-right destination, independent of the triggering touch.
  const targetX = width * 0.8;
  const targetY = 60;

  const [posX] = useState(() => new Animated.Value(startX));
  const [posY] = useState(() => new Animated.Value(startY));
  const [scale] = useState(() => new Animated.Value(1));
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(posX, {
        toValue: targetX,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(posY, {
        toValue: targetY,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.8,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.3,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (onAnimationEnd) onAnimationEnd();
    });
    // Each mounted particle animates once from its initial touch coordinates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          transform: [
            { translateX: posX },
            { translateY: posY },
            { scale: scale },
          ],
          opacity: opacity,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 999,
  },
});