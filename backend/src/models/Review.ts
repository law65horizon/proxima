// src/models/Review.ts
import { Pool } from 'pg';
import pool from '../config/database.js';
import { ReviewInput } from '../types/input.js';
import { Review } from '../types/index.js';


export class ReviewModel {
  constructor(private pool: Pool) {}

  async create(review: Omit<ReviewInput, 'created_at'>): Promise<Review> {
    const bookingQuery = `
      SELECT b.room_type_id,  p.id AS property_id, p.realtor_id from bookings b
      INNER JOIN room_types rt ON rt.id = b.room_type_id
      INNER JOIN properties p ON p.id = rt.property_id
      WHERE b.id = $1 AND b.guest_id = $2
    `
    const bookingResult = await this.pool.query(bookingQuery, [review.bookingId, review.user_id])

    console.log(bookingResult.rows[0], review.bookingId, review.user_id)
    if (bookingResult.rows.length === 0) {
      throw new Error('Booking not found or unauthorized');
    }

    const booking = bookingResult.rows[0]

    const query = `
      INSERT INTO reviews (booking_id, guest_id, room_type_id, property_id, realtor_id, rating, comment)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      review.bookingId,
      review.user_id,
      booking.room_type_id,
      booking.property_id,
      booking.realtor_id,
      review.rating,
      review.comment,
    ]);
    return result.rows[0];
  }

  async findById(id: string): Promise<Review | null> {
    const query = `SELECT * FROM reviews WHERE id = $1`;
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByPropertyId(propertyId: number): Promise<Review[]> {
    const query = `SELECT * FROM reviews WHERE property_id = $1`;
    const result = await this.pool.query(query, [propertyId]);
    return result.rows;
  }

  async update(id: string, review: Partial<Review>): Promise<Review | null> {
    const fields = [];
    const values = [];
    let index = 1;
    for (const [key, value] of Object.entries(review)) {
      if (value !== undefined) {
        fields.push(`${key} = $${index++}`);
        values.push(value);
      }
    }
    if (fields.length === 0) return null;
    values.push(id);
    const query = `UPDATE reviews SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`;
    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const query = `DELETE FROM reviews WHERE id = $1`;
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export default new ReviewModel(pool);