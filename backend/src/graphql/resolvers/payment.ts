import { Stripe } from 'stripe'
import BookingModel from '../../models/Booking.js';
import StripeService from '../../models/StripeService.js';
import { Pool } from 'pg';
import DataLoader from 'dataloader';
import pool from '../../config/database.js';
import { GraphQLError } from 'graphql';
import { AuthUser, Context, User } from '../../types/index.js';
import { requireAuth, requireOwnerOrAdmin } from '../../middleware/guards.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-11-17.clover',
    typescript: true
});

export const paymentLoader = new DataLoader(async (ids: number[]) => {
  const query = `
    SELECT id, booking_id, amount, currency, status, refunded_amount, refunded_at, created_at, payment_method
    FROM payments
    WHERE booking_id = ANY($1) AND status IN ('paid', 'partial') 
  `;
  console.log({ids})
  const result = await pool.query(query, [ids]);
  console.log(ids.map(id => result.rows.find(row => row.booking_id == id)))
  return ids.map(id => result.rows.filter(row => row.booking_id == id) || null);
});
export default {
  Query: {
    getPayment: async (_: any, { bookingId }: { bookingId: number }, context: { db: Pool; user: AuthUser }) => {
      const user = requireAuth(context);

      const result = await context.db.query(
        `SELECT p.* 
         FROM payments p
         INNER JOIN bookings b ON p.booking_id = b.id
         WHERE p.booking_id = $1 AND b.guest_id = $2
         ORDER BY p.created_at DESC
         LIMIT 1`,
        [bookingId, user.id]
      );

      if (result.rows.length === 0) return null;

      const payment = result.rows[0];
      return {
        id: payment.id,
        bookingId: payment.booking_id,
        amount: parseFloat(payment.amount),
        currency: payment.currency,
        status: payment.status,
        paymentMethod: payment.payment_method,
        createdAt: payment.created_at,
      };
    },

    getPaymentHistory: async (_: any, { userId }: { userId: number }, context: { db: Pool; user: AuthUser }) => {
      const user = requireAuth(context);
      requireOwnerOrAdmin(context, String(userId));  // prevents querying another user's history

      const result = await context.db.query(
        `SELECT p.* 
         FROM payments p
         INNER JOIN bookings b ON p.booking_id = b.id
         WHERE b.guest_id = $1
         ORDER BY p.created_at DESC`,
        [userId]
      );

      return result.rows.map((payment: any) => ({
        id: payment.id,
        bookingId: payment.booking_id,
        amount: parseFloat(payment.amount),
        currency: payment.currency,
        status: payment.status,
        paymentMethod: payment.payment_method,
        createdAt: payment.created_at,
      }));
    },
  },

  Mutation: {
    createCheckoutSession: async (
      _: any,
      { input }: { input: { bookingId: string; successUrl: string; cancelUrl: string; paymentOption: 'FULL' | 'PARTIAL' } },
      context: Context
    ) => {
      const user = requireAuth(context);

      const { bookingId, successUrl, cancelUrl, paymentOption } = input;

      try {
        const session = await StripeService.createCheckoutSession(
          parseInt(bookingId),
          user,
          successUrl,
          cancelUrl,
          paymentOption
        );
        paymentLoader.clear(parseInt(bookingId));
        return session;
      } catch (error: any) {
        throw new Error(error.message || 'Failed to create checkout session');
      }
    },

    processRefund: async (
      _: any,
      { bookingId, amount, reason }: { bookingId: number; amount?: number; reason?: string },
      context: { db: Pool; user: AuthUser }
    ) => {
      const user = requireAuth(context);

      const bookingCheck = await context.db.query(
        `SELECT guest_id FROM bookings WHERE id = $1`,
        [bookingId]
      );

      if (bookingCheck.rows.length === 0) {
        throw new GraphQLError('Booking not found.', {
          extensions: { code: 'NOT_FOUND', http: { status: 404 } },
        });
      }

      requireOwnerOrAdmin(context, String(bookingCheck.rows[0].guest_id));

      try {
        const result = await StripeService.processRefund(bookingId, amount, reason);
        return {
          success: result.success,
          refundId: result.refundId,
          message: 'Refund processed successfully',
        };
      } catch (error: any) {
        return {
          success: false,
          refundId: null,
          message: error.message || 'Failed to process refund',
        };
      }
    },
  },
}