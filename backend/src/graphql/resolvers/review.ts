// src/graphql/resolvers/review.ts
import ReviewModel from '../../models/Review.js';
import PropertyModel from '../../models/Property.js';
import UserModel from '../../models/User.js';
import DataLoader from 'dataloader';
import pool from '../../config/database.js';
// import { Error } from '@apollo/server';
import { User, Review, Context } from '../../types/index.js';
import { ReviewInput } from '../../types/input.js';
import { requireAuth, requireOwnerOrAdmin } from '../../middleware/guards.js';

export const reveiwLoader = new DataLoader(async (ids: string[]) => {
  const query = `
    SELECT * FROM reviews
    WHERE room_type_id = ANY($1)
  `;
  const result = await pool.query(query, [ids]);
  return ids.map(id => result.rows.filter(row => row.room_type_id === id));
});

export default {
  Query: {
    getReview: async (_: any, { id }: { id: string }) => {
      return await ReviewModel.findById(id);
    },
    getReviews: async (_: any, { propertyId }: { propertyId: string }) => {
      return await ReviewModel.findByPropertyId(parseInt(propertyId));
    },
  },
  Mutation: {
    createReview: async (_: any, { input }: { input: ReviewInput }, context: Context) => {
      const user = requireAuth(context)
      reveiwLoader.clear(user.id)
      return await ReviewModel.create({ ...input, user_id: user.id });
    },
    updateReview: async (_: any, { id, input }: { id: string; input: Review }, context: Context) => {
      const user = requireAuth(context)
      const review = await ReviewModel.findById(id);
      requireOwnerOrAdmin(context, review.guest_id)
      return await ReviewModel.update(id, input);
    },
    deleteReview: async (_: any, { id }: { id: string }, context: Context) => {
      const user = requireAuth(context)
      const review = await ReviewModel.findById(id);
      requireOwnerOrAdmin(context, review.guest_id)
      return await ReviewModel.delete(id);
    },
  },
  Review: {
    property: async (parent: Review) => {
      return await PropertyModel.findById(parent.property_id);
    },
    user: async (parent: Review) => {
      return await UserModel.findById(parent.guest_id);
    },
  },
};