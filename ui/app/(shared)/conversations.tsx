// screens/MessagesScreen.tsx
import { CONVERSATION_UPDATED_SUBSCRIPTION, CONVERSATIONS_QUERY, MARK_ALL_AS_READ } from '@/graphql/queries';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/theme/theme';
import { useMutation, useQuery } from '@apollo/client';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface Conversation {
  id: string;
  guest: { id: string; name: string };
  host: { id: string; name: string };
  property?: { id: string; title: string };
  lastMessage: { content: string; createdAt: string };
  unreadCount: number;
  last_message_at: string;
}

const MessagesScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const user = useAuthStore.getState().user

  const { data, loading, error, refetch, fetchMore, subscribeToMore } = useQuery(CONVERSATIONS_QUERY, {
    variables: { 
      first: 20,
      filter: {
        hasUnread: filter === 'unread' ? true : undefined,
        searchQuery: searchQuery || undefined,
      },
    },
    skip: !user,
    fetchPolicy: 'cache-and-network',
    // pollInterval: 30000,
  });

  const [markAllAsRead] = useMutation(MARK_ALL_AS_READ, {
    refetchQueries: ['Conversations'],
  });

  const conversations = data?.conversations?.edges?.map((edge: any) => edge.node) || [];
  const pageInfo = data?.conversations?.pageInfo;

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  useEffect(() => {
    console.log('sioio')
    if (!data) return
    const unsubscribe = subscribeToMore({
      document: CONVERSATION_UPDATED_SUBSCRIPTION,
      variables: {
        userId: user.id
      },
      updateQuery: (prev, {subscriptionData}) => {
        if (!subscriptionData.data.conversationUpdate) return prev
        console.log('working')

        const newConversation = subscriptionData.data.conversationUpdate
        const conversationId = newConversation.id

        // if (prev.conversations.edges.some((c: any) => c.id === newConversation.id)) {
        //   return prev;
        // }

        // client.cache.modify({
        //   fields: {
        //     conversations(existingData, {toReference, readField}) {
        //       const edges = existingData.edges || []
        //       const index = edges.findIndex(
        //         (edge:any) => readField('id', edge.node) === newConversation.conversationId
        //       )

        //       let targetEdge;

        //       if (index > -1) {
        //         targetEdge = edges[index]
        //       } else {
        //         targetEdge = {
        //           __typename: 'ConversationEdge',
        //           node: toReference({__typename: 'Conversation', id: newConversation.conversationId}),
        //           cursor: Date.now()
        //         }
        //       }

        //       const filteredEdges = edges.filter(
        //         (edge:any) => readField('id', edge.node) !== newConversation.conversationId
        //       )

        //       return {
        //         ...existingData,
        //         edges: [targetEdge, ...filteredEdges]
        //       }
        //     }
        //   }
        // })

        const edges = prev.conversations.edges;

        const index = edges.findIndex((edge:any) => edge.node.id === conversationId);

        let targetEdge;
        if (index > -1) {
          targetEdge = {
            ...edges[index],
            node: {
              ...edges[index].node,
              ...newConversation
            }
          }
        } else {
          targetEdge = {
            __typename: 'ConversationEdge',
            cursor: newConversation.last_message_at,
            node: newConversation
          }
        }

        console.log({targetEdge})

        const filteredEdges = edges.filter((_:any, i:any) => i !== index) 
        return {
          ...prev,
          conversations: {
            ...prev.conversations,
            edges: [targetEdge, ...filteredEdges],
            totalCount: index === -1 ? prev.conversations.totalCount + 1: prev.conversations.totalCount
          }
        }       
      }
    })

    return () => unsubscribe()
  }, [subscribeToMore]) 

  const renderConversationItem = ({ item }: { item: Conversation }) => {
    const isUnread = item.unreadCount > 0;
    console.log(item.guest.name, item.host.name)
    return (
      <TouchableOpacity
        style={[
          styles.conversationItem,
          { 
            backgroundColor: theme.colors.card,
            borderBottomColor: theme.colors.border,
          },
          isUnread && { backgroundColor: theme.colors.backgroundSec }
        ]}
        onPress={() => router.push({
          pathname: '../../chats',
          params: {chat: JSON.stringify({conversationId: item.id})}
        })}
      >
        <View style={[styles.avatar, { backgroundColor: theme.colors.primary + '20' }]}>
          <Text style={[styles.avatarText, { color: theme.colors.primary }]}>
            {item.guest.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text
              style={[
                styles.guestName,
                { color: theme.colors.text },
                isUnread && styles.unreadText
              ]}
              numberOfLines={1}
            >
              {item.guest.name}
            </Text>
            <Text style={[styles.timestamp, { color: theme.colors.textSecondary }]}>
              {formatTime(item.last_message_at)}
            </Text>
          </View>

          {item.property && (
            <Text
              style={[styles.propertyName, { color: theme.colors.textSecondary }]}
              numberOfLines={1}
            >
              {item.property.title}
            </Text>
          )}

          <View style={styles.lastMessageRow}>
            <Text
              style={[
                styles.lastMessage,
                { color: theme.colors.textSecondary },
                isUnread && { color: theme.colors.text, fontWeight: '600' }
              ]}
              numberOfLines={2}
            >
              {item.lastMessage?.content || 'No messages yet'}
            </Text>
            {isUnread && (
              <View style={[styles.unreadBadge, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.unreadCount}>
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.card }]}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Messages</Text>
        {conversations.some((c: Conversation) => c.unreadCount > 0) && (
          <TouchableOpacity onPress={() => markAllAsRead()} style={styles.markAllBtn}>
            <Text style={[styles.markAllText, { color: theme.colors.primary }]}>
              Mark all read
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: theme.colors.card }]}>
        <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.colors.text }]}
          placeholder="Search conversations..."
          placeholderTextColor={theme.colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'all' && { borderBottomColor: theme.colors.primary }
          ]}
          onPress={() => setFilter('all')}
        >
          <Text
            style={[
              styles.filterText,
              { color: filter === 'all' ? theme.colors.primary : theme.colors.textSecondary }
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'unread' && { borderBottomColor: theme.colors.primary }
          ]}
          onPress={() => setFilter('unread')}
        >
          <Text
            style={[
              styles.filterText,
              { color: filter === 'unread' ? theme.colors.primary : theme.colors.textSecondary }
            ]}
          >
            Unread
          </Text>
        </TouchableOpacity>
      </View>

      {/* Conversations List */}
      {loading && conversations.length === 0 ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversationItem}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refetch} />
          }
          onEndReached={() => {
            if (pageInfo?.hasNextPage && !loading) {
              fetchMore({ variables: { after: pageInfo.endCursor } });
            }
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={() => (
            <TouchableOpacity 
            // onPress={() => router.push('/messages/chats')} 
            style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={64} color={theme.colors.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                {filter === 'unread' ? 'No unread messages' : 'No conversations yet'}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  markAllBtn: {
    padding: 8,
  },
  markAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterText: {
    fontSize: 15,
    fontWeight: '600',
  },
  conversationItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  guestName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  unreadText: {
    fontWeight: '700',
  },
  timestamp: {
    fontSize: 13,
  },
  propertyName: {
    fontSize: 13,
    marginBottom: 4,
  },
  lastMessageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    flex: 1,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadCount: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  loader: {
    marginTop: 32,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
  },
});

export default MessagesScreen;