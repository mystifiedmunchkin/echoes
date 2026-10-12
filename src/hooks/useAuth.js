/** Loads and mutates the persisted authenticated user session. */
import { useEffect, useState } from 'react';
import { getAuthToken, getStoredUser, login, logout, register } from '../services/auth';
import { translate } from '../../constants/i18n';

export function useAuth() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAuthToken(), getStoredUser()])
      .then(([storedToken, storedUser]) => {
        setToken(storedToken);
        setUser(storedUser);
      })
      .catch((error) => console.error(translate('sessionLoadError'), error))
      .finally(() => setIsLoading(false));
  }, []);

  const signIn = async (credentials) => {
    const session = await login(credentials);
    setToken(session.token);
    setUser(session.user);
    return session;
  };

  const signUp = async (credentials) => {
    const session = await register(credentials);
    return session;
  };

  const signOut = async () => {
    await logout();
    setToken(null);
    setUser(null);
  };

  return { token, user, isLoading, signIn, signUp, signOut };
}
