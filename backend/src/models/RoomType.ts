// src/models/Message.ts
import { Pool } from 'pg';
import pool from '../config/database.js';
import { RoomType, } from './Property.js';
import room_type from '../graphql/resolvers/room_type.js';
import { AuthUser, Unit, User } from '../types/index.js';


export interface CreateRoomTypeInput {
    property_id: number
    name: string
    description: string
    capacity: number
    bed_count: number
    bathroom_count: number
    size_sqft: number
    base_price: number
    weekly_rate: number
    monthly_rate: number
    currency: string
    amenities: string[]
    min_nights: number
    max_nights: number,
    is_active: boolean
  }

export  interface CreateRoomUnitInput {
    room_type_id: number
    unit_code: string
    status: 'active' | 'maintainance' | 'inactive'
    auto_generate_code: boolean
    floor_number: number
    quantity: number
  }

  export interface UpdateRoomUnitInput {
    unit_code: String
    status: 'active' | 'maintainance' | 'inactive'
  }

export class RoomTypeModel {
  constructor(private pool: Pool) {}

  async createRoomType(input: CreateRoomTypeInput, user: AuthUser): Promise<{
    success: boolean,
    message: string,
    room_type: RoomType
  }> {
    // Verify property ownership
    const propertyCheck = await pool.query(
      'SELECT realtor_id FROM properties WHERE id = $1 AND deleted_at IS NULL',
      [input.property_id]
    );
    
    if (propertyCheck.rows.length === 0) {
      throw new Error('Property not found');
    }
    
    if (propertyCheck.rows[0].realtor_id !== user.id) {
      throw new Error('Not authorized');
    }

    // Validation
    if (!input.name || input.name.trim().length < 2) {
      throw new Error('Room type name must be at least 2 characters');
    }
    
    if (!input.base_price || input.base_price <= 0) {
      throw new Error('Base price must be greater than 0');
    }

    const client = await pool.connect()

    try {
        await client.query('BEGIN')

        const result = await client.query(
            `INSERT INTO room_types 
            (property_id, name, description, capacity, bed_count, bathroom_count, 
             size_sqft, base_price, weekly_rate, monthly_rate, currency, amenities, 
             min_nights, max_nights) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
            RETURNING *`,
            [
                input.property_id, input.name.trim(), input.description?.trim() || null,
                input.capacity || 1,
                input.bed_count || 1,
                input.bathroom_count || 1,
                input.size_sqft || null,
                input.base_price,
                input.weekly_rate || null,
                input.monthly_rate || null,
                input.currency || 'USD',
                JSON.stringify(input.amenities || []),
                input.min_nights || 1,
                input.max_nights || null,
            ]
        )

        await client.query('COMMIT')

        const roomType = result.rows[0]

        return {
            success: true,
            message: "Room type created successfully",
            room_type: {
                ...roomType,
                base_price: parseFloat(roomType.base_price),
                weekly_rate: roomType.weekly_rate ? parseFloat(roomType.weekly_rate) : null,
                monthly_rate: roomType.monthly_rate ? parseFloat(roomType.monthly_rate) : null,
                created_at: roomType.created_at.toISOString(),
                units: [],
                available_units_count: 0,
            }
        }
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Create room type error:', error)
        throw new Error('Failed to create room type')
    }
  }

  async updateRoomType(id: number, input: CreateRoomTypeInput, user: AuthUser): Promise<{
    success: boolean,
    message: string,
    room_type: RoomType
  }> {
    // Verify ownership
    const ownershipCheck = await pool.query(
      `SELECT p.realtor_id 
       FROM room_types rt 
       JOIN properties p ON rt.property_id = p.id 
       WHERE rt.id = $1 AND rt.deleted_at IS NULL`,
      [id]
    );

    if (ownershipCheck.rows.length === 0) {
      throw new Error('Room type not found');
    }

    if (ownershipCheck.rows[0].realtor_id !== user.id) {
      throw new Error('Not authorized');
    }

    console.log('editing')

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (input.name !== undefined) {
        updates.push(`name = $${paramCount}`)
        values.push(input.name.trim())
        paramCount++
    }

    if (input.description !== undefined) {
        updates.push(`description = $${paramCount}`)
        values.push(input.description.trim() || null)
        paramCount++
    }

    if (input.capacity !== undefined) {
        updates.push(`capacity = $${paramCount}`);
        values.push(input.capacity);
        paramCount++;
    }

    if (input.bed_count !== undefined) {
      updates.push(`bed_count = $${paramCount}`);
      values.push(input.bed_count);
      paramCount++;
    }

    if (input.bathroom_count !== undefined) {
      updates.push(`bathroom_count = $${paramCount}`);
      values.push(input.bathroom_count);
      paramCount++;
    }

    if (input.size_sqft !== undefined) {
      updates.push(`size_sqft = $${paramCount}`);
      values.push(input.size_sqft);
      paramCount++;
    }

    if (input.base_price !== undefined) {
      updates.push(`base_price = $${paramCount}`);
      values.push(input.base_price);
      paramCount++;
    }

    if (input.weekly_rate !== undefined) {
      updates.push(`weekly_rate = $${paramCount}`);
      values.push(input.weekly_rate);
      paramCount++;
    }

    if (input.monthly_rate !== undefined) {
      updates.push(`monthly_rate = $${paramCount}`);
      values.push(input.monthly_rate);
      paramCount++;
    }

    if (input.currency !== undefined) {
      updates.push(`currency = $${paramCount}`);
      values.push(input.currency);
      paramCount++;
    }

    if (input.amenities !== undefined) {
      updates.push(`amenities = $${paramCount}`);
      values.push(JSON.stringify(input.amenities));
      paramCount++;
    }

    if (input.min_nights !== undefined) {
      updates.push(`min_nights = $${paramCount}`);
      values.push(input.min_nights);
      paramCount++;
    }

    if (input.max_nights !== undefined) {
      updates.push(`max_nights = $${paramCount}`);
      values.push(input.max_nights);
      paramCount++;
    }

    if (input.is_active !== undefined) {
      updates.push(`is_active = $${paramCount}`);
      values.push(input.is_active);
      paramCount++;
    }

    if (updates.length === 0) {
        throw new Error('No fields to update')
    }

    values.push(id)

    const result = await pool.query(
        `UPDATE room_types SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
    )

    const roomType = result.rows[0]

    return {
        success: true,
        message: "Room type updated successfully",
        room_type: {
            ...roomType,
            base_price: parseFloat(roomType.base_price),
            weeklyRate: roomType.weekly_rate ? parseFloat(roomType.weekly_rate) : null,
            monthlyRate: roomType.monthly_rate ? parseFloat(roomType.monthly_rate) : null,
            created_at: roomType.created_at.toISOString(),
            units: [],
        }
    }
  }

  async deleteRoomType(id: number, user: AuthUser) {
    const ownershipCheck = await pool.query(
      `SELECT p.realtor_id 
       FROM room_types rt 
       JOIN properties p ON rt.property_id = p.id 
       WHERE rt.id = $1 AND rt.deleted_at IS NULL`,
      [id]
    );
    console.log({id})

    if (ownershipCheck.rows.length === 0) {
      throw new Error('Rooms type not found');
    }

    if (ownershipCheck.rows[0].realtor_id !== user.id) {
      throw new Error('Not authorized');
    }

    // Check for active bookings
    const bookingsCheck = await pool.query(
      `SELECT COUNT(*) FROM bookings 
       WHERE room_type_id = $1 
       AND status IN ('pending', 'confirmed', 'active')`,
      [id]
    );
    
    if (parseInt(bookingsCheck.rows[0].count) > 0) {
      throw new Error('Cannot delete room type with active bookings');
    }
    
    await pool.query(
      'UPDATE room_types SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
    
    return {
      success: true,
      message: 'Room type deleted successfully',
    };
  } 

  //units
  async createRoomUnit(input: CreateRoomUnitInput, user: AuthUser): Promise<{
    success: boolean,
    message: string,
    unit: Unit | null,
    units: Unit[]
  }> {
    // Verify ownership
    const ownershipCheck = await pool.query(
      `SELECT p.realtor_id 
       FROM room_types rt 
       JOIN properties p ON rt.property_id = p.id 
       WHERE rt.id = $1 AND rt.deleted_at IS NULL`,
      [input.room_type_id]
    );
    
    if (ownershipCheck.rows.length === 0) {
      throw new Error('Room type not found');
    }
    
    if (ownershipCheck.rows[0].realtor_id !== user.id) {
      throw new Error('Not authorized');
    }

    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      // Single unit creation
      if (!input.quantity || input.quantity === 1) {
        let unitCode = input.unit_code;
      
        // Auto-generate code if needed
        if (!unitCode || input.auto_generate_code) {
          if (input.floor_number) {
            const lastUnit = await client.query(
              `SELECT unit_code FROM room_units 
               WHERE room_type_id = $1 AND unit_code LIKE $2 
               ORDER BY unit_code DESC LIMIT 1`,
              [input.room_type_id, `${input.floor_number}%`]
            );
      
            if (lastUnit.rows.length === 0) {
              unitCode = `${input.floor_number}01`;
            } else {
              const lastCode = lastUnit.rows[0].unit_code;
              const roomNum = parseInt(lastCode.slice(-2)) + 1;
              unitCode = `${input.floor_number}${roomNum.toString().padStart(2, '0')}`;
            }
          } else {
            const lastUnit = await client.query(
              `SELECT unit_code FROM room_units 
               WHERE room_type_id = $1 
               ORDER BY unit_code DESC LIMIT 1`,
              [input.room_type_id]
            );
      
            if (lastUnit.rows.length === 0) {
              unitCode = '101';
            } else {
              const lastCode = lastUnit.rows[0].unit_code;
              const nextNum = parseInt(lastCode) + 1;
              unitCode = nextNum.toString();
            }
          }
        }
      
        // Check for duplicates
        const duplicateCheck = await client.query(
          'SELECT id FROM room_units WHERE room_type_id = $1 AND unit_code = $2',
          [input.room_type_id, unitCode]
        );
      
        if (duplicateCheck.rows.length > 0) {
          throw new Error(`Unit code ${unitCode} already exists`);
        }
      
        const result = await client.query(
          `INSERT INTO room_units (room_type_id, unit_code, status) 
           VALUES ($1, $2, $3) 
           RETURNING *`,
          [input.room_type_id, unitCode, input.status || 'active']
        );
      
        await client.query('COMMIT');
      
        return {
          success: true,
          message: 'Room unit created successfully',
          unit: {
            ...result.rows[0],
            created_at: result.rows[0].created_at.toISOString(),
          },
          units: []
        };
      }

      // Batch creation
      const quantity = input.quantity;
      const floorNumber = input.floor_number || 1;
      const units: any[] = [];

      for (let i = 0; i< quantity; i++) {
        const lastUnit = await client.query(
          `SELECT unit_code FROM room_units 
            WHERE room_type_id = $1 AND unit_code LIKE $2 
            ORDER BY unit_code DESC LIMIT 1`,
          [input.room_type_id, `${floorNumber}%`]
        );

        let unitCode: string;
        if (lastUnit.rows.length === 0 && i === 0) {
          unitCode = `${floorNumber}01`;
        } else {
          const baseCode = i === 0 ? lastUnit.rows[0].unit_code : units[i - 1].unit_code;
          const roomNum = parseInt(baseCode.slice(-2)) + 1;
          unitCode = `${floorNumber}${roomNum.toString().padStart(2, '0')}`;
        }

        const result = await client.query(
          `INSERT INTO room_units (room_type_id, unit_code, status) 
           VALUES ($1, $2, $3) 
           RETURNING *`,
          [input.room_type_id, unitCode, input.status || 'active']
        );

        units.push({
          ...result.rows[0],
          created_at: result.rows[0].created_at.toISOString(),
        });
      }

      await client.query('COMMIT')

      return {
        success: true,
        message: `${quantity} room units created successfully`,
        unit: null,
        units,
      }
    } catch (error) {
      
    }
  }

  async updateRoomUnit(id: number, input: UpdateRoomUnitInput, user: AuthUser): Promise<{
    success: boolean,
    message: string,
    unit: Unit
  }> {
    const ownershipCheck = await pool.query(
      `SELECT p.realtor_id 
       FROM room_units ru
       JOIN room_types rt ON ru.room_type_id = rt.id
       JOIN properties p ON rt.property_id = p.id 
       WHERE ru.id = $1`,
      [id]
    );
    
    if (ownershipCheck.rows.length === 0) {
      throw new Error('Room unit not found');
    }
    
    if (ownershipCheck.rows[0].realtor_id !== user.id) {
      throw new Error('Not authorized');
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    if (input.unit_code !== undefined) {
      updates.push(`unit_code = $${paramCount}`);
      values.push(input.unit_code);
      paramCount++;
    }
    
    if (input.status !== undefined) {
      updates.push(`status = $${paramCount}`);
      values.push(input.status);
      paramCount++;
    }
    
    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);
    
    const result = await pool.query(
      `UPDATE room_units SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    return {
      success: true,
      message: 'Room unit updated successfully',
      unit: {
        ...result.rows[0],
        created_at: result.rows[0].created_at.toISOString(),
      },
    };

          
  }

  async deleteRoomUnit(id: number, user: AuthUser) {
    const ownershipCheck = await pool.query(
      `SELECT p.realtor_id 
       FROM room_units ru
       JOIN room_types rt ON ru.room_type_id = rt.id
       JOIN properties p ON rt.property_id = p.id 
       WHERE ru.id = $1`,
      [id]
    );
    
    if (ownershipCheck.rows.length === 0) {
      throw new Error('Room unit not found');
    }
    
    if (ownershipCheck.rows[0].realtor_id !== user.id) {
      throw new Error('Not authorized');
    }

    // Check for active bookings
    const bookingsCheck = await pool.query(
      `SELECT COUNT(*) FROM bookings 
       WHERE unit_id = $1 
       AND status IN ('pending', 'confirmed', 'active')`,
      [id]
    );
    
    if (parseInt(bookingsCheck.rows[0].count) > 0) {
      throw new Error('Cannot delete unit with active bookings');
    }
    
    await pool.query('DELETE FROM room_units WHERE id = $1', [id]);
    
    return {
      success: true,
      message: 'Room unit deleted successfully',
    };
  }
  
}

export default new RoomTypeModel(pool);