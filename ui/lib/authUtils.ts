// lib/authUtils.ts
import * as SecureStore from 'expo-secure-store';

let tokenRefreshFailedCallback: (() => Promise<void>) | null = null;

export const setOnTokenRefreshFailed = (callback: () => Promise<void>) => {
  tokenRefreshFailedCallback = callback;
};

export const triggerTokenRefreshFailed = async () => {
  if (tokenRefreshFailedCallback) {
    await tokenRefreshFailedCallback();
  }
};

// Move setAuth logic here to be reusable
export const saveTokensToSecureStore = async (
  accessToken: string,
  refreshToken: string,
  user: any,
  sessionId: string,
  mode: string
) => {
  await SecureStore.setItemAsync('accessToken', accessToken);
  await SecureStore.setItemAsync('refreshToken', refreshToken);
  await SecureStore.setItemAsync('user', JSON.stringify(user));
  await SecureStore.setItemAsync('sessionId', sessionId);
  {mode && await SecureStore.setItemAsync('mode', mode);}
  // useAuthStore.setState({accessToken, user, refreshToken, sessionId})
};