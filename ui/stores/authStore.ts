// stores/authStore.ts (Zustand)

import { LOGOUT } from '@/graphql/mutations';
import { client, setOnAuthStateUpdate } from '@/lib/apolloClient';
import { setOnTokenRefreshFailed } from '@/lib/authUtils';
import { gql } from '@apollo/client';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import { create } from 'zustand';
import { useSearchStore } from './useSearchStore';

export type userMode = 'guest' | 'host';

// FIX #9 — navigation out of the store: expose a callback the root layout sets,
// so the store never imports router directly (router may not be mounted yet at boot).
type NavigateCallback = (path: string) => void;
let _navigateTo: NavigateCallback | null = null;
export const setStoreNavigator = (fn: NavigateCallback) => {
  _navigateTo = fn;
};

const GET_SESSION = gql`
  query GetSession($sessionId: String!) {
    getSession(sessionId: $sessionId) {
      session {
        deviceId
        user {
          id
          email
          role
        }
      }
      message
      success
    }
  }
`;

interface AuthStore {
  user: any;
  sessionId: string;
  accessToken: any;
  refreshToken: any;
  isAuthenticated: boolean;
  isLoading: boolean;
  mode: userMode | null;

  setAuth: (
    accessToken: string,
    refreshToken: string,
    user: any,
    sessionId: string,
    mode: userMode,
  ) => void;
  logout: () => void;
  clearAuth: () => void;
  loadAuth: () => void;
  updateUser: (user: any) => void;
  switchMode: (mode: userMode) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  sessionId: '',
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,
  mode: null,

  setAuth: async (accessToken, refreshToken, user, sessionId, mode) => {
    console.log({ accessToken, refreshToken, user, mode, sessionId });
    try {
      await SecureStore.setItemAsync('accessToken', accessToken);
      await SecureStore.setItemAsync('refreshToken', refreshToken);
      await SecureStore.setItemAsync('user', JSON.stringify(user));
      await SecureStore.setItemAsync('sessionId', sessionId);
      await SecureStore.setItemAsync('mode', mode);

      set({
        user,
        accessToken,
        refreshToken,
        sessionId,
        isAuthenticated: true,
        isLoading: false,
        mode,
      });
    } catch (error) {
      console.error('Failed to set auth:', error);
    }
  },

  switchMode: async (mode) => {
    try {
      await SecureStore.setItemAsync('mode', mode);
      set({ mode });
    } catch (error) {
      console.error('Failed to switch mode:', error);
    }
  },

  logout: async () => {
    const sessionId = await SecureStore.getItemAsync('sessionId');
    try {
      await client.mutate({
        mutation: LOGOUT,
        variables: { sessionId },
      });
      get().clearAuth();
    } catch (error: any) {
      Alert.alert('Logout failed', error?.message ?? 'Please try again.');
    }
  },

  clearAuth: async () => {
    try {
      await SecureStore.deleteItemAsync('accessToken');
      await SecureStore.deleteItemAsync('refreshToken');
      // FIX #7 — key was 'session', should match the set key 'sessionId'
      await SecureStore.deleteItemAsync('sessionId');
      await SecureStore.deleteItemAsync('user');
      await SecureStore.deleteItemAsync('mode');

      await client.clearStore();
      useSearchStore.getState().clearFilters();

      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
        mode: 'guest',
        sessionId: '',
      });
    } catch (error) {
      console.error('Failed to clear auth:', error);
    }
  },

  loadAuth: async () => {
    try {
      const [accessToken, refreshToken, sessionId, userRaw, storedMode] = await Promise.all([
        SecureStore.getItemAsync('accessToken'),
        SecureStore.getItemAsync('refreshToken'),
        SecureStore.getItemAsync('sessionId'),
        SecureStore.getItemAsync('user'),
        SecureStore.getItemAsync('mode'),
      ]);

      const mode = (storedMode as userMode) ?? 'guest';

      if (!accessToken || !refreshToken || !userRaw) {
        set({ isLoading: false, mode: 'guest' });
        return;
      }

      const user = JSON.parse(userRaw);

      try {
        const sessionResponse = await client.query({
          query: GET_SESSION,
          variables: { sessionId },
          fetchPolicy: 'network-only',
        });

        const sessionData = sessionResponse.data?.getSession;

        if (sessionData?.success && sessionData.session?.user) {
          set({
            user: sessionData.session.user,
            accessToken,
            refreshToken,
            sessionId: sessionId ?? '',
            isAuthenticated: true,
            mode,
            isLoading: false,
          });
        } else if (
          !sessionData?.success &&
          sessionData?.message?.toLowerCase() === 'session not found'
        ) {
          await get().clearAuth();
          // FIX #9 — use callback navigator instead of importing router in the store
          _navigateTo?.('/(guest)/(auth)/auth_page');
        }
      } catch (error: any) {
        // Network error / server down — trust stored credentials but mark unverified
        console.warn('Session verification failed (network?), using stored credentials:', error?.message);
        set({
          user,
          accessToken,
          refreshToken,
          sessionId: sessionId ?? '',
          isAuthenticated: true,
          mode,
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('loadAuth error:', error);
      set({ isLoading: false, mode: 'guest' });
    }
  },

  updateUser: async (user) => {
    try {
      await SecureStore.setItemAsync('user', JSON.stringify(user));
      set({ user });
    } catch (error) {
      console.error('Failed to update user:', error);
    }
  },
}));

setOnTokenRefreshFailed(async () => {
  await useAuthStore.getState().clearAuth();
});

setOnAuthStateUpdate(async (authData) => {
  const { accessToken, refreshToken, user, sessionId, mode } = authData;
  useAuthStore.getState().setAuth(accessToken, refreshToken, user, sessionId, mode);
});