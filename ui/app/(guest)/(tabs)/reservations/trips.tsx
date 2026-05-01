// screens/TripsDashboard.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
// import { useBookingsStore, Booking, BookingStatus } from '../store/bookingsStore';
import { ThemedText } from '@/components/ThemedText';
import { useAuthStore } from '@/stores/authStore';
import { Booking } from '@/stores/bookingStore';
import { useTheme } from '@/theme/theme';
import { gql, useQuery } from '@apollo/client';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 40;

const GET_MY_BOOKINGS = gql`
query MyBookings {
  myBookings {
    id
    property {
      id
      title
      images {
        id
        cdn_url
      }
      address {
        city
        country
        street
        postal_code
      }
    }
    checkOut
    checkIn
    guestCount
    cancellationPolicy
    currency
    specialRequests
    totalPrice
    type
    source
    status
    updated_at
    created_at
  }
}
`

export default function TripsDashboard({ navigation }: any) {
  const { theme } = useTheme();
  const {height} = Dimensions.get('screen')
  const user = useAuthStore((state) => state.user)
//   const bookings = useBookingsStore((state) => state.bookings);
  const [activeTab, setActiveTab] = useState<'current' | 'upcoming' | 'past'>('current');
  const [openDropDown, setOpenDropDown] = useState(false)
  const {data, error, loading, refetch} = useQuery(GET_MY_BOOKINGS, {skip: !user})
  const [isRefetching, setIsRefetching] = useState(false)
  const bookings: any[] = data?.myBookings || []
  // console.log(data?.myBookings[0].property.images)
  console.log({error})
  const categorizedBookings = useMemo(() => {
    // console.log({bookings})
    const now = new Date();
    
    const current = bookings.filter(
      (b) =>
        b.status === 'active' ||
        (b.status === 'confirmed' &&
          new Date(b.checkIn) <= new Date(now.getTime() + 24 * 60 * 60 * 1000))
    );

    const upcoming = bookings.filter(
      (b) => (b.status === 'confirmed' || b.status === 'pending') &&
        new Date(b.checkIn) > new Date(now.getTime() + 24 * 60 * 60 * 1000)
    );

    const past = bookings.filter(
      (b) => b.status === 'cancelled' || b.status === 'completed'
    );

    return { current, upcoming, past };
  }, [bookings]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        await refetch();
      } catch (error) {
        
      }
    };

    fetchData();
  }, [user]);


  const activeBookings = categorizedBookings[activeTab];

  const getDaysInfo = (booking: Booking) => {
    const now = new Date();
    const checkIn = new Date(booking.checkIn);
    const checkOut = new Date(booking.checkOut);
    
    if (booking.status === 'active') {
      const daysLeft = Math.ceil((checkOut.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { label: 'Days remaining', value: daysLeft };
    } else if (booking.status === 'completed') {
      const daysUntil = Math.ceil((checkIn.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { label: 'Days until check-in', value: daysUntil };
    } else {
      const totalDays = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
      return { label: 'Duration', value: totalDays };
    }
  };

  const formatDateRange = (checkIn: string, checkOut: string) => {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    
    const monthStart = start.toLocaleDateString('en-US', { month: 'short' });
    const monthEnd = end.toLocaleDateString('en-US', { month: 'short' });
    const dayStart = start.getDate();
    const dayEnd = end.getDate();
    
    if (monthStart === monthEnd) {
      return `${monthStart} ${dayStart} - ${dayEnd}`;
    }
    return `${monthStart} ${dayStart} - ${monthEnd} ${dayEnd}`;
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'hotel':
        return 'Hotel Stay';
      case 'apartment':
        return 'Rental Property';
      case 'purchase':
        return 'Property Purchase';
      default:
        return type;
    }
  };

  const renderTripCard = (booking: any) => {
    const daysInfo = getDaysInfo(booking);
    const isToday = new Date(booking.checkIn).toDateString() === new Date().toDateString();

    return (
      <TouchableOpacity
        key={booking.id}
        style={[styles.tripCard, { backgroundColor: theme.colors.card }]}
        // onPress={() => navigation.navigate('BookingDetails', { bookingId: booking.id })}
        onPress={() => router.push({
          pathname: '/reservations/details/[id]',
          params: {id: booking.id}
        })}
        activeOpacity={0.9}
      >
        {/* Image Section with Gradient Overlay */}
        <View style={styles.imageSection}>
          <Image
            source={{ uri:  
              booking.property.images[0]?.cdn_url || "https://res.cloudinary.com/dajzo2zpq/image/upload/v1773301917/properties/ghnebuerhfw7v4x0eo8r.jpg"
            }}
            style={styles.tripImage}
          />
          {/* <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={styles.imageGradient}
          /> */}
          
          {/* Type Badge */}
          <View style={[styles.typeBadge, { backgroundColor: theme.colors.card }]}>
            <Ionicons
              name={booking.type === 'hotel' ? 'bed' : booking.type === 'apartment' ? 'home' : 'key'}
              size={14}
              color={theme.colors.primary}
            />
            <Text style={[styles.typeText, { color: theme.colors.text }]}>
              {getTypeLabel(booking.type)}
            </Text>
          </View>

          {/* Today Badge */}
          {isToday && (
            <View style={[styles.todayBadge, { backgroundColor: theme.colors.success }]}>
              <Text style={styles.todayText}>TODAY</Text>
            </View>
          )}

          {/* Location on Image */}
          <View style={styles.locationOverlay}>
            <Text style={styles.cityText}>{booking.property.address.city}</Text>
            <Text style={styles.countryText}>{booking.property.address.country}</Text>
          </View>
        </View>

        {/* Content Section */}
        <View style={styles.cardContent}>
          <Text style={[styles.propertyName, { color: theme.colors.text }]} numberOfLines={2}>
            {booking.property.title}
          </Text>

          <View style={styles.dateRow}>
            <Ionicons name="calendar" size={16} color={theme.colors.primary} />
            <Text style={[styles.dateText, { color: theme.colors.text }]}>
              {formatDateRange(booking.checkIn, booking.checkOut)}
            </Text>
          </View>

          {/* Info Grid */}
          <View style={styles.infoGrid}>
            <View style={[styles.infoBox, { backgroundColor: theme.colors.backgroundSec }]}>
              <Text style={[styles.infoValue, { color: theme.colors.primary }]}>
                {daysInfo.value}
              </Text>
              <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>
                {daysInfo.label}
              </Text>
            </View>

            <View style={[styles.infoBox, { backgroundColor: theme.colors.backgroundSec }]}>
              <Text style={[styles.infoValue, { color: theme.colors.text }]}>
                {booking.guestCount}
              </Text>
              <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>
                {booking.guestCount === 1 ? 'Guest' : 'Guests'}
              </Text>
            </View>

            <View style={[styles.infoBox, { backgroundColor: theme.colors.backgroundSec }]}>
              <Text style={[styles.infoValue, { color: theme.colors.text }]}>
                {booking.currency}
              </Text>
              <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>
                {booking.totalPrice.toLocaleString()}
              </Text>
            </View>
          </View>

          {/* Action Button */}
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.backgroundSec }]}
            onPress={() => {
              if (booking.status === 'active' || isToday) {
                // Navigate to check-in instructions or directions
                router.push({
                  pathname: '/reservations/details/[id]',
                  params: {id: booking.id}
                })
              } else {
                router.push({
                  pathname: '/reservations/details/[id]',
                  params: {id: booking.id}
                })
              }
            }}
          >
            <Text style={[styles.actionButtonText, {color: theme.colors.text}]}>
              {booking.status === 'active' ? 'Get directions' : isToday ? 'Check-in Info' : 'View Trip'}
            </Text>
            <Ionicons name="arrow-forward" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const refetchData = async() => {
    if (isRefetching) return
    try {
      setIsRefetching(true)
      await refetch()
    } catch (error) {
      Alert.alert('Failed to Refetch Data')
    } finally {
      setIsRefetching(false)
    }
  }

  if (loading) return (
    <View style={{justifyContent: 'center', alignItems: 'center', height}}>
      <ActivityIndicator size={'large'} color={theme.colors.text} />
    </View>
  )
  if (error) {
    // unhandled
  }

  if (!user) return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}

      {/* Not Logged In Content */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.notLoggedInContainer}>
          {/* Icon Section */}
          <View style={[styles.notLoggedInIconContainer, { backgroundColor: theme.colors.backgroundSec }]}>
            <Ionicons name="log-in-outline" size={64} color={theme.colors.primary} />
          </View>

          {/* Main Message */}
          <Text style={[styles.notLoggedInTitle, { color: theme.colors.text }]}>
            Sign in to view your trips
          </Text>
          <Text style={[styles.notLoggedInSubtitle, { color: theme.colors.textSecondary }]}>
            Keep track of your reservations and get real-time updates on your bookings
          </Text>

          {/* Features List */}
          <View style={styles.featuresList}>
            {[
              { icon: 'calendar-outline', text: 'Track current and upcoming trips' },
              { icon: 'notifications-outline', text: 'Get booking updates and reminders' },
              { icon: 'map-outline', text: 'Access directions and check-in info' },
              { icon: 'time-outline', text: 'View your booking history' },
            ].map((feature, index) => (
              <View key={index} style={styles.featureItem}>
                <View style={[styles.featureIconContainer, { backgroundColor: theme.colors.card }]}>
                  <Ionicons name={feature.icon as any} size={22} color={theme.colors.primary} />
                </View>
                <Text style={[styles.featureText, { color: theme.colors.text }]}>
                  {feature.text}
                </Text>
              </View>
            ))}
          </View>

          {/* Action Buttons */}
          <TouchableOpacity
            style={[styles.signInButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => router.push('/(guest)/(auth)/sign_in')}
            activeOpacity={0.8}
          >
            <Text style={styles.signInButtonText}>Sign In</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.signUpRow}>
            <Text style={[styles.signUpText, { color: theme.colors.textSecondary }]}>
              Don't have an account?
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(guest)/(auth)/sign_up')}
              activeOpacity={0.7}
            >
              <Text style={[styles.signUpLink, { color: theme.colors.primary }]}>
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>

          {/* Browse Properties Link */}
          <View style={[styles.divider, { backgroundColor: theme.colors.backgroundSec }]} />
          
          <TouchableOpacity
            style={[styles.browseButton, { backgroundColor: theme.colors.card }]}
            onPress={() => router.push('/(guest)/(tabs)/home/(toptabs)/homes')}
            activeOpacity={0.8}
          >
            <Ionicons name="search-outline" size={20} color={theme.colors.text} />
            <Text style={[styles.browseButtonText, { color: theme.colors.text }]}>
              Browse Properties
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  )

  console.log({user})
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Custom Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
              Your Journey
            </Text>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              Trips
            </Text>
          </View>
          
          <TouchableOpacity
            style={[styles.menuButton, { backgroundColor: theme.colors.card }]}
            onPress={() => setOpenDropDown(!openDropDown)}
          >
            <Ionicons name="options-outline" size={22} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
        {openDropDown && (
          <View style={[styles.dropDown, {backgroundColor: theme.colors.card}]}>
            {['current', 'upcoming', 'past'].map((item) => (
              <TouchableOpacity key={item} onPress={() => {
                setActiveTab(item as any)
                setOpenDropDown(false)
              }}>
                <ThemedText style={{fontSize: 16, fontWeight: 600, textDecorationLine: activeTab == item? 'underline': 'none', textTransform: 'capitalize'}}>
                  {item}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={{position: 'relative', paddingTop: 10}}>
          <View style={[styles.activeTab, {paddingVertical: 10, paddingHorizontal: 20, backgroundColor: theme.colors.card, borderRadius: 20}]}>
            <ThemedText style={{textTransform: 'capitalize'}}>{activeTab}</ThemedText>
          </View>
        </View>
      </View>

      {/* Trips List */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchData} />}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {activeBookings.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconContainer, { backgroundColor: theme.colors.backgroundSec }]}>
              <Ionicons
                name={
                  activeTab === 'current'
                    ? 'location-outline'
                    : activeTab === 'upcoming'
                    ? 'calendar-outline'
                    : 'time-outline'
                }
                size={48}
                color={theme.colors.textSecondary}
              />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
              {activeTab === 'current' && "No current trips"}
              {activeTab === 'upcoming' && "No upcoming trips"}
              {activeTab === 'past' && "No past trips"}
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
              {activeTab === 'past'
                ? "Your completed bookings will appear here"
                : "Start exploring to book your next adventure"}
            </Text>
            {activeTab !== 'past' && (
              <TouchableOpacity
                style={[styles.exploreButton, { backgroundColor: theme.colors.primary }]}
                onPress={() => router.push('/(guest)/(tabs)/home/(toptabs)/homes')}
              >
                <Text style={styles.exploreButtonText}>Explore Properties</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          activeBookings.map((booking) => renderTripCard(booking))
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    // marginBottom: 24,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  menuButton: {
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
  },
  dropDown: {
    position: 'absolute', 
    top: 120, 
    alignSelf: 'flex-end', 
    marginRight: 20, 
    zIndex: 10,
    padding: 20,
    borderRadius: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    gap: 15,
    width: 120
  },
  tabContainer: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  activeTab: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 10,
    paddingBottom: 50
  },
  tripCard: {
    borderRadius: 24,
    marginBottom: 20,
    // overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    padding: 10
  },
  imageSection: {
    position: 'relative',
    height: 240,
  },
  tripImage: {
    width: '100%',
    height: '100%',
    // backgroundColor: '#f0f0f0',
    borderRadius: 25
  },
  imageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  typeBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  todayBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  todayText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  locationOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    width: '100%'
  },
  cityText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 2,
    textTransform: 'capitalize',
  },
  countryText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'capitalize',
    flex: 1
  },
  cardContent: {
    paddingHorizontal: 10,
    paddingVertical: 20
  },
  propertyName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    lineHeight: 26,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  dateText: {
    fontSize: 15,
    fontWeight: '600',
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  infoBox: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  infoValue: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  exploreButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
  },
  exploreButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  shadow: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },

  // Not Logged In Styles
  notLoggedInContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  notLoggedInIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  notLoggedInTitle: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  notLoggedInSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
    paddingHorizontal: 10,
  },
  featuresList: {
    width: '100%',
    marginBottom: 40,
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 4,
  },
  featureIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
    width: '100%',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    marginBottom: 20,
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  signUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 32,
  },
  signUpText: {
    fontSize: 15,
    fontWeight: '500',
  },
  signUpLink: {
    fontSize: 15,
    fontWeight: '700',
  },
  divider: {
    width: '100%',
    height: 1,
    marginBottom: 24,
  },
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: '100%',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  browseButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});