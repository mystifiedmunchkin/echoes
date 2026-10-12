import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Video from 'react-native-video';

export function FullscreenMediaViewer({ source, type }) {
  if (type === 'video') {
    return (
      <Video
        controls
        paused={false}
        resizeMode="contain"
        source={{ uri: source }}
        style={styles.media}
      />
    );
  }

  return (
    <View style={styles.imageContainer}>
      <Image source={{ uri: source }} style={styles.media} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    alignItems: 'center',
    backgroundColor: '#000',
    flex: 1,
    justifyContent: 'center',
  },
  media: {
    flex: 1,
    width: '100%',
  },
});
