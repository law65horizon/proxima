// screens/host/BookingsDashboardScreen.tsx

import SearchFilterModal, { FilterState } from '@/components/ui/bookings/SearchModal';
import { useTheme } from '@/theme/theme';
import { gql, useQuery } from '@apollo/client';
import { Ionicons } from '@expo/vector-icons';
import { MaterialTopTabBarProps, createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

// Import tab screens
import { useBookingFilter } from '@/stores/bookingStore';
import { useIsFocused } from '@react-navigation/native';
import ActiveTabScreen from './ActiveTab';
import AllTabScreen from './All';
import UpcomingTabScreen from './UpcomingTab';

function StatsTabBar({
  state,
  navigation,
  theme,
  stats,
  activeFilters,
}: MaterialTopTabBarProps & {
  theme: any;
  stats: any;
  activeFilters: number;
}) {
  const tabs = [
    {
      key: 'Upcoming',
      label: 'Upcoming',
      value: stats?.upcoming_count ?? 0,
      color: theme.colors.primary,
      bg: theme.colors.primary + '15',
    },
    {
      key: 'Active',
      label: 'Active',
      value: stats?.active_count ?? 0,
      color: theme.colors.success,
      bg: theme.colors.success + '15',
    },
    {
      key: 'All',
      label: 'All',
      value: stats?.total ?? 0,
      color: theme.colors.text,
      bg: theme.colors.backgroundSec,
    },
  ];

  return (
    <View style={[styles.statsBar, { marginVertical: 10, backgroundColor: theme.colors.card }]}>
      {tabs.map((tab, index) => {
        const isActive = state.routes[state.index].name === tab.key;

        return (
          <React.Fragment key={tab.key}>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => navigation.navigate(tab.key)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.statBadge,
                  {
                    backgroundColor: isActive ? tab.bg : theme.colors.background,
                    borderWidth: isActive ? 0 : 1,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statValue,
                    { color: isActive ? tab.color : theme.colors.textSecondary },
                  ]}
                >
                  {tab.value}
                </Text>
              </View>

              <Text
                style={[
                  styles.statLabel,
                  {
                    color: isActive
                      ? theme.colors.text
                      : theme.colors.textSecondary,
                    fontWeight: isActive ? '700' : '500',
                  },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>

            {index < tabs.length - 1 && <View style={styles.statDivider} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const GET_BOOKINGS_SUMMARY = gql`
  query GetBookingsSummary {
    myBookingsSummary {
      pending_count
      upcoming_count
      active_count
      total
    }
  }
`;

// const GET_HOST_PROPERTIES = gql`
//   query GetHostProperties {
//     myProperties {
//       id
//       title
//     }
//   }
// `;

const mock = {
  "data": {
    "getHostBookings": {
      "__typename": "BookingSummary",
      "pending_count": 5,
      "upcoming_count": 12,
      "active_count": 3,
      "total": 45
    }
  }
};

const mockProperties = {
  data: {
    myProperties: [
      { id: "1", title: "Luxury Penthouse Victoria Island" },
      { id: "2", title: "Modern Apartment Lekki" },
      { id: "3", title: "Beachfront Villa" },
    ]
  }
};

const Tab = createMaterialTopTabNavigator();

export default function BookingsDashboardScreen() {
  const { theme } = useTheme();
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const setStoreFilter = useBookingFilter(state => state.setFilter)
  const clearFilter = useBookingFilter(state => state.clearAll)
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    propertyId: null,
    status: [],
    dateRange: { start: null, end: null },
    sortBy: 'date',
    sortOrder: 'desc',
    priceRange: { min: 0, max: 10000 },
    guestType: 'all',
  });
  const isFocused = useIsFocused()

  const { data: summary, startPolling, stopPolling} = useQuery(GET_BOOKINGS_SUMMARY, {
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true
  });

  useEffect(() => {
    if (isFocused) {
      startPolling(30000)
    } else {
      stopPolling
    }
  }, [isFocused])
  const stats = summary?.myBookingsSummary;
  // const stats = mock.data?.getHostBookings;
  const properties = mockProperties.data?.myProperties || [];
  // const stats = data?.getHostBookings;
  // const properties = propertiesData?.myProperties || [];

  const handleApplyFilters = (newFilters: FilterState) => {
    setFilters(newFilters);
    console.log(newFilters.dateRange)
    setStoreFilter('filter', {
      query: newFilters.searchQuery,
      status: newFilters.status[0],
      startDate: newFilters.dateRange.start??undefined,
      endDate: newFilters.dateRange.end??undefined,
      guestType: newFilters.guestType,
      minPrice: newFilters.priceRange.min,
      maxPrice: newFilters.priceRange.max
    })
    // TODO: Apply filters to the queries
    console.log('Applied filters:', newFilters);
    // You can pass these filters as props to your tab screens
    // or use React Context to share them globally
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.searchQuery) count++;
    if (filters.propertyId) count++;
    if (filters.status.length > 0) count++;
    if (filters.dateRange.start || filters.dateRange.end) count++;
    if (filters.guestType !== 'all') count++;
    if (filters.priceRange.min > 0 || filters.priceRange.max < 10000) count++;
    return count;
  };

  const activeFiltersCount = getActiveFiltersCount();
  // console.log({activeFiltersCount, filters})

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Bookings
          </Text>
          <TouchableOpacity
            style={[styles.searchButton, { backgroundColor: theme.colors.card }]}
            onPress={() => setSearchModalVisible(true)}
          >
            <Ionicons name="search" size={20} color={theme.colors.text} />
            {activeFiltersCount > 0 && (
              <View style={[styles.filterBadge, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Active Filters Preview */}
        {activeFiltersCount > 0 && (
          <View style={[styles.activeFiltersContainer, {paddingBottom:0, backgroundColor: theme.colors.card }]}>
            <View style={styles.activeFiltersHeader}>
              <Ionicons name="filter" size={16} color={theme.colors.primary} />
              <Text style={[styles.activeFiltersText, { color: theme.colors.text }]}>
                {activeFiltersCount} filter{activeFiltersCount > 1 ? 's' : ''} active
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.clearFiltersButton, { backgroundColor: theme.colors.backgroundSec }]}
              onPress={() => {
                setFilters({
                  searchQuery: '',
                  propertyId: null,
                  status: [],
                  dateRange: { start: null, end: null },
                  sortBy: 'date',
                  sortOrder: 'desc',
                  priceRange: { min: 0, max: 10000 },
                  guestType: 'all',
                });
                clearFilter()
              }}
            >
              <Ionicons name="close" size={14} color={theme.colors.textSecondary} />
              <Text style={[styles.clearFiltersText, { color: theme.colors.textSecondary }]}>
                Clear
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Tabs */}
      <Tab.Navigator
        tabBar={(props) => (
          <StatsTabBar {...props} theme={theme} stats={stats} activeFilters={activeFiltersCount} />
        )}
      >
        <Tab.Screen name="Upcoming" component={UpcomingTabScreen} />
        <Tab.Screen name="Active" component={ActiveTabScreen} />
        <Tab.Screen name="All" component={AllTabScreen} />
      </Tab.Navigator>

      {/* Search & Filter Modal */}
      <SearchFilterModal
        visible={searchModalVisible}
        onClose={() => setSearchModalVisible(false)}
        onApply={handleApplyFilters}
        properties={properties}
        initialFilters={filters}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  activeFiltersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
  },
  activeFiltersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeFiltersText: {
    fontSize: 13,
    fontWeight: '600',
  },
  clearFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  clearFiltersText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsBar: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginHorizontal: 20,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statBadge: {
    minWidth: 40,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginHorizontal: 8,
  },
}); 



// // screens/host/BookingsDashboardScreen.tsx

// import SearchFilterModal, { FilterState } from '@/components/ui/bookings/SearchModal';
// import { useTheme } from '@/theme/theme';
// import { gql, useQuery } from '@apollo/client';
// import { Ionicons } from '@expo/vector-icons';
// import { MaterialTopTabBarProps, createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
// import React, { useState } from 'react';
// import {
//   StyleSheet,
//   Text,
//   TouchableOpacity,
//   View
// } from 'react-native';

// // Import tab screens
// import ActiveTabScreen from './ActiveTab';
// import UpcomingTabScreen from './UpcomingTab';
// import { useBookingFilter } from '@/stores/bookingStore';

// function StatsTabBar({
//   state,
//   navigation,
//   theme,
//   stats,
//   activeFilters,
// }: MaterialTopTabBarProps & {
//   theme: any;
//   stats: any;
//   activeFilters: number;
// }) {
//   const tabs = [
//     {
//       key: 'Upcoming',
//       label: 'Upcoming',
//       value: stats?.upcoming_count ?? 0,
//       color: theme.colors.primary,
//       bg: theme.colors.primary + '15',
//     },
//     {
//       key: 'Active',
//       label: 'Active',
//       value: stats?.active_count ?? 0,
//       color: theme.colors.success,
//       bg: theme.colors.success + '15',
//     },
//     {
//       key: 'All',
//       label: 'All',
//       value: stats?.total ?? 0,
//       color: theme.colors.text,
//       bg: theme.colors.backgroundSec,
//     },
//   ];

//   return (
//     <View style={[styles.statsBar, { marginVertical: 10, backgroundColor: theme.colors.card }]}>
//       {tabs.map((tab, index) => {
//         const isActive = state.routes[state.index].name === tab.key;

//         return (
//           <React.Fragment key={tab.key}>
//             <TouchableOpacity
//               style={styles.statItem}
//               onPress={() => navigation.navigate(tab.key)}
//               activeOpacity={0.8}
//             >
//               <View
//                 style={[
//                   styles.statBadge,
//                   {
//                     backgroundColor: isActive ? tab.bg : theme.colors.background,
//                     borderWidth: isActive ? 0 : 1,
//                     borderColor: theme.colors.border,
//                   },
//                 ]}
//               >
//                 <Text
//                   style={[
//                     styles.statValue,
//                     { color: isActive ? tab.color : theme.colors.textSecondary },
//                   ]}
//                 >
//                   {tab.value}
//                 </Text>
//               </View>

//               <Text
//                 style={[
//                   styles.statLabel,
//                   {
//                     color: isActive
//                       ? theme.colors.text
//                       : theme.colors.textSecondary,
//                     fontWeight: isActive ? '700' : '500',
//                   },
//                 ]}
//               >
//                 {tab.label}
//               </Text>
//             </TouchableOpacity>

//             {index < tabs.length - 1 && <View style={styles.statDivider} />}
//           </React.Fragment>
//         );
//       })}
//     </View>
//   );
// }

// const GET_BOOKINGS_SUMMARY = gql`
//   query GetBookingsSummary {
//     getHostBookings(limit: 1) {
//       pending_count
//       upcoming_count
//       active_count
//       total
//     }
//   }
// `;

// const GET_HOST_PROPERTIES = gql`
//   query GetHostProperties {
//     myProperties {
//       id
//       title
//     }
//   }
// `;

// const mock = {
//   "data": {
//     "getHostBookings": {
//       "__typename": "BookingSummary",
//       "pending_count": 5,
//       "upcoming_count": 12,
//       "active_count": 3,
//       "total": 45
//     }
//   }
// };

// const mockProperties = {
//   data: {
//     myProperties: [
//       { id: "1", title: "Luxury Penthouse Victoria Island" },
//       { id: "2", title: "Modern Apartment Lekki" },
//       { id: "3", title: "Beachfront Villa" },
//     ]
//   }
// };

// const Tab = createMaterialTopTabNavigator();

// export default function BookingsDashboardScreen() {
//   const { theme } = useTheme();
//   const [searchModalVisible, setSearchModalVisible] = useState(false);
//   const {setFilter, endDate, startDate, query, maxPrice, minPrice, status, guestType} = useBookingFilter()
//   // const [filters, setFilters] = useState<FilterState>({
//   //   searchQuery: '',
//   //   propertyId: null,
//   //   status: [],
//   //   dateRange: { start: null, end: null },
//   //   sortBy: 'date',
//   //   sortOrder: 'desc',
//   //   priceRange: { min: 0, max: 10000 },
//   //   guestType: 'all',
//   // });

//   const { data, loading, refetch } = useQuery(GET_BOOKINGS_SUMMARY, {
//     // pollInterval: 30000, // Refresh every 30 seconds
//   });

//   const { data: propertiesData } = useQuery(GET_HOST_PROPERTIES);

//   const stats = mock.data?.getHostBookings;
//   const properties = mockProperties.data?.myProperties || [];
//   // const stats = data?.getHostBookings;
//   // const properties = propertiesData?.myProperties || [];

//   const handleApplyFilters = (newFilters: FilterState) => {
//     // setFilters(newFilters);
//     // TODO: Apply filters to the queries
//     console.log('Applied filters:', newFilters);
//     // You can pass these filters as props to your tab screens
//     // or use React Context to share them globally
//   };

//   const getActiveFiltersCount = () => {
//     let count = 0;
//     if (query) count++;
//     if (status && status.length > 0) count++;
//     if (startDate|| endDate) count++;
//     if (guestType !== 'all') count++;
//     if ((minPrice && maxPrice) && (minPrice > 0 || maxPrice < 10000)) count++;
//     return count;
//   };

//   const activeFiltersCount = getActiveFiltersCount();
//   // console.log({activeFiltersCount, filters})

//   return (
//     <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
//       {/* Header */}
//       <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
//         <View style={styles.headerTop}>
//           <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
//             Bookings
//           </Text>
//           <TouchableOpacity
//             style={[styles.searchButton, { backgroundColor: theme.colors.card }]}
//             onPress={() => setSearchModalVisible(true)}
//           >
//             <Ionicons name="search" size={20} color={theme.colors.text} />
//             {activeFiltersCount > 0 && (
//               <View style={[styles.filterBadge, { backgroundColor: theme.colors.primary }]}>
//                 <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
//               </View>
//             )}
//           </TouchableOpacity>
//         </View>

//         {/* Active Filters Preview */}
//         {activeFiltersCount > 0 && (
//           <View style={[styles.activeFiltersContainer, {paddingBottom:0, backgroundColor: theme.colors.card }]}>
//             <View style={styles.activeFiltersHeader}>
//               <Ionicons name="filter" size={16} color={theme.colors.primary} />
//               <Text style={[styles.activeFiltersText, { color: theme.colors.text }]}>
//                 {activeFiltersCount} filter{activeFiltersCount > 1 ? 's' : ''} active
//               </Text>
//             </View>
//             <TouchableOpacity
//               style={[styles.clearFiltersButton, { backgroundColor: theme.colors.backgroundSec }]}
//               onPress={() => {
//                 setFilters({
//                   searchQuery: '',
//                   propertyId: null,
//                   status: [],
//                   dateRange: { start: null, end: null },
//                   sortBy: 'date',
//                   sortOrder: 'desc',
//                   priceRange: { min: 0, max: 10000 },
//                   guestType: 'all',
//                 });
//               }}
//             >
//               <Ionicons name="close" size={14} color={theme.colors.textSecondary} />
//               <Text style={[styles.clearFiltersText, { color: theme.colors.textSecondary }]}>
//                 Clear
//               </Text>
//             </TouchableOpacity>
//           </View>
//         )}
//       </View>

//       {/* Tabs */}
//       <Tab.Navigator
//         tabBar={(props) => (
//           <StatsTabBar {...props} theme={theme} stats={stats} activeFilters={activeFiltersCount} />
//         )}
//       >
//         <Tab.Screen name="Upcoming" component={UpcomingTabScreen} />
//         <Tab.Screen name="Active" component={ActiveTabScreen} />
//         {/* <Tab.Screen name="All" component={AllTabScreen} /> */}
//       </Tab.Navigator>

//       {/* Search & Filter Modal */}
//       <SearchFilterModal
//         visible={searchModalVisible}
//         onClose={() => setSearchModalVisible(false)}
//         onApply={handleApplyFilters}
//         properties={properties}
//         initialFilters={filters}
//       />
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//   },
//   header: {
//     paddingTop: 60,
//     paddingBottom: 16,
//   },
//   headerTop: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'space-between',
//     paddingHorizontal: 20,
//   },
//   headerTitle: {
//     fontSize: 32,
//     fontWeight: '800',
//     letterSpacing: -1,
//   },
//   searchButton: {
//     width: 44,
//     height: 44,
//     borderRadius: 22,
//     alignItems: 'center',
//     justifyContent: 'center',
//     elevation: 2,
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.1,
//     shadowRadius: 4,
//     position: 'relative',
//   },
//   filterBadge: {
//     position: 'absolute',
//     top: -4,
//     right: -4,
//     width: 20,
//     height: 20,
//     borderRadius: 10,
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   filterBadgeText: {
//     color: '#FFF',
//     fontSize: 11,
//     fontWeight: '700',
//   },
//   activeFiltersContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'space-between',
//     marginHorizontal: 20,
//     marginTop: 12,
//     padding: 12,
//     borderRadius: 12,
//   },
//   activeFiltersHeader: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 8,
//   },
//   activeFiltersText: {
//     fontSize: 13,
//     fontWeight: '600',
//   },
//   clearFiltersButton: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 4,
//     paddingHorizontal: 10,
//     paddingVertical: 6,
//     borderRadius: 8,
//   },
//   clearFiltersText: {
//     fontSize: 12,
//     fontWeight: '600',
//   },
//   statsBar: {
//     flexDirection: 'row',
//     paddingVertical: 16,
//     paddingHorizontal: 12,
//     marginHorizontal: 20,
//     borderRadius: 16,
//     elevation: 2,
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.1,
//     shadowRadius: 4,
//   },
//   statItem: {
//     flex: 1,
//     alignItems: 'center',
//   },
//   statBadge: {
//     minWidth: 40,
//     paddingVertical: 8,
//     paddingHorizontal: 12,
//     borderRadius: 12,
//     marginBottom: 6,
//   },
//   statValue: {
//     fontSize: 20,
//     fontWeight: '800',
//     textAlign: 'center',
//   },
//   statLabel: {
//     fontSize: 11,
//     fontWeight: '600',
//     textAlign: 'center',
//   },
//   statDivider: {
//     width: 1,
//     backgroundColor: 'rgba(0,0,0,0.08)',
//     marginHorizontal: 8,
//   },
// }); 

