
import { Pool } from 'pg';
import pool from '../config/database.js';
import { calculateNights, formatDate } from '../utils/helperFuncs.js';
import { BookingResult, HostBookingsSummary, Booking, User } from '../types/index.js';
import { BookingInput, SearchBookingInput } from '../types/input.js';



export class BookingModel {
  constructor(private pool: Pool) {}

  async calculateBookingPrice({roomTypeId, checkIn, checkOut}: {roomTypeId: number, checkIn: Date, checkOut: Date}) {
    const nights = calculateNights(checkIn, checkOut);
    const useNightlyRates = nights < 7;
    
    // Get room type details
    const roomTypeResult = await pool.query(
      'SELECT * FROM room_types WHERE id = $1',
      [roomTypeId]
    );
    const roomType = roomTypeResult.rows[0];
    
    if (!roomType) {
      throw new Error('Room type not found');
    }

    let subtotal = 0;
    let nightlyRateDetails: any[] = [];
    let periodRate = null;
    let periodType = null;
    let discount = 0;
    let discountPercent = 0;

    if (useNightlyRates) {
      // Use nightly rates from rate_calendar
      const rateQuery = `
        SELECT date, nightly_rate
        FROM rate_calendar
        WHERE room_type_id = $1
        AND date >= $2
        AND date < $3
        ORDER BY date ASC
      `;
      
      const rateResult = await pool.query(rateQuery, [
        roomTypeId,
        formatDate(checkIn),
        formatDate(checkOut)
      ]);
      
      nightlyRateDetails = rateResult.rows.map((row: any) => ({
        date: row.date,
        rate: parseFloat(row.nightly_rate)
      }));
      
      subtotal = nightlyRateDetails.reduce((sum, day) => sum + day.rate, 0);
    } else {
      // Use period rates (weekly/monthly)
      if (nights >= 28) {
        // Monthly rate
        const months = Math.floor(nights / 30);
        periodRate = roomType.monthly_rate;
        periodType = 'monthly';
        subtotal = periodRate * months;
        
        // Check for duration discounts
        const discountQuery = `
          SELECT discount_percent
          FROM room_duration_discounts
          WHERE room_type_id = $1 AND stay_type = 'monthly'
        `;
        const discountResult = await pool.query(discountQuery, [roomTypeId]);
        
        if (discountResult.rows.length > 0) {
          discountPercent = parseFloat(discountResult.rows[0].discount_percent);
          discount = subtotal * (discountPercent / 100);
          subtotal -= discount;
        }
      } else if (nights >= 7) {
        // Weekly rate
        const weeks = Math.floor(nights / 7);
        periodRate = roomType.weekly_rate || roomType.base_price * 7;
        periodType = 'weekly';
        subtotal = periodRate * weeks;
        
        // Check for duration discounts
        const discountQuery = `
          SELECT discount_percent
          FROM room_duration_discounts
          WHERE room_type_id = $1 AND stay_type = 'weekly'
        `;
        const discountResult = await pool.query(discountQuery, [roomTypeId]);
        
        if (discountResult.rows.length > 0) {
          discountPercent = parseFloat(discountResult.rows[0].discount_percent);
          discount = subtotal * (discountPercent / 100);
          subtotal -= discount;
        }
      }
    }

    // Calculate fees
    const cleaningFee = 50; // Could be from property settings
    const serviceFeePercent = 10;
    const serviceFee = subtotal * (serviceFeePercent / 100);
    // const total = subtotal + cleaningFee + serviceFee;
    const total = Math.ceil(nights * roomType.base_price)
    console.log({total})

    return {
      roomTypeId,
      checkIn,
      checkOut,
      nights,
      useNightlyRates,
      breakdown: {
        subtotal,
        nightlyRateDetails: useNightlyRates ? nightlyRateDetails : null,
        periodRate,
        periodType,
        cleaningFee,
        serviceFee,
        serviceFeePercent,
        discount,
        discountPercent
      },
      total,
      currency: roomType.currency || 'USD'
    };
  }

  async create(booking: BookingInput): Promise<BookingResult> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN');
      const { guestId, checkIn, checkOut, roomTypeId, guestCount, specialRequests, source } = booking;
      console.log({roomTypeId})

      // Validate dates
      const nights = calculateNights(checkIn, checkOut);
      if (nights < 1) {
        throw new Error('Check-out must be after check-in');
      }

      // Check minimum stay requirement
      // const minStayQuery = `
      //   SELECT COALESCE(MIN(min_stay), 1) as min_stay
      //   FROM rate_calendar
      //   WHERE room_type_id = $1
      //     AND date >= $2
      //     AND date < $3
      // `;
      // const minStayResult = await client.query(minStayQuery, [
      //   roomTypeId,
      //   formatDate(checkIn),
      //   formatDate(checkOut)
      // ]);

      // const minStay = minStayResult.rows[0]?.min_stay || 1;
      // if (nights < minStay) {
      //   return {
      //     success: false,
      //     message: `Minimum stay of ${minStay} night(s) required`,
      //     booking: null,
      //     errors: [`Minimum stay requirement not met: ${minStay} nights`]
      //   };
      // }

      // Check if dates are blocked
      const blockedQuery = `
        SELECT COUNT(*) as blocked_count
        FROM rate_calendar
        WHERE room_type_id = $1
          AND date >= $2
          AND date < $3
          AND is_blocked = true
      `;
      const blockedResult = await client.query(blockedQuery, [
        roomTypeId,
        formatDate(checkIn),
        formatDate(checkOut)
      ]);
      if (parseInt(blockedResult.rows[0].blocked_count) > 0) {
        return {
          success: false,
          message: 'Some dates in your selection are not available',
          booking: null,
          errors: ['Selected dates contain blocked periods']
        };
      }

      //Find available unit
      const unitQuery = `
        SELECT ru.id
        FROM room_units ru
        WHERE ru.room_type_id = $1
          And ru.status = 'active'
          AND ru.id NOT IN (
            SELECT b.unit_id
            FROM bookings b
            WHERE b.status = 'confirmed'
              AND NOT (b.check_out <= $2 OR b.check_in >= $3)
          )
        LIMIT 1
      `

      const unitResult = await client.query(unitQuery, [
        roomTypeId,
        formatDate(checkIn),
        formatDate(checkOut)
      ])

      if (unitResult.rows.length === 0) {
        return {
          success: false,
          message: 'No units available for selected dates',
          booking: null,
          errors: ['All units are booked for this period']
        };
      }

      const unitId = unitResult.rows[0].id;

      console.log({ososo: 'idsos'})
      const priceCalc = await this.calculateBookingPrice({roomTypeId, checkIn, checkOut})
      const bookingQuery = `
        INSERT INTO bookings (
          unit_id, room_type_id, guest_id, check_in, check_out,
          total_price, currency, status, source, guest_count, special_requests
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const bookingResult = await client.query(bookingQuery, [
        unitId,
        roomTypeId,
        guestId,
        formatDate(checkIn),
        formatDate(checkOut),
        priceCalc.total,
        priceCalc.currency,
        'pending',
        source,
        guestCount,
        specialRequests
      ])

      await client.query('COMMIT')

      return {
        success: true,
        message: 'Booking created successfully',
        booking: bookingResult.rows[0],
        errors: []
      }      
    } catch (error) {
        await client.query('ROLLBACK');
        throw error
    } finally {
      client.release()
    }    
  }

  async myBookings({userId, status}: {userId: string, status: string}): Promise<any[]> {
    let query = `
      SELECT b.*, rt.name AS room_name, rt.id AS room_id, p.id AS property_id, p.title, p.property_type, p.address_id, p.realtor_id from bookings b
      INNER JOIN room_types rt ON rt.id = b.room_type_id
      INNER JOIN properties p ON p.id = rt.property_id
      WHERE b.guest_id = $1
    `;
    const params: any[] = [userId];

    if (status) {
      query += ' AND b.status = $2';
      params.push(status.toLowerCase());
    }

    query += ' ORDER BY check_in DESC';

    console.log({query, params})

    const result = await pool.query(query, params);
    console.log({result: result.rows})
    const bookings = result.rows.map((booking) => ({
      id: booking.id,
      room_type_id: booking.room_type_id,
      unit_id: booking.unit_id,
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      totalPrice: booking.total_price,
      amountPaid: booking.amount_paid,
      currency: booking.currency,
      specialRequests: booking.special_requests,
      type: booking.property_type,
      guest_id: booking.guest_id,
      guestCount: booking.guest_count,
      source: booking.source,
      status: booking.status,
      payment_status: booking.payment_status,
      created_at: booking.created_at,
      updated_at: booking.updated_at,
      property: {
        id: booking.property_id,
        address_id: booking.address_id,
        realtor_id: booking.realtor_id,
        title: booking.title
      },
      room_type: {
        id: booking.room_id,
        name: booking.room_name
      }
    }))
    return bookings;
  }

  async myBookingsSummary({userId, fields}: {userId, fields: any}): Promise<HostBookingsSummary> {
    console.log({fields})
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE b.status = 'active') AS active_count,
        COUNT(*) FILTER (WHERE b.status = 'completed') AS completed_count,
        COUNT(*) FILTER (WHERE b.status = 'pending') AS pending_count,
        COUNT(*) FILTER (WHERE b.status = 'confirmed') AS confirmed_count
      FROM bookings b
      INNER JOIN room_types rt ON rt.id = b.room_type_id
      INNER JOIN properties p ON p.id = rt.property_id
      WHERE p.realtor_id = $1
    `
    const result = await pool.query(query, [userId])

    const pending_count = result.rows[0]?.pending_count || 0
    const active_count = result.rows[0]?.active_count || 0
    const upcoming_count = result.rows[0]?.confirmed_count || 0

    const summary = {
      pending_count,
      active_count, 
      upcoming_count,
      total: pending_count + active_count + upcoming_count
    }
    return summary
  }

  async realtorBookings({userId, input}: {userId: string, input: SearchBookingInput}): Promise<any[]> {
    const {
      query: search,
      startDate,
      endDate,
      status,
      minPrice,
      maxPrice, 
      guestType
    } = input
    // let query = `
    //   SELECT b.*, rt.name AS room_name, rt.id AS room_id, rt.base_price AS room_base_price, p.id AS property_id, p.title, p.property_type, p.address_id, p.realtor_id from bookings b
    //   INNER JOIN room_types rt ON rt.id = b.room_type_id
    //   INNER JOIN properties p ON p.id = rt.property_id
    //   WHERE p.realtor_id = $1
    // `;

    console.time('search')
    console.log({input})
    let query = `
      SELECT 
        b.*,
        rt.name AS room_name,
        rt.id AS room_id,
        rt.base_price AS room_base_price,
        p.id AS property_id,
        p.title AS property_title,
        p.property_type,
        p.address_id,
        p.realtor_id,
        u.name AS guest_name,
        u.email AS guest_email
      FROM bookings b
      INNER JOIN room_types rt ON rt.id = b.room_type_id
      INNER JOIN properties p ON p.id = rt.property_id
      INNER JOIN users u ON u.id = b.guest_id
      WHERE p.realtor_id = $1
    `;

    const params: any[] = [userId];
    let idx = params.length + 1;
    // const params: any[] = [1];

    if (search) {
      query += `
        AND (
          u.name ILIKE $${idx}
          OR u.email ILIKE $${idx}
          OR p.title ILIKE $${idx}
          OR CAST(b.id AS TEXT) = $${idx + 1}
        )
      `;
      params.push(`%${search}%`, search);
      idx += 2;
    }

    if (startDate) {
      query += ` AND b.check_in >= $${idx}`;
      params.push(startDate);
      idx++;
    }

    if (endDate) {
      query += ` AND b.check_out <= $${idx}`;
      params.push(endDate);
      idx++;
    }

    if (status) {
      query += ` AND b.status = $${idx}`;
      params.push(status);
      idx++;
    }

    if (minPrice) {
      query += ` AND b.total_price >= $${idx}`;
      params.push(minPrice);
      idx++;
    }

    if (maxPrice) {
      query += ` AND b.total_price <= $${idx}`;
      params.push(maxPrice);
      idx++;
    }

    if (guestType === 'repeated') {
      query += `
        AND b.guest_id IN (
          SELECT guest_id
          FROM bookings
          GROUP BY guest_id
          HAVING COUNT(*) > 1
        )
      `
    }

    if (guestType === 'first_time') {
      query += `
        AND b.guest_id IN (
          SELECT guest_id
          FROM bookings
          GROUP BY guest_id
          HAVING COUNT(*) = 1
        )
      `
    }



    query += ' ORDER BY check_in DESC';

    console.log({query, params})

    const result = await pool.query(query, params);
    // console.log({result: result.rows})
    const bookings = result.rows.map((booking) => ({
      id: booking.id,
      room_type_id: booking.room_type_id,
      unit_id: booking.unit_id,
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      totalPrice: booking.total_price,
      amountPaid: booking.amount_paid,
      currency: booking.currency,
      specialRequests: booking.special_requests,
      type: booking.property_type,
      guest_id: booking.guest_id,
      guestCount: booking.guest_count,
      source: booking.source,
      status: booking.status,
      payment_status: booking.payment_status,
      created_at: booking.created_at,
      updated_at: booking.updated_at,
      property: {
        id: booking.property_id,
        address_id: booking.address_id,
        realtor_id: booking.realtor_id,
        title: booking.title
      },
      room_type: {
        id: booking.room_id,
        name: booking.room_name
      }
    }))
    console.timeEnd('search')
    return bookings;
  }

  async findById(id: number): Promise<any | null> {
    const query = `
      SELECT b.*, rt.name AS room_name, rt.id AS room_id, rt.base_price AS room_base_price, p.id AS property_id, p.title, p.property_type, p.address_id, p.realtor_id from bookings b
      INNER JOIN room_types rt ON rt.id = b.room_type_id
      INNER JOIN properties p ON p.id = rt.property_id
      WHERE b.id = $1
    `;
    const result = await this.pool.query(query, [id]);
    const booking = result.rows[0]
    // console.log({result})
    const booking_property = {
      id: booking.id,
      unit_id: booking.unit_id,
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      totalPrice: booking.total_price,
      amountPaid: booking.amount_paid,
      currency: booking.currency,
      specialRequests: booking.special_requests,
      type: booking.property_type,
      guest_id: booking.guest_id,
      guestCount: booking.guest_count,
      source: booking.source,
      status: booking.status,
      payment_status: booking.payment_status,
      created_at: booking.created_at,
      updated_at: booking.updated_at,
      property: {
        id: booking.property_id,
        address_id: booking.address_id,
        realtor_id: booking.realtor_id,
        title: booking.title,
        property_type: booking.property_type
      },
      room_type: {
        id: booking.room_id,
        name: booking.room_name,
        base_price: booking.room_base_price
      }
    }
    return booking_property || null;
  }

  async update(id: number, updates: Partial<Booking>): Promise<Booking | null> {
    const fields: string[] = [];
    const values = [];
    let index = 1;
    if (updates.status) {
      fields.push(`status = $${index++}`);
      values.push(updates.status);
    }
    if (fields.length === 0) return null;
    values.push(id);
    const query = `UPDATE bookings SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`;
    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id: number): Promise<boolean> {
    const query = `DELETE FROM bookings WHERE id = $1`;
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async updateBookingStatus ({ bookingId, status }: { bookingId: number; status: string }) {
      // Check if user is admin/host (implement your auth logic)
      // const isAdmin = context.user?.role === 'admin';
      const isAdmin = true;
      
      if (!isAdmin) {
        return {
          success: false,
          message: 'Unauthorized',
          booking: null,
          errors: ['Only administrators can update booking status']
        };
      }

      try {
        const updateQuery = `
          UPDATE bookings
          SET status = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
        `;
        const result = await pool.query(updateQuery, [
          status.toLowerCase(),
          bookingId
        ]);

        if (result.rows.length === 0) {
          return {
            success: false,
            message: 'Booking not found',
            booking: null,
            errors: ['Booking does not exist']
          };
        }

        return {
          success: true,
          message: 'Booking status updated successfully',
          booking: result.rows[0],
          errors: []
        };
      } catch (error: any) {
        return {
          success: false,
          message: error.message,
          booking: null,
          errors: [error.message]
        };
      }
  }

  async cancelBooking ({ bookingId, userId }: { bookingId: number, userId: string }): Promise<BookingResult> {
    console.log('iosiosioiowjo')
    try {
      // Verify booking belongs to user
      const verifyQuery = `
        SELECT * FROM bookings
        WHERE id = $1 AND guest_id = $2
      `;
      console.log('iosiosi')
      const verifyResult = await pool.query(verifyQuery, [bookingId, userId]);
      console.log({verifyResult: verifyResult.rows[0]})
      if (verifyResult.rows.length === 0) {
        return {
          success: false,
          message: 'Booking not found',
          booking: null,
          errors: ['Booking does not exist or does not belong to you']
        };
      }

      const booking = verifyResult.rows[0];
      
      if (booking.status === 'cancelled') {
        return {
          success: false,
          message: 'Booking is already cancelled',
          booking,
          errors: ['Booking already cancelled']
        };
      }

      // Update booking status
      const updateQuery = `
        UPDATE bookings
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;
      const updateResult = await pool.query(updateQuery, [bookingId]);

      return {
        success: true,
        message: 'Booking cancelled successfully',
        booking: updateResult.rows[0],
        errors: []
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
        booking: null,
        errors: [error.message]
      };
    }
  }
}

export default new BookingModel(pool);