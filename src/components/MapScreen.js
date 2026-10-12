// /**
//  * Legacy extracted map screen retained for reference.
//  * The active map UI is currently composed directly in App.js.
//  */
// import React, { useState } from 'react';
// import {
//   ActivityIndicator,
//   StyleSheet,
//   Text,
//   TouchableOpacity,
//   View,
// } from 'react-native';
// import MaplibreGL from '@maplibre/maplibre-react-native';
// import maplibregl from '@maplibre/maplibre-react-native'; // No access token needed for self-hosted or open styles

// import Slider from '@react-native-community/slider';

// import InventoryModal from '../../components/InventoryModal';

// import { CreateMemoryModal } from './CreateMemoryModal';
// import { MemoryInfoModal } from './MemoryInfoModal';
// import { formatRadiusText, getDistanceInMeters } from '../utils/geo';
// import { COLORS } from '../../app/theme';
// import { useI18n } from '../../constants/i18n';

// maplibregl.setAccessToken(null);

// export default function MapScreen({
//   location,
//   memories,
//   radius,
//   isLoadingApi,
//   apiError,
//   refreshData,
//   updateRadius,
//   collectedMemories,
//   onShowInventory,
//   showInventory,
//   onCloseInventory,
//   onClearInventory,
//   onReplaceMemory,
//   selectedCreationCoords,
//   onSetCreationCoords,
//   showCreateModal,
//   onShowCreateModal,
//   onHideCreateModal,
//   onCloseCreateModal,
//   onMemoryCreated,
//   onOpenARCamera,
// }) {
//   const { t } = useI18n();
//   const [selectedMemoryToInspect, setSelectedMemoryToInspect] = useState(null);
//   const [showInfoModal, setShowInfoModal] = useState(false);
//   const [slidingRadius, setSlidingRadius] = useState(null);

//   const mapStyleUrl = 'https://demotiles.maplibre.org/style.json';


//   const inspectMemoryAt = (latitude, longitude) => {
//     const hit = memories.find((memory) =>
//       getDistanceInMeters(latitude, longitude, memory.lat, memory.lng) < 2
//     );
//     if (!hit) return false;

//     onSetCreationCoords(null);
//     setSelectedMemoryToInspect(hit);
//     setShowInfoModal(true);
//     return true;
//   };

//   return (
//     <View style={styles.container}>
//       <View style={styles.header}>
//         <Text style={styles.headerTitle}>{t('ministry')}</Text>
//         <TouchableOpacity onPress={onShowInventory}>
//           <Text style={styles.inventoryBadge}>{t('collection')} ({collectedMemories.length})</Text>
//         </TouchableOpacity>
//       </View>

//       {apiError && (
//         <TouchableOpacity style={styles.errorBanner} onPress={refreshData}>
//           <Text style={styles.errorText}>{apiError} - Toucher pour reessayer</Text>
//         </TouchableOpacity>
//       )}

//       <MaplibreGL.MapView
//         style={styles.map}
//         styleURL={mapStyleUrl}
//         initialCamera={{
//           centerCoordinate: [location.longitude, location.latitude],
//           zoomLevel: 14,
//         }}
//         onPress={(event) => {
//           onSetCreationCoords(null);
//           const coordinate = event.nativeEvent?.geometry?.coordinates;
//           if (coordinate) inspectMemoryAt(coordinate[1], coordinate[0]);
//         }}
//         onLongPress={(event) => {
//           const coordinate = event.nativeEvent?.geometry?.coordinates;
//           if (!coordinate) return;
//           if (!inspectMemoryAt(coordinate[1], coordinate[0])) {
//             onSetCreationCoords({ latitude: coordinate[1], longitude: coordinate[0] });
//             onHideCreateModal();
//           }
//         }}
//       >
//         <MaplibreGL.UserLocation visible={true} />
//         <MaplibreGL.ShapeSource
//           id="radiusCircle"
//           shape={{
//             type: 'Feature',
//             geometry: {
//               type: 'Point',
//               coordinates: [location.longitude, location.latitude],
//             },
//             properties: {
//               radius: slidingRadius || radius,
//             },
//           }}
//         >
//           <MaplibreGL.CircleLayer
//             id="circleFill"
//             style={{
//               circleRadius: ['interpolate', ['linear'], ['zoom'], 0, ['*', ['get', 'radius'], 0.0001], 18, ['get', 'radius']],
//               circleColor: COLORS.primaryStrong,
//               circleOpacity: 0.2,
//               circleStrokeColor: COLORS.primaryStrong,
//               circleStrokeWidth: 1,
//             }}
//           />
//         </MaplibreGL.ShapeSource>

//         {memories.map((memory) => (
//           <MaplibreGL.PointAnnotation
//             key={memory.id}
//             id={`memory-${memory.id}`}
//             coordinate={[memory.lng, memory.lat]}
//             onSelected={() => {
//               setSelectedMemoryToInspect(memory);
//               setShowInfoModal(true);
//             }}
//           >
//             <View style={styles.markerContainer}>
//               <View style={styles.markerDot} />
//             </View>
//             <MaplibreGL.Callout title={memory.name} />
//           </MaplibreGL.PointAnnotation>
//         ))}
//         {selectedCreationCoords && (
//           <MaplibreGL.PointAnnotation
//             id="newMemoryMarker"
//             coordinate={[selectedCreationCoords.longitude, selectedCreationCoords.latitude]}
//           >
//             <View style={[styles.markerContainer, styles.creationMarkerContainer]}>
//               <View style={[styles.markerDot, styles.creationMarkerDot]} />
//             </View>
//             <MaplibreGL.Callout title="New memory" />
//           </MaplibreGL.PointAnnotation>
//         )}
//       </MaplibreGL.MapView>

//       {selectedCreationCoords && (
//         <TouchableOpacity
//           style={styles.createAtLocationButton}
//           onPress={onShowCreateModal}
//           accessibilityRole="button"
//         >
//           <Text style={styles.createAtLocationButtonText}>{t('createHere')}</Text>
//         </TouchableOpacity>
//       )}

//       <CreateMemoryModal
//         visible={showCreateModal}
//         currentLocation={selectedCreationCoords}
//         onClose={onCloseCreateModal}
//         onMemoryCreated={onMemoryCreated}
//       />

//       <View style={styles.sliderContainer}>
//         <View style={styles.sliderHeader}>
//           <Text style={styles.sliderText}>
//             {t('radius')} : <Text style={styles.radiusValue}>{formatRadiusText(slidingRadius || radius)}</Text>
//           </Text>
//           {isLoadingApi && <ActivityIndicator size="small" color={COLORS.accent} />}
//         </View>
//         <Slider
//           style={styles.slider}
//           minimumValue={50}
//           maximumValue={5000}
//           step={50}
//           value={radius}
//           minimumTrackTintColor={COLORS.primaryStrong}
//           maximumTrackTintColor={COLORS.surfaceMuted}
//           thumbTintColor={COLORS.accent}
//           onValueChange={setSlidingRadius}
//           onSlidingComplete={(value) => {
//             setSlidingRadius(null);
//             updateRadius(value);
//           }}
//         />
//       </View>

//       <View style={styles.bottomBar}>
//         <TouchableOpacity style={styles.button} onPress={onOpenARCamera}>
//           <Text style={styles.buttonText}>{t('scanAr')}</Text>
//         </TouchableOpacity>
//       </View>

//       <InventoryModal
//         visible={showInventory}
//         onClose={onCloseInventory}
//         items={collectedMemories}
//         onClear={onClearInventory}
//         onReplace={onReplaceMemory}
//       />

//       <MemoryInfoModal
//         visible={showInfoModal}
//         memory={selectedMemoryToInspect}
//         onClose={() => {
//           setShowInfoModal(false);
//           setSelectedMemoryToInspect(null);
//         }}
//       />
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: COLORS.background },
//   header: { paddingTop: 50, paddingBottom: 15, backgroundColor: COLORS.surface, alignItems: 'center' },
//   headerTitle: { color: COLORS.accent, fontSize: 16, fontWeight: 'bold', fontFamily: 'monospace' },
//   inventoryBadge: { color: COLORS.text, fontSize: 13, fontFamily: 'monospace', marginTop: 5 },
//   errorBanner: { backgroundColor: COLORS.danger, padding: 8, alignItems: 'center' },
//   errorText: { color: COLORS.text, fontSize: 12, fontFamily: 'monospace' },
//   map: { flex: 1, width: '100%' },
//   bottomBar: { padding: 20, backgroundColor: COLORS.surface, alignItems: 'center' },
//   button: { backgroundColor: COLORS.primaryStrong, paddingVertical: 15, borderRadius: 5, width: '100%', alignItems: 'center' },
//   buttonText: { color: COLORS.text, fontWeight: 'bold', fontFamily: 'monospace' },
//   createAtLocationButton: {
//     position: 'absolute',
//     bottom: 160,
//     alignSelf: 'center',
//     backgroundColor: COLORS.primaryStrong,
//     paddingHorizontal: 24,
//     paddingVertical: 14,
//     borderRadius: 24,
//     justifyContent: 'center',
//     alignItems: 'center',
//     elevation: 5,
//     shadowColor: COLORS.background,
//     shadowOffset: { width: 0, height: 3 },
//     shadowOpacity: 0.3,
//     shadowRadius: 4,
//   },
//   createAtLocationButtonText: { fontSize: 14, color: COLORS.text, fontWeight: 'bold', fontFamily: 'monospace' },
//   markerContainer: {
//     alignItems: 'center',
//     justifyContent: 'center',
//     width: 30,
//     height: 30,
//   },
//   markerDot: {
//     width: 15,
//     height: 15,
//     borderRadius: 7.5,
//     backgroundColor: COLORS.accent,
//     borderWidth: 2,
//     borderColor: COLORS.background,
//   },
//   creationMarkerContainer: {
//     width: 40,
//     height: 40,
//   },
//   creationMarkerDot: {
//     width: 20,
//     height: 20,
//     borderRadius: 10,
//     backgroundColor: COLORS.primaryStrong,
//   },
//   disclosureOverlay: { flex: 1, justifyContent: 'center', backgroundColor: COLORS.overlay, padding: 20 },
//   disclosureCard: { backgroundColor: COLORS.surfaceRaised, borderRadius: 16, borderColor: COLORS.primaryStrong, borderWidth: 1, padding: 20 },
//   disclosureTitle: { color: COLORS.accent, fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
//   disclosureText: { color: COLORS.text, fontSize: 14, lineHeight: 21 },
//   disclosurePolicyText: { marginTop: 12 },
//   disclosureLink: { color: COLORS.primary, textDecorationLine: 'underline', marginTop: 12 },
//   disclosureActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
//   sliderContainer: { position: 'absolute', bottom: 95, left: 15, right: 15, backgroundColor: 'rgba(17, 25, 29, 0.95)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
//   slider: { width: '100%', height: 40 },
//   sliderText: { color: COLORS.text, fontFamily: 'monospace', fontSize: 12 },
//   radiusValue: { color: COLORS.accent, fontWeight: 'bold' },
//   disclosureCancel: { color: COLORS.text, fontWeight: 'bold' },
//   disclosureAccept: { color: COLORS.accent, fontWeight: 'bold' },
// });