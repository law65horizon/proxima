import { ThemedText } from '@/components/ThemedText';
import { useGetRecents } from '@/hooks/useGetRecentSearches';
import { useSearchStore } from '@/stores';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/theme/theme';
import { gql, useLazyQuery, useMutation } from '@apollo/client';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type QuickSearchResult = {
  id: number | string | null;
  city: { id: number | string; name: string };
  country: { id: number | string; name: string };
  geom: any | null;
  postal_code: string | null;
  street: string | null;
};

type QuickSearchList = QuickSearchResult[];

const QUICK_SEARCH = gql`
  query QuickSearch($query: String, $latitude: Float, $longitude: Float, $radius: Float) {
    quickSearch(query: $query, latitude: $latitude, longitude: $longitude, radius: $radius) {
      quickSearch {
        city { id name }
        country { name id }
        geom
        id
        postal_code
        street
      }
      search_type
    }
  }
`;

const ADD_TO_RECENTS = gql`
  mutation Mutation($input: RecentSearchesInput) {
    addToRecents(input: $input) {
      city
      latitude
      longitude
      postal_code
      street
      tag
      userId
    }
  }
`;

type Segment = 'for-sale' | 'for-rent' | 'sold';
type SearchFields = 'city' | 'postal_code' | 'street';

const SUGGESTIONS = [
  '2 bedroom in Paris',
  'Homes near Central Park',
  'Beachfront apartment',
  'Modern condo in Berlin',
];

interface SubmitInput {
  type: 'recents' | 'search';
  searchType?: SearchFields;
  value: string;
  tag?: string;
}

const RedesignedSearch = () => {
  const { theme } = useTheme();
  const router = useRouter();

  const [query, setQuery] = useState<string>('');
  const [segment, setSegment] = useState<Segment>('for-sale');
  const [usingLocation, setUsingLocation] = useState<boolean>(false);
  const [locationLabel, setLocationLabel] = useState<string>('Current Location');
  const [results, setResults] = useState<QuickSearchList>([]);
  const [searchType, setSearchType] = useState<SearchFields | ''>('');
  // FIX #4 — track debounce-pending state to prevent recents flash while user is still typing
  const [isPending, setIsPending] = useState<boolean>(false);
  // FIX #5 — surface search errors to the user instead of silently swallowing them
  const [searchError, setSearchError] = useState<string | null>(null);

  const [searchQuery, { loading: fetching }] = useLazyQuery(QUICK_SEARCH);
  const [addToRecents] = useMutation(ADD_TO_RECENTS);
  const { data: recentData, loading: loadingRecents } = useGetRecents();
  const user = useAuthStore((state) => state.user);
  const addToRecentsStore = useSearchStore((state) => state.addToRecents);

  const inputRef = useRef<TextInput>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear debounce timer on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleChange = (text: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (text.trim().length < 3) {
      // Reset immediately for short inputs — no need to debounce
      setIsPending(false);
      setResults([]);
      setSearchType('');
      setSearchError(null);
      return;
    }

    // FIX #4 — mark as pending so showLists stays false during the debounce window
    setIsPending(true);
    timeoutRef.current = setTimeout(() => {
      runSearch(text);
    }, 600);
  };

  const runSearch = async (text: string) => {
    setSearchError(null);
    try {
      const { data } = await searchQuery({ variables: { query: text } });
      setResults(data?.quickSearch?.quickSearch ?? []);
      setSearchType(data?.quickSearch?.search_type ?? '');
      // FIX #1 — removed Keyboard.dismiss() here; dismissing mid-type closes the keyboard
      // while the user is still typing, which is jarring UX
    } catch (error) {
      // FIX #5 — set error state so the UI can inform the user
      setSearchError('Something went wrong. Please try again.');
    } finally {
      setIsPending(false);
    }
  };

  const getSearchValuePair = (recent: any): { search: SearchFields; value: string } | null => {
    if (recent.postal_code) return { search: 'postal_code', value: String(recent.postal_code) };
    if (recent.city) return { search: 'city', value: recent.city };
    return null;
  };

  // FIX #4 — isPending gates showLists so recents don't flash during the debounce window
  const showLists = !query || (!isPending && !fetching && query.length > 0 && results.length === 0 && !searchError);

  const handleSubmit = async (input: SubmitInput) => {
    const value = (input.value ?? query).trim();
    if (!value) return;

    if (input.type === 'search') {
      const resolvedSearchType = input.searchType || (searchType as SearchFields) || 'city';
      const resolvedTag = input.tag || value;

      try {
        addToRecentsStore({
          tag: resolvedTag,
          timestamp: Date.now(),
          [resolvedSearchType]: value,
        });
        if (user) {
          addToRecents({
            variables: {
              input: { userId: user.id, tag: resolvedTag, [resolvedSearchType]: value },
            },
          }).catch((err) => console.error('addToRecents mutation error:', err));
        }
      } catch (error) {
        console.error('addToRecents store error:', error);
      }

      Keyboard.dismiss();
      router.dismissAll();
      router.push({
        pathname: '/(guest)/(tabs)/home/(search)/[query]',
        params: {
          query: JSON.stringify({
            [resolvedSearchType]: value,
            sale_status:
              segment === 'for-rent' ? 'rent' : segment === 'for-sale' ? 'sale' : segment,
          }),
        },
      });
      return;
    }

    // type === 'recents'
    Keyboard.dismiss();
    router.dismissAll();
    router.push({
      pathname: '/(guest)/(tabs)/home/(search)/[query]',
      params: {
        query: JSON.stringify({
          ...(input.searchType ? { [input.searchType]: value } : { city: value }),
          sale_status:
            segment === 'for-rent' ? 'rent' : segment === 'for-sale' ? 'sale' : segment,
        }),
      },
    });
  };

  const requestLocation = async () => {
    try {
      setUsingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setUsingLocation(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const geocoded = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      const first = geocoded?.[0];
      const label = [first?.city, first?.region, first?.country].filter(Boolean).join(', ');
      setLocationLabel(label || 'Current Location');
      setQuery(label || 'Current Location');
    } catch (e) {
      console.error('Location error:', e);
    } finally {
      setUsingLocation(false);
      inputRef.current?.focus();
    }
  };

  const renderSegment = (key: Segment, label: string) => (
    <Pressable
      key={key}
      onPress={() => setSegment(key)}
      style={[
        styles.segmentButton,
        {
          backgroundColor:
            segment === key
              ? theme.mode === 'dark'
                ? theme.colors.background2
                : theme.colors.background
              : 'transparent',
          borderColor: theme.colors.border,
          borderWidth: 0,
          flex: 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: segment === key }}
    >
      <ThemedText type="defaultSemiBold" style={{ color: theme.colors.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );

  const ListElement = (item: any, tag: string) => {
    switch (tag) {
      case 'city':
        return (
          <View style={{ justifyContent: 'space-between', height: 40, flex: 1 }}>
            <ThemedText style={{ marginLeft: 10, textTransform: 'capitalize' }}>
              {item?.city?.name}
            </ThemedText>
            <ThemedText style={{ marginLeft: 10, textTransform: 'capitalize', color: theme.colors.textSecondary }}>
              {item?.country?.name}
            </ThemedText>
          </View>
        );
      case 'postal_code':
        return (
          <View style={{ justifyContent: 'space-between', height: 40 }}>
            <ThemedText style={{ marginLeft: 10 }}>{item.postal_code}</ThemedText>
            <ThemedText style={{ marginLeft: 10, color: theme.colors.textSecondary }}>
              {item?.city?.name}, {item?.country?.name}
            </ThemedText>
          </View>
        );
      default:
        return (
          <View style={{ justifyContent: 'space-between', height: 40 }}>
            <ThemedText style={{ marginLeft: 10 }}>{item.street}</ThemedText>
            <ThemedText style={{ marginLeft: 10, color: theme.colors.textSecondary }}>
              {item?.city?.name}, {item?.country?.name}
            </ThemedText>
          </View>
        );
    }
  };

  const ListHeader = (
    <View style={{ paddingHorizontal: 16, gap: 12 }}>
      <ThemedText type="defaultSemiBold" style={{ marginVertical: 8 }}>
        {showLists ? 'Recents' : 'Search results'}
      </ThemedText>
    </View>
  );

  // FIX #6 — wrap in useMemo to prevent rebuilding on every render
  const dataToRender = useMemo(() => {
    if (!showLists) return results;
    return (recentData ?? [])
      .map((r: any, index: number) => ({
        type: 'recent',
        id: `recent-${index}`,
        title: r.tag,
        ...r,
      }))
      .concat(SUGGESTIONS.map((s) => ({ type: 'suggest', id: `s-${s}`, title: s })));
  }, [showLists, recentData, results]);

  // FIX #6 — useCallback so renderItem reference is stable across renders
  const renderItem = useCallback(
    ({ item, index }: { item: any; index: number }) => {
      if (item.type === 'recent' || item.type === 'suggest') {
        return (
          <Pressable
            onPress={() => {
              setQuery(item.title);
              if (item.type === 'suggest') {
                handleSubmit({ type: 'search', value: item.title });
              } else {
                const pair = getSearchValuePair(item);
                if (pair) {
                  handleSubmit({ type: 'recents', value: pair.value, searchType: pair.search });
                } else {
                  handleSubmit({ type: 'recents', value: item.title });
                }
              }
            }}
            style={[styles.row, { borderColor: theme.colors.border, backgroundColor: theme.colors.card, marginTop: 0 }]}
          >
            <Ionicons
              name={item.type === 'recent' ? 'time-outline' : 'sparkles-outline'}
              size={18}
              color={theme.colors.textSecondary}
            />
            <ThemedText style={{ marginLeft: 10 }}>{item.title}</ThemedText>
          </Pressable>
        );
      }

      return (
        <TouchableOpacity
          onPress={() =>
            handleSubmit({
              searchType: searchType as SearchFields,
              type: 'search',
              // city.id is intentional — server uses it for direct DB lookup rather than name search
              value:
                searchType === 'city'
                  ? item?.city?.id
                  : searchType === 'postal_code'
                  ? item.postal_code
                  : item.geom,
              tag:
                searchType === 'city'
                  ? item?.city?.name
                  : searchType === 'postal_code'
                  ? item.postal_code
                  : item.street,
            })
          }
          style={[styles.row, { borderWidth: 0, marginTop: 0, paddingHorizontal: 5, paddingVertical: 8 }]}
        >
          <Ionicons
            name="home-outline"
            size={18}
            color={theme.colors.textSecondary}
            style={{ backgroundColor: 'rgba(179, 223, 217, 0.9)', padding: 15, borderRadius: 8 }}
          />
          {ListElement(item, searchType)}
        </TouchableOpacity>
      );
    },
    [searchType, theme, handleSubmit]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 0 }}>
        {/* Search bar */}
        <View style={[styles.searchRow, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" style={styles.backIcon}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: theme.colors.text }]}
            placeholder="Search homes, cities, or addresses"
            placeholderTextColor={theme.colors.textSecondary}
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              handleChange(t);
            }}
            returnKeyType="search"
            onSubmitEditing={() =>
              handleSubmit({
                value: query,
                type: 'search',
                searchType: (searchType as SearchFields) || 'city',
                tag: query,
              })
            }
            autoFocus
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => {
                setQuery('');
                setResults([]);
                setSearchType('');
                setSearchError(null);
                setIsPending(false);
              }}
              style={styles.clearIcon}
              accessibilityRole="button"
            >
              <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
            </Pressable>
          )}
        </View>

        {/* Segmented control */}
        <View style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundSec, borderRadius: 10 }}>
          <View style={styles.segmentInner}>
            {renderSegment('for-rent', 'For Rent')}
            {renderSegment('for-sale', 'For Sale')}
            {renderSegment('sold', 'Sold')}
          </View>
        </View>

        {/* Location row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            onPress={requestLocation}
            style={[styles.locationRow, { flex: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="crosshairs-gps" color={theme.colors.accent} size={20} />
            <ThemedText type="defaultSemiBold" style={{ flex: 1, marginLeft: 10 }}>
              {locationLabel}
            </ThemedText>
            {usingLocation && <ActivityIndicator animating size="small" color={theme.colors.accent} />}
          </Pressable>
          <TouchableOpacity>
            <Ionicons name="earth-sharp" size={35} color={theme.colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

      {/* FIX #5 — error state rendered inline above the list */}
      {searchError && (
        <View style={[styles.errorBanner, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Ionicons name="alert-circle-outline" size={16} color="#e05c5c" />
          <ThemedText style={{ marginLeft: 8, color: '#e05c5c', fontSize: 13 }}>{searchError}</ThemedText>
        </View>
      )}

      {/* FIX #4 — show loading indicator during debounce + fetch instead of flashing recents */}
      {(isPending || (fetching && query.length >= 3)) && !searchError ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : showLists ? (
        <>
          {ListHeader}
          {/* FIX — loadingRecents: show skeleton instead of partially-rendered list */}
          {loadingRecents ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : (
            <View style={{ marginHorizontal: 12, borderWidth: 1, gap: 0, borderRadius: 16, borderColor: theme.colors.border }}>
              {dataToRender.map((item: any, index: number) => {
                const pair = item.type === 'recent' ? getSearchValuePair(item) : null;
                return (
                  <Pressable
                    key={item.id ?? index}
                    onPress={() => {
                      if (item.type === 'suggest') {
                        handleSubmit({ type: 'search', value: item.title });
                      } else if (pair) {
                        handleSubmit({ type: 'recents', value: pair.value, searchType: pair.search });
                      } else {
                        handleSubmit({ type: 'recents', value: item.title });
                      }
                    }}
                    style={{
                      padding: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderBottomWidth: index + 1 === dataToRender.length ? 0 : 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Ionicons
                      name={item.type === 'recent' ? 'time-outline' : 'sparkles-outline'}
                      size={22}
                      color={theme.colors.accent}
                    />
                    <ThemedText style={{ marginLeft: 10, textTransform: 'capitalize', width: '100%' }}>
                      {item.title}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      ) : (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={results}
          // FIX #2 — stable key: Math.random() causes unnecessary re-renders; use index as last resort
          keyExtractor={(it: any, index: number) =>
            it.id != null
              ? String(it.id)
              : it.city?.id != null
              ? `city-${it.city.id}-${index}`
              : `item-${index}`
          }
          ListHeaderComponent={ListHeader}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: Platform.select({ ios: 84, android: 124 }) }}
        />
      )}

      {/* Floating Search button */}
      <TouchableOpacity
        onPress={() =>
          handleSubmit({
            value: query,
            type: 'search',
            searchType: (searchType as SearchFields) || 'city',
            tag: query,
          })
        }
        disabled={!query}
        style={[styles.submitButton, { backgroundColor: theme.colors.text }]}
      >
        <ThemedText style={{ fontSize: 16, color: theme.colors.background, textAlign: 'center' }}>
          Search
        </ThemedText>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  submitButton: {
    position: 'absolute',
    bottom: 20,
    flex: 1,
    height: 60,
    width: '90%',
    alignSelf: 'center',
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    paddingTop: 60,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    height: 44,
    marginTop: 8,
  },
  backIcon: {
    padding: 4,
    marginRight: 4,
  },
  input: {
    flex: 1,
    height: 40,
    paddingHorizontal: 8,
    fontSize: 16,
  },
  clearIcon: {
    paddingHorizontal: 4,
  },
  segmentInner: {
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    marginTop: 10,
    marginBottom: 5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
});

export default RedesignedSearch;