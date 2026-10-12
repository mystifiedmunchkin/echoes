/** Persists collected-memory inventory and exposes collection actions to the UI. */
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translate } from '../../constants/i18n';

export function useInventory() {
  const [collectedMemories, setCollectedMemories] = useState([]);
  const [showInventory, setShowInventory] = useState(false);

  useEffect(() => {
    async function loadStoredMemories() {
      try {
        const stored = await AsyncStorage.getItem('@collected_memories');
        if (stored) setCollectedMemories(JSON.parse(stored));
      } catch (e) {
        console.error(translate('collectionLoadError'), e);
      }
    }
    loadStoredMemories();
  }, []);

  const handleCollectMemory = async (memoryData) => {
    const exists = collectedMemories.some(item => item.id === memoryData.id);
    if (!exists) {
      const updatedCollection = [...collectedMemories, { ...memoryData, collectedAt: new Date().toISOString() }];
      setCollectedMemories(updatedCollection);
      await AsyncStorage.setItem('@collected_memories', JSON.stringify(updatedCollection));
      alert(translate('memoryAdded', { name: memoryData.name }));
    }
  };

  const clearInventory = async () => {
    setCollectedMemories([]);
    await AsyncStorage.removeItem('@collected_memories');
  };

  return { collectedMemories, showInventory, setShowInventory, handleCollectMemory, clearInventory };
}