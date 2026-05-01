// screens/host/ActiveTabScreen.tsx
import { useBookingFilter } from '@/stores/bookingStore';
import { useTheme } from '@/theme/theme';
import { gql, useMutation, useQuery } from '@apollo/client';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

const GET_ACTIVE_BOOKINGS = gql`
  query MyBookingsByStatus($input: SearchBookingsInput!) {
    myBookingsByStatus(input: $input) {
      id
      checkIn
      checkOut
      totalPrice
      amountPaid
      currency
      status
      payment_status
      guestCount
      specialRequests
      created_at
      guest {
        id
        name
        email
        phone
      }
      property {
        id
        title
      }
      room_type {
        id
        name
      }
      unit {
        id
        unit_code
      }
    }
  }
`;

const mock = {
  "data": {
    "myBookingsByStatus": [
      {
        "__typename": "Booking",
        "id": "book_7721",
        "amountPaid": 45000,
        "totalPrice": 120000,
        "currency": "NGN",
        "status": "CONFIRMED",
        "payment_status": "PARTIAL",
        specialRequests: "geoiwow",
        "source": "DIRECT",
        "guestCount": 2,
        "cancellationPolicy": "MODERATE",
        "checkIn": "2026-03-15T14:00:00Z",
        "checkOut": "2026-03-20T11:00:00Z",
        "created_at": "2026-02-01T09:30:00Z",
        "guest": {
          "__typename": "User",
          "id": "user_990",
          "name": "Chidi Okoro",
          "email": "chidi@example.com",
          "phone": "+2348031234567"
        },
        "property": {
          "__typename": "Property",
          "id": "prop_441",
          "title": "Luxury Penthouse Victoria Island",
          "property_type": "APARTMENT"
        },
        "room_type": {
          "__typename": "RoomType",
          "id": "room_552",
          "name": "Executive Suite",
          "base_price": 24000
        },
        "unit": {
          "__typename": "RoomUnit",
          "id": "unit_101",
          "unit_code": "VI-P-101"
        }
      }
    ]
  }
}

const REPORT_ISSUE = gql`
  mutation ReportIssue($bookingId: Int!, $issue: String!) {
    reportIssue(bookingId: $bookingId, issue: $issue) {
      id
      issue
      status
    }
  }
`;

export default function ActiveTabScreen() {
  const { theme } = useTheme();
  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [issueText, setIssueText] = useState('');

  const filters = useBookingFilter(state => state.filter)
  const { data, loading, refetch } = useQuery(GET_ACTIVE_BOOKINGS, {
    variables: {
      input: { ...filters, status: filters?.status??'active' }
    },
  });

  const [reportIssue] = useMutation(REPORT_ISSUE, {
    onCompleted: () => {
      setIssueModalVisible(false);
      setIssueText('');
      Alert.alert('Success', 'Issue reported successfully');
      refetch();
    },
  });

  // const bookings = mock.data?.myBookingsByStatus || [];
  const bookings = data?.myBookingsByStatus || [];

  const getStayProgress = (checkIn: string, checkOut: string) => {
    const now = new Date();
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const totalDuration = end.getTime() - start.getTime();
    const elapsed = now.getTime() - start.getTime();
    const progress = Math.max(0, Math.min(1, elapsed / totalDuration));
    const totalDays = Math.ceil(totalDuration / (1000 * 60 * 60 * 24));
    const elapsedDays = Math.ceil(elapsed / (1000 * 60 * 60 * 24));
    return { progress, totalDays, elapsedDays };
  };

  const getDaysUntilCheckOut = (checkOut: string) => {
    const now = new Date();
    const checkOutDate = new Date(checkOut);
    const diffTime = checkOutDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return "Checking out today";
    if (diffDays === 1) return "Tomorrow";
    return `${diffDays} days`;
  };

  const handleReportIssue = (booking: any) => {
    setSelectedBooking(booking);
    setIssueModalVisible(true);
  };

  const submitIssue = () => {
    if (!issueText.trim()) {
      Alert.alert('Error', 'Please describe the issue');
      return;
    }
    reportIssue({
      variables: {
        bookingId: selectedBooking.id,
        issue: issueText,
      },
    });
  };

  const renderBookingCard = (booking: any) => {
    const { progress, totalDays, elapsedDays } = getStayProgress(
      booking.checkIn,
      booking.checkOut
    );
    console.log(booking.id)
    const daysUntil = getDaysUntilCheckOut(booking.checkOut);
    const isCheckingOutSoon = daysUntil === "Tomorrow" || daysUntil === "Checking out today";

    return (
      <View
        key={booking.id}
        style={[
          styles.bookingCard,
          { backgroundColor: theme.colors.card },
          isCheckingOutSoon && { borderLeftWidth: 4, borderLeftColor: theme.colors.warning },
        ]}
      >
        {/* Status Header */}
        <View style={[styles.statusHeader, { backgroundColor: theme.colors.accent + '15' }]}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: theme.colors.accent }]} />
            <Text style={[styles.statusText, { color: theme.colors.accent }]}>
              IN-STAY • Day {elapsedDays} of {totalDays}
            </Text>
          </View>
          {isCheckingOutSoon && (
            <View style={[styles.warningBadge, { backgroundColor: theme.colors.warning + '20' }]}>
              <Ionicons name="time" size={14} color={theme.colors.warning} />
              <Text style={[styles.warningText, { color: theme.colors.warning }]}>
                {daysUntil}
              </Text>
            </View>
          )}
        </View>

        {/* Property Info */}
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

        {/* Guest Info */}
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
            </View>
          </View>
        </View>

        {/* Stay Dates */}
        <View style={styles.datesSection}>
          <View style={styles.dateRow}>
            <View style={styles.dateItem}>
              <Ionicons name="calendar" size={14} color={theme.colors.textSecondary} />
              <Text style={[styles.dateLabel, { color: theme.colors.textSecondary }]}>
                Checked in
              </Text>
              <Text style={[styles.dateValue, { color: theme.colors.text }]}>
                {new Date(booking.checkIn).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
            </View>
            <View style={styles.dateItem}>
              <Ionicons name="calendar-outline" size={14} color={theme.colors.textSecondary} />
              <Text style={[styles.dateLabel, { color: theme.colors.textSecondary }]}>
                Checking out
              </Text>
              <Text style={[styles.dateValue, { color: theme.colors.text }]}>
                {new Date(booking.checkOut).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })} ({daysUntil})
              </Text>
            </View>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressSection}>
          <Text style={[styles.progressLabel, { color: theme.colors.textSecondary }]}>
            Stay progress
          </Text>
          <View style={[styles.progressBar, { backgroundColor: theme.colors.backgroundSec }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: theme.colors.accent,
                  width: `${progress * 100}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: theme.colors.textSecondary }]}>
            {Math.round(progress * 100)}% complete
          </Text>
        </View>

        {/* Last Communication */}
        <View style={[styles.communicationSection, { backgroundColor: theme.colors.backgroundSec }]}>
          <View style={styles.communicationHeader}>
            <Ionicons name="chatbubbles" size={16} color={theme.colors.textSecondary} />
            <Text style={[styles.communicationLabel, { color: theme.colors.textSecondary }]}>
              Last message
            </Text>
            <Text style={[styles.communicationTime, { color: theme.colors.textSecondary }]}>
              2 hours ago
            </Text>
          </View>
          <Text style={[styles.messagePreview, { color: theme.colors.text }]}>
            "Thank you, everything is great!"
          </Text>
        </View>

        {/* Issues Status */}
        <View style={[styles.issuesSection, { backgroundColor: theme.colors.success + '10' }]}>
          <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
          <Text style={[styles.issuesText, { color: theme.colors.success }]}>
            No issues reported ✓
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => Alert.alert('Message', 'Open chat with guest')}
          >
            <Ionicons name="chatbubble" size={18} color="#FFF" />
            <Text style={styles.actionTextPrimary}>Message</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.error + '20' }]}
            onPress={() => handleReportIssue(booking)}
          >
            <Ionicons name="warning" size={18} color={theme.colors.error} />
            <Text style={[styles.actionText, { color: theme.colors.error }]}>Issue</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.backgroundSec }]}
            onPress={() => router.push({
              pathname: '/bookings/details',
              params: {id: booking.id}
            })}
          >
            <Ionicons name="information-circle-outline" size={18} color={theme.colors.text} />
            <Text style={[styles.actionText, { color: theme.colors.text }]}>Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
      >
        {loading ? (
          <></>
          // <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 60 }} />
        ) : bookings.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="home-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
              No active stays
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
              Guests currently staying will appear here
            </Text>
          </View>
        ) : (
          bookings.map((booking: any) => renderBookingCard(booking))
        )}
      </ScrollView>

      {/* Report Issue Modal */}
      <Modal
        visible={issueModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIssueModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                Report Issue
              </Text>
              <TouchableOpacity onPress={() => setIssueModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {selectedBooking && (
              <View style={styles.modalBookingInfo}>
                <Text style={[styles.modalPropertyName, { color: theme.colors.text }]}>
                  {selectedBooking.property.title}
                </Text>
                <Text style={[styles.modalGuestName, { color: theme.colors.textSecondary }]}>
                  Guest: {selectedBooking.guest.name}
                </Text>
              </View>
            )}

            <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
              Describe the issue
            </Text>
            <TextInput
              style={[
                styles.issueInput,
                {
                  backgroundColor: theme.colors.backgroundInput,
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                },
              ]}
              placeholder="E.g., Broken air conditioning, noise complaint, damage..."
              placeholderTextColor={theme.colors.textPlaceholder}
              multiline
              numberOfLines={6}
              value={issueText}
              onChangeText={setIssueText}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.colors.backgroundSec }]}
                onPress={() => setIssueModalVisible(false)}
              >
                <Text style={[styles.modalButtonText, { color: theme.colors.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.colors.error }]}
                onPress={submitIssue}
              >
                <Text style={styles.modalButtonTextPrimary}>Submit Issue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  bookingCard: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  warningText: {
    fontSize: 11,
    fontWeight: '700',
  },
  propertySection: { padding: 16, paddingTop: 12 },
  propertyHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  propertyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  propertyInfo: { flex: 1 },
  propertyTitle: { fontSize: 16, fontWeight: '700' },
  propertySubtitle: { fontSize: 13, marginTop: 2 },
  bookingId: { fontSize: 12, fontWeight: '600' },
  guestSection: { paddingHorizontal: 16, marginBottom: 16 },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  guestInfo: { flex: 1 },
  guestName: { fontSize: 15, fontWeight: '700' },
  guestContact: { fontSize: 13, marginTop: 2 },
  datesSection: { paddingHorizontal: 16, marginBottom: 16 },
  dateRow: { flexDirection: 'row', gap: 16 },
  dateItem: { flex: 1, gap: 4 },
  dateLabel: { fontSize: 11, fontWeight: '600' },
  dateValue: { fontSize: 13, fontWeight: '600' },
  progressSection: { paddingHorizontal: 16, marginBottom: 16 },
  progressLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'right',
  },
  communicationSection: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
  },
  communicationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  communicationLabel: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  communicationTime: {
    fontSize: 11,
  },
  messagePreview: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  issuesSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  issuesText: {
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    paddingTop: 0,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionTextPrimary: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    minHeight: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalBookingInfo: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  modalPropertyName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  modalGuestName: {
    fontSize: 14,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  issueInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalButtonTextPrimary: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
});