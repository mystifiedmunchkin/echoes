/**
 * Active application shell: owns map/radar state, AR entry/exit, and modal orchestration.
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, BackHandler, Alert } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import DeviceInfo from 'react-native-device-info';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useCameraPermission } from 'react-native-vision-camera';
import Slider from '@react-native-community/slider';
import InventoryModal from './src/components/InventoryModal';
import {
  Camera,
  FillLayer,
  MapView,
  MarkerView,
  ShapeSource,
} from '@maplibre/maplibre-react-native';
import {
  calculateBearing, createRadiusPolygon, getDistanceInMeters, formatRadiusText,
  getRelativeARPosition, spreadARPositions,
} from './src/utils/geo';
import { useInventory } from './src/hooks/useInventory';
import { useRadar } from './src/hooks/useRadar';
import CollectionParticle from './src/components/CollectionParticle';
import { CreateMemoryModal } from './src/components/CreateMemoryModal';
import { MemoryAudioPlayer } from './src/components/MemoryAudioPlayer';
import { MemoryInfoModal } from './src/components/MemoryInfoModal';
import { FullscreenMediaViewer } from './src/components/FullscreenMediaViewer';
import { AccountModal } from './src/components/AccountModal';
import ViroModelViewer from './src/components/ViroModelViewer';
import { useAuth } from './src/hooks/useAuth'
import { COLORS } from './theme';
import { useI18n } from './constants/i18n';
const ViroARView = React.lazy(() => import('./src/components/ViroARView'));
const AR_MEMORY_MAX_RADIUS_METERS = 5000;
const AR_SESSION_RELEASE_MS = 1500;
const MODEL_VIEWER_RELEASE_MS = 500;

export default function App() {
  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  // --- Display and localized strings ---
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  // // --- Radar state and API interaction ---
  const {
    location, errorMsg, memories, radius, isLoadingApi, apiError,
    updateRadius, refreshData, requestGpsPermission, cacheMemoryAssets
  } = useRadar(5000);

  // --- Manage the memory's position in AR relative to the user's AR location (origin) ---
  const [selectedMemoryToPlace, setSelectedMemoryToPlace] = useState(null);
  const [selectedArMemory, setSelectedArMemory] = useState(null);

  // --- Inventory management ---
  const {
    collectedMemories, showInventory, setShowInventory,
    handleCollectMemory, clearInventory
  } = useInventory();
  const collectionItems = useMemo(() => collectedMemories.map((item) => {
    const sourceMemory = memories.find((memory) => String(memory.id) === String(item.id));
    return sourceMemory?.creatorName && !item.creatorName
      ? { ...item, creatorName: sourceMemory.creatorName }
      : item;
  }), [collectedMemories, memories]);

  // --- Authentication and account management ---
  const { user, signIn, signUp, signOut } = useAuth();
  const [showAccount, setShowAccount] = useState(false);
  const requireAuthentication = useCallback(() => {
    if (user) return true;
    setShowAccount(true);
    return false;
  }, [user]);

  // --- Camera AR state and management ---
  // --- Camera AR state and management ---
  const [showCamera, setShowCamera] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const { hasPermission, requestPermission } = useCameraPermission();
  const isProblematicARDevice = () => {
    const manufacturer = DeviceInfo.getManufacturerSync().toLowerCase();
    const model = DeviceInfo.getModel();
    return manufacturer === 'samsung' && (model.includes('A') || model.includes('M') || model.includes('Galaxy A'));
  };

  useEffect(() => {
    if (isProblematicARDevice()) {
      Alert.alert(
        t('samsungDeviceMode'),
        t('samsungDeviceDescription'),
      );
    }
  }, [t]);

  const [arSessionMemories, setArSessionMemories] = useState([]);
  const [isPlacingMode, setIsPlacingMode] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isPreparingPlacement, setIsPreparingPlacement] = useState(false);
  const [resetPlacedMemoryKey, setResetPlacedMemoryKey] = useState(0);
  const [slidingRadius, setSlidingRadius] = useState(5000);
  const [activeParticle, setActiveParticle] = useState(null);
  const lastARCloseAt = useRef(0);
  // --- Modal management for creating and inspecting memories ---
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCreationCoords, setSelectedCreationCoords] = useState(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [selectedMemoryToInspect, setSelectedMemoryToInspect] = useState(null);
  const [modelViewerMemory, setModelViewerMemory] = useState(null);
  const [isPreparingModelViewer, setIsPreparingModelViewer] = useState(false);
  const modelViewerRequestKey = useRef(0);
  const modelViewerTransitionTimer = useRef(null);
  const [mediaViewer, setMediaViewer] = useState(null);
  const [isPreparingMediaViewer, setIsPreparingMediaViewer] = useState(false);
  const mediaViewerRequestKey = useRef(0);
  const mediaViewerTransitionTimer = useRef(null);

  useEffect(() => {
    const syncAssets = () => {
      if (!showInfoModal || !selectedMemoryToInspect) return;

      let isCurrentSelection = true;
      cacheMemoryAssets(selectedMemoryToInspect)
        .then((cachedMemory) => {
          if (!isCurrentSelection) return;
          setSelectedMemoryToInspect((currentMemory) => (
            currentMemory && String(currentMemory.id) === String(cachedMemory.id)
              ? cachedMemory
              : currentMemory
          ));
        })
        .catch((error) => {
          if (isCurrentSelection) {
            console.warn(t('mediaPreparationError'), error);
          }
        });

      return () => {
        isCurrentSelection = false;
      };
    };
    syncAssets();
  }, [showInfoModal, selectedMemoryToInspect, cacheMemoryAssets, t]);

  useEffect(() => () => {
    if (modelViewerTransitionTimer.current) {
      clearTimeout(modelViewerTransitionTimer.current);
    }
    if (mediaViewerTransitionTimer.current) {
      clearTimeout(mediaViewerTransitionTimer.current);
    }
  }, []);

  const openModelViewer = useCallback(async (memory) => {
    if (!memory?.model_url) return;

    const requestKey = ++modelViewerRequestKey.current;
    if (modelViewerTransitionTimer.current) {
      clearTimeout(modelViewerTransitionTimer.current);
    }
    setShowInfoModal(false);
    setSelectedMemoryToInspect(null);
    setIsPreparingModelViewer(true);

    try {
      const cachedMemory = await cacheMemoryAssets(memory);
      if (modelViewerRequestKey.current !== requestKey) return;

      modelViewerTransitionTimer.current = setTimeout(() => {
        if (modelViewerRequestKey.current !== requestKey) return;
        setModelViewerMemory(cachedMemory);
        setIsPreparingModelViewer(false);
      }, MODEL_VIEWER_RELEASE_MS);
    } catch (error) {
      if (modelViewerRequestKey.current !== requestKey) return;
      setIsPreparingModelViewer(false);
      Alert.alert(
        t('modelLoadError'),
        error instanceof Error ? error.message : t('modelPreparationError'),
      );
    }
  }, [cacheMemoryAssets, t]);

  const closeModelViewer = useCallback(() => {
    const requestKey = ++modelViewerRequestKey.current;
    if (modelViewerTransitionTimer.current) {
      clearTimeout(modelViewerTransitionTimer.current);
    }

    if (!modelViewerMemory) {
      setIsPreparingModelViewer(false);
      return;
    }

    setModelViewerMemory(null);
    setIsPreparingModelViewer(true);
    modelViewerTransitionTimer.current = setTimeout(() => {
      if (modelViewerRequestKey.current === requestKey) {
        setIsPreparingModelViewer(false);
      }
    }, MODEL_VIEWER_RELEASE_MS);
  }, [modelViewerMemory]);

  const openMediaViewer = useCallback(async (memory, type) => {
    const mediaUrl = memory?.[`${type}_url`];
    if (!mediaUrl) return;

    const requestKey = ++mediaViewerRequestKey.current;
    if (mediaViewerTransitionTimer.current) {
      clearTimeout(mediaViewerTransitionTimer.current);
    }
    setShowInfoModal(false);
    setSelectedMemoryToInspect(null);
    setIsPreparingMediaViewer(true);

    try {
      const cachedMemory = await cacheMemoryAssets(memory);
      const source = cachedMemory[`${type}_url`];
      if (!source) throw new Error(t('mediaLoadError'));
      if (mediaViewerRequestKey.current !== requestKey) return;

      mediaViewerTransitionTimer.current = setTimeout(() => {
        if (mediaViewerRequestKey.current !== requestKey) return;
        setMediaViewer({ name: cachedMemory.name, source, type });
        setIsPreparingMediaViewer(false);
      }, MODEL_VIEWER_RELEASE_MS);
    } catch (error) {
      if (mediaViewerRequestKey.current !== requestKey) return;
      setIsPreparingMediaViewer(false);
      Alert.alert(
        t('mediaLoadError'),
        error instanceof Error ? error.message : t('mediaLoadError'),
      );
    }
  }, [cacheMemoryAssets, t]);

  const closeMediaViewer = useCallback(() => {
    const requestKey = ++mediaViewerRequestKey.current;
    if (mediaViewerTransitionTimer.current) {
      clearTimeout(mediaViewerTransitionTimer.current);
    }

    if (!mediaViewer) {
      setIsPreparingMediaViewer(false);
      return;
    }

    setMediaViewer(null);
    setIsPreparingMediaViewer(true);
    mediaViewerTransitionTimer.current = setTimeout(() => {
      if (mediaViewerRequestKey.current === requestKey) {
        setIsPreparingMediaViewer(false);
      }
    }, MODEL_VIEWER_RELEASE_MS);
  }, [mediaViewer]);

  // --- Memory creation mode from the AR view ---
  const [isCreatingInAR, setIsCreatingInAR] = useState(false);


  // --- AR camera closure ---
  //// TODO :  maybe this needs looking at closely to get the correct order of instructions (buggy?)
  const closeARCamera = useCallback(() => {
    lastARCloseAt.current = Date.now();
    setShowCamera(false);
    setArSessionMemories([]);
    setIsPlacingMode(false);
    setSelectedMemoryToPlace(null);
    setSelectedArMemory(null);
    setIsCreatingInAR(false);
    setIsModelLoading(false);
    setIsPreparingPlacement(false);
    setActiveParticle(null);
  }, []);

  // --- AR camera opening ---
  const openARCamera = useCallback(() => {
    if (isProblematicARDevice()) {
      Alert.alert(
        t('arUnavailable'),
        t('arUnavailableDescription'),
      );
      return false;
    }
    const elapsedSinceClose = Date.now() - lastARCloseAt.current;
    if (lastARCloseAt.current > 0 && elapsedSinceClose < AR_SESSION_RELEASE_MS) {
      Alert.alert(t('arClosing'), t('arClosingWait'));
      return false;
    }
    // Prepare AR session memories based on the current location and nearby memories
    const sessionMemories = spreadARPositions(memories
      .map((memory) => {
        const distanceMeters = getDistanceInMeters(
          location.latitude,
          location.longitude,
          memory.lat,
          memory.lng,
        );
        return {
          memory,
          bearingDeg: calculateBearing(
            location.latitude,
            location.longitude,
            memory.lat,
            memory.lng,
          ),
          distanceMeters,
          relativePosition: getRelativeARPosition(
            calculateBearing(
              location.latitude,
              location.longitude,
              memory.lat,
              memory.lng,
            ),
            distanceMeters,
          ),
        };
      })
      .filter(({ distanceMeters }) => distanceMeters <= Math.min(radius, AR_MEMORY_MAX_RADIUS_METERS))
      .sort((left, right) => left.distanceMeters - right.distanceMeters));
    // Set the memories to choose from during the AR session.
    setArSessionMemories(sessionMemories);
    setCameraKey((prev) => prev + 1);
    setShowCamera(true);
    return true;
  }, [location, memories, radius, t]);

  // --- Request camera permission and start AR session (FIRST)
  const requestCameraAndStart = useCallback(async () => {
    let granted = hasPermission;
    if (!granted) {
      try {
        granted = await requestPermission();
      } catch (error) {
        console.error(t('cameraPermissionRequestError'), error);
        Alert.alert(t('error'), t('cameraError'));
        return;
      }
    }
    if (!granted) return Alert.alert(t('error'), t('cameraPermissionDenied'));

    if (!location) {
      Alert.alert(t('error'), t('initializingRadar'));
      return;
    }

    openARCamera();
  }, [hasPermission, requestPermission, location, openARCamera, t]);

  const handleOpenARCamera = useCallback(async () => {
    requestCameraAndStart();
  }, [requestCameraAndStart]);


  // AR uses local plane coordinates for rendering. This saved GPS coordinate is only
  // persisted with a newly created memory so it remains discoverable on the map.
  const handlePlaneTapped = useCallback(() => {
    const coords = location && {
      latitude: location.latitude,
      longitude: location.longitude,
    };
    if (!coords) return;
    setSelectedCreationCoords(coords);
    // Let the native Viro click callback return before unmounting the scene.
    setTimeout(() => {
      closeARCamera();
      setShowCreateModal(true);
    }, 0);
  }, [closeARCamera, location]);

  // This list is intentionally captured when AR opens, so nearby memories do not
  // appear, disappear, or move while the AR session is running.
  const arMemories = useMemo(
    () => arSessionMemories.map(({ memory }) => memory),
    [arSessionMemories],
  );
  const nearbyMemories = useMemo(
    () => arSessionMemories.map(({ memory, bearingDeg, distanceMeters, relativePosition }) => ({
      id: memory.id,
      name: memory.name,
      bearingDeg,
      distanceMeters,
      relativePosition,
      isOwn: user?.id != null && String(
        memory.user_id ?? memory.creator?.id ?? memory.created_by,
      ) === String(user.id),
    })),
    [arSessionMemories, user],
  );

  // The radar cache replaces remote model URLs with local file:// URLs after the
  // AR session may already have been opened. Keep the captured session in sync so
  // Viro never retries a protected remote URL without request headers.
  useEffect(() => {
    // Wrap in function to avoid direct setState in render/effect if needed
    const syncMemories = () => {
      setArSessionMemories((currentSession) => {
        let changed = false;
        const nextSession = currentSession.map((entry) => {
          const refreshedMemory = memories.find(
            (memory) => String(memory.id) === String(entry.memory.id),
          );
          if (!refreshedMemory || refreshedMemory === entry.memory) return entry;
          changed = true;
          return { ...entry, memory: refreshedMemory };
        });
        return changed ? nextSession : currentSession;
      });
    };
    syncMemories();
  }, [memories]);

  useEffect(() => {
    const syncSelected = () => {
      setSelectedArMemory((currentMemory) => {
        const refreshedMemory = currentMemory
          && arMemories.find((memory) => String(memory.id) === String(currentMemory.id));
        return refreshedMemory || null;
      });
    };
    syncSelected();
  }, [arMemories]);

  // Replace a memory from the inventory.
  const handleReplaceFromInventory = async (memory) => {
    setShowInventory(false);
    const sourceMemory = memories.find((item) => String(item.id) === String(memory.id));
    setIsPreparingPlacement(true);
    try {
      const cachedMemory = await cacheMemoryAssets(sourceMemory || memory);
      setSelectedMemoryToPlace({ ...cachedMemory, is_collectible: false });
      if (!openARCamera()) setSelectedMemoryToPlace(null);
    } catch (error) {
      setSelectedMemoryToPlace(null);
      Alert.alert(t('modelLoadError'), error.message);
    } finally {
      setIsPreparingPlacement(false);
    }
  };

  const handleMemorySelected = useCallback(async (memoryId) => {
    const memory = arMemories.find((item) => String(item.id) === String(memoryId));
    if (!memory || isPreparingPlacement) return;

    setIsPreparingPlacement(true);
    try {
      const cachedMemory = await cacheMemoryAssets(memory);
      setSelectedArMemory(cachedMemory);
      setSelectedMemoryToPlace(cachedMemory);
      setIsPlacingMode(true);
    } catch (error) {
      Alert.alert(t('modelLoadError'), error.message);
    } finally {
      setIsPreparingPlacement(false);
    }
  }, [arMemories, cacheMemoryAssets, isPreparingPlacement, t]);



  useEffect(() => {
    if (!showCamera) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeARCamera();
      return true;
    });

    return () => subscription.remove();
  }, [closeARCamera, showCamera]);

  const handleCollectWithAnimation = (event) => {
    if (!requireAuthentication()) return;

    const { id, name, screenX, screenY } = event;
    const collectedMemory = memories.find((memory) => String(memory.id) === String(id));

    // 1. Trigger the visual animation.
    if (screenX && screenY) {
      setActiveParticle({ x: screenX, y: screenY });
    }

    // 2. Save the memory in the inventory.
    handleCollectMemory({
      id,
      name,
      creatorName: collectedMemory?.creatorName || '',
    });
  };

  // // --- Error and permission screen ---
  // if (!location) {
  //   return (
  //     <View style={styles.loadingContainer}>
  //       <ActivityIndicator size="large" color={COLORS.accent} />
  //       <Text style={styles.loadingText}>{errorMsg || t('initializingRadar')}</Text>
  //       {errorMsg && (
  //         <View style={{ marginTop: 20 }}>
  //           <TouchableOpacity style={styles.retryButton} onPress={requestGpsPermission}>
  //             <Text style={styles.retryText}>{t('retry')}</Text>
  //           </TouchableOpacity>
  //           <TouchableOpacity style={[styles.retryButton, { marginTop: 10, backgroundColor: COLORS.surfaceMuted }]} onPress={openSettings}>
  //             <Text style={{ color: COLORS.text, fontWeight: 'bold' }}>{t('openSettings')}</Text>
  //           </TouchableOpacity>
  //         </View>
  //       )}
  //     </View>
  //   );
  // }

  // --- AR camera view ---
  if (isPreparingModelViewer || modelViewerMemory) {
    return (
      <View style={styles.modelViewerScreen} collapsable={false}>
        {modelViewerMemory ? (
          <ViroModelViewer
            modelUrl={modelViewerMemory.model_url}
            style={styles.fullscreenModelViewer}
          />
        ) : (
          <View style={styles.modelViewerLoading}>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={styles.loaderText}>{t('loading')}</Text>
          </View>
        )}
        <View style={[styles.modelViewerHeader, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            style={styles.backButtonHeader}
            onPress={closeModelViewer}
            accessibilityRole="button"
            accessibilityLabel={t('closeModelViewer')}
          >
            <Text style={styles.backButtonText}>×</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isPreparingMediaViewer || mediaViewer) {
    return (
      <View style={styles.modelViewerScreen} collapsable={false}>
        {mediaViewer ? (
          <FullscreenMediaViewer source={mediaViewer.source} type={mediaViewer.type} />
        ) : (
          <View style={styles.modelViewerLoading}>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={styles.loaderText}>{t('loading')}</Text>
          </View>
        )}
        <View style={[styles.modelViewerHeader, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            style={styles.backButtonHeader}
            onPress={closeMediaViewer}
            accessibilityRole="button"
            accessibilityLabel={t('closeMediaViewer')}
          >
            <Text style={styles.backButtonText}>×</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (showCamera) {

    //// when opening the AR camera no memories should be selected yet
    //// TODO : make sure that arMemoryToPlace can be null at startup and it won't disrupt anything
    const arMemoryToPlace = selectedMemoryToPlace || selectedArMemory;
    return (
      <View style={styles.arScreen} collapsable={false}>
        <React.Suspense
          fallback={(
            <View style={styles.arCenterOverlay}>
              <ActivityIndicator size="small" color={COLORS.accent} />
              <Text style={styles.loaderText}>{t('loading')}</Text>
            </View>
          )}
        >
          <ViroARView
            key={`ar-view-${cameraKey}`}
            style={styles.viroView}
            onMemoryCollected={(e) => handleCollectWithAnimation(e.nativeEvent)}
            onMemorySelected={(e) => handleMemorySelected(e.nativeEvent.id)}
            onMemoryPlaced={() => {
              setIsPlacingMode(false);
              setSelectedMemoryToPlace(null);
            }}
            onModelLoadingStatus={(e) => {
              setIsModelLoading(e.nativeEvent.isLoading);
              if (e.nativeEvent.error) {
                Alert.alert(t('modelLoadError'), e.nativeEvent.error);
              }
            }}
            resetPlacedMemoryKey={resetPlacedMemoryKey}
            canCollect={!!user}
            onPlaneTapped={handlePlaneTapped}
            creatingMemoryMode={isCreatingInAR}
            memoryToPlace={isPlacingMode ? arMemoryToPlace : null}
            arMemories={arMemories}
            nearbyMemories={nearbyMemories}
          />
        </React.Suspense>

        {/* Animated particle overlaid when a memory is collected. */}
        {activeParticle && (
          <CollectionParticle
            startX={activeParticle.x}
            startY={activeParticle.y}
            onAnimationEnd={() => setActiveParticle(null)}
          />
        )}

        <View
          style={[styles.topBar, { paddingTop: insets.top + 12 }]}
          pointerEvents="box-none"
        >
          <View style={styles.topBarRow}>
            {arMemoryToPlace ? (
              <View style={styles.memoryMarkerCard}>
                <View style={styles.compassBadge}>
                  <Text style={styles.compassText}>{arMemoryToPlace.name}</Text>
                </View>
                {!!arMemoryToPlace.creatorName && (
                  <Text style={styles.memoryMarkerCreator}>{arMemoryToPlace.creatorName}</Text>
                )}
              </View>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            <View style={styles.topBarActions}>

              <TouchableOpacity
                style={styles.accountButton}
                onPress={() => {
                  setShowAccount(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('openAccount')}
              >
                <Text style={styles.accountButtonText}>{user ? t('account') : t('signIn')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.backButtonHeader}
                onPress={closeARCamera}
                accessibilityRole="button"
                accessibilityLabel={t('closeCamera')}
              >
                <Text style={styles.backButtonText}>&#x2715;</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {(isModelLoading || isPreparingPlacement) && (
          <View style={styles.arCenterOverlay} pointerEvents="box-none">
            {(isModelLoading || isPreparingPlacement) && (
              <View style={styles.centerPrompt}>
                <ActivityIndicator size="small" color={COLORS.accent} />
                <Text style={styles.loaderText}>
                  {isPreparingPlacement ? t('loading') : t('loading')}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* --- Hints and cancel button for placing and creating memories in AR */}
        {(isPlacingMode || isCreatingInAR) && (
          <View
            style={[styles.placementBanner, { top: insets.top + 58 }]}
            pointerEvents="auto"
          >
            <Text style={styles.placingHint}>
              {isPlacingMode ? t('placeOnFloor') : t('touchHorizontalPlane')}
            </Text>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setIsPlacingMode(false);
                setSelectedMemoryToPlace(null);
                setSelectedArMemory(null);
                setIsCreatingInAR(false);
                setResetPlacedMemoryKey((key) => key + 1);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('cancel')}
            >
              <Text style={styles.cancelPromptText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* --- Bottom controls for creating, placing, and accessing the collection in AR */}
        <View
          style={[
            styles.bottomControlsArea,
            { paddingBottom: insets.bottom + 14 },
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={[
              styles.bottomAction,
              styles.createAction,
              (!user || isPlacingMode || isCreatingInAR) && styles.disabledAction,
            ]}
            onPress={() => {
              if (!requireAuthentication()) return;
              setIsCreatingInAR(true);
              setShowCreateModal(false);
              setSelectedCreationCoords(null);
            }}
            disabled={isPlacingMode || isCreatingInAR}
          >
            <Text style={styles.bottomActionText}>+ {t('createMemory')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bottomAction, (!arMemoryToPlace || isPlacingMode || isCreatingInAR || isPreparingPlacement) && styles.disabledAction]}
            onPress={() => handleMemorySelected(arMemoryToPlace.id)}
            disabled={!arMemoryToPlace || isPlacingMode || isCreatingInAR || isPreparingPlacement}
          >
            <Text style={styles.bottomActionText}>⌄ {t('placeShort')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bottomAction, !user && styles.disabledAction]}
            onPress={() => {
              if (!requireAuthentication()) return;
              closeARCamera();
              setShowInventory(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('openCollection')}
          >
            <Text style={styles.bottomActionText}>{t('collection')} ({collectedMemories.length})</Text>
          </TouchableOpacity>
        </View>

        {/* --- Audio player for the currently selected AR memory */}
        <MemoryAudioPlayer source={arMemoryToPlace?.audio_url || ''} />

        <InventoryModal
          visible={showInventory}
          onClose={() => setShowInventory(false)}
          items={collectionItems}
          onClear={clearInventory}
          onReplace={handleReplaceFromInventory}
        />
        <AccountModal
          visible={showAccount}
          onClose={() => setShowAccount(false)}
          user={user}
          onSignIn={signIn}
          onSignUp={signUp}
          onSignOut={signOut}
        />
      </View>
    );
  }


  // --- Default map view ---
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('ministry')}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setShowAccount(true)}>
            <Text style={styles.accountText}>{user ? t('account') : t('signIn')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (!requireAuthentication()) return;
              setShowInventory(true);
            }}
          >
            <Text style={[styles.inventoryBadge, !user && styles.disabledText]}>
              {t('collection')} ({collectedMemories.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* BANDEAU ERREUR RESEAU */}
      {apiError && (
        <TouchableOpacity style={styles.errorBanner} onPress={refreshData}>
          <Text style={styles.errorText}>{apiError} - {t('retryNetwork')}</Text>
        </TouchableOpacity>
      )}
      {errorMsg && !apiError && (
        <TouchableOpacity style={styles.errorBanner} onPress={requestGpsPermission}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </TouchableOpacity>
      )}


      <MapView
        style={styles.map}
        mapStyle="https://tiles.openfreemap.org/styles/bright"
        onPress={(event) => {
          setSelectedCreationCoords(null);
          const coordinates = event.geometry?.coordinates;
          if (coordinates) {
            const coords = { latitude: coordinates[1], longitude: coordinates[0] };
            const hit = memories.find((m) =>
              getDistanceInMeters(coords.latitude, coords.longitude, m.lat, m.lng) < 2
            );
            if (hit) {
              setSelectedCreationCoords(null);
              setSelectedMemoryToInspect(hit);
              setShowInfoModal(true);
            }
          }
        }}
        onLongPress={(event) => {
          const coordinates = event.geometry?.coordinates;
          if (!coordinates) return;
          const coords = { latitude: coordinates[1], longitude: coordinates[0] };

          const hit = memories.find((m) =>
            getDistanceInMeters(coords.latitude, coords.longitude, m.lat, m.lng) < 2
          );
          if (hit) {
            setSelectedCreationCoords(null);
            setSelectedMemoryToInspect(hit);
            setShowInfoModal(true);
            return;
          }

          if (!requireAuthentication()) return;
          setSelectedCreationCoords(coords);
          setShowCreateModal(false);
        }}
      >
        <Camera
          initialViewState={{
            center: location ? [location.longitude, location.latitude] : [1.3553, 44.0175],
            zoom: 14,
          }}
        />
        {location && (
          <ShapeSource
            id="search-radius"
            shape={createRadiusPolygon(
              location.latitude,
              location.longitude,
              slidingRadius || radius,
            )}
          >
            <FillLayer
              id="search-radius-fill"
              style={{
                fillColor: COLORS.primaryStrong,
                fillOpacity: 0.2,
                fillOutlineColor: COLORS.primaryStrong,
              }}
            />
          </ShapeSource>
        )}
        {memories.map((memory) => (
          <MarkerView
            key={String(memory.id)}
            coordinate={[memory.lng, memory.lat]}
          >
            <TouchableOpacity
              onPress={() => {
                setSelectedMemoryToInspect(memory);
                setShowInfoModal(true);
              }}
            >
              <View style={styles.mapMarker} />
            </TouchableOpacity>
          </MarkerView>
        ))}
        {selectedCreationCoords && (
          <MarkerView
            coordinate={[selectedCreationCoords.longitude, selectedCreationCoords.latitude]}
          >
            <View style={[styles.mapMarker, styles.newMemoryMarker]} />
          </MarkerView>
        )}
      </MapView>

      {/* Overlay UI elements outside MapView. */}
      {selectedCreationCoords && (
        <TouchableOpacity
          style={[
            styles.createAtLocationButton,
            { bottom: insets.bottom + 160 },
            !user && styles.disabledAction,
          ]}
          onPress={() => {
            if (!requireAuthentication()) return;
            setShowCreateModal(true);
          }}
          accessibilityRole="button"
        >
          <Text style={[
            styles.createAtLocationButtonText,
            !user && styles.disabledText,
          ]}
          >
            {t('createHere')}
          </Text>
        </TouchableOpacity>
      )}

      {/* Creation modal. */}
      <CreateMemoryModal
        visible={showCreateModal}
        currentLocation={selectedCreationCoords}
        onClose={() => {
          setShowCreateModal(false);
          setSelectedCreationCoords(null);
        }}
        onMemoryCreated={() => {
          if (typeof refreshData === 'function') {
            refreshData();
          }
        }}
      />

      <View style={[styles.sliderContainer, { bottom: insets.bottom + 14, right: 82 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.sliderText}>
            {t('radius')} : <Text style={styles.radiusValue}>{formatRadiusText(slidingRadius || radius)}</Text>
          </Text>
          {isLoadingApi && <ActivityIndicator size="small" color={COLORS.accent} />}
        </View>
        <Slider
          style={{ width: '100%', height: 40 }}
          minimumValue={5}
          maximumValue={5000}
          step={5}
          value={radius}
          minimumTrackTintColor={COLORS.primaryStrong}
          maximumTrackTintColor={COLORS.surfaceMuted}
          thumbTintColor={COLORS.accent}
          onValueChange={(val) => setSlidingRadius(val)}
          onSlidingComplete={(val) => {
            setSlidingRadius(null);
            updateRadius(val);
          }}
        />
      </View>

      <TouchableOpacity
        style={[styles.mapArButton, { bottom: insets.bottom + 14 }]}
        onPress={handleOpenARCamera}
        accessibilityRole="button"
        accessibilityLabel={t('scanAr')}
      >
        <Text style={styles.mapArButtonIcon}>👁</Text>
      </TouchableOpacity>

      <InventoryModal
        visible={showInventory}
        onClose={() => setShowInventory(false)}
        items={collectionItems}
        onClear={clearInventory}
        onReplace={handleReplaceFromInventory}
      />

      <MemoryInfoModal
        visible={showInfoModal}
        memory={selectedMemoryToInspect}
        onViewImage={(memory) => openMediaViewer(memory, 'image')}
        onViewModel={openModelViewer}
        onViewVideo={(memory) => openMediaViewer(memory, 'video')}
        onClose={() => {
          setShowInfoModal(false);
          setSelectedMemoryToInspect(null);
        }}
      />

      <AccountModal
        visible={showAccount}
        onClose={() => setShowAccount(false)}
        user={user}
        onSignIn={signIn}
        onSignUp={signUp}
        onSignOut={signOut}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1 },
  devTapOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    justifyContent: 'flex-top',
    alignItems: 'center',
    paddingTop: 50,
  },
  devBadge: {
    backgroundColor: COLORS.overlayStrong,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.accentStrong,
  },
  devBadgeText: {
    color: COLORS.accentStrong,
    fontSize: 12,
    fontWeight: 'bold',
  },
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: COLORS.accent, marginTop: 20, fontFamily: 'monospace', textAlign: 'center' },
  retryButton: { backgroundColor: COLORS.accent, paddingVertical: 12, paddingHorizontal: 25, borderRadius: 25 },
  retryText: { color: COLORS.background, fontWeight: 'bold' },

  header: { paddingTop: 50, paddingBottom: 15, backgroundColor: COLORS.surface, alignItems: 'center' },
  headerActions: { alignItems: 'center' },
  headerTitle: { color: COLORS.accent, fontSize: 16, fontWeight: 'bold', fontFamily: 'monospace' },
  inventoryBadge: { color: COLORS.text, fontSize: 13, fontFamily: 'monospace', marginTop: 5 },
  accountText: { color: COLORS.primary, fontSize: 12, fontFamily: 'monospace', marginTop: 8 },

  errorBanner: { backgroundColor: COLORS.danger, padding: 8, alignItems: 'center' },
  errorText: { color: COLORS.text, fontSize: 12, fontFamily: 'monospace' },

  map: { flex: 1, width: '100%' },
  mapMarker: { width: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.accent, borderWidth: 2, borderColor: COLORS.background },
  newMemoryMarker: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.primaryStrong },

  bottomBar: { padding: 20, backgroundColor: COLORS.surface, alignItems: 'center' },
  button: { backgroundColor: COLORS.primaryStrong, paddingVertical: 15, borderRadius: 5, width: '100%', alignItems: 'center' },
  buttonText: { color: COLORS.text, fontWeight: 'bold', fontFamily: 'monospace' },
  backButtonText: { color: COLORS.textOnDark, fontWeight: 'bold', fontFamily: 'monospace' },

  arScreen: { flex: 1, backgroundColor: COLORS.transparent },
  viroView: { flex: 1 },
  modelViewerScreen: { flex: 1, backgroundColor: COLORS.background },
  fullscreenModelViewer: { flex: 1, width: '100%', height: '100%', borderRadius: 0 },
  modelViewerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  modelViewerHeader: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, zIndex: 20, elevation: 20 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, zIndex: 20, elevation: 20 },
  topBarRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8, flexShrink: 0 },
  backButtonHeader: { backgroundColor: COLORS.danger, width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  accountButton: { backgroundColor: COLORS.overlayDark, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18 },
  accountButtonText: { color: COLORS.textOnDark, fontFamily: 'monospace', fontSize: 11 },

  compassBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.overlayDarkStrong, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, gap: 8 },
  compassText: { color: COLORS.textOnDark, fontFamily: 'monospace', fontSize: 12, flexShrink: 1 },
  memoryMarkerCard: { flex: 1, minWidth: 0, marginRight: 10, backgroundColor: COLORS.overlayDark, borderRadius: 12, paddingBottom: 8 },
  memoryMarkerCreator: { color: COLORS.textOnDark, fontFamily: 'monospace', fontSize: 11, paddingHorizontal: 12, paddingTop: 5 },
  memoryMarkerDescription: { color: COLORS.textOnDarkMuted, fontSize: 11, lineHeight: 15, paddingHorizontal: 12, paddingTop: 5 },

  arCenterOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, zIndex: 30, elevation: 30 },
  centerPrompt: { alignItems: 'center', gap: 10, maxWidth: '100%' },
  loaderText: { color: COLORS.border, fontFamily: 'monospace', fontSize: 12 },
  placementBanner: { position: 'absolute', left: 14, right: 14, alignItems: 'center', gap: 8, zIndex: 30, elevation: 30 },

  bottomControlsArea: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 10, backgroundColor: COLORS.transparent, zIndex: 20, elevation: 20 },
  bottomAction: { flex: 1, minHeight: 42, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: COLORS.controlBorderOverlay, backgroundColor: COLORS.controlOverlay, justifyContent: 'center', alignItems: 'center' },
  createAction: { backgroundColor: COLORS.createActionOverlay, borderColor: COLORS.primary },
  bottomActionText: { color: COLORS.textOnDark, fontWeight: 'bold', fontFamily: 'monospace', fontSize: 11, textAlign: 'center' },
  disabledAction: { opacity: 0.42 },
  disabledText: { opacity: 0.45 },

  placingHint: { color: COLORS.accent, fontFamily: 'monospace', backgroundColor: COLORS.hintOverlay, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 15, fontSize: 12, textAlign: 'center' },
  cancelButton: { backgroundColor: COLORS.cancelOverlay, paddingVertical: 6, paddingHorizontal: 15, borderRadius: 15 },
  cancelPromptText: { color: COLORS.textOnDark, fontWeight: 'bold' },

  sliderContainer: { position: 'absolute', left: 15, right: 15, backgroundColor: COLORS.sliderSurface, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.sliderBorder },
  sliderText: { color: COLORS.textOnDark, fontFamily: 'monospace', fontSize: 12 },
  radiusValue: { color: COLORS.accent, fontWeight: 'bold' },
  mapArButton: { position: 'absolute', right: 14, width: 54, height: 54, borderRadius: 27, backgroundColor: COLORS.accentStrong, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: COLORS.background, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 4 },
  mapArButtonIcon: { fontSize: 25, color: COLORS.textOnDark },
  createAtLocationButton: {
    position: 'absolute',
    bottom: 160,
    alignSelf: 'center',
    backgroundColor: COLORS.primaryStrong,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: COLORS.background,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  createAtLocationButtonText: {
    fontSize: 14,
    color: COLORS.textOnDark,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  disclosureOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: COLORS.disclosureOverlay,
    padding: 20,
  },
  disclosureCard: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: 16,
    borderColor: COLORS.primaryStrong,
    borderWidth: 1,
    padding: 20,
  },
  disclosureTitle: {
    color: COLORS.accent,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  disclosureText: {
    color: COLORS.textOnDark,
    fontSize: 14,
    lineHeight: 21,
  },
  disclosurePolicyText: {
    marginTop: 12,
  },
  disclosureLink: {
    color: COLORS.primary,
    textDecorationLine: 'underline',
    marginTop: 12,
  },
  disclosureActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
  },
  disclosureCancel: {
    color: COLORS.textOnDark,
    fontWeight: 'bold',
  },
  disclosureAccept: {
    color: COLORS.accent,
    fontWeight: 'bold',
  },
});