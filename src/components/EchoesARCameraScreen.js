// /**
//  * Legacy custom-AR screen retained for reference only.
//  * The active app uses ViroARView through App.js instead of this obsolete bridge.
//  */
// import React from 'react';
// import {
//   ActivityIndicator,
//   Platform,
//   SafeAreaView,
//   StatusBar,
//   StyleSheet,
//   Text,
//   TouchableOpacity,
//   View,
// } from 'react-native';

// import { EchoesARView } from '../../modules/echoes-ar';



// import CollectionParticle from '../../components/CollectionParticle';
// import { CreateMemoryModal } from './CreateMemoryModal';
// import { getDistanceInMeters } from '../utils/geo';
// import { COLORS } from '../../constants/theme';
// import { useI18n } from '../../constants/i18n';
// const ViroARView = EchoesARView;

// export default function EchoesARCameraScreen({
//   cameraKey,
//   arViewRef,
//   location,
//   memories,
//   selectedMemoryToPlace,
//   isPlacingMode,
//   isModelLoading,
//   isCreatingInAR,
//   activeParticle,
//   showCreateModal,
//   selectedCreationCoords,
//   refreshData,
//   onMemoryCollected,
//   onMemoryPlaced,
//   onModelLoadingStatus,
//   onPlaneTapped,
//   onPlaceMemory,
//   onCancelPlacement,
//   onStartCreating,
//   onCancelCreating,
//   onClose,
//   onAnimationEnd,
//   onCloseCreateModal,
// }) {
//   const { t } = useI18n();
//   const userLatitude = location.latitude;
//   const userLongitude = location.longitude;
//   let closestMemory = selectedMemoryToPlace;
//   let minDistance = Infinity;

//   if (!closestMemory) {
//     memories.forEach((memory) => {
//       const distance = getDistanceInMeters(userLatitude, userLongitude, memory.lat, memory.lng);
//       if (distance < minDistance) {
//         minDistance = distance;
//         closestMemory = memory;
//       }
//     });
//   } else {
//     minDistance = getDistanceInMeters(userLatitude, userLongitude, closestMemory.lat, closestMemory.lng);
//   }

//   return (
//     <View style={styles.root}>
//       <ViroARView
//         key={`ar-view-${cameraKey}`}
//         ref={arViewRef}
//         style={styles.arView}
//         onMemoryCollected={onMemoryCollected}
//         onMemoryPlaced={onMemoryPlaced}
//         onModelLoadingStatus={onModelLoadingStatus}
//         onPlaneTapped={onPlaneTapped}
//         creatingMemoryMode={isCreatingInAR}
//       />

//       {activeParticle && (
//         <CollectionParticle
//           startX={activeParticle.x}
//           startY={activeParticle.y}
//           onAnimationEnd={onAnimationEnd}
//         />
//       )}

//       <SafeAreaView style={styles.cameraOverlay} pointerEvents="box-none">
//         <View style={styles.topBar}>
//           {closestMemory && (
//             <View style={styles.compassBadge}>
//               <Text style={styles.compassArrow}>&#x2794;</Text>
//               <Text style={styles.compassText}>
//                 {closestMemory.name} ({minDistance.toFixed(0)}m)
//               </Text>
//             </View>
//           )}
//           <TouchableOpacity style={styles.backButton} onPress={onClose}>
//             <Text style={styles.buttonText}>&#x2715;</Text>
//           </TouchableOpacity>
//         </View>

//         {isModelLoading && (
//           <View style={styles.loaderBadge}>
//             <ActivityIndicator size="small" color={COLORS.accent} />
//             <Text style={styles.loaderText}>{t('loading')}</Text>
//           </View>
//         )}

//         <View style={styles.bottomControls}>
//           {closestMemory && !isPlacingMode && !isCreatingInAR && (
//             <TouchableOpacity style={styles.placeButton} onPress={() => onPlaceMemory(closestMemory)}>
//               <Text style={styles.placeButtonText}>{t('placeHere')}</Text>
//             </TouchableOpacity>
//           )}

//           {!isPlacingMode && !isCreatingInAR && (
//             <TouchableOpacity
//               style={[styles.placeButton, styles.createButton, closestMemory && styles.spacedButton]}
//               onPress={onStartCreating}
//             >
//               <Text style={styles.createButtonText}>+ {t('createMemory')}</Text>
//             </TouchableOpacity>
//           )}

//           {isPlacingMode && (
//             <View style={styles.placingHintContainer}>
//               <Text style={styles.placingHint}>{t('touchCameraSurface')}</Text>
//               <TouchableOpacity style={styles.cancelButton} onPress={onCancelPlacement}>
//                 <Text style={styles.buttonText}>{t('cancel')}</Text>
//               </TouchableOpacity>
//             </View>
//           )}

//           {isCreatingInAR && (
//             <View style={styles.placingHintContainer}>
//               <Text style={styles.placingHint}>{t('touchSurfaceToContinue')}</Text>
//               <TouchableOpacity style={styles.cancelButton} onPress={onCancelCreating}>
//                 <Text style={styles.buttonText}>{t('cancel')}</Text>
//               </TouchableOpacity>
//             </View>
//           )}
//         </View>
//       </SafeAreaView>

//       <CreateMemoryModal
//         visible={showCreateModal}
//         currentLocation={selectedCreationCoords}
//         onClose={onCloseCreateModal}
//         onMemoryCreated={() => {
//           if (typeof refreshData === 'function') refreshData();
//         }}
//       />
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   root: { flex: 1, backgroundColor: COLORS.background },
//   arView: { flex: 1, width: '100%', height: '100%', position: 'absolute' },
//   cameraOverlay: {
//     ...StyleSheet.absoluteFillObject,
//     backgroundColor: 'transparent',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 10 : 10,
//   },
//   topBar: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
//   backButton: { backgroundColor: COLORS.danger, width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
//   buttonText: { color: COLORS.text, fontWeight: 'bold' },
//   compassBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.overlay, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 8 },
//   compassArrow: { color: COLORS.accent, fontSize: 16 },
//   compassText: { color: COLORS.text, fontFamily: 'monospace', fontSize: 12 },
//   loaderBadge: { backgroundColor: COLORS.overlayStrong, padding: 12, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 10 },
//   loaderText: { color: COLORS.accent, fontFamily: 'monospace', fontSize: 12 },
//   bottomControls: { width: '100%', alignItems: 'center', marginBottom: Platform.OS === 'android' ? 40 : 20 },
//   placeButton: { backgroundColor: COLORS.accent, paddingVertical: 12, paddingHorizontal: 25, borderRadius: 25, elevation: 5 },
//   placeButtonText: { color: COLORS.background, fontWeight: 'bold', fontFamily: 'monospace', fontSize: 14 },
//   createButton: { backgroundColor: COLORS.primaryStrong, minWidth: 220 },
//   spacedButton: { marginTop: 10 },
//   createButtonText: { color: COLORS.text, fontWeight: 'bold', fontFamily: 'monospace', fontSize: 13 },
//   placingHintContainer: { alignItems: 'center', gap: 8 },
//   placingHint: { color: COLORS.accent, fontFamily: 'monospace', backgroundColor: COLORS.overlayStrong, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 15, fontSize: 12 },
//   cancelButton: { backgroundColor: COLORS.transparentLight, paddingVertical: 6, paddingHorizontal: 15, borderRadius: 15 },
// });