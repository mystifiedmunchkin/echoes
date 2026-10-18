/** Authentication API and AsyncStorage-backed session persistence helpers. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translate } from '../../constants/i18n';

const API_URL = 'https://echoes.sophiehorner.art';
const TOKEN_KEY = '@echoes_auth_token';
const USER_KEY = '@echoes_auth_user';

function responseError(payload, status) {
  const message =
    typeof payload?.message === 'string' && payload.message.trim()
      ? payload.message.trim()
      : translate('serverError', { status });
  const details = Object.entries(payload?.errors || {}).flatMap(([field, value]) => {
    const messages = Array.isArray(value) ? value : [value];
    return messages
      .filter(item => typeof item === 'string' && item.trim())
      .map(item => `${field}: ${item}`);
  });
  return details.length ? `${message} (${details.join('; ')})` : message;
}

async function requestAuth(path, credentials, requiresToken = true) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(credentials),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(responseError(payload, response.status));
  }

  const user = payload.user || payload.data || null;
  const token = payload?.token || payload?.access_token;
  if (requiresToken && !token) {
    throw new Error(payload?.message || translate('emailVerificationRequired'));
  }

  // Registration requires email verification and must not replace an existing local session.
  if (!requiresToken) return { token: null, user, message: payload?.message };

  await AsyncStorage.setItem(TOKEN_KEY, token);
  if (user) await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  return { token, user };
}

export async function login(credentials) {
  return requestAuth('/api/login', credentials);
}

export async function register(credentials) {
  return requestAuth('/api/register', credentials, false);
}

export async function logout() {
  const token = await getAuthToken();
  if (token) {
    await fetch(`${API_URL}/api/logout`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    }).catch(() => null);
  }
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

export async function deleteAccount() {
  const token = await getAuthToken();
  if (!token) throw new Error(translate('accountDeletionAuthenticationRequired'));

  const response = await fetch(`${API_URL}/api/user`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      responseError(payload, response.status),
    );
  }
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

export async function getAuthToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function getStoredUser() {
  const storedUser = await AsyncStorage.getItem(USER_KEY);
  return storedUser ? JSON.parse(storedUser) : null;
}
