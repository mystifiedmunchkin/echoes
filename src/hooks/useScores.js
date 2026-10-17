/** Legacy aiming-score storage; the active application uses per-user useProgress instead. */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@experience_scores';

function increment(scores, { id, name, points = 1 }) {
  const index = scores.findIndex(item => String(item.id) === String(id));
  return index < 0
    ? [...scores, { id, name, points }]
    : scores.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, name: name || item.name, points: item.points + points }
          : item,
      );
}

export function useScores() {
  const [scores, setScores] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(stored => {
        const saved = stored ? JSON.parse(stored) : [];
        if (!Array.isArray(saved)) throw new Error('Invalid saved scores');
        if (!mounted) return;
        // Replay points earned during hydration on top of the saved scores.
        setScores(pending => pending.reduce(increment, saved));
        setLoaded(true);
      })
      .catch(error => console.error('Score loading failed', error));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    writes.current = writes.current
      .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(scores)))
      .catch(error => console.error('Score saving failed', error));
  }, [loaded, scores]);

  const addScore = useCallback(score => {
    setScores(current => increment(current, score));
  }, []);

  return { scores, addScore };
}
