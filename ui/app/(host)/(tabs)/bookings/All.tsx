// screens/host/UpcomingTabScreen.tsx
import { useBookingFilter } from '@/stores/bookingStore';
import { useTheme } from '@/theme/theme';
import { gql, useQuery } from '@apollo/client';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const GET_All_BOOKINGS = gql`
  query MyBookingsByStatus($input: SearchBookingsInput!) {
  myBookingsByStatus(input: $input) {
    amountPaid
    cancellationPolicy
    checkIn
    checkOut
    created_at
    currency
    guest {
      id
      name
      email
      phone
    }
    id
    property {
      id
      title
    }
    status
    totalPrice
    source
    unit {
      id
      unit_code
    }
    guestCount
    payment_status
    specialRequests
    room_type {
      id
      name
    }
  }
}
`;

export default function AllTabScreen() {
  const { theme } = useTheme();
  const filters = useBookingFilter(state => state.filter)
  const { data, loading, refetch } = useQuery(GET_All_BOOKINGS, {
    variables: {
      input: {...filters, status: filters?.status??undefined}
    }
  });

  

  // useEffect(() => {
  //   refetch({status: 'confirmed', minPrice: 100})
  //   console.log({filters})
  // }, [filters])

  // For development — remove when query is ready
//   const bookings = mock.data?.myBookingsByStatus || [];
  const bookings = data?.myBookingsByStatus || [];

  const getDaysUntilCheckIn = (checkIn: string) => {
    const now = new Date();
    const checkInDate = new Date(checkIn);
    const diffTime = checkInDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return "Checking in today";
    if (diffDays === 1) return "Tomorrow";
    return `In ${diffDays} days`;
  };

  const renderBookingCard = (booking: any) => {
    const daysUntil = getDaysUntilCheckIn(booking.checkIn);
    const isSoon = daysUntil.includes("today") || daysUntil.includes("Tomorrow");
    const nights = Math.ceil(
      (new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / (1000 * 60 * 60 * 24)
    );
    // console.log(booking.property)

    return (
      <View
        key={booking.id}
        style={[
          styles.bookingCard,
          { backgroundColor: theme.colors.card },
          isSoon && { borderLeftWidth: 4, borderLeftColor: theme.colors.warning },
        ]}
      >
        {/* Status Badge */}
        {/* <View style={[styles.statusBadge, { backgroundColor: theme.colors.success + '30' }]}>
          <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
          <Text style={[styles.statusText, { color: theme.colors.success }]}>
            CONFIRMED
          </Text>
        </View> */}

        {/* Property */}
        <View style={styles.propertySection}>
          <View style={styles.propertyHeader}>
            <View style={[styles.propertyIcon, { backgroundColor: theme.colors.primary + '15' }]}>
              <Ionicons name="business" size={20} color={theme.colors.primary} />
            </View>
            <View style={styles.propertyInfo}>
              <Text style={[styles.propertyTitle, { color: theme.colors.text }]} numberOfLines={1}>
                {booking.property.title}
              </Text>
              <Text style={[styles.propertySubtitle, { color: theme.colors.textSecondary }]}>
                {booking.room_type?.name || 'Unit'} • {booking.unit?.unit_code || '#'}
              </Text>
            </View>
            <Text style={[styles.bookingId, { color: theme.colors.textSecondary }]}>
              #{booking.id}
            </Text>
          </View>
        </View>

        {/* Guest & Countdown */}
        <View style={styles.guestSection}>
          <View style={styles.guestRow}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
              <Text style={styles.avatarText}>{booking.guest.name.charAt(0)}</Text>
            </View>
            <View style={styles.guestInfo}>
              <Text style={[styles.guestName, { color: theme.colors.text }]}>
                  {booking.guest.name}
                </Text>
                <Text style={[styles.guestContact, { color: theme.colors.textSecondary }]}>
                  {booking.guest.email}
                </Text>
              {/* <Text style={[styles.countdown, { color: isSoon ? theme.colors.warning : theme.colors.text }]}>
                Check-in: {new Date(booking.checkIn).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} ({daysUntil})
              </Text> */}
            </View>
          </View>
        </View>

        {/* Summary Line */}
        <View style={styles.detailsSection}>
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Ionicons name="calendar-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>
                  Check-in
                </Text>
                <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                  {new Date(booking.checkIn).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
        
              {/* <View style={styles.detailItem}>
                <Ionicons name="calendar" size={16} color={theme.colors.textSecondary} />
                <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>
                  Check-out
                </Text>
                <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                  {new Date(booking.checkOut).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View> */}

              <View style={styles.detailItem}>
                <Ionicons name="people-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>
                  Guests
                </Text>
                <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                  {booking.guestCount || 1}
                </Text>
              </View>
        
              <View style={styles.detailItem}>
                <Ionicons name="moon-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>
                  Nights
                </Text>
                <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                  {nights}
                </Text>
              </View>
            </View>
        
            <View style={styles.detailRow}>
              {/* <View style={styles.detailItem}>
                <Ionicons name="people-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>
                  Guests
                </Text>
                <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                  {booking.guestCount || 1}
                </Text>
              </View> */}
        
              <View style={[styles.detailItem, { flex: 2 }]}>
                <Ionicons name="cash-outline" size={16} color={theme.colors.primary} />
                <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>
                  Paid
                </Text>
                <Text style={[styles.priceValue, { color: theme.colors.primary }]}>
                  ${booking.amountPaid.toFixed(2)}
                </Text>
              </View>

              <View style={[styles.detailItem, { flex: 2 }]}>
                <Ionicons name="cash-outline" size={16} color={theme.colors.primary} />
                <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>
                  Total
                </Text>
                <Text style={[styles.priceValue, { color: theme.colors.primary }]}>
                  ${booking.totalPrice.toFixed(2)}
                </Text>
              </View>
            </View>
        </View>

        {/* Checklist */}
        <View style={[styles.checklist, { backgroundColor: theme.colors.backgroundSec }]}>
          <Text style={[styles.checklistTitle, { color: theme.colors.textSecondary }]}>
            Pre-arrival checklist
          </Text>
          <View style={styles.checkItem}>
            <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
            <Text style={[styles.checkText, { color: theme.colors.text }]}>Payment received</Text>
          </View>
          <View style={styles.checkItem}>
            <Ionicons name="time-outline" size={18} color={theme.colors.warning} />
            <Text style={[styles.checkText, { color: theme.colors.text }]}>Check-in instructions pending</Text>
          </View>
          {/* Add more dynamic items later */}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.backgroundSec }]}
            onPress={() => router.push({
              pathname: '/bookings/details',
              params: {id: booking.id}
            })}
          >
            <Ionicons name="information-circle-outline" size={20} color={theme.colors.text} />
            <Text style={[styles.actionText, { color: theme.colors.text }]}>Details</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.primary + '20' }]}
            onPress={() => router.push({
              pathname: '/(host)/chats',
              params: {chat: JSON.stringify({
                recipientId: booking.guest.id,
                propertyId: booking.property.id,
                bookingId: booking.id
              })}
            })}
          >
            <Ionicons name="chatbubble-outline" size={20} color={theme.colors.primary} />
            <Text style={[styles.actionText, { color: theme.colors.primary }]}>Message</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.backgroundSec }]}
            onPress={() => Alert.alert('More', 'Modify / Cancel / Notes')}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.textSecondary} />
            <Text style={[styles.actionText, { color: theme.colors.textSecondary }]}>More</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
    >
      {(loading && bookings.length === 0) ? (
        // <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 60 }} />
        <></>
      ) : bookings.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>No bookings</Text>
          <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
            Bookings will appear here
          </Text>
        </View>
      ) : (
        bookings.map((booking: any) => renderBookingCard(booking))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  bookingCard: {
    borderRadius: 16,
    marginBottom: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  statusBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  propertySection: { marginBottom: 16 },
  propertyHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  propertyIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  propertyInfo: { flex: 1 },
  propertyTitle: { fontSize: 16, fontWeight: '700' },
  propertySubtitle: { fontSize: 13, marginTop: 2 },
  bookingId: { fontSize: 12, fontWeight: '600' },
  guestSection: { marginBottom: 12 },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  guestInfo: { flex: 1 },
  guestName: { fontSize: 15, fontWeight: '700' },
  guestContact: {
    fontSize: 13,
  },
  detailsSection: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  detailItem: {
    flex: 1,
    gap: 4,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  countdown: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  summaryLine: { marginVertical: 12 },
  summaryText: { fontSize: 14, fontWeight: '500' },
  checklist: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  checklistTitle: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  checkText: { fontSize: 14 },
  actions: { flexDirection: 'row', gap: 10 },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionText: { fontSize: 14, fontWeight: '600' },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  emptySubtitle: { fontSize: 15, textAlign: 'center', paddingHorizontal: 40 },
});