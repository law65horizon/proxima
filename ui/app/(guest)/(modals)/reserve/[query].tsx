// ReservationScreen.tsx
import DraggableModal from '@/components/DraggableModal';
import { ThemedText } from '@/components/ThemedText';
import { ErrorState } from '@/components/ui/StateComponents';
import { CREATE_CHECKOUT_SESSION } from '@/graphql/mutations';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/theme/theme';
import { calculatePeriod } from '@/utils/calculatePeriod';
import { getNightlyRatesInRange, RateCalendarEntry, sumNightlyRates } from '@/utils/getNightsInRange';
import { gql, useMutation, useQuery } from '@apollo/client';
import { Entypo } from '@expo/vector-icons';
import { useStripe } from "@stripe/stripe-react-native";
import dayjs from 'dayjs';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { CalendarList } from 'react-native-calendars';

// import { ScreenWidth } from 'react-native-elements/dist/helpers';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function formatTimestamp(timestamp: string) {
  const date = new Date(parseInt(timestamp));
  console.log(date.getMinutes())
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// GraphQL Queries
const GET_ROOM_TYPE = gql`
  query GetRoomType($id: ID!) {
    getRoomType(id: $id) {
      id
      name
      description
      capacity
      base_price
      weekly_rate
      currency
      monthly_rate
      currency
      amenities
      property {
        id
        title
        images {
          cdn_url
          id
        }
      }
    }
  }
`;

const CREATE_BOOKING = gql`
  mutation CreateBooking($input: CreateBookingInput!) {
    createBooking(input: $input) {
      success,
      message,
      booking {
        id
      },
      errors
    }
  }
`
const CREATE_PAYMENT_INTENT = gql`
  mutation CreatePaymentIntent($input: CreatePaymentIntentInput!) {
    createPaymentIntent(input: $input) {
      clientSecret
    }
  }
`; 

const GET_RATE_CALENDAR = gql`
  query GetRateCalendar($id: ID!, $startDate: Date!, $endDate: Date!) {
    getAvailability(id: $id, startDate: $startDate, endDate: $endDate) {
      date
      nightly_rate
      min_stay
      is_blocked
    }
  }
`;

const ReservationScreen = () => {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const { query } = useLocalSearchParams();
  const stripe = useStripe()
  const user = useAuthStore(state => state.user)

  const [checkInDate, setCheckInDate] = useState<string | null>(null);
  const [checkOutDate, setCheckOutDate] = useState<string | null>(null);
  const [guests, setGuests] = useState(1);
  const [paymentOption, setPaymentOption] = useState<'full' | 'partial'>('full');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [priceModalVisible, setPriceModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  
  
  

  const [selectedDateCalendar, setSelectedDateCalendar] = useState<RateCalendarEntry[]>([])
  const [pricingInfo, setPricingInfo] = useState({
    nights: 0,
    period: 'daily',
    price: 0
  })

  // GraphQL Hooks
  const { data: roomTypeData, loading: roomTypeLoading, error: fetchRoomTypeError, refetch } = useQuery(GET_ROOM_TYPE, {
    variables: { id: query }
  });

  const { data: rateCalendarData, loading: calendarLoading } = useQuery(
    GET_RATE_CALENDAR, {
      variables: {
        id: query,
        startDate: "2025-11-21",
        endDate: "2026-11-21"
      }
    }
  );

  const [createBooking, {data, error}] = useMutation(CREATE_BOOKING)
  const [createPaymentIntent] = useMutation(CREATE_PAYMENT_INTENT);
  const [createCheckoutSession] = useMutation(
    CREATE_CHECKOUT_SESSION,
    {
      onCompleted: (data) => {
        if (data?.createCheckoutSession?.url) {
          setCheckoutUrl(data.createCheckoutSession.url);
        }
      },
      onError: (error) => {
        Alert.alert('Error', error.message || 'Failed to create checkout session');
        setLoading(false);
      },
    }
  );

  // useEffect(() => {
  //   if (paymentData?.getPayment?.status === 'succeeded') {
  //     setPaymentCompleted(true);
  //     handlePaymentSuccess();
  //     } else if (paymentData?.getPayment?.status === 'failed') {
  //     Alert.alert('Payment Failed', 'Your payment could not be processed. Please try again.');
  //     }
  // }, [paymentData]);

  const handlePaymentSuccess = () => {
      Alert.alert(
        'Payment Successful',
        'Your booking has been confirmed!',
        [
          {
            text: 'View Booking',
            onPress: () => {
              router.dismissAll();
              router.replace('/(guest)/(tabs)/reservations/trips');
            },
          },
        ],
        { cancelable: false }
      );
    };
    

  const handleCreateBooking = async () => {
    if (!isValidReservation) return;
    setLoading(true);
    try {
      const amountInCents = Math.round(pricingInfo.price * 100);
      console.log({user})
      const result = await createBooking({
        variables: {
          input: {
            guestId: user.id || 3,
            roomTypeId: query,
            checkIn: checkInDate,
            checkOut: checkOutDate,
            guestCount: guests,
            source: 'mobile app'
          }
        }
      })
      const bookingResult = result.data.createBooking

      console.log({amountInCents})

      const bookingId = bookingResult?.booking?.id;
      // const bookingId = '37'
      console.log({ios: bookingResult.data?.createBooking?.booking})
      if (!bookingId) {
        return Alert.alert("Booking failed", bookingResult.message??"Booking could not be created.");
      }

      console.log({bookingId})

      // const paymentIntentResult = await createPaymentIntent({
      //   variables: {
      //     input: {
      //       bookingId,
      //       amount: amountInCents,
      //       currency: "usd"
      //     }
      //   }
      // });

      const successUrl = `${Platform.select({
        ios: 'exp://localhost:8081',
        android: 'exp://192.168.1.x:8081', // Replace with your IP
      })}/--/payment-success?bookingId=${bookingId}`;
      
      const cancelUrl = `${Platform.select({
        ios: 'exp://localhost:8081',
        android: 'exp://192.168.1.x:8081',
      })}/--/payment-cancel?bookingId=${bookingId}`;
      console.log({successUrl})
      const paymentIntentResult = await createCheckoutSession({
        variables: {
          input: {
            bookingId,
            successUrl,
            cancelUrl,
            paymentOption: paymentOption.toUpperCase(),
          }
        }
      });
      
      const clientSecret =
        paymentIntentResult.data?.createCheckoutSession?.clientSecret;

      if (!clientSecret) {
        return Alert.alert("Payment Error", "Unable to create payment intent");
      }

      const init = await stripe.initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: "miine",
        returnURL: successUrl
      })

      if (init.error) {
        return Alert.alert("stripe error:", init.error.message)
      }

      const present = await stripe.presentPaymentSheet();
      if (present.error) {
        return Alert.alert("Payment Failed", present.error.message);
      }
      
      Alert.alert('Booking Confirmed', 'Your reservation has been created!');
      router.dismissAll()
      router.replace('/(guest)/(tabs)/reservations/trips')
    } catch (error) {
      Alert.alert(`Booking Failed ${error}`);
    } finally {
      setLoading(false)
    }
    // Alert.alert('Booking Confirmed', 'Your reservation has been created!');
  };


  const closeCalendarFunc = () => {
    if (checkInDate && checkOutDate) {
      let nights = dayjs(checkOutDate).diff(dayjs(checkInDate), 'day') || 0;
      let period = calculatePeriod(nights);
      let price: number;
      switch (period) {
        case 'weekly': {
          const fullWeeks = Math.floor(nights/7)
          const rmDays = nights % 7
          price = fullWeeks * (roomTypeData?.getRoomType.weekly_rate || roomTypeData?.getRoomType.base_price * 7);

          price += rmDays * (roomTypeData?.getRoomType.base_price || 0)
          break;
        }
        case 'monthly': {
          const fullMonths = Math.floor(nights/30)
          const rmDays = nights % 30
          price = fullMonths * (roomTypeData?.getRoomType.monthly_rate || roomTypeData?.getRoomType.base_price * 30);

          price += rmDays * (roomTypeData?.getRoomType.base_price || 0)
          break;
        }
        default: {
          let dsx = getNightlyRatesInRange(checkInDate, checkOutDate, rateCalendarData?.getAvailability)
          console.log({dsx, checkInDate, checkOutDate})
          setSelectedDateCalendar(dsx)
          price = sumNightlyRates(dsx) || (roomTypeData?.getRoomType.base_price * nights)
          break
        }
      }
      setPricingInfo({period, nights, price})
      // console.log({sos: getNightlyRatesInRange(checkInDate, checkOutDate, rateCalendarData?.getAvailability)})
    }
    setDateModalVisible(false)
  }

  // console.log({res: rateCalendarData?.getAvailability})

  const priceData = {
    calculateBookingPrice: {
      nights: checkInDate && checkOutDate ? dayjs(checkOutDate).diff(dayjs(checkInDate), 'day') : 0,
      useNightlyRates: false,
      total: 10,
      currency: 'USD',
      checkIn: checkInDate || "2025-11-21",
      checkOut: checkOutDate || "2025-11-21",
      breakdown: {
        periodType: 'weekly',
        subtotal: 10.0,
        periodRate: 4,
        cleaningFee: 0,
        serviceFee: 0,
        serviceFeePercent: 20,
        discount: 10,
        discountPercent: 10,
        nightlyRateDetails: {
          date: '2024-2-11',
          rate: 20
        }
      }
    }
  };

  // console.log({checkInDate, checkOutDate})
  // Process blocked dates
  const disabledDatesSet = useMemo(() => {
    if (!rateCalendarData?.getAvailability) return new Set<string>();
    
    const disabled = new Set<string>();
    rateCalendarData.getAvailability.forEach((day: any) => {
      if (day.is_blocked === true) {
        disabled.add(day.date);
      }
    });
    return disabled;
  }, [rateCalendarData]);

  // console.log({disabledDatesSet})

  // Generate marked dates with range selection styling
  const markedDates = useMemo(() => {
    const marked: any = {};
    // console.log({marked})
    // Mark disabled dates
    disabledDatesSet.forEach(date => {
      marked[date] = {
        disabled: true,
        disableTouchEvent: true,
        textColor: theme.colors.textSecondary,
        customStyles: {
          container: {
            opacity: 0.3,
          },
          text: {
            textDecorationLine: 'line-through',
            color: theme.colors.accent,
          }
        }
      };
    });

    // Mark selected range
    if (checkInDate && checkOutDate) {
      const start = dayjs(checkInDate);
      const end = dayjs(checkOutDate);
      let current = start;

      while (current.isBefore(end) || current.isSame(end, 'day')) {
        const dateStr = current.format('YYYY-MM-DD');
        const isStart = current.isSame(start, 'day');
        const isEnd = current.isSame(end, 'day');
        const isMiddle = !isStart && !isEnd;

        marked[dateStr] = {
          ...marked[dateStr],
          selected: true,
          color: theme.colors.primary,
          textColor: '#FFFFFF',
          startingDay: isStart,
          endingDay: isEnd,
          customStyles: {
            container: {
              backgroundColor: isStart || isEnd ? theme.colors.primary : `${theme.colors.primary}30`,
              borderTopLeftRadius: isStart ? 20 : 0,
              borderBottomLeftRadius: isStart ? 20 : 0,
              borderTopRightRadius: isEnd ? 20 : 0,
              borderBottomRightRadius: isEnd ? 20 : 0,
            },
            text: {
              color: isStart || isEnd ? '#FFFFFF' : theme.colors.text,
              fontWeight: isStart || isEnd ? '600' : '400',
            }
          }
        };
        current = current.add(1, 'day');
      }
    } else if (checkInDate) {
      // Only check-in selected
      marked[checkInDate] = {
        ...marked[checkInDate],
        selected: true,
        color: theme.colors.primary,
        textColor: '#FFFFFF',
        customStyles: {
          container: {
            backgroundColor: theme.colors.primary,
            borderRadius: 20,
          },
          text: {
            color: '#FFFFFF',
            fontWeight: '600',
          }
        }
      };
    }

    return marked;
  }, [checkInDate, checkOutDate, disabledDatesSet, theme]);

  // Optimized day press handler
  const handleDayPress = useCallback((day: any) => {
    const dateStr = day.dateString;
    
    // Check if date is disabled
    // if (disabledDatesSet.has(dateStr)) {
    //   Alert.alert('Date Unavailable', 'This date is not available for booking.');
    //   return;
    // }

    if (!checkInDate || (checkInDate && checkOutDate)) {
      // Start new selection
      setCheckInDate(dateStr);
      setCheckOutDate(null);
    } else {
      // Complete the range
      const selectedDate = dayjs(dateStr);
      const startDate = dayjs(checkInDate);

      if (selectedDate.isBefore(startDate)) {
        // Selected date is before check-in, make it the new check-in
        setCheckInDate(dateStr);
        setCheckOutDate(null);
      } else {
        // Check if there are any blocked dates in the range
        let hasBlockedDate = false;
        let current = startDate.add(1, 'day');
        
        while (current.isBefore(selectedDate) || current.isSame(selectedDate, 'day')) {
          if (disabledDatesSet.has(current.format('YYYY-MM-DD'))) {
            hasBlockedDate = true;
            break;
          }
          current = current.add(1, 'day');
        }

        if (hasBlockedDate) {
          Alert.alert(
            'Invalid Range', 
            'Your selected range contains unavailable dates. Please select a different range.'
          );
          setCheckInDate(dateStr);
          setCheckOutDate(null);
        } else {
          setCheckOutDate(dateStr);
        }
      }
    }
  }, [checkInDate, checkOutDate, disabledDatesSet]);

  // Validation
  const isValidReservation = useMemo(() => {
    if (!roomTypeData?.getRoomType) return false;
    
    const hasValidDates = checkInDate && checkOutDate;
    const meetsMinStay = priceData?.calculateBookingPrice?.nights >= 1;
    const withinCapacity = guests > 0 && guests <= (roomTypeData.getRoomType.capacity || 4);
    
    return hasValidDates && meetsMinStay && withinCapacity && agreedToTerms;
  }, [checkInDate, checkOutDate, guests, agreedToTerms, priceData, roomTypeData]);

  // Handle booking submission
  console.log({user})
  console.log({data, loading, error: error?.message})
  if (roomTypeLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!roomTypeLoading && (fetchRoomTypeError || !roomTypeData)) {
    return <ErrorState onRetry={refetch} retryText='Refetch'/>
  } 

  const roomType = roomTypeData?.getRoomType;
  console.log({roomType: roomType.property.images})
  const pricing = priceData?.calculateBookingPrice;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.card, borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Entypo name='cross' size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Image 
            source={{ uri: roomType.property.images[0]?.cdn_url || 'https://via.placeholder.com/60' }} 
            style={styles.thumbnail} 
          />
          <View style={styles.headerText}>
            <Text style={[styles.propertyTitle, { color: theme.colors.text }]} numberOfLines={2}>
              {roomType?.name || 'Loading...'}
            </Text>
            <Text style={[styles.propertySubtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {roomType?.property?.title || ''}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Date Selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Select Dates
          </Text>
          
          <TouchableOpacity
            style={[styles.dateButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
            onPress={() => setDateModalVisible(true)}
          >
            <View style={styles.dateButtonContent}>
              <View style={styles.dateColumn}>
                <Text style={[styles.dateLabel, { color: theme.colors.textSecondary }]}>Check-in</Text>
                <Text style={[styles.dateValue, { color: theme.colors.text }]}>
                  {checkInDate ? dayjs(checkInDate).format('MMM D, YYYY') : 'Add date'}
                </Text>
              </View>
              
              <View style={[styles.dateDivider, { backgroundColor: theme.colors.border }]} />
              
              <View style={styles.dateColumn}>
                <Text style={[styles.dateLabel, { color: theme.colors.textSecondary }]}>Check-out</Text>
                <Text style={[styles.dateValue, { color: theme.colors.text }]}>
                  {checkOutDate ? dayjs(checkOutDate).format('MMM D, YYYY') : 'Add date'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {checkInDate && checkOutDate && (
            <Text style={[styles.helperText, { color: theme.colors.textSecondary }]}>
              {pricingInfo.nights} {pricingInfo.nights === 1 ? 'night' : 'nights'}
              {pricingInfo.period == 'daily' ? ' • Nightly rates' : ` • ${pricingInfo.period} rates`}
            </Text>
          )}
        </View>

        {/* Guest Selection */}
        <View style={styles.section}>
          <View style={styles.guestContainer}>
            <View>
              <Text style={[styles.sectionTitle, { color: theme.colors.text, marginBottom: 4 }]}>Guests</Text>
              <Text style={[styles.helperText, { color: theme.colors.textSecondary }]}>
                Maximum {roomType?.capacity || 4} guests
              </Text>
            </View>
            <View style={styles.stepperContainer}>
              <TouchableOpacity
                style={[styles.stepperButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
                onPress={() => setGuests(Math.max(1, guests - 1))}
                disabled={guests <= 1}
              >
                <Text style={[styles.stepperButtonText, { color: guests <= 1 ? theme.colors.textSecondary : theme.colors.text }]}>−</Text>
              </TouchableOpacity>
              <Text style={[styles.guestValue, { color: theme.colors.text }]}>{guests}</Text>
              <TouchableOpacity
                style={[styles.stepperButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
                onPress={() => setGuests(Math.min(roomType?.capacity || 4, guests + 1))}
                disabled={guests >= (roomType?.capacity || 4)}
              >
                <Text style={[styles.stepperButtonText, { color: guests >= (roomType?.capacity || 4) ? theme.colors.textSecondary : theme.colors.text }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Pricing Summary */}
        {checkInDate && checkOutDate && (
          <View style={[styles.section, styles.pricingSection]}>
            <View>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Total Price</Text>
              <Text style={[styles.totalPrice, { color: theme.colors.text }]}>
                ${pricingInfo.price.toFixed(2)} <Text style={styles.currency}>{roomType.currency}</Text>
              </Text>
            </View>
            <TouchableOpacity 
              onPress={() => setPriceModalVisible(true)} 
              style={[styles.detailsButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
            >
              <ThemedText type='defaultSemiBold'>View details</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* Payment Options */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Payment Options</Text>
          
          <TouchableOpacity
            style={[
              styles.radioOption, 
              { 
                borderColor: paymentOption === 'full' ? theme.colors.primary : theme.colors.border,
                backgroundColor: theme.colors.card 
              }
            ]}
            onPress={() => setPaymentOption('full')}
          >
            <View style={[styles.radio, { borderColor: paymentOption === 'full' ? theme.colors.primary : theme.colors.border }]}>
              {paymentOption === 'full' && <View style={[styles.radioInner, { backgroundColor: theme.colors.primary }]} />}
            </View>
            <View style={styles.radioContent}>
              <Text style={[styles.radioTitle, { color: theme.colors.text }]}>Pay in full</Text>
              <Text style={[styles.radioSubtitle, { color: theme.colors.textSecondary }]}>
                Pay ${pricingInfo.price?.toFixed(2) || '0.00'} now
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.radioOption, 
              { 
                borderColor: paymentOption === 'partial' ? theme.colors.primary : theme.colors.border,
                backgroundColor: theme.colors.card 
              }
            ]}
            onPress={() => setPaymentOption('partial')}
          >
            <View style={[styles.radio, { borderColor: paymentOption === 'partial' ? theme.colors.primary : theme.colors.border }]}>
              {paymentOption === 'partial' && <View style={[styles.radioInner, { backgroundColor: theme.colors.primary }]} />}
            </View>
            <View style={styles.radioContent}>
              <Text style={[styles.radioTitle, { color: theme.colors.text }]}>Pay part now, part later</Text>
              <Text style={[styles.radioSubtitle, { color: theme.colors.textSecondary }]}>
                Pay ${((pricingInfo?.price || 0) * 0.5).toFixed(2)} now, ${((pricingInfo?.price || 0) * 0.5).toFixed(2)} later
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Terms Checkbox */}
        <View style={[styles.section, styles.termsSection]}>
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setAgreedToTerms(!agreedToTerms)}
          >
            <View style={[styles.checkbox, { borderColor: agreedToTerms ? theme.colors.primary : theme.colors.border, backgroundColor: theme.colors.card }]}>
              {agreedToTerms && <View style={[styles.checkboxInner, { backgroundColor: theme.colors.primary }]} />}
            </View>
            <Text style={[styles.termsText, { color: theme.colors.textSecondary }]}>
              I agree to the cancellation policy, house rules, and terms of service
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* CTA Button */}
      <View style={[styles.ctaContainer, { backgroundColor: theme.colors.card, borderTopColor: theme.colors.border }]}>
        <TouchableOpacity
          style={[
            styles.ctaButton,
            { backgroundColor: theme.colors.primary },
            !isValidReservation && styles.ctaButtonDisabled,
          ]}
          disabled={!isValidReservation}
          onPress={() => {
            if(!user) {
              console.log({users: user})
              router.push('/(guest)/(auth)/auth_page')
            } else {
              handleCreateBooking()
            }
          }}
        >
          {loading 
          ? <ActivityIndicator animating={loading} color={'white'} />
          :<Text style={styles.ctaButtonText}>
            {checkInDate && checkOutDate 
              ? `Confirm and Pay $${pricingInfo?.price.toFixed(2) || '0.00'}`
              : 'Select dates to continue'
            }
          </Text>}
        </TouchableOpacity>
      </View>

      {/* Date Picker Modal */}
      <DraggableModal
        isVisible={dateModalVisible}
        onClose={() => closeCalendarFunc()}
        height={SCREEN_HEIGHT * 0.85}
      >
        <View style={styles.modalInner}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              Select Dates
            </Text>
            {/* <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>
              {checkInDate && !checkOutDate ? 'Select checkout date' : 'Select check-in date'}
            </Text> */}
          </View>

          {calendarLoading ? (
            <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <View style={{ flex: 1, backgroundColor: 'red'}} >
              <CalendarList
                pastScrollRange={0}
                futureScrollRange={6}
                current={dayjs().format('YYYY-MM-DD')}
                minDate={dayjs().format('YYYY-MM-DD')}
                maxDate={dayjs().add(6, 'month').format('YYYY-MM-DD')}
                onDayPress={handleDayPress}
                markedDates={markedDates}
                markingType={'period'}
                calendarStyle={{backgroundColor: theme.colors.backgroundSec, width: SCREEN_WIDTH-30,}}
                theme={{
                  backgroundColor: theme.colors.backgroundSec,
                  calendarBackground: theme.colors.backgroundSec,
                  textSectionTitleColor: theme.colors.textSecondary,
                  selectedDayBackgroundColor: theme.colors.primary,
                  selectedDayTextColor: '#FFFFFF',
                  todayTextColor: theme.colors.primary,
                  dayTextColor: theme.colors.text,
                  textDisabledColor: theme.colors.textSecondary,
                  monthTextColor: theme.colors.text,
                  textMonthFontWeight: '600',
                  textDayFontSize: 16,
                  textMonthFontSize: 18,
                }}
                style={{ backgroundColor: theme.colors.accent }}
                scrollEnabled
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.modalButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => closeCalendarFunc()}
          >
            <Text style={styles.modalButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </DraggableModal>

      {/* Price Details Modal */}
      <DraggableModal
        isVisible={priceModalVisible}
        onClose={() => setPriceModalVisible(false)}
        height={SCREEN_HEIGHT * 0.6}
      >
        <View style={styles.modalInner}>
          <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Price Details</Text>
          {pricingInfo ? (
            <View style={styles.priceBreakdown}>
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: theme.colors.text }]}>
                  {pricing.useNightlyRates 
                    ? `Nightly rates × ${pricingInfo.nights} nights`
                    : `${pricing.breakdown.periodType} rate × ${pricingInfo.nights} nights`
                  }
                </Text>
                <Text style={[styles.priceValue, { color: theme.colors.text }]}>
                  ${pricingInfo.price.toFixed(2)}
                </Text>
              </View>

              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: theme.colors.text }]}>Cleaning fee</Text>
                <Text style={[styles.priceValue, { color: theme.colors.text }]}>
                  ${pricing.breakdown.cleaningFee.toFixed(2)}
                </Text>
              </View>
              
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: theme.colors.text }]}>
                  Service fee ({pricing.breakdown.serviceFeePercent}%)
                </Text>
                <Text style={[styles.priceValue, { color: theme.colors.text }]}>
                  ${pricing.breakdown.serviceFee.toFixed(2)}
                </Text>
              </View>
              
              <View style={[styles.priceRow, styles.totalRow, { borderTopColor: theme.colors.border }]}>
                <Text style={[styles.priceLabel, styles.totalLabel, { color: theme.colors.text }]}>Total</Text>
                <Text style={[styles.priceValue, styles.totalValue, { color: theme.colors.primary }]}>
                  ${pricingInfo.price.toFixed(2)}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={[{ color: theme.colors.text, textAlign: 'center', marginTop: 20 }]}>
              Select dates to see pricing
            </Text>
          )}
        </View>
      </DraggableModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  closeButton: {
    marginBottom: 12,
    alignSelf: 'flex-end',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnail: {
    width: 70,
    height: 70,
    borderRadius: 12,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  propertyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  propertySubtitle: {
    fontSize: 14,
  },
  scrollContent: {
    flex: 1,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 12,
  },
  dateButton: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 16,
  },
  dateButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateColumn: {
    flex: 1,
  },
  dateDivider: {
    width: 1,
    height: 40,
    marginHorizontal: 16,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  dateValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  helperText: {
    fontSize: 13,
    marginTop: 8,
  },
  guestContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    fontSize: 20,
    fontWeight: '600',
  },
  guestValue: {
    fontSize: 18,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'center',
  },
  pricingSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalPrice: {
    fontSize: 24,
    fontWeight: '700',
  },
  currency: {
    fontSize: 16,
    fontWeight: '400',
  },
  detailsButton: {
    padding: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  radioContent: {
    flex: 1,
  },
  radioTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  radioSubtitle: {
    fontSize: 14,
  },
  termsSection: {
    borderBottomWidth: 0,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxInner: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  ctaContainer: {
    padding: 16,
    borderTopWidth: 1,
    paddingBottom: 32,
  },
  ctaButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaButtonDisabled: {
    opacity: 0.4,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalInner: {
    flex: 1,
    padding: 20,
  },
  modalHeader: {
    marginBottom: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 14,
  },
  modalButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  priceBreakdown: {
    marginTop: 20,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  priceLabel: {
    fontSize: 15,
    flex: 1,
    marginRight: 12,
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  totalRow: {
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 10,
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
  },
});

export default ReservationScreen;

// const handleCreateBooking = async () => {
//     if (!isValidReservation) return;
//     setLoading(true)
//     try {
//       const amountInCents = Math.round(pricingInfo.price * 100);
//       // const bookingResult = await createBooking({
//       //   variables: {
//       //     input: {
//       //       guestId: 2,
//       //       roomTypeId: query,
//       //       checkIn: checkInDate,
//       //       checkOut: checkOutDate,
//       //       guestCount: guests
//       //     }
//       //   }
//       // })

//       console.log({amountInCents})

//       // const bookingId = bookingResult.data?.createBooking?.booking?.id;
//       const bookingId = '37'
//       if (!bookingId) {
//         return Alert.alert("Booking failed", "Booking could not be created.");
//       }

//       console.log({bookingId})

//       const successUrl = `${Platform.select({
//         ios: 'exp://localhost:8081',
//         android: 'exp://192.168.1.x:8081', // Replace with your IP
//       })}/--/payment-success?bookingId=${bookingId}`;
      
//       const cancelUrl = `${Platform.select({
//         ios: 'exp://localhost:8081',
//         android: 'exp://192.168.1.x:8081',
//       })}/--/payment-cancel?bookingId=${bookingId}`;

//       await createCheckoutSession({
//         variables: {
//           bookingId,
//           successUrl,
//           cancelUrl
//         }
//       })
  
      
//       Alert.alert('Booking Confirmed', 'Your reservation has been created!');
//       router.dismissAll()
//       router.replace('/(guest)/(tabs)/reservations/trips')
//     } catch (error) {
//       Alert.alert(`Booking Failed ${error}`);
//     }
//     // Alert.alert('Booking Confirmed', 'Your reservation has been created!');
//   };

// const handleCreateBooking = async () => {
//     if (!isValidReservation) return;
//     try {
//       const amountInCents = Math.round(pricingInfo.price * 100);
//       // const bookingResult = await createBooking({
//       //   variables: {
//       //     input: {
//       //       guestId: 2,
//       //       roomTypeId: query,
//       //       checkIn: checkInDate,
//       //       checkOut: checkOutDate,
//       //       guestCount: guests
//       //     }
//       //   }
//       // })

//       console.log({amountInCents})

//       // const bookingId = bookingResult.data?.createBooking?.booking?.id;
//       const bookingId = '37'
//       // console.log({ios: bookingResult.data?.createBooking?.booking})
//       if (!bookingId) {
//         return Alert.alert("Booking failed", "Booking could not be created.");
//       }

//       console.log({bookingId})

//       const paymentIntentResult = await createPaymentIntent({
//         variables: {
//           input: {
//             bookingId,
//             amount: amountInCents,
//             currency: "usd"
//           }
//         }
//       });

//       const clientSecret =
//         paymentIntentResult.data?.createPaymentIntent?.clientSecret;

//       if (!clientSecret) {
//         return Alert.alert("Payment Error", "Unable to create payment intent");
//       }

//       const init = await stripe.initPaymentSheet({
//         paymentIntentClientSecret: clientSecret,
//         merchantDisplayName: "miine",
//       })

//       if (init.error) {
//         return Alert.alert("stripe error:", init.error.message)
//       }

//       const present = await stripe.presentPaymentSheet();
//       if (present.error) {
//         return Alert.alert("Payment Failed", present.error.message);
//       }
      
//       Alert.alert('Booking Confirmed', 'Your reservation has been created!');
//       router.dismissAll()
//       router.replace('/(guest)/(tabs)/reservations/trips')
//     } catch (error) {
//       Alert.alert(`Booking Failed ${error}`);
//     }
//     // Alert.alert('Booking Confirmed', 'Your reservation has been created!');
//   };