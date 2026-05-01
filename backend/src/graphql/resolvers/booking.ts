// src/graphql/resolvers/booking.ts
import DataLoader from 'dataloader';
import BookingModel from '../../models/Booking.js';
import PropertyModel from '../../models/Property.js';
import UserModel from '../../models/User.js';
import { roomUnitLoader, roomUnitLoader0 } from './property.js';
import { userLoader } from './user.js';
import {GraphQLError} from 'graphql'
import { paymentLoader } from './payment.js';
import { getRequestedFields } from '../../utils/getyRequestedFields.js';
import { User, Booking, Context } from '../../types/index.js';
import { SearchBookingInput, BookingInput } from '../../types/input.js';
import { requireAuth, requireOwnerOrAdmin } from '../../middleware/guards.js';
// import { A } from '@apollo/server';

export const propertyBookingLoader = new DataLoader(async (propertyIds) => {
  const query = `
    SELECT 
      id, 
      property_id, 
      user_id, 
      start_date, 
      end_date, 
      status, 
      created_at
    FROM property_bookings
    WHERE property_id = ANY($1)
  `;
  const result = await UserModel.pool.query(query, [propertyIds]);
  return propertyIds.map(id => result.rows.filter(row => row.property_id === id));
});

export default {
  Query: {
    getBooking: async (_: any, { id }: { id: string }) => {
      return await BookingModel.findById(parseInt(id));
    },
    myBookings: async (_:any, __: any, {context}: {context: Context}) => {
      requireAuth(context)
      return await BookingModel.myBookings({userId: context.user?.id, status: null});
    },

    myBookingsByStatus: async (_:any, {input}: {input: SearchBookingInput}, context: Context) => {
      const user = requireAuth(context)
      // console.log({status})
      return await BookingModel.realtorBookings({userId: user?.id, input});
    },

    calculateBookingPrice: async (_: any, {roomTypeId, checkIn, checkOut}) => {
      return await BookingModel.calculateBookingPrice({roomTypeId, checkIn, checkOut});
    },
    
    myBookingsSummary: async (_: any, __: any, context: Context, info: any) => {
      const user = requireAuth(context)
      const fields = getRequestedFields(info)
      return await BookingModel.myBookingsSummary({userId: user.id, fields})
    }
  },
  Mutation: {
    createBooking: async (_: any, { input }: { input: BookingInput }, context: Context) => {
      requireAuth(context)
      return await BookingModel.create(input);
    },
    updateBooking: async (_: any, { id, status }: { id: string; status: string }, context: Context) => {
      const user = requireAuth(context)
      const booking = await BookingModel.findById(parseInt(id));
      requireOwnerOrAdmin(context, booking.guest_id)
      return await BookingModel.update(parseInt(id), { status });
    },
    cancelBooking: async (_: any, { id }: { id: string }, context: Context) => {
      const user = requireAuth(context)
      // console.log({user, id})
      const booking = await BookingModel.findById(parseInt(id));
      requireOwnerOrAdmin(context, booking.guest_id)
      return await BookingModel.cancelBooking({bookingId: parseInt(id), userId: user.id});
    },
    refreshRateCalendar: async (_:any, {id}) => {}
  },
  Booking: {
    unit: async (parent: any) => {
      console.log({ow: parent})
      return await roomUnitLoader0.load(parent.unit_id)
    },
    guest: async (parent: any) => {
      console.log({sis: parent.guest_id})
      return await userLoader.load(parent.guest_id);
    },
  },
  MyBookingResult: {
    unit: async (parent: any) => {
      console.log({ow: parent})
      return await roomUnitLoader0.load(parent.unit_id)
    },
    guest: async (parent: any) => {
      console.log({sis: parent.guest_id})
      return await userLoader.load(parent.guest_id);
    },
    payments: async (parent: any) => {
      return await paymentLoader.load(parent.id)
    },
  },
};