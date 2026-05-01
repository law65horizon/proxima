import { userMode } from '@/stores/authStore';
import { ApolloClient, ApolloLink, defaultDataIdFromObject, HttpLink, InMemoryCache } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { from } from '@apollo/client/link/core';
import { onError } from '@apollo/client/link/error';
import { Observable } from "@apollo/client/utilities";
import * as SecureStore from 'expo-secure-store';
import { saveTokensToSecureStore, triggerTokenRefreshFailed } from './authUtils';
import { server_port } from './constants';
// If the standard import fails:
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { AsyncStorageWrapper, persistCache } from 'apollo3-cache-persist';
import * as SQLite from 'expo-sqlite';
import { createClient } from 'graphql-ws';


// Remove the import of useAuthStore

const errorLink = onError(({ graphQLErrors, operation, forward }) => {
  if (graphQLErrors) {
    for (const err of graphQLErrors) {
      if (err.extensions?.code === 'TOKEN_EXPIRED') {
        return new Observable(observer => {
          (async () => {
            try {
              const {accessToken} = await refreshAccessToken();

              if (!accessToken) {
                throw new Error("Failed to refresh");
              }

              operation.setContext(({ headers = {} }) => ({
                headers: {
                  ...headers,
                  Authorization: `Bearer ${accessToken}`,
                },
              }));

              const subscriber = forward(operation).subscribe({
                next: result => observer.next(result),
                error: error => observer.error(error),
                complete: () => observer.complete(),
              });

              return () => subscriber.unsubscribe();
            } catch (e) {
              observer.error(e);
            }
          })();
        });
      }
      // if (err.message === "Unauthorized" || err.message === 'Authentication required' || err.message.includes("token")) {
      //   return new Observable(observer => {
      //     (async () => {
      //       try {
      //         const newAccessToken = await refreshAccessToken();

      //         if (!newAccessToken) {
      //           throw new Error("Failed to refresh");
      //         }

      //         operation.setContext(({ headers = {} }) => ({
      //           headers: {
      //             ...headers,
      //             Authorization: `Bearer ${newAccessToken}`,
      //           },
      //         }));

      //         const subscriber = forward(operation).subscribe({
      //           next: result => observer.next(result),
      //           error: error => observer.error(error),
      //           complete: () => observer.complete(),
      //         });

      //         return () => subscriber.unsubscribe();
      //       } catch (e) {
      //         observer.error(e);
      //       }
      //     })();
      //   });
      // }
    }
  }
});

const authLink = setContext(async (_, { headers }) => {
  const token = await SecureStore.getItemAsync('accessToken');
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  };
});

const httpLink = new HttpLink({
  uri: server_port,
  fetchOptions: {
    timeout: 30000,
  },
});

const wsLink = new GraphQLWsLink(
  createClient({
    connectionParams: async () => {
      const token = await SecureStore.getItemAsync('accessToken')
      return {
        authorization: token? `Bearer ${token}` : '',
        headers: {
          "ngrok-skip-browser-warning": "true",
        },
      }
    },
    on: {
      connected: () => console.log('🚀 Expo: WS Connected'),
      closed: () => console.warn('⚠️ Expo: WS Disconnected'),
      // error: (err) => console.error('❌ Expo: WS Error', err),
    }
  })
)

const splitLink = ApolloLink.split(
  ({query}) => {
    const definition = query.definitions[0]
    // console.log({websocket: definition.kind === 'OperationDefinition' &&
    //   definition.operation === 'subscription'}, definition.name.value)

    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    )
  },
  wsLink,
  httpLink
)

const db = SQLite.openDatabaseSync('apollo_cache.db')

db.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS apollo_storage (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
`);

const sqliteStorage = {
  getItem: async (key:any) => {
    const result:any = await db.getFirstAsync(`SELECT value FROM apollo_storage WHERE key = ?`, [key])
    return result ? result.value : null
  },
  setItem: async (key: any, value: any) => {
    await db.runAsync(
      `INSERT OR REPLACE INTO apollo_storage (key, value) VALUES (?, ?)`,
      [key, value] 
    )
  },
  removeItem: async(key:any) => {
    await db.runAsync(`DELETE FROM apollo_storage WHERE key = ?`, [key])
  }
}

const cache = new InMemoryCache({
  dataIdFromObject: (object) => defaultDataIdFromObject(object),
  resultCaching: true,
  typePolicies: {
    Query: {
      fields: {
        searchProperties: {
          keyArgs: ['input', ['query', 'minPrice', 'maxPrice', 'speciality', 'amenities', 'startDate', 'endDate', 'minRating']],
          merge(existing = { edges: [], pageInfo: {}, totalCount: 0 }, incoming, { args, readField }) {
            console.log('Merge called:', { existingEdges: existing.edges.length, incomingEdges: incoming.edges.length, cursor: args?.after, data: incoming.edges.map((edge:any) => edge.node) });
            const mergedEdges = existing.edges ? [...existing.edges] : [];
            const cursor = args?.after; // Use the 'after' cursor from query variables
            let offset = cursor ? offsetFromCursor(mergedEdges, cursor, readField) : -1;

            if (offset < 0) offset = mergedEdges.length; // Append if cursor not found

            // Deduplicate incoming edges to avoid duplicates
            const incomingIds = new Set(mergedEdges.map((edge) => readField('id', edge.node)));
            const newEdges = incoming.edges.filter((edge:any) => !incomingIds.has(readField('id', edge.node)));
            console.log({newEdges})
            // Insert new edges at the correct offset
            for (let i = 0; i < newEdges.length; ++i) {
              mergedEdges[offset + i] = newEdges[i];
            }

            return {
              ...incoming,
              edges: mergedEdges,
              pageInfo: incoming.pageInfo,
              totalCount: incoming.totalCount,
            };
          },
        },
        searchRoomTypes: {
          keyArgs: ['input', ['propertyType', 'query', 'value', 'beds', 'bathrooms', 'minPrice', 'maxPrice', 'speciality', 'amenities', 'startDate', 'endDate', 'minRating']],
          merge(existing = { edges: [], pageInfo: {}, totalCount: 0 }, incoming, { args, readField }) {
            console.log('Merge called:', { existingEdges: existing.edges.length, incomingEdges: incoming.edges.length, cursor: args?.after, data: incoming.edges.map((edge:any) => edge.node) });
            const mergedEdges = existing.edges ? [...existing.edges] : [];
            // console.log({mergedEdges})
            const cursor = args?.after; // Use the 'after' cursor from query variables
            let offset = cursor ? offsetFromCursor(mergedEdges, cursor, readField) : -1;

            if (offset < 0) offset = mergedEdges.length; // Append if cursor not found

            // Deduplicate incoming edges to avoid duplicates
            const incomingIds = new Set(mergedEdges.map((edge) => readField('id', edge.node)));
            const newEdges = incoming.edges.filter((edge:any) => !incomingIds.has(readField('id', edge.node)));
            console.log({newEdges})
            // Insert new edges at the correct offset
            for (let i = 0; i < newEdges.length; ++i) {
              mergedEdges[offset + i] = newEdges[i];
            }

            return {
              ...incoming,
              edges: mergedEdges,
              pageInfo: incoming.pageInfo,
              totalCount: incoming.totalCount,
            };
          },
        },
        getProperties: {
          keyArgs: false, // Cache based on all args (first, after)
          merge(existing = { edges: [], pageInfo: {}, totalCount: 0 }, incoming, { args, readField }) {
            const mergedEdges = existing.edges ? [...existing.edges] : [];
            const cursor = args?.after;
            let offset = cursor ? offsetFromCursor(mergedEdges, cursor, readField) : -1;

            if (offset < 0) offset = mergedEdges.length;

            // Deduplicate incoming edges
            const incomingIds = new Set(mergedEdges.map((edge) => readField('id', edge.node)));
            const newEdges = incoming.edges.filter((edge:any) => !incomingIds.has(readField('id', edge.node)));

            for (let i = 0; i < newEdges.length; ++i) {
              mergedEdges[offset + i] = newEdges[i];
            }

            return {
              ...incoming,
              edges: mergedEdges,
              pageInfo: incoming.pageInfo,
              totalCount: incoming.totalCount,
            };
          },
        },
        messages: {
          keyArgs: ['conversationId'],
          merge(existing = [], incoming) {
            return incoming;
          },
        },
        conversations: {
          keyArgs: ['filter'],
          merge(existing, incoming, { args }) {
            if (!args?.after) return incoming;
            return {
              ...incoming,
              edges: [...(existing?.edges || []), ...(incoming?.edges || [])],
            };
          },
        }
        // Remove the duplicate searchProperties policy
      },
    },
    Message: {
      fields: {
        read_at: {
          merge: (_, incoming) => incoming,
        },
      },
    },
  },
});

// const persistor = new CachePersistor({
//   cache,
//   storage: new AsyncStorageWrapper(sqliteStorage),
//   trigger: 'background'
// })

// const init = async () => {
//   await persistor.restore()
// }

export const setupPersist = async () => {
  await persistCache({
    cache,
    storage: new AsyncStorageWrapper(sqliteStorage)
  })
}



function offsetFromCursor(items:any, cursor: any, readField: any) {
  for (let i = items.length - 1; i >= 0; --i) {
    const item = items[i];
    if (readField('id', item.node) === cursor) {
      return i + 1;
    }
  }
  return -1;
}

export const client = new ApolloClient({
  link: from([errorLink, authLink, splitLink]),
  cache,
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
      nextFetchPolicy: 'cache-first',
      errorPolicy: 'all',
      notifyOnNetworkStatusChange: true
    },
    query: {
      fetchPolicy: 'cache-first',
      errorPolicy: 'all'
    },
    mutate: {
      errorPolicy: 'all',
      fetchPolicy: 'network-only'
    }
  },
  assumeImmutableResults: true,
  connectToDevTools: true,
});

export const refreshAccessToken = async () => {
  console.log({called: 'called'});
  const refreshToken = await SecureStore.getItemAsync('refreshToken');
  const mode = await SecureStore.getItemAsync('mode') as userMode;
  console.log({refreshToken});

  if (!refreshToken) {
    await triggerTokenRefreshFailed();
    throw new Error('No refresh token available');
  }

  try {
    const response = await fetch(server_port, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation RefreshToken($refreshToken: String!) {
            refreshAccessToken(refreshToken: $refreshToken) {
              accessToken
              refreshToken
              user {
                id
                email
                role
              }
              sessionId
            }
          }
        `,
        variables: { refreshToken },
      }),
    });
 
    const { data, errors } = await response.json();
    console.log({ data: data?.refreshAccessToken.accessToken });

    if (errors?.length) {
      const error = errors[0];

      if(error.extensions.code == 'SESSION_EXPIRED') {
        await triggerTokenRefreshFailed()
        throw new Error('REFRESH_TOKEN_INVALID')
      }

      throw new Error('REFRESH_TEMPORARY_FAILURE');
    }

    if (data?.refreshAccessToken) {
      const { accessToken, refreshToken: newRefreshToken, user, sessionId } = data.refreshAccessToken;

      console.log({user});
      
      // Save to SecureStore directly instead of using authStore
      await saveTokensToSecureStore(
        accessToken,
        newRefreshToken,
        user,
        sessionId,
        mode
      );

      // Notify the auth store to update its state
      // This will be handled by the callback set in authStore
      await triggerAuthStateUpdate({
        accessToken,
        refreshToken: newRefreshToken,
        user: { id: user?.id, email: user?.email },
        sessionId,
        mode: mode ?? 'guest'
      });

      return {accessToken, user};
    } else {
      await triggerTokenRefreshFailed();
      client.clearStore();
      throw new Error('Token refresh failed');
    }
  } catch (error:any) {
    console.warn('Refresh failed (soft):', error.message)
    throw error
  }
};

// Add a callback mechanism for auth state updates
let authStateUpdateCallback: ((authData: any) => Promise<void>) | null = null;

export const setOnAuthStateUpdate = (callback: (authData: any) => Promise<void>) => {
  authStateUpdateCallback = callback;
};

const triggerAuthStateUpdate = async (authData: any) => {
  if (authStateUpdateCallback) {
    await authStateUpdateCallback(authData);
  }
};