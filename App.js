/**
 * Active application shell: owns map/radar state, AR entry/exit, and modal orchestration.
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, Image, ActivityIndicator, TouchableOpacity, BackHandler, Alert } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import DeviceInfo from 'react-native-device-info';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useCameraPermission } from 'react-native-vision-camera';
import InventoryModal from './src/components/InventoryModal';
import MenuModal from './src/components/MenuModal';
import {
  Camera,
  CircleLayer,
  FillLayer,
  LineLayer,
  MapView,
  ShapeSource,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import { createRadiusPolygon } from './src/utils/geo';
import {
  MAP_RADIUS_METERS, DISCOVERY_RADIUS_METERS, isGalaxyADevice,
  canViewMemoryContent, getMemoryDistance, createARSession,
} from './src/utils/memoryAccess';
import { useProgress } from './src/hooks/useProgress';
import { useRadar } from './src/hooks/useRadar';
import CollectionParticle from './src/components/CollectionParticle';
import { MemoryAudioPlayer } from './src/components/MemoryAudioPlayer';
import { MemoryInfoModal } from './src/components/MemoryInfoModal';
import { FullscreenMediaViewer } from './src/components/FullscreenMediaViewer';
import { AccountModal } from './src/components/AccountModal';
import ViroModelViewer from './src/components/ViroModelViewer';
import ViroARView from './src/components/ViroARView';
import { hasExperience, readExperience } from './src/experiences/experience';
import { ExperienceControls } from './src/experiences/ExperienceControls';
import ExperienceViewer from './src/experiences/ExperienceViewer';
import { useAuth } from './src/hooks/useAuth'
import { loadBundledGames } from './src/services/bundledGames';
import { COLORS } from './theme';
import { translate, useI18n } from './constants/i18n';
const MAP_NEIGHBORHOOD_ZOOM = 12;
const DEFAULT_MAP_CENTER = [1.3553, 44.0175];
const AR_SESSION_RELEASE_MS = 1500;
const MODEL_VIEWER_RELEASE_MS = 500;
const memoryKey = memory => `${memory?.location_id}:${memory?.id}`;

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

  // --- Radar state and API interaction ---
  const {
    location, errorMsg, memories, isLoadingApi, apiError,
    refreshData, requestGpsPermission, cacheMemoryAssets, loadNearbyMemories,
  } = useRadar(MAP_RADIUS_METERS);
  const memoryMarkers = useMemo(() => ({
    type: 'FeatureCollection',
    features: memories
      .filter((memory) => Number.isFinite(Number(memory.lat)) && Number.isFinite(Number(memory.lng)))
      .map((memory) => ({
        type: 'Feature',
        properties: {
          gameId: String(memory.id),
          locationId: memory.location_id,
          isNearby: getMemoryDistance(location, memory) <= DISCOVERY_RADIUS_METERS,
        },
        geometry: {
          type: 'Point',
          coordinates: [Number(memory.lng), Number(memory.lat)],
        },
      })),
  }), [memories, location]);
  const mapCenterCoordinate = useMemo(
    () => location
      ? [location.longitude, location.latitude]
      : DEFAULT_MAP_CENTER,
    [location],
  );

  // --- Manage the memory's position in AR relative to the user's AR location (origin) ---
  const [selectedMemoryToPlace, setSelectedMemoryToPlace] = useState(null);
  const [selectedArMemory, setSelectedArMemory] = useState(null);

  // --- Inventory management ---
  const [showInventory, setShowInventory] = useState(false);
  const [bundledGames, setBundledGames] = useState([]);
  useEffect(() => {
    try {
      setBundledGames(loadBundledGames());
    } catch (error) {
      console.error('Bundled game loading failed', error);
      Alert.alert(translate('experienceError'), error.message);
    }
  }, []);
  const bundledLocationIds = useMemo(
    () => [...new Set(bundledGames.map(game => game.location_id))],
    [bundledGames],
  );
  const isBundledGame = useCallback(memory =>
    bundledGames.some(game => memoryKey(game) === memoryKey(memory)), [bundledGames]);
  const { user, token, signIn, signUp, signOut, deleteAccount } = useAuth();
  const {
    scores, addScore, visitedPlaces, markPlaceVisited, collectedItems,
    collectObject, clearCollectedItems: clearCollection, finishGame,
    collectedMemories, handleCollectMemory,
  } = useProgress(user, token, bundledLocationIds);
  // Whole games and memories can be replayed; individual objects keep composite IDs.
  const collectionItems = useMemo(() => [...bundledGames, ...collectedMemories
    .filter(item => !isBundledGame(item)).map((item) => {
    const sourceMemory = memories.find((memory) => memoryKey(memory) === memoryKey(item));
    return sourceMemory?.creatorName && !item.creatorName
      ? { ...item, creatorName: sourceMemory.creatorName }
      : item;
  }), ...collectedItems.map(item => ({
    ...item,
    id: `${item.location_id}:${item.game_id}:${item.item_id}`,
    isGameObject: true,
  }))], [bundledGames, isBundledGame, collectedMemories, memories, collectedItems]);

  // --- Places/games already seen by the player, listed in the menu ---
  const [showMenu, setShowMenu] = useState(false);
  const menuPlaces = useMemo(() => {
    const collectedIds = new Set(collectedMemories.map((item) => memoryKey(item)));
    const visitedIds = new Set(visitedPlaces.map((place) => memoryKey(place)));
    const collectedOnly = collectedMemories
      .filter((item) => !visitedIds.has(memoryKey(item)))
      .map((item) => ({ ...item, lastSeenAt: item.collectedAt }));
    return [...visitedPlaces, ...collectedOnly].map((place) => ({
      ...place,
      isDone: collectedIds.has(memoryKey(place)),
    }));
  }, [collectedMemories, visitedPlaces]);

  // --- Authentication and account management ---
  const [showAccount, setShowAccount] = useState(false);
  const requireAuthentication = useCallback(() => {
    if (user) return true;
    setShowAccount(true);
    return false;
  }, [user]);

  // --- Camera AR state and management ---
  const [showCamera, setShowCamera] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const { hasPermission, requestPermission } = useCameraPermission();
  const isGalaxyA = useMemo(() => isGalaxyADevice(
    DeviceInfo.getManufacturerSync(), DeviceInfo.getModel(), DeviceInfo.getDeviceId(),
  ), []);
  const canViewContent = useCallback(
    (memory) => canViewMemoryContent(location, memory, isGalaxyA),
    [location, isGalaxyA],
  );

  useEffect(() => {
    if (isGalaxyA) {
      Alert.alert(
        t('samsungDeviceMode'),
        t('samsungDeviceDescription'),
      );
    }
  }, [isGalaxyA, t]);

  const [arSessionMemories, setArSessionMemories] = useState([]);
  const [isPlacingMode, setIsPlacingMode] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isPreparingPlacement, setIsPreparingPlacement] = useState(false);
  const [resetPlacedMemoryKey, setResetPlacedMemoryKey] = useState(0);
  const [activeParticle, setActiveParticle] = useState(null);
  const lastARCloseAt = useRef(0);
  const preparingAR = useRef(false);
  const [isPreparingAR, setIsPreparingAR] = useState(false);
  // --- Modal management for inspecting memories ---
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [selectedMemoryToInspect, setSelectedMemoryToInspect] = useState(null);
  const [modelViewerMemory, setModelViewerMemory] = useState(null);
  const [isPreparingModelViewer, setIsPreparingModelViewer] = useState(false);
  const [experienceGameIndex, setExperienceGameIndex] = useState(0);
  const [experienceInteraction, setExperienceInteraction] = useState(null);
  const [showAimingHint, setShowAimingHint] = useState(true);
  const [aimingPlaneReady, setAimingPlaneReady] = useState(false);
  const arExperience = useMemo(() => readExperience(selectedArMemory), [selectedArMemory]);
  const viewerExperience = useMemo(() => readExperience(modelViewerMemory), [modelViewerMemory]);
  const activeGame = (viewerExperience || arExperience)?.games[experienceGameIndex];
  const activeMemory = viewerExperience ? modelViewerMemory : selectedArMemory;
  const gameSession = useRef(null);
  // Save the outgoing game's progress on switch/close, but never for a different user.
  useEffect(() => {
    const previous = gameSession.current;
    const current = activeGame && activeMemory
      ? {
        locationId: activeMemory.location_id, gameId: activeGame.id, userId: user?.id,
        finishGame: () => finishGame(isBundledGame(activeMemory)
          ? { scoreOnlyLocationId: activeMemory.location_id } : undefined),
      }
      : null;
    if (
      previous &&
      previous.userId === user?.id &&
      (previous.locationId !== current?.locationId || previous.gameId !== current?.gameId)
    ) previous.finishGame();
    gameSession.current = current;
  }, [activeGame, activeMemory, finishGame, isBundledGame, user?.id]);
  const reportExperienceError = useCallback((message) => {
    Alert.alert(t('experienceError'), message);
  }, [t]);
  const selectExperienceGame = useCallback((index) => {
    setExperienceGameIndex(index);
    setExperienceInteraction(null);
    setShowAimingHint(true);
    setAimingPlaneReady(false);
  }, []);
  const handleExperienceEvent = useCallback((event) => {
    const experience = viewerExperience || arExperience;
    const memory = viewerExperience ? modelViewerMemory : selectedArMemory;
    const game = experience?.games[experienceGameIndex];
    // Ignore callbacks from a scene that is no longer the active game.
    if (!game || event.gameId !== game.id || event.type !== game.type) return;
    if (event.name === 'collect') {
      const object = game.objects.find(item => item.id === event.objectId);
      if (object?.properties.collectible !== true ||
        (!isBundledGame(memory) && !requireAuthentication())) return;
      const asset = game.assets.find(item => item.id === object.properties.asset);
      collectObject({
        location_id: memory.location_id, game_id: game.id, item_id: object.id,
        name: asset?.name || object.properties.text || `${memory.name || ''} #${object.id}`,
      });
    }
    if (event.name === 'press') setExperienceInteraction(event);
    if (event.name === 'projectileHint') {
      setShowAimingHint(event.data?.visible === true);
    }
    if (event.name === 'planeCandidate') setAimingPlaneReady(false);
    if (event.name === 'planeReady') setAimingPlaneReady(true);
    if (
      event.name === 'collision' &&
      event.data?.scoringContact === true &&
      memory
    ) {
      const points = Number(event.data.points);
      const awardedPoints = Number.isFinite(points) && points > 0 ? points : 1;
      const previousScore = scores.find(score =>
        score.location_id === memory.location_id && score.gameType === event.type,
      )?.points ?? 0;
      const totalScore = previousScore + awardedPoints;
      addScore({
        location_id: memory.location_id, name: memory.name, gameType: event.type,
        points: awardedPoints,
      });
      Alert.alert(
        t('scoreAddedTitle'),
        t('scoreAdded', { points: awardedPoints, total: totalScore }),
      );
    }
  }, [addScore, arExperience, collectObject, experienceGameIndex, modelViewerMemory,
    scores,
    isBundledGame, requireAuthentication, selectedArMemory, t, viewerExperience]);
  const modelViewerRequestKey = useRef(0);
  const modelViewerTransitionTimer = useRef(null);
  const collectionLaunchTimer = useRef(null);
  const [mediaViewer, setMediaViewer] = useState(null);
  const [isPreparingMediaViewer, setIsPreparingMediaViewer] = useState(false);
  const mediaViewerRequestKey = useRef(0);
  const mediaViewerTransitionTimer = useRef(null);

  useEffect(() => {
    const syncAssets = () => {
      if (!showInfoModal || !selectedMemoryToInspect || !canViewContent(selectedMemoryToInspect)) return;
      const hasRemoteMedia = [
        ...(selectedMemoryToInspect.model_urls || []),
        selectedMemoryToInspect.model_url, selectedMemoryToInspect.image_url,
        selectedMemoryToInspect.video_url, selectedMemoryToInspect.audio_url,
      ].some((url) => /^https?:\/\//i.test(url || ''));
      if (!hasRemoteMedia) return;

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
    return syncAssets();
  }, [showInfoModal, selectedMemoryToInspect, cacheMemoryAssets, canViewContent, t]);

  useEffect(() => () => {
    if (modelViewerTransitionTimer.current) {
      clearTimeout(modelViewerTransitionTimer.current);
    }
    if (mediaViewerTransitionTimer.current) {
      clearTimeout(mediaViewerTransitionTimer.current);
    }
    if (collectionLaunchTimer.current) {
      clearTimeout(collectionLaunchTimer.current);
    }
  }, []);

  const openModelViewer = useCallback(async (memory, fromCollection = false) => {
    if (!fromCollection && !canViewContent(memory)) {
      Alert.alert(t('contentPreview'), t('contentDiscoveryHint'));
      return;
    }
    if (!memory?.model_url && !hasExperience(memory)) return;

    // Invalidate older downloads and allow the native modal to release before mounting Viro.
    const requestKey = ++modelViewerRequestKey.current;
    if (modelViewerTransitionTimer.current) {
      clearTimeout(modelViewerTransitionTimer.current);
    }
    setShowInfoModal(false);
    setSelectedMemoryToInspect(null);
    setIsPreparingModelViewer(true);

    try {
      const cachedMemory = isBundledGame(memory) ? memory : await cacheMemoryAssets(memory);
      if (modelViewerRequestKey.current !== requestKey) return;

      modelViewerTransitionTimer.current = setTimeout(() => {
        if (modelViewerRequestKey.current !== requestKey) return;
        setModelViewerMemory(cachedMemory);
        if (!isBundledGame(cachedMemory)) markPlaceVisited(cachedMemory);
        selectExperienceGame(0);
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
  }, [cacheMemoryAssets, canViewContent, isBundledGame, markPlaceVisited, selectExperienceGame, t]);

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

  useEffect(() => {
    if (!modelViewerMemory) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeModelViewer();
      return true;
    });
    return () => subscription.remove();
  }, [closeModelViewer, modelViewerMemory]);

  const openMediaViewer = useCallback(async (memory, type) => {
    if (!canViewContent(memory)) {
      Alert.alert(t('contentPreview'), t('contentDiscoveryHint'));
      return;
    }
    const mediaUrl = memory?.[`${type}_url`];
    if (!mediaUrl) return;

    // A newer open/close request must prevent a completed download from reopening the viewer.
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
  }, [cacheMemoryAssets, canViewContent, t]);

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

  // --- AR camera closure ---
  // Record the close time so reopening waits for the native AR session to release.
  const closeARCamera = useCallback(() => {
    lastARCloseAt.current = Date.now();
    setShowCamera(false);
    setArSessionMemories([]);
    setIsPlacingMode(false);
    setSelectedMemoryToPlace(null);
    setSelectedArMemory(null);
    setAimingPlaneReady(false);
    setIsModelLoading(false);
    setIsPreparingPlacement(false);
    setActiveParticle(null);
  }, []);

  // --- AR camera opening ---
  const openARCamera = useCallback(async (collectionMemory = null) => {
    if (isGalaxyA) {
      Alert.alert(
        t('arUnavailable'),
        t('arUnavailableDescription'),
      );
      return false;
    }
    if (preparingAR.current) return false;
    const elapsedSinceClose = Date.now() - lastARCloseAt.current;
    if (lastARCloseAt.current > 0 && elapsedSinceClose < AR_SESSION_RELEASE_MS) {
      Alert.alert(t('arClosing'), t('arClosingWait'));
      return false;
    }
    preparingAR.current = true;
    setIsPreparingAR(true);
    try {
      if (collectionMemory) {
        const cachedMemory = isBundledGame(collectionMemory)
          ? collectionMemory : await cacheMemoryAssets(collectionMemory);
        const experience = readExperience(cachedMemory);
        setArSessionMemories([]);
        setSelectedMemoryToPlace(cachedMemory);
        setSelectedArMemory(experience ? cachedMemory : null);
        setIsPlacingMode(!experience);
        selectExperienceGame(0);
      } else {
        const nearby = await loadNearbyMemories();
        const session = createARSession(nearby.memories, nearby.location);
        // Discovery still requires fresh GPS and prepared nearby assets; Collection does not.
        const preparedSession = await Promise.all(session.map(async (entry) => ({
          ...entry,
          memory: await cacheMemoryAssets(entry.memory),
        })));
        setArSessionMemories(preparedSession);
      }
      setCameraKey((prev) => prev + 1);
      setShowCamera(true);
      return true;
    } catch (error) {
      Alert.alert(t('arPreparationError'), error.message);
      return false;
    } finally {
      preparingAR.current = false;
      setIsPreparingAR(false);
    }
  }, [isGalaxyA, isBundledGame, loadNearbyMemories, cacheMemoryAssets, selectExperienceGame, t]);

  // --- Request camera permission before preparing the AR session ---
  const requestCameraAndStart = useCallback(async (collectionMemory = null) => {
    if (isGalaxyA) {
      if (collectionMemory) {
        await openModelViewer(collectionMemory, true);
        return;
      }
      await openARCamera();
      return;
    }
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

    if (!collectionMemory && !location) {
      Alert.alert(t('error'), t('initializingRadar'));
      return;
    }

    await openARCamera(collectionMemory);
  }, [hasPermission, requestPermission, location, openARCamera, openModelViewer, isGalaxyA, t]);

  const handleOpenARCamera = useCallback(async () => {
    await requestCameraAndStart();
  }, [requestCameraAndStart]);

  // This list is intentionally captured when AR opens, so nearby memories do not
  // appear, disappear, or move while the AR session is running.
  const arMemories = useMemo(
    () => arSessionMemories.map(({ memory, relativePosition }) => ({ ...memory, relativePosition })),
    [arSessionMemories],
  );
  const nearbyMemories = useMemo(
    () => arSessionMemories.map(({ memory, bearingDeg, distanceMeters, relativePosition }) => ({
      id: memory.id,
      location_id: memory.location_id,
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

  useEffect(() => {
    const syncSelected = () => {
      setSelectedArMemory((currentMemory) => {
        const refreshedMemory = currentMemory
          && arMemories.find((memory) => memoryKey(memory) === memoryKey(currentMemory));
        return currentMemory?.fromCollection ? currentMemory : refreshedMemory || null;
      });
    };
    syncSelected();
  }, [arMemories]);

  // Preserve the original game/location IDs; re-playing never creates a new location.
  const handleReplaceFromInventory = (memory) => {
    if (collectionLaunchTimer.current || preparingAR.current) return;
    setShowInventory(false);
    setIsPreparingAR(true);
    // Let the native Collection modal dismiss before mounting an AR/3D navigator.
    collectionLaunchTimer.current = setTimeout(async () => {
      collectionLaunchTimer.current = null;
      try {
        await requestCameraAndStart({ ...memory, is_collectible: false, fromCollection: true });
      } finally {
        setIsPreparingAR(false);
      }
    }, MODEL_VIEWER_RELEASE_MS);
  };

  const handleCollectGame = useCallback(async memory => {
    if (isBundledGame(memory) || !requireAuthentication()) return;
    try {
      const cachedMemory = await cacheMemoryAssets(memory);
      if (!readExperience(cachedMemory)) throw new Error(t('gameDefinitionRequired'));
      handleCollectMemory(cachedMemory);
    } catch (error) {
      Alert.alert(t('experienceError'), error.message);
    }
  }, [cacheMemoryAssets, handleCollectMemory, isBundledGame, requireAuthentication, t]);

  const handleMemorySelected = useCallback(async (selectedGame) => {
    const memory = arMemories.find((item) =>
      selectedGame?.location_id == null
        ? String(item.id) === String(selectedGame?.id)
        : memoryKey(item) === memoryKey(selectedGame));
    if (!memory || isPreparingPlacement) return;

    setIsPreparingPlacement(true);
    markPlaceVisited(memory);
    try {
      const cachedMemory = await cacheMemoryAssets(memory);
      setSelectedArMemory(cachedMemory);
      setSelectedMemoryToPlace(cachedMemory);
      selectExperienceGame(0);
      setIsPlacingMode(!hasExperience(cachedMemory));
    } catch (error) {
      Alert.alert(t('modelLoadError'), error.message);
    } finally {
      setIsPreparingPlacement(false);
    }
  }, [arMemories, cacheMemoryAssets, isPreparingPlacement, markPlaceVisited, selectExperienceGame, t]);

  const openMemoryInfo = useCallback((memory) => {
    if (!memory) return;
    markPlaceVisited(memory);
    setSelectedMemoryToInspect(memory);
    setShowInfoModal(true);
  }, [markPlaceVisited]);



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
      location_id: collectedMemory?.location_id,
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

  // --- Fullscreen 3D and media viewers ---
  if (isPreparingModelViewer || modelViewerMemory) {
    return (
      <View style={styles.modelViewerScreen} collapsable={false}>
        {modelViewerMemory && viewerExperience ? (
          <>
            <ExperienceViewer
              experience={viewerExperience}
              gameIndex={experienceGameIndex}
              onEvent={handleExperienceEvent}
              onError={reportExperienceError}
              style={styles.fullscreenModelViewer}
            />
            <View style={[styles.experiencePanel, { bottom: insets.bottom + 20 }]}>
              <ExperienceControls experience={viewerExperience} gameIndex={experienceGameIndex}
                onSelect={selectExperienceGame} mode="viewer" />
              {!isBundledGame(modelViewerMemory) && !modelViewerMemory.fromCollection && (
                <TouchableOpacity
                  onPress={() => handleCollectGame(modelViewerMemory)}
                  accessibilityRole="button"
                  accessibilityLabel={t('addGameToCollection')}
                >
                  <Text style={styles.cancelPromptText}>{t('addGameToCollection')}</Text>
                </TouchableOpacity>
              )}
              {viewerExperience.games[experienceGameIndex]?.objects.some(object => object.properties.collectible) &&
                <Text style={styles.loaderText}>{t('collectibleHint')}</Text>}
              {experienceInteraction && (
                <Text style={styles.loaderText}>{experienceInteraction.objectId}</Text>
              )}
            </View>
          </>
        ) : modelViewerMemory ? (
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

    // No selection is required at startup: memory droplets remain available for discovery.
    const arMemoryToPlace = selectedMemoryToPlace || selectedArMemory;
    return (
      <View style={styles.arScreen} collapsable={false}>
        <ViroARView
          key={`ar-view-${cameraKey}`}
          style={styles.viroView}
          onMemoryCollected={(e) => handleCollectWithAnimation(e.nativeEvent)}
          onMemorySelected={(e) => handleMemorySelected(e.nativeEvent)}
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
          memoryToPlace={isPlacingMode ? arMemoryToPlace : null}
          arMemories={arMemories}
          nearbyMemories={nearbyMemories}
          experience={arExperience}
          experienceGameIndex={experienceGameIndex}
          onExperienceEvent={handleExperienceEvent}
          onExperienceError={reportExperienceError}
        />

        {arExperience?.games[experienceGameIndex]?.type === 'aiming' && showAimingHint && (
          <Image
            source={require('./assets/long-tap.png')}
            style={styles.aimingHintImage}
            pointerEvents="none"
            accessibilityLabel={t('aimingViewerHint')}
          />
        )}

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

        {arExperience && (
          <View style={[styles.experiencePanel, { top: insets.top + 76 }]}>
            {arExperience.games[experienceGameIndex]?.type === 'aiming' &&
              !aimingPlaneReady && (
                <Text style={styles.placingHint}>{t('aimingScanPlane')}</Text>
              )}
            {arExperience.games.length > 1 && (
              <ExperienceControls
                experience={arExperience}
                gameIndex={experienceGameIndex}
                onSelect={selectExperienceGame}
                mode="ar"
                showTitle={false}
                showHint={false}
              />
            )}
            {!isBundledGame(selectedArMemory) && !selectedArMemory?.fromCollection && (
              <TouchableOpacity
                onPress={() => handleCollectGame(selectedArMemory)}
                accessibilityRole="button"
                accessibilityLabel={t('addGameToCollection')}
              >
                <Text style={styles.cancelPromptText}>{t('addGameToCollection')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => {
              setSelectedArMemory(null);
              setSelectedMemoryToPlace(null);
              setExperienceInteraction(null);
            }} accessibilityRole="button" accessibilityLabel={t('closeExperience')}>
              <Text style={styles.cancelPromptText}>{t('closeExperience')}</Text>
            </TouchableOpacity>
          </View>
        )}

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

        {/* --- Hint and cancel button for placing memories in AR */}
        {isPlacingMode && (
          <View
            style={[styles.placementBanner, { top: insets.top + 58 }]}
            pointerEvents="auto"
          >
            <Text style={styles.placingHint}>{t('placeOnFloor')}</Text>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setIsPlacingMode(false);
                setSelectedMemoryToPlace(null);
                setSelectedArMemory(null);
                setResetPlacedMemoryKey((key) => key + 1);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('cancel')}
            >
              <Text style={styles.cancelPromptText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* --- Bottom controls for placing and accessing the collection in AR */}
        <View
          style={[
            styles.bottomControlsArea,
            { paddingBottom: insets.bottom + 14 },
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={[styles.bottomAction, (!arMemoryToPlace || arExperience || isPlacingMode || isPreparingPlacement) && styles.disabledAction]}
            onPress={() => handleMemorySelected(arMemoryToPlace)}
            disabled={!arMemoryToPlace || !!arExperience || isPlacingMode || isPreparingPlacement}
          >
            <Text style={styles.bottomActionText}>⌄ {t('placeShort')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bottomAction}
            onPress={() => {
              closeARCamera();
              setShowInventory(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('openCollection')}
          >
            <Text style={styles.bottomActionText}>{t('collection')} ({collectionItems.length})</Text>
          </TouchableOpacity>
        </View>

        {/* --- Audio player for the currently selected AR memory */}
        <MemoryAudioPlayer source={arMemoryToPlace?.audio_url || ''} />

        <InventoryModal
          visible={showInventory}
          onClose={() => setShowInventory(false)}
          items={collectionItems}
          onClear={clearCollection}
          onReplace={handleReplaceFromInventory}
        />
        <AccountModal
          visible={showAccount}
          onClose={() => setShowAccount(false)}
          user={user}
          onSignIn={signIn}
          onSignUp={signUp}
          onSignOut={signOut}
          onDeleteAccount={deleteAccount}
        />
      </View>
    );
  }


  // --- Default map view ---
  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>{t('appName')}</Text>
        <View style={styles.headerActions}>
          {isLoadingApi && <ActivityIndicator size="small" color={COLORS.accent} />}
          <TouchableOpacity onPress={() => setShowAccount(true)}>
            <Text style={styles.accountText}>{user ? t('account') : t('signIn')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Network errors take priority over GPS errors; tapping retries the failed operation. */}
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
      >
        <Camera
          defaultSettings={{
            centerCoordinate: DEFAULT_MAP_CENTER,
            zoomLevel: MAP_NEIGHBORHOOD_ZOOM,
          }}
          centerCoordinate={mapCenterCoordinate}
          zoomLevel={MAP_NEIGHBORHOOD_ZOOM}
          minZoomLevel={MAP_NEIGHBORHOOD_ZOOM}
        />
        {location && (
          <ShapeSource
            id="search-radius"
            shape={createRadiusPolygon(
              location.latitude,
              location.longitude,
              MAP_RADIUS_METERS,
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
            <LineLayer
              id="search-radius-outline"
              style={{ lineColor: COLORS.primaryStrong, lineWidth: 1 }}
            />
          </ShapeSource>
        )}
        {location && (
          <ShapeSource
            id="discovery-radius"
            shape={createRadiusPolygon(location.latitude, location.longitude, DISCOVERY_RADIUS_METERS)}
          >
            <FillLayer
              id="discovery-radius-fill"
              style={{ fillColor: COLORS.accent, fillOpacity: 0.25 }}
            />
            <LineLayer
              id="discovery-radius-outline"
              style={{ lineColor: COLORS.accent, lineWidth: 2 }}
            />
          </ShapeSource>
        )}
        <ShapeSource
          id="memory-markers"
          shape={memoryMarkers}
          onPress={(event) => {
            const gameId = event.features?.[0]?.properties?.gameId;
            const locationId = event.features?.[0]?.properties?.locationId;
            const memory = memories.find((item) =>
              String(item.id) === String(gameId) &&
              (locationId == null ||
                String(item.location_id) === String(locationId)));
            openMemoryInfo(memory);
          }}
        >
          <CircleLayer
            id="memory-marker-circles"
            style={{
              circleRadius: 8,
              circleColor: ['case', ['get', 'isNearby'], COLORS.nearbyMemoryMarker, COLORS.distantMemoryMarker],
              circleStrokeWidth: 2,
              circleStrokeColor: COLORS.background,
            }}
          />
        </ShapeSource>
        {location && (
          <UserLocation
            renderMode="native"
            androidRenderMode="compass"
            showsUserHeadingIndicator
          />
        )}
      </MapView>

      <View style={[styles.mapBottomBar, { bottom: insets.bottom + 14 }]}>
        <TouchableOpacity
          style={[styles.bottomAction, styles.mapBottomAction]}
          onPress={() => {
            setShowInventory(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('openCollection')}
        >
          <Text style={styles.bottomActionText}>{t('collection')} ({collectionItems.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bottomAction, styles.mapBottomAction]}
          onPress={() => setShowMenu(true)}
          accessibilityRole="button"
          accessibilityLabel={t('openMenu')}
        >
          <Text style={styles.bottomActionText}>☰ {t('menu')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.mapArButton, { bottom: insets.bottom + 14 }]}
        onPress={handleOpenARCamera}
        disabled={isPreparingAR}
        accessibilityRole="button"
        accessibilityLabel={t('scanAr')}
      >
        {isPreparingAR ? (
          <ActivityIndicator size="small" color={COLORS.textOnDark} />
        ) : (
          <Text style={styles.mapArButtonIcon}>👁</Text>
        )}
      </TouchableOpacity>

      <InventoryModal
        visible={showInventory}
        onClose={() => setShowInventory(false)}
        items={collectionItems}
        onClear={clearCollection}
        onReplace={handleReplaceFromInventory}
      />

      <MenuModal
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        places={menuPlaces}
        scores={scores}
        onSelectPlace={(place) => {
          const memory = memories.find((item) => String(item.id) === String(place.id));
          setShowMenu(false);
          openMemoryInfo(memory || place);
        }}
      />

      <MemoryInfoModal
        visible={showInfoModal}
        memory={selectedMemoryToInspect}
        canViewContent={canViewContent(selectedMemoryToInspect)}
        previewMessage={getMemoryDistance(location, selectedMemoryToInspect) > DISCOVERY_RADIUS_METERS
          ? t('contentTooFar')
          : t('contentInAR')}
        onViewImage={(memory) => openMediaViewer(memory, 'image')}
        onViewModel={openModelViewer}
        onViewVideo={(memory) => openMediaViewer(memory, 'video')}
        canCollectGame={!isBundledGame(selectedMemoryToInspect) &&
          getMemoryDistance(location, selectedMemoryToInspect) <= DISCOVERY_RADIUS_METERS}
        onCollectGame={handleCollectGame}
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
        onDeleteAccount={deleteAccount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  experiencePanel: { position: 'absolute', left: 16, right: 16 },
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

  header: { paddingBottom: 8, paddingHorizontal: 14, backgroundColor: COLORS.surface, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: COLORS.accent, fontSize: 13, fontWeight: 'bold', fontFamily: 'monospace' },
  accountText: { color: COLORS.primary, fontSize: 12, fontFamily: 'monospace' },

  errorBanner: { backgroundColor: COLORS.danger, padding: 8, alignItems: 'center' },
  errorText: { color: COLORS.text, fontSize: 12, fontFamily: 'monospace' },

  map: { flex: 1, width: '100%' },

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
  aimingHintImage: {
    position: 'absolute',
    top: '45%',
    left: '62%',
    height: '5%',
    width: '5%',
    resizeMode: 'contain',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 999,
    opacity: 0.9,
  },

  arCenterOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, zIndex: 30, elevation: 30 },
  centerPrompt: { alignItems: 'center', gap: 10, maxWidth: '100%' },
  loaderText: { color: COLORS.border, fontFamily: 'monospace', fontSize: 12 },
  placementBanner: { position: 'absolute', left: 14, right: 14, alignItems: 'center', gap: 8, zIndex: 30, elevation: 30 },

  bottomControlsArea: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 10, backgroundColor: COLORS.transparent, zIndex: 20, elevation: 20 },
  bottomAction: { flex: 1, minHeight: 42, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: COLORS.controlBorderOverlay, backgroundColor: COLORS.controlOverlay, justifyContent: 'center', alignItems: 'center' },
  bottomActionText: { color: COLORS.textOnDark, fontWeight: 'bold', fontFamily: 'monospace', fontSize: 11, textAlign: 'center' },
  disabledAction: { opacity: 0.42 },
  disabledText: { opacity: 0.45 },

  placingHint: { color: COLORS.accent, fontFamily: 'monospace', backgroundColor: COLORS.hintOverlay, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 15, fontSize: 12, textAlign: 'center' },
  cancelButton: { backgroundColor: COLORS.cancelOverlay, paddingVertical: 6, paddingHorizontal: 15, borderRadius: 15 },
  cancelPromptText: { color: COLORS.textOnDark, fontWeight: 'bold' },

  mapBottomBar: { position: 'absolute', left: 14, right: 82, height: 54, flexDirection: 'row', gap: 8 },
  mapBottomAction: { minHeight: 54 },
  mapArButton: { position: 'absolute', right: 14, width: 54, height: 54, borderRadius: 27, backgroundColor: COLORS.accentStrong, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: COLORS.background, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 4 },
  mapArButtonIcon: { fontSize: 25, color: COLORS.textOnDark },
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