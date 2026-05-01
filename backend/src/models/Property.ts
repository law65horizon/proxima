// propertyModel.ts - Production-ready with best practices
import { Pool, PoolClient } from "pg";
import pool from "../config/database.js";
import redisClient from "../config/redis.js";
import cloudinary from "../config/cloudinary.js";
import {deleteFromCloudinary} from '../utils/deleteFromCloudinary.js'
import {getCode} from 'country-list'
import { Address, Unit, RateCalendar, Recents } from "../types/index.js";
import { SearchRoomsInput, ImageManageMentInput, ImagesInput } from "../types/input.js";

// ============================================
// TYPES & INTERFACES
// ============================================


export interface RoomType {
  id: number;
  property_id: number;
  name: string;
  description?: string;
  capacity?: number;
  bed_count?: number;
  bathroom_count?: number;
  size_sqft?: number;
  base_price?: number;
  derived_price?: number;
  currency?: string;
  is_active?: boolean;
  amenities?: string[];
  units?: Unit[];
  pricingRules?: PricingRule[];
  durationDiscounts?: DurationDiscount[];
  created_at?: string;
  updated_at?: string;
  property: Omit<Property, "roomTypes">;
  availableUnits?: number;
  totalUnits?: number;
  duration?: string;
  monthlyRate?: number;
  weeklyRate?: number;
  totalReviews?: number;
  avg_rating?: number
}

interface PricingRule {
  startDate: string;
  endDate: string;
  nightlyRate?: number;
  minStay?: number;
  maxStay?: number;
  note?: string;
}

interface DurationDiscount {
  stayType: string;
  discountPercent: number;
}

export interface Property {
  id: number;
  realtor_id: string;
  address_id: number;
  title: string;
  speciality: string;
  amenities: string[];
  price: number;
  description?: string;
  property_type: "apartment" | "hotel" | "house";
  sale_status: "rent" | "sale";
  status: "draft" | "published" | "pending_review" | "archived";
  created_at?: string;
  updated_at?: string;
  address?: Address;
  roomTypes: RoomType[];
  images?: ImagesInput[];
}

export interface PropertyEdit {
  id: number;
  realtor_id: number;
  address_id: number;
  title: string;
  speciality: string;
  amenities: string[];
  price: number;
  description?: string;
  property_type: "apartment" | "hotel" | "house";
  sale_status: "rent" | "sale";
  status: "draft" | "published" | "pending_review" | "archived";
  created_at?: string;
  updated_at?: string;
  address?: Address;
  images?: ImageManageMentInput;
}


// ============================================
// CONSTANTS
// ============================================

const CACHE_TTL = {
  PROPERTY_DETAIL: 600, // 10 minutes
  ROOM_TYPE_DETAIL: 600,
  SEARCH_RESULTS: 300, // 5 minutes
  AVAILABILITY: 180, // 3 minutes
};

const GEO_KEY = "properties:geo";
const PROPERTY_HASH_PREFIX = "property:hash:";

const PAGINATION_LIMITS = {
  MIN: 1,
  MAX: 100,
  DEFAULT: 20,
};

// ============================================
// PROPERTY MODEL CLASS
// ============================================

export class PropertyModel {
  constructor(private pool: Pool) {}

  // ============================================
  // HELPER METHODS
  // ============================================

  private mapGraphQLFieldsToColumns(
    requestedFields: string[],
    prefix = "p"
  ): string[] {
    const fieldMap: Record<string, string> = {
      id: "id",
      realtor_id: "realtor_id",
      address_id: "address_id",
      title: "title",
      speciality: "speciality",
      amenities: "amenities",
      price: "price",
      base_price: "base_price",
      description: "description",
      status: "status",
      created_at: "created_at",
      updated_at: "updated_at",
      property_type: "property_type",
      sale_status: "sale_status",
      property_id: "property_id",
      name: "name",
      bed_count: "bed_count",
      bathroom_count: "bathroom_count",
      size_sqft: "size_sqft",
      capacity: "capacity",
      currency: "currency",
      isActive: "is_active",
      weeklyRate: "weekly_rate",
      monthlyRate: "monthly_rate",
    };

    const requiredFields = prefix === "p" ? ["id", "realtor_id", "address_id"] : ["id"];
    const selectedFields = new Set<string>(requiredFields);

    requestedFields.forEach((field) => {
      if (fieldMap[field] && !selectedFields.has(fieldMap[field])) {
        selectedFields.add(fieldMap[field]);
      }
    });

    return Array.from(selectedFields).map((field) => `${prefix}.${field}`);
  }

  private async invalidatePropertyCache(propertyId: number, realtorId?: number): Promise<void> {
    const pipeline = redisClient.multi();

    pipeline.del(`property:${propertyId}`);
    pipeline.del(`roomType:property:${propertyId}`);
    
    if (realtorId) {
      console.log({realtorId})
      pipeline.del(`properties:realtor:${realtorId}:*`);
    }

    // Invalidate search caches
    const searchKeys = await redisClient.keys("search:*");
    searchKeys.forEach((key) => pipeline.del(key));

    await pipeline.exec();
  }

  private async getOrCreateAddress(
    client: PoolClient,
    address: Omit<Address, "id" | "created_at">
  ): Promise<number> {
    const code = getCode(address.country)
    console.log({code, coutry: address})
    console.log(address.country.trim().toLocaleLowerCase())
    // Get or create country
    const countryResult = await client.query(
      `INSERT INTO countries (name, code)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [address.country.trim().toLocaleLowerCase(), address.country.slice(0,2).toUpperCase()]
    );

    // const countryResult = await client.query(
    //   `WITH ins AS (
    //      INSERT INTO countries (name, code)
    //      VALUES ($1, $2)
    //      ON CONFLICT (name) DO NOTHING
    //      RETURNING id
    //    )
    //    SELECT id FROM ins
    //    UNION ALL
    //    SELECT id FROM countries WHERE name = $1
    //    LIMIT 1`,
    //   [address.country.trim().toLocaleLowerCase(), address.country.slice(0, 2).toUpperCase()]
    // );
    const countryId = countryResult.rows[0].id;

    // Get or create city
    const cityResult = await client.query(
      `INSERT INTO cities (name, country_id)
       VALUES ($1, $2)
       ON CONFLICT (name, country_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [address.city.trim().toLocaleLowerCase(), countryId]
    );
    const cityId = cityResult.rows[0].id;

    // Get or create address
    const addressResult = await client.query(
      `INSERT INTO addresses (street, city_id, postal_code, geom)
       VALUES ($1, $2, $3, ST_SetSrid(ST_MakePoint($4, $5), 4326)::geography)
       ON CONFLICT (street, city_id, postal_code) DO UPDATE 
       SET geom = ST_SetSrid(ST_MakePoint($4, $5), 4326)::geography
       RETURNING id`,
      [
        address.street.trim().toLocaleLowerCase(),
        cityId,
        address.postal_code || null,
        address.latitude || null,
        address.longitude || null,
      ]
    );

    return addressResult.rows[0].id;
  }

  private async indexPropertyInRedis(
    propertyId: number,
    roomTypeId: number,
    data: {
      basePrice: number;
      bedrooms: number;
      bathrooms: number;
      type: string;
      status: boolean;
      addressId: number
    }
  ): Promise<void> {
    try {
      const coordsResult = await this.pool.query(
        `
          SELECT
            ST_Y(geom::geometry) as latitude,
            ST_X(geom::geometry) as longitude
          FROM addresses WHERE id = $1
        `,
        [data.addressId]
      )

      if (!coordsResult.rows[0] || !coordsResult.rows[0].latitude || !coordsResult.rows[0].longitude) {
        console.warn(`No valid coordinates for address ${data.addressId}`);
        return;
      }
    
      const { latitude, longitude } = coordsResult.rows[0];
      // Add to geo index
      await redisClient.geoAdd(GEO_KEY, {
        longitude: parseFloat(longitude),
        latitude: parseFloat(latitude),
        member: roomTypeId.toString(),
      });

      // Store filterable attributes
      await redisClient.hSet(`${PROPERTY_HASH_PREFIX}${roomTypeId}`, {
        propertyId: propertyId.toString(),
        basePrice: data.basePrice.toString(),
        bedrooms: data.bedrooms.toString(),
        bathrooms: data.bathrooms.toString(),
        type: data.type,
        status: data.status ? "active" : "inactive",
        latitude: latitude.toString(),
        longitude: longitude.toString(),
      });

      // Set expiry
      await redisClient.expire(`${PROPERTY_HASH_PREFIX}${roomTypeId}`, 86400);
    } catch (error) {
      console.error("Redis indexing error:", error);
      // Don't throw - Redis failures shouldn't break property creation
    }
  }

  private calculateDuration(checkIn: Date, checkOut: Date): string {
    const nights = Math.ceil(
      (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (nights >= 30) return "monthly";
    if (nights >= 7) return "weekly";
    return "daily";
  }

  private parseAddressQuery(query: string): {
    useFullText: boolean;
    usePostalCode: boolean;
    useCity: boolean;
    normalizedQuery: string;
  } {
    const trimmed = query.trim();
    
    // Check if it's primarily numeric (likely postal code)
    const digitsOnly = trimmed.replace(/[^0-9]/g, '');
    const usePostalCode = digitsOnly.length >= 5;
    
    // Check if it's a short query (likely city/state)
    const useCity = trimmed.split(/\s+/).length <= 2 && !usePostalCode;
    
    // Otherwise use full-text search
    const useFullText = !usePostalCode && !useCity;
    
    return {
      useFullText,
      usePostalCode,
      useCity,
      normalizedQuery: trimmed.toLowerCase()
    };
  }

  // private buildAddressFilter(
  //   query?: string,
  //   latitude?: number,
  //   longitude?: number,
  //   radius?: number
  // ): string {
  //   if(latitude && longitude && radius) {
  //     return `
  //       SELECT a.id, a.street, a.postal_code, a.geom, c.name as city_name, co.name as country_name
  //       FROM addresses a
  //       INNER JOIN cities c ON a.city_id = c.id
  //       INNER JOIN countries co ON c.country_id = co.id
  //       WHERE ST_DWITHIN(
  //         a.geom, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
  //         ${radius}
  //       )
  //     `
  //   }

  //   if (query) {
  //     const parsed = this.parseAddressQuery(query)

  //     if (parsed.usePostalCode) {
  //       const normalized = query.replace(/[^0-9]/g, '');
  //       return `
  //         SELECT a.id, a.street, a.postal_code, a.geom, c.name as city_name, c.id as city_id, co.name as country_name, c.id as city_id
  //         FROM addresses a
  //         INNER JOIN cities c ON a.city_id = c.id
  //         INNER JOIN countries co ON c.country_id = co.id
  //         WHERE a.postal_code ILIKE '%${normalized}%'
  //       `
  //     }

  //     if(parsed.useCity) {
  //       return `
  //         SELECT a.id, a.street, a.postal_code, a.geom, c.name as city_name, c.id as city_id, co.name as country_name, c.id as city_id
  //         FROM addresses a
  //         INNER JOIN cities c ON a.city_id = c.id
  //         INNER JOIN countries co ON c.country_id = co.id
  //         WHERE c.name ILIKE '%${parsed.normalizedQuery}%'
  //       `
  //     }

  //     return `
  //       SELECT a.id, a.street, a.postal_code, a.geom, c.name as city_name, c.id as city_id, co.name as country_name, c.id as city_id
  //       FROM addresses a
  //       INNER JOIN cities c ON a.city_id = c.id
  //       INNER JOIN countries co ON c.country_id = co.id
  //       WHERE a.search_vector @@ plainto_tsquery('english', '${query}')
  //     `
  //   }
  // }

  private buildAddressFilter1(
    query?: string,
    latitude?: number,
    longitude?: number,
    radius?: number
  ): string {
    if(latitude && longitude && radius) {
      return `
        SELECT a.id, a.street, a.postal_code, a.geom, c.name as city_name, co.name as country_name, co.id as country_id
        FROM addresses a
        INNER JOIN cities c ON a.city_id = c.id
        INNER JOIN countries co ON c.country_id = co.id
        WHERE ST_DWITHIN(
          a.geom, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
          ${radius}
        )
      `
    }

    if (query) {
      const parsed = this.parseAddressQuery(query)

      if (parsed.usePostalCode) {
        const normalized = query.replace(/[^0-9]/g, '');
        return `
          SELECT a.id, a.street, a.postal_code, a.geom, c.name as city_name, c.id as city_id, co.name as country_name, co.id as country_id
          FROM addresses a
          INNER JOIN cities c ON a.city_id = c.id
          INNER JOIN countries co ON c.country_id = co.id
          WHERE a.postal_code ILIKE '%${normalized}%'
        `
      }

      if(parsed.useCity) {
        return `
          SELECT c.id as city_id, c.name as city_name, co.name as country_name, co.id as country_id
          FROM cities c
          INNER JOIN countries co ON c.country_id = co.id
          where c.name ILIKE '%${parsed.normalizedQuery}%'
        `
      }

      return `
        SELECT a.id, a.street, a.postal_code, a.geom, c.name as city_name, c.id as city_id, co.name as country_name, co.id as country_id
        FROM addresses a
        INNER JOIN cities c ON a.city_id = c.id
        INNER JOIN countries co ON c.country_id = co.id
        WHERE a.search_vector @@ plainto_tsquery('english', '${query}')
      `
    } 
    return ''
  }

  private buildAvailabilityFilter (
    checkIn: Date,
    checkOut: Date,
  ): string {
    return `
      SELECT 1 FROM room_units u
      WHERE u.room_type_id = rt.id
        AND u.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.unit_id = u.id
          AND b.status IN ('pending', 'confirmed')
          AND daterange(b.check_in, b.check_out, '[)')
            && daterange(DATE '${checkIn}', DATE '${checkOut}','[)')
        )
    `
  }

  // ============================================
  // CREATE PROPERTY
  // ============================================

  async create(
    property: Omit<Property, "id" | "created_at" | "updated_at"> & {
      address: Omit<Address, "id" | "created_at">;
      images: ImagesInput[];
    }
  ): Promise<Property> {
    if (property.title.trim().length < 3) {
      throw new Error('Property title must be at least 3 characters');
    }

    if (!property.description || property.description.trim().length < 50) {
      throw new Error('Property description must be at least 50 characters');
    }

    if (!property.price || property.price <= 0) {
      throw new Error('Price must be greater than 0');
    }

    if (!property.images || property.images.length === 0) {
      throw new Error('At least one image is required');
    }

    if (!property.address || !property.address.street || !property.address.city || !property.address.country) {
      throw new Error('Complete address information is required');
    }
    
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // Validate required fields
      if (!property.address?.latitude || !property.address?.longitude) {
        throw new Error("Property address must include latitude and longitude");
      }

      // Get or create address
      console.log({wo: 'working'})
      const addressId = await this.getOrCreateAddress(client, property.address);
      console.log({addressId})

      // Insert property
      const propertyResult = await client.query(
        `INSERT INTO properties 
         (realtor_id, address_id, title, speciality, price, description, 
          amenities, status, property_type, sale_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          property.realtor_id,
          addressId,
          property.title || null,
          property.speciality || null,
          property.price || null,
          property.description || null,
          JSON.stringify(property.amenities || []),
          property.status.toLocaleLowerCase() || "draft",
          property.property_type.toLocaleLowerCase(),
          property.sale_status || "rent",
        ]
      );

      const newProperty = propertyResult.rows[0];
      console.log({pr: newProperty.id})

      // Insert images
      const images:number[] = [];
      if (property.images && property.images.length > 0) {
        for (const imageUrl of property.images) {
          const imageResult = await client.query(
            `INSERT INTO images 
             (storage_key, storage_provider, cdn_url, file_name, file_size_bytes, mime_type, width, height) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
             RETURNING id`,
            [
              imageUrl.storage_key, 'cloudinary', imageUrl.uri, imageUrl.fileName,
              imageUrl.fileSize, imageUrl.mimeType, imageUrl.width, imageUrl.height

            ]
          );
          images.push(imageResult.rows[0].id);
        }
      }

      console.log({images})
      for (let i = 0; i < images.length; i++) {
        await client.query(
          `INSERT INTO property_images
          (property_id, image_id, display_order, is_primary)
          VALUES ($1, $2, $3, $4)`,
          [
            newProperty.id,
            images[i],
            i,
            i == 0
          ]
        )
      }

      await client.query("COMMIT");

      // Invalidate caches
      await this.invalidatePropertyCache(newProperty.id, newProperty.realtor_id);

      return { ...newProperty, images };
    } catch (error:any) {
      await client.query("ROLLBACK");
      
      if (error.code === "23505") {
        throw new Error(`Unique constraint violation: ${error.detail}`);
      }
      
      console.error("Property creation error:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // FIND BY ID
  // ============================================

  async findById(id: number, requestedFields: string[] = []): Promise<Property | null> {
    const cacheKey = `property:${id}`;

    try {
      const cached = (await redisClient.get(cacheKey))?.toString();
      if (cached) {
        // console.log("Cache hit for property:", id);
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error("Redis get error:", error);
      // Continue to DB query if Redis fails
    }

    const fields = this.mapGraphQLFieldsToColumns(requestedFields);
    const query = `
      SELECT ${fields.join(", ")}
      FROM properties p
      WHERE p.id = $1
    `;

    const result = await this.pool.query(query, [id]);

    if (result.rows[0]) {
      try {
        await redisClient.setEx(
          cacheKey,
          CACHE_TTL.PROPERTY_DETAIL,
          JSON.stringify(result.rows[0])
        );
      } catch (error) {
        console.error("Redis set error:", error);
        // Don't throw - caching failure shouldn't affect the response
      }
    }

    return result.rows[0] || null;
  }

  // ============================================
  // FIND BY REALTOR
  // ============================================

  async findByRealtor(
    realtorId: string,
    requestedFields: string[] = []
  ): Promise<Property[]> {
    const sortedFields = [...requestedFields].sort();
    const cacheKey = `properties:realtor:${realtorId}:${JSON.stringify(sortedFields)}`;

    try {
      const cached = (await redisClient.get(cacheKey))?.toString();
      if (cached) {
        console.log("Cache hit for realtor properties:", realtorId);
        // return JSON.parse(cached);
      }
    } catch (error) {
      console.error("Redis get error:", error);
    }

    const fields = this.mapGraphQLFieldsToColumns(requestedFields);
    const query = `
      SELECT ${fields.join(", ")}
      FROM properties p
      WHERE p.realtor_id = $1
      ORDER BY p.created_at DESC
    `;

    const result = await this.pool.query(query, [realtorId]);
    const properties = result.rows;

    try {
      await redisClient.setEx(cacheKey, CACHE_TTL.SEARCH_RESULTS, JSON.stringify(properties));
    } catch (error) {
      console.error("Redis set error:", error);
    }

    return properties;
  }

  // ============================================
  // SEARCH ROOM TYPES (Complex query - next artifact)
  // ============================================

  // Will continue in next artifact...
  // propertyModel.ts - Search & Query Methods (Part 2)

  // ============================================
  // SEARCH ROOM TYPES - Production Ready
  // ============================================

  // Fixed searchRoomTypes method - replace in your PropertyModel class

  // async quickSearch(query: string, latitude: number, longitude: number, radius: number, first = 10) {
  //   // const cacheKey = `search:${JSON.stringify(input)}`;
  //   try {
  //     console.log(query, latitude, longitude, radius)
  //     let sqlQuery = this.buildAddressFilter1(query, latitude, longitude, radius)
  //     const parsed = this.parseAddressQuery(query)
  //     console.log({parsed})
  //     let search_type 
  //     if(parsed.useCity) {
  //       search_type = 'city'
  //     } else if (parsed.usePostalCode) {
  //       search_type = 'postal_code'
  //     } else {
  //       search_type = 'text_search'
  //     }
  
  //     sqlQuery += `LIMIT ${first}`
  //     console.log({sqlQuery})
  //     console.time('quick')
  
  //     const result = await this.pool.query(sqlQuery)
  //     const final_map = result.rows.map(row => ({
  //       id: row?.id || null,
  //       city: {
  //         id: row?.city_id,
  //         name: row?.city_name
  //       },
  //       country: {
  //         id: row?.country_id,
  //         name: row?.country_name
  //       },
  //       geom: row?.geom,
  //       postal_code: row?.postal_code,
  //       street: row?.street
  //     }))
  //     console.log({reS: result.rows})
  //     console.timeEnd('quick')


  //     return {
  //       quickSearch: final_map,
  //       search_type
  //     }
  //   } catch (error) {
  //     throw error
  //   }
  // }
  async quickSearch(query: string) {
  const trimmed = query.trim();
  const isNumericDominant = /^\d{4,}$/.test(trimmed.replace(/\s/g, ''));

  const [cityResults, postalResults, textResults] = await Promise.all([
    this.pool.query(
      `SELECT 'city' AS search_type, c.id AS city_id, c.name AS city_name,
              co.id AS country_id, co.name AS country_name,
              NULL AS street, NULL AS postal_code, NULL AS geom,
              similarity(c.name, $1) AS score
       FROM cities c
       JOIN countries co ON c.country_id = co.id
       WHERE c.name % $1
       ORDER BY score DESC LIMIT 5`,
      [trimmed]
    ),

    isNumericDominant
      ? this.pool.query(
          `SELECT 'postal_code' AS search_type, a.id, a.postal_code,
                  c.id AS city_id, c.name AS city_name,
                  co.id AS country_id, co.name AS country_name, a.geom
           FROM addresses a
           JOIN cities c ON a.city_id = c.id
           JOIN countries co ON c.country_id = co.id
           WHERE a.postal_code ILIKE $1 LIMIT 5`,
          [`%${trimmed}%`]
        )
      : Promise.resolve({ rows: [] }),

    // Only search streets if query looks like a street (has 2+ words, or no city matched)
    !isNumericDominant
      ? this.pool.query(
          `SELECT 'street' AS search_type, a.id, a.street, a.postal_code, a.geom,
                  c.id AS city_id, c.name AS city_name,
                  co.id AS country_id, co.name AS country_name,
                  similarity(a.street, $1) AS score
           FROM addresses a
           JOIN cities c ON a.city_id = c.id
           JOIN countries co ON c.country_id = co.id
           WHERE a.street % $1          -- trigram on the street name directly
           ORDER BY score DESC LIMIT 5`,
          [trimmed]
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const STRONG_CITY_SCORE = 0.4;
  const strongCityHit = cityResults.rows.some(r => r.score >= STRONG_CITY_SCORE);

  // If we have a confident city match, suppress streets entirely —
  // the user is searching for a place, not an address
  const streets = strongCityHit ? [] : textResults.rows;

  const merged = [
    ...cityResults.rows,
    ...postalResults.rows,
    ...streets,
  ];
  console.log({merged})

  const dominantType =
    cityResults.rows.length > 0 ? 'city' :
    postalResults.rows.length > 0 ? 'postal_code' : 'street';

  const quickSearch = merged.map(row => ({
      id: row.id ?? null,
      city: { id: row.city_id, name: row.city_name },
      country: { id: row.country_id, name: row.country_name },
      geom: row.geom ?? null,
      postal_code: row.postal_code ?? null,
      street: row.street ?? null,
    }))
    console.log({quickSearch: quickSearch[0]})
  return {
    quickSearch: merged.map(row => ({
      id: row.id ?? null,
      city: { id: row.city_id, name: row.city_name },
      country: { id: row.country_id, name: row.country_name },
      geom: row.geom ?? null,
      postal_code: row.postal_code ?? null,
      street: row.street ?? null,
    })),
    search_type: dominantType,
  };
}

  async searchRoomTypes(
    input: SearchRoomsInput,
    requestedFields: string[]
  ): Promise<{
    edges: { node: RoomType; cursor: string }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    totalCount: number;
  }> {
    console.log({input})
    const {
      propertyType,
      sale_status,
      beds,
      bathrooms,
      minPrice,
      maxPrice,
      minSize,
      maxSize,
      amenities,
      query,
      value,
      checkIn,
      checkOut,
      first = PAGINATION_LIMITS.DEFAULT,
      after,
      latitude,
      longitude,
      radius,
    } = input;

  // Validate pagination
  if (first < PAGINATION_LIMITS.MIN || first > PAGINATION_LIMITS.MAX) {
    throw new Error(
      `'first' must be between ${PAGINATION_LIMITS.MIN} and ${PAGINATION_LIMITS.MAX}`
    );
  }

  console.log({first, query, value, after, propertyType})

  // Check cache
  const cacheKey = `search:${JSON.stringify(input)}`;
  try {
    const cached = (await redisClient.get(cacheKey))?.toString();
    if (cached) {
      console.log("Cache hit for search");
      // return JSON.parse(cached);
    }
  } catch (error) {
    console.error("Redis cache error:", error);
  }

  const rtFields = this.mapGraphQLFieldsToColumns(requestedFields, "rt");
  const pFields = requestedFields
    .filter((f) => f.startsWith("p."))
    .map((f) => `${f} AS ${f.replace(".", "_")}`);
  // console.log({pFields, requestedFields})
  const fields = [...rtFields, ...pFields];
  console.log({pFields})
  // const addressFilter = `
  //   WITH filtered_addresses AS (
  //     ${this.buildAddressFilter(query, latitude, longitude, radius)}
  //   )
  // `
  // const useAddressFilter = query || (latitude && longitude && radius) ? true : false

  let sqlQuery = `
    SELECT 
      ${fields.join(', ')}
    FROM room_types rt
    INNER JOIN properties p ON rt.property_id = p.id
	  INNER JOIN addresses a ON a.id = p.address_id
	  INNER JOIN cities c ON c.id = a.city_id
	  INNER JOIN countries co ON co.id = c.country_id
  `

  // Calculate duration if dates provided
  let duration: string | undefined;

  // Build query
  const conditions: string[] = [];
  const params: any[] = [];

  // Property type filter
  if (propertyType && propertyType.length > 0) {
    const p_types_lower_case = propertyType.map(type => type.toLowerCase())
    params.push(p_types_lower_case);
    conditions.push(`p.property_type = ANY($${params.length})`);
  }

  if (sale_status) {
    params.push(sale_status);
    conditions.push(`p.sale_status = $${params.length}`);
  }

  // Bed/bath filters
  if (beds !== undefined && beds > 0) {
    params.push(beds);
    conditions.push(`rt.bed_count >= $${params.length}`);
  }
  if (bathrooms !== undefined && bathrooms > 0) {
    params.push(bathrooms);
    conditions.push(`rt.bathroom_count >= $${params.length}`);
  }

  // Size filters
  if (minSize !== undefined && minSize > 0) {
    params.push(minSize);
    conditions.push(`rt.size_sqft >= $${params.length}`);
  }
  if (maxSize !== undefined && maxSize > 0) {
    params.push(maxSize);
    conditions.push(`rt.size_sqft <= $${params.length}`);
  }

  // Price filters
  if (minPrice !== undefined && minPrice > 0) {
    params.push(minPrice);
    conditions.push(`rt.base_price >= $${params.length}`);
  }
  if (maxPrice !== undefined && maxPrice > 0) {
    params.push(maxPrice);
    conditions.push(`rt.base_price <= $${params.length}`);
  }

  // Amenities filter (must have ALL specified amenities)
  if (amenities && amenities.length > 0) {
    params.push(JSON.stringify(amenities));
    conditions.push(`rt.amenities @> $${params.length}::jsonb`);
  }

  if(after) {
    params.push(after)
    conditions.push(`rt.id >= $${params.length}`)
  }

  conditions.push("rt.is_active = true");
  if (query && value) {
    
    switch (query) {
      case 'city': {
        params.push(parseInt(value))
        conditions.push(`c.id = $${params.length}`)
      }
    }
  }
  if(checkIn && checkOut) {
    conditions.push(`EXISTS (${this.buildAvailabilityFilter(checkIn, checkOut)})`)
  }

  if (conditions.length > 0) {
    sqlQuery += ` WHERE ${conditions.join(' AND ')}`
  }

  if(latitude && longitude) {
    sqlQuery += ` ORDER BY distance ASC, rt.id ASC`;
    // params.latitude = latitude
  } else {
    sqlQuery += ` ORDER BY rt.base_price ASC, rt.id ASC`
  }

  console.log(typeof first)
  params.push(first)
  sqlQuery += ` LIMIT $${params.length}`

  // Build price fields based on duration
  // let priceField = "rt.base_price AS derived_price";
  // if (duration === "monthly" && checkIn && checkOut) {
  //   priceField = "COALESCE(rt.monthly_rate, rt.base_price) AS derived_price";
  // } else if (duration === "weekly" && checkIn && checkOut) {
  //   priceField = "COALESCE(rt.weekly_rate, rt.base_price) AS derived_price";
  // } else if (duration === "daily" && checkIn && checkOut) {
  //   // Reuse existing date params
  //   const startIdx = params.findIndex(p => p === checkIn);
  //   const endIdx = params.findIndex(p => p === checkOut);
  //   priceField = `
  //     COALESCE((
  //       SELECT AVG(rc.nightly_rate)
  //       FROM rate_calendar rc
  //       WHERE rc.room_type_id = rt.id
  //         AND rc.date >= $${startIdx + 1}::date
  //         AND rc.date < $${endIdx + 1}::date
  //     ), rt.base_price) AS derived_price
  //   `;
  // }

  // Build field list


  // FIXED: Conditional HAVING clause based on whether we have date filtering
  // const havingClause = hasDateFilter 
  //   ? "HAVING COUNT(DISTINCT CASE WHEN b.id IS NULL THEN u.id END) > 0"
  //   : "HAVING COUNT(DISTINCT u.id) > 0";

  // Count query - FIXED: Same conditional logic
  // const countParams = params.slice(0, params.length - (after ? 2 : 1));
  // const countQuery = `
  //   SELECT COUNT(*) as count FROM (
  //     SELECT DISTINCT rt.id
  //     FROM room_types rt
  //     INNER JOIN properties p ON rt.property_id = p.id
  //     INNER JOIN addresses a ON p.address_id = a.id
  //     INNER JOIN cities c ON a.city_id = c.id
  //     INNER JOIN countries co ON c.country_id = co.id
  //     ${availabilityJoin}
  //     ${whereClause}
  //     GROUP BY rt.id
  //     ${havingClause}
  //   ) subquery
  // `;

  // console.log({ sqlQuery, params});

  try {
    // Execute queries in parallel
    // const [roomTypesResult] = await Promise.all([
    //   // this.pool.query(roomTypesQuery, params),
    //   this.pool.query(sqlQuery),
    //   // this.pool.query(countQuery, countParams),
    // ]);
    console.log({sqlQuery, params})
    console.time('db')
    const roomTypesResult = await this.pool.query(sqlQuery, params)
    console.timeEnd('db')

    // Map results
    console.time('mapping')
    console.log({roomtypes: roomTypesResult.rows[0]})
    const roomTypes: RoomType[] = roomTypesResult.rows.map((row) => ({
      id: row.id,
      property_id: row?.property_id,
      name: row?.name,
      description: row?.description,
      capacity: row?.capacity,
      bed_count: row?.bed_count,
      bathroom_count: row?.bathroom_count,
      size_sqft: row?.size_sqft,
      base_price: row?.base_price,
      derivedPrice: parseFloat(row?.derived_price || row?.base_price),
      weeklyRate: row?.weekly_rate,
      monthlyRate: row?.monthly_rate,
      currency: row?.currency,
      is_active: row?.is_active,
      amenities: row?.amenities || [],
      created_at: row?.created_at,
      availableUnits: parseInt(row?.available_units || '0'),
      totalUnits: parseInt(row?.total_units || '0'),
      duration,
      property: {
        id: row?.p_id,
        realtor_id: row?.p_realtor_id,
        address_id: row?.p_address_id,
        title: row?.p_title,
        speciality: row?.p_speciality,
        amenities: row?.p_amenities,
        price: row?.p_price,
        description: row?.p_description,
        property_type: row?.p_property_type,
        sale_status: row?.p_sale_status,
        status: row?.p_status,
        created_at: row?.p_created_at,
        updated_at: row?.p_updated_at,
      },
    }));
    console.log({roomTypes})

    const totalCount = 10;
    // const totalCount = parseInt(countResult.rows[0]?.count || "0");
    const hasNextPage = roomTypes.length === first;
    const endCursor = hasNextPage ? roomTypes[roomTypes.length - 1].id.toString() : null;

    const result = {
      edges: roomTypes.map((node) => ({
        node,
        cursor: node.id.toString(),
      })),
      pageInfo: { hasNextPage, endCursor },
      totalCount,
    };
    console.log({result: result.edges[0]})

    console.timeEnd('mapping')
    console.time('cache')

    // Cache result
    try {
      if (roomTypesResult.rows.length > 0) {
        await redisClient.setEx(cacheKey, CACHE_TTL.SEARCH_RESULTS, JSON.stringify(result));
      }
    } catch (error) {
      console.error("Redis cache set error:", error);
    }
    console.timeEnd('cache')

    return result;
  } catch (error) {
    console.error("Search query error:", error);
    throw error;
  }
}

  // ============================================
  // GET ROOM TYPE
  // ============================================

  async getRoomType(id: number, requestedFields: string[]): Promise<RoomType | null> {
    const cacheKey = `roomType:${id}`;
    console.log({cacheKey})
    try {
      // const cached = (await redisClient.get(cacheKey))?.toString();
      // if (cached) {
      //   console.log("Cache hit for room type:", id);
      //   return JSON.parse(cached);
      // }
    } catch (error) {
      console.error("Redis get error:", error);
    }

    const rtFields = this.mapGraphQLFieldsToColumns(requestedFields, "rt");
    const pFields = requestedFields
      .filter((f) => f.startsWith("p.") && f !== 'p.images')
      .map((f) => `${f} AS ${f.replace(".", "_")}`);

    const fields = [...rtFields, ...pFields];

    const query = `
      SELECT 
        ${fields.join(", ")},
        (SELECT COUNT(*) FROM reviews WHERE room_type_id = rt.id) AS total_reviews,
        (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE room_type_id = rt.id) AS avg_rating
      FROM room_types rt
      INNER JOIN properties p ON rt.property_id = p.id
      WHERE rt.id = $1;
    `;

    console.log({query})

    const result = await this.pool.query(query, [id]);

    if (!result.rows[0]) {
      return null;
    }

    const row = result.rows[0];
    const roomType: RoomType = {
      id: row.id,
      property_id: row.property_id,
      name: row.name,
      description: row.description,
      capacity: row.capacity,
      bed_count: row.bed_count,
      bathroom_count: row.bathroom_count,
      size_sqft: row.size_sqft,
      base_price: row.base_price,
      weeklyRate: row.weekly_rate,
      monthlyRate: row.monthly_rate,
      currency: row.currency,
      is_active: row.is_active,
      amenities: row.amenities || [],
      property: {
        id: row.p_id,
        realtor_id: row.p_realtor_id,
        address_id: row.p_address_id,
        title: row.p_title,
        speciality: row.p_speciality,
        amenities: row.p_amenities,
        price: row.p_price,
        description: row.p_description,
        property_type: row.p_property_type,
        sale_status: row.p_sale_status,
        status: row.p_status,
        created_at: row.p_created_at,
        updated_at: row.p_updated_at,
      },
      totalReviews: row.total_reviews,
      avg_rating: row.avg_rating
    };

    try {
      await redisClient.setEx(
        cacheKey,
        CACHE_TTL.ROOM_TYPE_DETAIL,
        JSON.stringify(roomType)
      );
    } catch (error) {
      console.error("Redis set error:", error);
    }

    return roomType;
  }

  async getRoomTypes(ids: number[], requestedFields: string[]): Promise<{
    edges: { node: RoomType; cursor: string }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    totalCount: number;
  }> {
    // const cacheKey = `roomType:${id}`;
    // console.log({cacheKey})
    // try {
    //   const cached = (await redisClient.get(cacheKey))?.toString();
    //   if (cached) {
    //     console.log("Cache hit for room type:", id);
    //     return JSON.parse(cached);
    //   }
    // } catch (error) {
    //   console.error("Redis get error:", error);
    // }

    const rtFields = this.mapGraphQLFieldsToColumns(requestedFields, "rt");
    const pFields = requestedFields
      .filter((f) => f.startsWith("p."))
      .map((f) => `${f} AS ${f.replace(".", "_")}`);

    const fields = [...rtFields, ...pFields];

    console.log({fields})

    const query = `
      SELECT 
        ${fields.join(", ")},
        (SELECT COUNT(*) FROM reviews WHERE room_type_id = rt.id) AS total_reviews,
        (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE room_type_id = rt.id) AS avg_rating
      FROM room_types rt
      INNER JOIN properties p ON rt.property_id = p.id
      WHERE rt.id = ANY($1);
    `;

    console.log({query})

    const result = await this.pool.query(query, [ids]);

    // if (result.rows.length <= 0) {
    //   return {
    //     edges: [],
    //     totalCount: 0,
    //     pageInfo: {hasNextPage: false, endCursor: ''}
    //   }
    // }

    const row = result.rows;
    console.log({row})
    // const roomType: RoomType = {
    //   id: row.id,
    //   property_id: row.property_id,
    //   name: row.name,
    //   description: row.description,
    //   capacity: row.capacity,
    //   bed_count: row.bed_count,
    //   bathroom_count: row.bathroom_count,
    //   size_sqft: row.size_sqft,
    //   base_price: row.base_price,
    //   weeklyRate: row.weekly_rate,
    //   monthlyRate: row.monthly_rate,
    //   currency: row.currency,
    //   is_active: row.is_active,
    //   amenities: row.amenities || [],
    //   property: {
    //     id: row.p_id,
    //     realtor_id: row.p_realtor_id,
    //     address_id: row.p_address_id,
    //     title: row.p_title,
    //     speciality: row.p_speciality,
    //     amenities: row.p_amenities,
    //     price: row.p_price,
    //     description: row.p_description,
    //     property_type: row.p_property_type,
    //     sale_status: row.p_sale_status,
    //     status: row.p_status,
    //     created_at: row.p_created_at,
    //     updated_at: row.p_updated_at,
    //   },
    //   totalReviews: row.total_reviews,
    //   avg_rating: row.avg_rating
    // };

    const roomTypes: RoomType[] = result.rows.map((row) => ({
      id: row.id,
      property_id: row?.property_id,
      name: row?.name,
      description: row?.description,
      capacity: row?.capacity,
      bed_count: row?.bed_count,
      bathroom_count: row?.bathroom_count,
      size_sqft: row?.size_sqft,
      base_price: row?.base_price,
      derivedPrice: parseFloat(row?.derived_price || row?.base_price),
      weeklyRate: row?.weekly_rate,
      monthlyRate: row?.monthly_rate,
      currency: row?.currency,
      is_active: row?.is_active,
      amenities: row?.amenities || [],
      created_at: row?.created_at,
      availableUnits: parseInt(row?.available_units || '0'),
      totalUnits: parseInt(row?.total_units || '0'),
      property: {
        id: row?.p_id,
        realtor_id: row?.p_realtor_id,
        address_id: row?.p_address_id,
        title: row?.p_title,
        speciality: row?.p_speciality,
        amenities: row?.p_amenities,
        price: row?.p_price,
        description: row?.p_description,
        property_type: row?.p_property_type,
        sale_status: row?.p_sale_status,
        status: row?.p_status,
        created_at: row?.p_created_at,
        updated_at: row?.p_updated_at,
      },
    }));

    const totalCount = 10;
    // const totalCount = parseInt(countResult.rows[0]?.count || "0");
    const hasNextPage = false;
    const endCursor = hasNextPage ? roomTypes[roomTypes.length - 1].id.toString() : null;

    const results = {
      edges: roomTypes.map((node) => ({
        node,
        cursor: node.id.toString(),
      })),
      pageInfo: { hasNextPage, endCursor },
      totalCount,
    };


    return results;
  }

  async searchRecents(userId: number): Promise<Recents[]> {
    try {
      const searchKey = `recent_searches:${userId}`
      const recents = (await redisClient.zRange(searchKey, 0, 19))
      console.timeEnd('connect')

      const validArray = `[${recents.join(',')}]`
      console.log({recents, validArray: JSON.parse(validArray)})

      return JSON.parse(validArray)
    } catch (error) {
      throw error
    }
  }

  async addToRecents(input: Omit<Recents, 'userId'> & {userId: string}): Promise<Recents | null> {
    try {
      const searchKey = `recent_searches:${input.userId}`
      const timestamp = Date.now()
      const searchData = JSON.stringify(input)
      const pipeline = redisClient.multi()
  
      pipeline.zAdd(searchKey, [{value: searchData, score: timestamp}])
  
      pipeline.zRemRangeByRank(searchKey, 0, -21)
      await pipeline.exec()
  
      return {...input, userId: parseInt(input.userId)}
    } catch (error) {
      throw error
    }
  }

  // ============================================
  // GET AVAILABILITY
  // ============================================

  async getAvailability({
    id,
    startDate,
    endDate,
  }: {
    id: number;
    startDate: string;
    endDate: string;
  }): Promise<RateCalendar[]> {
    const cacheKey = `availability:${id}:${startDate}:${endDate}`;

    try {
      const cached = (await redisClient.get(cacheKey))?.toString();
      if (cached) {
        // return JSON.parse(cached);
      }
    } catch (error) {
      console.error("Redis get error:", error);
    }

    const result = await this.pool.query(
      `SELECT date, nightly_rate, min_stay, is_blocked
       FROM rate_calendar
       WHERE room_type_id = $1
         AND date BETWEEN $2 AND $3
       ORDER BY date`,
      [id, startDate, endDate]
    );

    const availability = result.rows;

    try {
      await redisClient.setEx(
        cacheKey,
        CACHE_TTL.AVAILABILITY,
        JSON.stringify(availability)
      );
    } catch (error) {
      console.error("Redis set error:", error);
    }

    return availability;
  }

  // ============================================
  // GET AVAILABLE UNITS
  // ============================================

  async getAvailableUnits({
    id,
    checkIn,
    checkOut,
  }: {
    id: number;
    checkIn?: Date;
    checkOut?: Date;
  }): Promise<Unit[]> {
    let query = `
      SELECT ru.id, ru.room_type_id, ru.unit_code, ru.floor_number, ru.status
      FROM room_units ru
      WHERE ru.room_type_id = $1
        AND ru.status = 'active'
    `;

    const params: any[] = [id];

    if (checkIn && checkOut) {
      params.push(checkIn, checkOut);
      query += `
        AND ru.id NOT IN (
          SELECT b.unit_id
          FROM bookings b
          WHERE b.status = 'confirmed'
            AND daterange(b.check_in, b.check_out, '[]') && daterange($2, $3, '[]')
        )
      `;
    }

    query += ` ORDER BY ru.unit_code`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // ============================================
  // ADD ROOM UNIT
  // ============================================

  async addRoomUnit(input: Omit<Unit, "id">): Promise<Unit> {
    const result = await this.pool.query(
      `INSERT INTO room_units (room_type_id, unit_code, floor_number, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.roomTypeId, input.unitCode || null, input.floorNumber || null, input.status || "active"]
    );

    // Invalidate related caches
    await redisClient.del(`roomType:${input.roomTypeId}`);
    await redisClient.del(`availability:${input.roomTypeId}:*`);

    return result.rows[0];
  }

  // propertyModel.ts - Update & Delete Methods (Part 3)

  // ============================================
  // UPDATE PROPERTY
  // ============================================

  async update(
    id: number,
    updates: Partial<Omit<PropertyEdit, "id" | "created_at">> & {
      address?: Omit<Address, "id" | "created_at">;
      images?: ImageManageMentInput;
    }
  ): Promise<Property | null> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // Check if property exists
      const existingProperty = await this.findById(id, ["id", "realtor_id", "address_id"]);
      if (!existingProperty) {
        throw new Error("Property not found");
      }
      

      let addressId = existingProperty.address_id;

      // Update address if provided
      if (updates.address) {
        addressId = await this.getOrCreateAddress(client, updates.address);
      }

      // Handle images
      if (updates.images) {

        if (updates.images.remove && updates.images.remove.length > 0) {
          console.log('deleting')
          const imagesToDelete = await client.query(
            `SELECT i.storage_key 
             FROM images i
             JOIN property_images pi ON i.id = pi.image_id
             WHERE pi.property_id = $1 AND i.id = ANY($2)`,
            [id, updates.images.remove]
          );
          const storage_keys: string[] = []
          for (const img of imagesToDelete.rows) {
            storage_keys.push(img.storage_key)
          }
          try {
            await deleteFromCloudinary(storage_keys)
          } catch (error) {
            
          }
          console.log(updates.images.remove)
          await client.query(
            'DELETE FROM images WHERE id = ANY($1)',
            [updates.images.remove]
          )
        }

        if (updates.images.add && updates.images.add.length > 0) {
          for (const image of updates.images.add) {
            const imageResult = await client.query(
              `INSERT INTO images 
               (storage_key, storage_provider, cdn_url, file_name, file_size_bytes, mime_type, width, height) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
               RETURNING id`,
              [
                image.storage_key,
                'cloudinary',
                image.uri,
                image.fileName || `property-${Date.now()}.jpg`,
                image.fileSize,
                image.mimeType || 'image/jpeg',
                image.width,
                image.height,
              ]
            );

            await client.query(
              `INSERT INTO property_images (property_id, image_id, display_order, is_primary) 
              VALUES ($1, $2, $3, $4)`,
              [id, imageResult.rows[0].id, 0, false]
            );
          }
        }

        // 6c. Update existing images (order, primary status)
        if (updates.images.update && updates.images.update.length > 0) {
          for (const imageUpdate of updates.images.update) {
            const updates: string[] = [];
            const values: any[] = [];
            let paramCount = 1;
            if (imageUpdate.display_order !== undefined) {
              updates.push(`display_order = $${paramCount}`);
              values.push(imageUpdate.display_order);
              paramCount++;
            }
            if (imageUpdate.is_primary !== undefined) {
              // If setting as primary, first unset all others
              if (imageUpdate.is_primary) {
                await client.query(
                  'UPDATE property_images SET is_primary = false WHERE property_id = $1',
                [id]
                )
              }
              updates.push(`is_primary = $${paramCount}`);
              values.push(imageUpdate.is_primary);
              paramCount++;
            }
            if (updates.length > 0) {
              values.push(id, imageUpdate.id);
              await client.query(
                `UPDATE property_images 
                 SET ${updates.join(', ')} 
                 WHERE property_id = $${paramCount} AND image_id = $${paramCount + 1}`,
                values
              );
            }
          }
        }       
      }


      // Build dynamic update query
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      const allowedFields = [
        "title",
        "speciality",
        "price",
        "description",
        "amenities",
        "status",
        "property_type",
        "sale_status",
      ];

      for (const field of allowedFields) {
        if (updates[field] !== undefined && updates[field] !== null) {
          updateFields.push(`${field} = $${paramIndex++}`);
          updateValues.push(
            // field === "amenities" ? JSON.stringify(updates[field]) : field === "status" ? updates.status.toLocaleLowerCase() : updates[field]
          );
        }
      }

      // Add address_id if changed
      if (addressId !== existingProperty.address_id) {
        updateFields.push(`address_id = $${paramIndex++}`);
        updateValues.push(addressId);
      }

      if (updateFields.length === 0) {
        // No updates to make
        await client.query("COMMIT");
        return await this.findById(id);
      }

      // Add updated_at
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(id);

      const query = `
        UPDATE properties
        SET ${updateFields.join(", ")}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await client.query(query, updateValues);
      const updatedProperty = result.rows[0];

      await client.query("COMMIT");

      // Invalidate caches
      await this.invalidatePropertyCache(id, updatedProperty.realtor_id);

      // Update Redis geo index if location changed
      if (updates.address?.latitude && updates.address?.longitude) {
        try {
          // Get all room types for this property
          const roomTypesResult = await this.pool.query(
            "SELECT id FROM room_types WHERE property_id = $1",
            [id]
          );

          for (const row of roomTypesResult.rows) {
            await redisClient.geoAdd(GEO_KEY, {
              longitude: updates.address.longitude,
              latitude: updates.address.latitude,
              member: row.id.toString(),
            });
          }
        } catch (error) {
          console.error("Redis geo update error:", error);
        }
      }

      return updatedProperty;
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Property update error:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // DELETE PROPERTY
  // ============================================

  async delete(id: number): Promise<{
    success: boolean,
    message: string
  }> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // Check if property exists
      const property = await this.findById(id, ["id", "realtor_id"]);
      if (!property) {
        return {
          success: false,
          message: `Property doesn't exist`
        };
      }

      // Check for active bookings
      const bookingsResult = await client.query(
        `SELECT COUNT(*) as count 
         FROM bookings b
         INNER JOIN room_units ru ON b.unit_id = ru.id
         INNER JOIN room_types rt ON ru.room_type_id = rt.id
         WHERE rt.property_id = $1 
           AND b.status IN ('pending', 'confirmed')
           AND b.check_out >= CURRENT_DATE`,
        [id]
      );

      const activeBookings = parseInt(bookingsResult.rows[0]?.count || "0");
      if (activeBookings > 0) {
        throw new Error(
          `Cannot delete property: ${activeBookings} active booking(s) exist`
        );
      }

      // Get room types before deletion (for Redis cleanup)
      const roomTypesResult = await client.query(
        "SELECT id FROM room_types WHERE property_id = $1",
        [id]
      );
      const roomTypeIds = roomTypesResult.rows.map((row) => row.id);

      // Delete property (CASCADE will handle related records)
      const deleteResult = await client.query("DELETE FROM properties WHERE id = $1", [id]);

      await client.query("COMMIT");

      // Clean up Redis
      await this.invalidatePropertyCache(id, parseInt(property.realtor_id));

      // Remove from geo index
      try {
        if (roomTypeIds.length > 0) {
          await redisClient.zRem(
            GEO_KEY,
            roomTypeIds.map((id) => id.toString())
          );

          // Remove hash entries
          for (const rtId of roomTypeIds) {
            await redisClient.del(`${PROPERTY_HASH_PREFIX}${rtId}`);
          }
        }
      } catch (error) {
        console.error("Redis cleanup error:", error);
      }

      return {
        success: (deleteResult.rowCount ?? 0) > 0,
        message: 'Property deleted'
      }
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Property deletion error:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // PUBLISH PROPERTY
  // ============================================

  async publish(id: number): Promise<Property | null> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // Validate property is ready to be published
      const property = await client.query(
        `SELECT p.*, 
          (SELECT COUNT(*) FROM room_types WHERE property_id = p.id) as room_count,
          (SELECT COUNT(*) FROM property_images WHERE property_id = p.id) as image_count
         FROM properties p
         WHERE p.id = $1`,
        [id]
      );

      if (!property.rows[0]) {
        throw new Error("Property not found");
      }

      const prop = property.rows[0];

      // Validation checks
      const errors: string[] = [];

      if (!prop.title) errors.push("Title is required");
      if (!prop.speciality) errors.push("Speciality is required");
      if (!prop.price) errors.push("Price is required");
      if (!prop.address_id) errors.push("Address is required");
      if (prop.room_count === 0) errors.push("At least one room type is required");
      if (prop.image_count === 0) errors.push("At least one image is required");

      if (errors.length > 0) {
        throw new Error(`Cannot publish property: ${errors.join(", ")}`);
      }

      // Update status
      const result = await client.query(
        `UPDATE properties 
         SET status = 'published', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      await client.query("COMMIT");

      // Invalidate caches
      await this.invalidatePropertyCache(id, result.rows[0].realtor_id);

      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Property publish error:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // ARCHIVE PROPERTY
  // ============================================

  async archive(id: number): Promise<Property | null> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // Check for active bookings
      const bookingsResult = await client.query(
        `SELECT COUNT(*) as count 
         FROM bookings b
         INNER JOIN room_units ru ON b.unit_id = ru.id
         INNER JOIN room_types rt ON ru.room_type_id = rt.id
         WHERE rt.property_id = $1 
           AND b.status IN ('pending', 'confirmed')
           AND b.check_out >= CURRENT_DATE`,
        [id]
      );

      const activeBookings = parseInt(bookingsResult.rows[0]?.count || "0");
      if (activeBookings > 0) {
        throw new Error(
          `Cannot archive property: ${activeBookings} active booking(s) exist`
        );
      }

      const result = await client.query(
        `UPDATE properties 
         SET status = 'archived', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      if (!result.rows[0]) {
        throw new Error("Property not found");
      }

      await client.query("COMMIT");

      // Invalidate caches
      await this.invalidatePropertyCache(id, result.rows[0].realtor_id);

      // Remove from geo index (archived properties shouldn't appear in searches)
      try {
        const roomTypesResult = await this.pool.query(
          "SELECT id FROM room_types WHERE property_id = $1",
          [id]
        );

        const roomTypeIds = roomTypesResult.rows.map((row) => row.id.toString());
        if (roomTypeIds.length > 0) {
          await redisClient.zRem(GEO_KEY, roomTypeIds);
        }
      } catch (error) {
        console.error("Redis cleanup error:", error);
      }

      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Property archive error:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // BATCH OPERATIONS
  // ============================================

  async batchIndex(properties: Array<{ id: number; }>) {
    try {
      const roomTypesResult = await this.pool.query(
        `SELECT 
          rt.id, 
          rt.property_id, 
          rt.base_price, 
          rt.bed_count, 
          rt.bathroom_count, 
          rt.name, 
          rt.is_active, 
          p.address_id,
          ST_Y(a.geom::geometry) as latitude,
          ST_X(a.geom::geometry) as longitude
         FROM room_types rt
         INNER JOIN properties p ON rt.property_id = p.id
         INNER JOIN addresses a ON p.address_id = a.id
         WHERE p.id = ANY($1) AND a.geom IS NOT NULL`,
        [properties.map((p) => p.id)]
      );
      
      if (roomTypesResult.rows.length === 0) {
        console.log('No room types found for batch indexing');
        return;
      }

      const pipeline = redisClient.multi();

      for (const row of roomTypesResult.rows) {
        // Add to geo index
        pipeline.geoAdd(GEO_KEY, {
          longitude: parseFloat(row.longitude),
          latitude: parseFloat(row.latitude),
          member: row.id.toString(),
        });

        // Store filterable attributes
        pipeline.hSet(`${PROPERTY_HASH_PREFIX}${row.id}`, {
          propertyId: row.property_id.toString(),
          basePrice: row.base_price?.toString() || "0",
          bedrooms: row.bed_count?.toString() || "0",
          bathrooms: row.bathroom_count?.toString() || "0",
          type: row.name,
          status: row.is_active ? "active" : "inactive",
          latitude: row.latitude?.toString() || "0",
          longitude: row.longitude?.toString() || "0",
        });

        pipeline.expire(`${PROPERTY_HASH_PREFIX}${row.id}`, 86400);
      }

      await pipeline.exec();
      console.log(`✅ Indexed ${roomTypesResult.rows.length} room types`);
    } catch (error) {
      console.error("Batch index error:", error);
      throw error;
    }
  }
}

export default new PropertyModel(pool);



// // Updated propertyModel
// import { Pool } from "pg";
// import redis from "redis";
// import pool from "../config/database.js";
// import { Address } from "./Address.js"; 
// import { request } from "http";
// import redisClient from "../config/redis.js";

// export type Unit = {id: number, roomTypeId: string, unitCode?: string, floorNumber?: number, status?: string}
// export type RateCalender = {date: String, nightly_rate: number, min_stay: number, is_blocked: boolean}

// interface RoomType {
//   id: number;
//   property_id: number;
//   name: string;
//   description?: string;
//   capacity?: number;
//   bed_count?: number;
//   bathroom_count?: number;
//   size_sqft?: number;
//   basePrice?: number;
//   devivedPrice?: number;
//   currency?: string;
//   is_active?: boolean;
//   amenities?: string[];
//   units?: Unit[]
//   pricingRules?: {startDate: string, endDate: string, nightlyRate?: number, minStay?: number, maxStay?: number, note?: string}[],
//   durationDiscounts?: {stayType: string, discountPercent: string}[]
//   created_at?: string;
//   updated_at?: string;
//   property: Omit<Property, 'roomTypes'>
//   availableUnits?: number
//   totalUnits?: number
//   duration?: string
//   monthlyRate?: number;
//   weeklyRate?: number;
// }

// export interface Property {
//   id: number;
//   realtor_id: number;
//   address_id: number;
//   title: string;
//   speciality: string;
//   amenities: string[];
//   price: number;
//   description?: string;
//   property_type: 'apartment' | 'hotel' | 'house';
//   sale_status: 'rent' | 'sale';
//   status: 'draft' | 'published' | 'pending_review' | 'archived';
//   created_at?: string;
//   updated_at?: string;
//   address?: Address;
//   roomTypes: RoomType[];
//   images?: { id: number; url: string; meta_data?: string; caption?: string }[];
//   bookings?: { id: number; user_id: number; start_date: string; end_date: string; status: string; created_at?: string }[];
//   reviews?: { id: number; user_id: number; rating: number; comment?: string; created_at?: string }[];
// }

// interface PropertySearchInput {
//   query?: string;
//   minPrice?: number;
//   maxPrice?: number;
//   speciality?: string;
//   amenities?: string[];
//   startDate?: string;
//   endDate?: string;
//   minRating?: number;
// }

// export interface SearchRoomsInput {
//   propertyType: String
//   beds: number
//   bathrooms: number
//   minPrice: number
//   maxPrice: number
//   minSize: number
//   maxSize: number
//   amenities: string[]
//   address: String
//   checkIn: Date
//   checkOut: Date
//   first: number
//   after: String
//   latitude?: number;
//   longitude?: number;
//   radius?: number;
// }

// const CACHE_TTL = {
//   PROPERTY_DETAIL: 600, // 10 minutes
//   SEARCH_RESULTS: 300, // 5 minutes
//   FEATURED: 900, // 15 minutes
// };

// const GEO_KEY = 'properties:geo';
// const PROPERTY_HASH_PREFIX = 'property:hash:';

// export class PropertyModel {
//   private redisClient: redis.RedisClientType;

//   constructor(private pool: Pool) {
//     // this.redisClient = redis.createClient({
//     //   username: 'default',
//     //   password: process.env.REDIS_PASSWORD || 'npA2GgAvR6DpV0Z2NZurNQqK93mJIgmW',
//     //   socket: {
//     //     host: process.env.REDIS_HOST || 'redis-11196.c92.us-east-1-3.ec2.redns.redis-cloud.com',
//     //     port: parseInt(process.env.REDIS_PORT || '11196')
//     //   }
//     // });
//     // this.redisClient.connect().catch(err => console.error('Redis connection error:', err));
//   }

//   private mapGraphQLFieldsToColumns(requestedFields: string[], is_p=true): string[] {
//     const fieldMap: { [key: string]: string } = {
//       id: 'id',
//       realtor_id: 'realtor_id',
//       address_id: 'address_id',
//       title: 'title',
//       speciality: 'speciality',
//       amenities: 'amenities',
//       price: 'base_price',
//       basePrice: 'base_price',
//       description: 'description',
//       status: 'status',
//       created_at: 'created_at',
//       updated_at: 'updated_at',
//       property_type: 'property_type',
//       sale_status: 'sale_status',
//       property_id: 'property_id',
//       name: 'name',
//       bedCount: 'bed_count',
//       bathroomCount: 'bathroom_count',
//       sizeSqft: 'size_sqft',
//       capacity: 'capacity',
//       currency: 'currency',
//       isActive: 'is_active',
//       weeklyRate: 'weekly_rate',
//       monthlyRate: 'monthly_rate',
//     };
    
//     const requiredFields = is_p ? ['id', 'realtor_id', 'address_id']: ['id'];
//     const selectedFields = new Set<string>(requiredFields);

//     requestedFields.forEach(field => {
//       if (fieldMap[field] && !selectedFields.has(fieldMap[field])) {
//         selectedFields.add(fieldMap[field]);
//       }
//     });

//     return  is_p ? Array.from(selectedFields).map(field => `p.${field}`): Array.from(selectedFields).map(field => `rt.${field}`);
//   }

//   // private async calculateDurationLoader({check_in, check_out}): Promise<number> {
//   //   const nights = pool.query(
//   //     `SELECT calculate_nights($1, $2)`,
//   //     [check_in, check_out]
//   //   )
//   //   console.log({osd: nights.rows[0]})
//   //   return 19
//   // }


//   async create(property: Omit<Property, 'id' | 'created_at' | 'updated_at'> & { address: Omit<Address, 'id' | 'created_at'>; image_urls: string[] }): Promise<Property> {
//     const client = await this.pool.connect();
//     try {
//       await client.query('BEGIN');

//       let address_id: number | null = null;
      
//       if (property.address) {
//         const countryQuery = `
//           WITH inserted AS (
//             INSERT INTO countries (name, code)
//             VALUES ($1, $2)
//             ON CONFLICT (name) DO NOTHING
//             RETURNING id
//           )
//           SELECT id FROM inserted
//           UNION
//           SELECT id FROM countries WHERE name = $1
//         `;
//         const countryResult = await client.query(countryQuery, [
//           property.address.country,
//           property.address.country.slice(0, 2).toUpperCase()
//         ]);
//         const country_id = countryResult.rows[0].id;

//         const cityQuery = `
//           WITH inserted AS (
//             INSERT INTO cities (name, country_id)
//             VALUES ($1, $2)
//             ON CONFLICT (name, country_id) DO NOTHING
//             RETURNING id
//           )
//           SELECT id FROM inserted
//           UNION
//           SELECT id FROM cities WHERE name = $1 AND country_id = $2
//         `;
//         const cityResult = await client.query(cityQuery, [property.address.city, country_id]);
//         const city_id = cityResult.rows[0].id;

//         const addressQuery = `
//           WITH inserted AS (
//             INSERT INTO addresses (street, city_id, postal_code, latitude, longitude)
//             VALUES ($1, $2, $3, $4, $5)
//             ON CONFLICT (street, city_id, postal_code) DO NOTHING
//             RETURNING id
//           )
//           SELECT id FROM inserted
//           UNION
//           SELECT id FROM addresses WHERE street = $1 AND city_id = $2 AND (postal_code = $3 OR (postal_code IS NULL AND $3 IS NULL))
//         `;
//         const addressResult = await client.query(addressQuery, [
//           property.address.street,
//           city_id,
//           property.address.postal_code || null,
//           property.address.latitude || null,
//           property.address.longitude || null
//         ]);
//         address_id = addressResult.rows[0].id;
//       }

      

//       const propertyQuery = `
//         INSERT INTO properties (realtor_id, address_id, title, speciality, price, description, amenities, status, property_type, sale_status)
//         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, 'rent')
//         RETURNING *
//       `;
//       const propertyResult = await client.query(propertyQuery, [
//         property.realtor_id,
//         address_id,
//         property.title,
//         property.speciality,
//         property.price,
//         property.description,
//         JSON.stringify(property.amenities),
//         property.property_type,
//       ]);
//       const newProperty = propertyResult.rows[0];

//       const images = [];
//       for (const imageUrl of property.image_urls) {
//         const imageQuery = `
//           INSERT INTO property_images (property_id, url)
//           VALUES ($1, $2)
//           RETURNING id, url, meta_data, caption
//         `;
//         const imageResult = await client.query(imageQuery, [newProperty.id, imageUrl]);
//         images.push(imageResult.rows[0]);
//       }

//       // const roomTypes = []
//       for (const room of property.roomTypes) {
//         const room_typesQuery = `
//           INSERT INTO room_types (property_id, name, description, capacity, bed_count, bathroom_count, size_sqft, base_price, currency, is_active, amenities)
//           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
//           RETURNING *
//         `

//         const result = await client.query(room_typesQuery, [
//           newProperty.id, room.name, room.description, room.capacity, room.bed_count,
//           room.bathroom_count, room.size_sqft, room.basePrice, room.currency, 
//           room.is_active, JSON.stringify(room.amenities)
//         ])

//         const type_id = result.rows[0]?.id

//         // console.log({type_id, ce: room.basePrice})

//         if (room.pricingRules && room.pricingRules.length > 0) {
//           for (const pr of room.pricingRules) {
//             await client.query(
//               `INSERT INTO room_pricing_rules
//                  (room_type_id, start_date, end_date, nightly_rate, min_stay, max_stay, note)
//                VALUES ($1,$2,$3,$4,$5,$6,$7)`,
//               [type_id, pr.startDate, pr.endDate, pr.nightlyRate, pr.minStay, pr.maxStay, pr.note]
//             );
//           }
//         }

//         // 4️⃣ Insert duration discounts
//         if (room.durationDiscounts && room.durationDiscounts.length > 0) {
//           for (const d of room.durationDiscounts) {
//             await client.query(
//               `INSERT INTO room_duration_discounts
//                  (room_type_id, stay_type, discount_percent)
//                VALUES ($1,$2,$3)`,
//               [type_id, d.stayType, d.discountPercent]
//             );
//           }
//         }

//         await client.query(
//           `SELECT refresh_rate_calendar($1, CURRENT_DATE, (CURRENT_DATE + INTERVAL '90 days')::date)`,
//           [type_id]
//         )

//         await redisClient.geoadd(GEO_KEY, property.address.longitude, property.address.latitude)

//         await redisClient.hset(`${PROPERTY_HASH_PREFIX}${type_id}`, {
//           basePrice: room.basePrice,
//           bedrooms: room.bed_count,
//           bathrooms: room.bathroom_count,
//           type: room.name,
//           status: room.is_active,
//           latitude: property.address.latitude,
//           longitude: property.address.longitude,
//         })

//         await redisClient.expire(`${PROPERTY_HASH_PREFIX}${type_id}`, 86400)
//         // roomTypes.push(result.rows[0])
//       }

//       await client.query('COMMIT');
//       await this.redisClient.del(`properties:realtor:${property.realtor_id}`);
//       await this.redisClient.del("properties:connection:*");
//       await this.redisClient.del("properties:search:*");
//       return { ...newProperty, images };
//     } catch (error) {
//       await client.query('ROLLBACK');
//       if (error.code === '23505') {
//         console.error({errors: 'error'})
//         throw new Error('Unique constraint violation: ' + error.detail);
//       }
//       throw error;
//     } finally {
//       client.release();
//     }
//   }

//   async findById(id: number, requestedFields: string[] = []): Promise<Property | null> {
//     const cacheKey = `property:${id}`

//     const cached = (await redisClient.get(cacheKey))?.toString()

//     if (cached) {
//       console.log("cache hit for property:", id)
//       return JSON.parse(cached)
//     }
//     const fields = this.mapGraphQLFieldsToColumns(requestedFields);
//     const query = `
//       SELECT ${fields.join(', ')}
//       FROM properties p
//       WHERE p.id = $1
//     `;
//     // console.log(fields, requestedFields)
//     // console.log({query})
//     const result = await this.pool.query(query, [id]);

//     if (result.rows[0]) {
//       console.log("setting redis key", cacheKey)
//       await redisClient.setEx(cacheKey, CACHE_TTL.PROPERTY_DETAIL, JSON.stringify(result.rows[0]))
//     }
//     // console.log(result.rows[0])
//     return result.rows[0] || null;
//   }

//   async findByRealtor(realtor_id: number, requestedFields: string[] = []): Promise<Property[]> {
//     const cacheKey = `properties:realtor:${realtor_id}:${JSON.stringify(requestedFields.sort())}`;
//     const cached = await this.redisClient.get(cacheKey);
//     if (cached && typeof cached === 'string') return JSON.parse(cached);

//     const fields = this.mapGraphQLFieldsToColumns(requestedFields);
//     const query = `
//       SELECT ${fields.join(', ')}
//       FROM properties p
//       WHERE p.realtor_id = $1
//     `;
//     const result = await this.pool.query(query, [realtor_id]);
//     const properties = result.rows;

//     await this.redisClient.setEx(cacheKey, 3600, JSON.stringify(properties));
//     return properties;
//   }

//   async searchRoomTypes(input: SearchRoomsInput, requestedFields: string[]): Promise<{
//     edges: { node: RoomType, cursor: string }[];
//     pageInfo: { hasNextPage: boolean; endCursor: string | null };
//     totalCount: number;
//   }> {
//     const {
//       propertyType,
//       beds,
//       bathrooms,
//       minPrice,
//       maxPrice,
//       minSize,
//       maxSize,
//       amenities,
//       address,
//       checkIn,
//       checkOut,
//       first = 20,
//       after,
//       latitude,
//       longitude,
//       radius
//     } = input;

//     let duration: string;

//     const conditions: string[] = [];
//     const params: any[] = [];

//     const cacheKey = `search:${JSON.stringify(input)}`

//     const cached = await (await redisClient.get(cacheKey))?.toString()
//     if (cached) {
//       console.log("cache hit for search")
//       return JSON.parse(cached)
//     }

//     if (first < 1 || first > 100) {
//       throw new Error('first must be between 1 and 100');
//     }
//     // Property type
//     if (propertyType) {
//       params.push(propertyType);
//       conditions.push(`p.property_type = $${params.length}`);
//     }

//   // Bed / bath filters
//     if (beds) {
//       params.push(beds);
//       conditions.push(`rt.bed_count >= $${params.length}`);
//     }
//     if (bathrooms) {
//       params.push(bathrooms);
//       conditions.push(`rt.bathroom_count >= $${params.length}`);
//     }

//     // Size filters
//     if (minSize) {
//       params.push(minSize);
//       conditions.push(`rt.size_sqft >= $${params.length}`);
//     }
//     if (maxSize) {
//       params.push(maxSize);
//       conditions.push(`rt.size_sqft <= $${params.length}`);
//     }

//     // Price filters
//     if (minPrice) {
//       params.push(minPrice);
//       conditions.push(`rt.base_price >= $${params.length}`);
//     }
//     if (maxPrice) {
//       params.push(maxPrice);
//       conditions.push(`rt.base_price <= $${params.length}`);
//     }

//     // Amenity filter
//     if (amenities && amenities.length > 0) {
//       params.push(amenities);
//       conditions.push(`rt.amenities && $${params.length}::text[]`);
//     }

//     // 🔍 Location filter — FIXED (direct JOIN with addresses)
//     if (latitude && longitude && radius) {
//       params.push(longitude, latitude, radius * 1000); // convert km → meters if needed
//       conditions.push(`
//         ST_DWithin(
//           a.geom,
//           ST_MakePoint($${params.length - 2}, $${params.length - 1})::geography,
//           $${params.length}
//         )
//       `);
//     }

//   // Address search (partial match)
//     if (address) {
//       params.push(`%${address}%`);
//       conditions.push(`(
//         p.title ILIKE $${params.length}
//         OR a.street ILIKE $${params.length}
//         OR EXISTS (SELECT 1 FROM cities c WHERE c.id = a.city_id AND c.name ILIKE $${params.length})
//         OR EXISTS (SELECT 1 FROM countries co 
//         JOIN cities c2 ON c2.country_id = co.id
//         WHERE c2.id = a.city_id AND co.name ILIKE $${params.length})
//       )`);
//     }

//     // Availability
//     let availabilityJoin = "";
//     if (checkIn && checkOut) {
//       const result = await this.pool.query(
//         `SELECT calculate_nights($1, $2)`,
//         [checkIn, checkOut]
//       )

//       const nights = result.rows[0]?.calculate_nights;

//       if (nights >= 30) {
//         duration =  'monthly';
//       } else if (nights >= 7) {
//         duration =  'weekly';
//       } else {
//         duration =  'daily';
//       }
      
//       params.push(checkIn, checkOut);
//       const startIdx = params.length - 1;
//       const endIdx = params.length;
//       availabilityJoin = `
//         JOIN room_units u ON u.room_type_id = rt.id AND u.status = 'active'
//         LEFT JOIN bookings b ON b.unit_id = u.id
//         AND b.status = 'confirmed'
//         AND daterange(b.check_in, b.check_out, '[]') && daterange($${startIdx}, $${endIdx}, '[]')
//       `;
//       conditions.push("b.id IS NULL");
//     } else {
//       availabilityJoin = `
//         JOIN room_units u ON u.room_type_id = rt.id AND u.status = 'active'
//       `;
//     }

//     const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

//     const p_fields = requestedFields.filter(f => f.startsWith('p.')).map(f => f + ' AS ' + f.replace('.', '_'))
//     let price_fields = [];
//     switch (duration) {
//       case 'daily': {
//         // params.push(checkIn);
//         const startIndex = params.length-1;

//         // params.push(checkOut);
//         const endIndex = params.length;
//         if (!checkIn || !checkOut) return;

//         price_fields = [`
//           (
//             SELECT AVG(rc.nightly_rate)
//             FROM rate_calendar rc
//             WHERE rc.room_type_id = rt.id
//             AND rc.date >= $${startIndex}::date
//             AND rc.date <  $${endIndex}::date
//           ) AS dbx
//         `];
//         break;
//       }
//       case 'weekly': {
//         price_fields = ['rt.weekly_rate AS dbx']
//         break
//       }
//       case 'monthly': {
//         price_fields = ['rt.monthly_rate AS dbx']
//         break
//       }
//     }
//     // Pagination
//     let paginationClause = "";
//     if (after) {
//       params.push(after);
//       paginationClause = `AND rt.id > $${params.length}`;
//     }
//     params.push(first);
//     const limitClause = `LIMIT $${params.length}`;
//     const fields = [
//       ...this.mapGraphQLFieldsToColumns(requestedFields, false),
//       ...p_fields,
//       ...price_fields
//     ]

//     const roomTypesQuery = `
//       SELECT 
//         ${fields.join(', ')},     
//         COUNT(u.id) AS available_units,
//         COUNT(rt.id) AS total_units
//       FROM room_types rt
//       JOIN properties p ON rt.property_id = p.id
//       JOIN addresses a ON p.address_id = a.id
//       ${availabilityJoin}
//       ${whereClause}
//       GROUP BY rt.id, p.id
//       ORDER BY rt.id
//       ${paginationClause}
//       ${limitClause};
//     `;

//   const countParams = params.slice(0, params.length - (after ? 2 : 1));
//   const countQuery = `
//     SELECT COUNT(DISTINCT rt.id)
//     FROM room_types rt
//     JOIN properties p ON rt.property_id = p.id
//     JOIN addresses a ON p.address_id = a.id
//     ${availabilityJoin}
//     ${whereClause}
//   `;

//     const [result, totalCountResult] = await Promise.all([
//       this.pool.query(roomTypesQuery, params),
//       this.pool.query(countQuery, countParams)
//     ])

//     console.log(result.rows[0].available_units, result.rows[0].total_units, totalCountResult.rows[0])
    


//     const roomTypes: RoomType[] = result.rows.map(row => ({
//       id: row.id,
//       property_id: row.property_id,
//       name: row.name,
//       description: row.description,
//       capacity: row.capacity,
//       bedCount: row.bed_count,
//       bathroomcount: row.bathroom_count,
//       sizeSqft: row.size_sqft,
//       basePrice: row.base_price,
//       price: row.base_price,
//       derivedPrice: row.dbx,
//       weeklyRate: row.weekly_rate,
//       monthlyRate: row.monthly_rate,
//       property: {
//         id: row.p_id,
//         realtor_id: row.p_realtor_id,
//         address_id: row.p_address_id,
//         title: row.p_title,
//         speciality: row.p_speciality,
//         amenities: row.p_amenities,
//         price: row.p_price,
//         description: row.p_description,
//         property_type: row.p_property_type,
//         sale_status: row.p_sale_status,
//         status: row.p_status,
//         created_at: row.p_created_at,
//         updated_at: row.p_updated_at,
//       },
//       availableUnits: row.available_units,
//       totalUnits: row.total_units,
//       duration: duration,
//       amenities: row.amenities || [],
//     }));
//     // console.log({roomTypes})

//     const hasNextPage = result.rows.length === first;
//     const endCursor = hasNextPage ? result.rows[result.rows.length - 1].id : null;

//     if (roomTypes) {
//       redisClient.setEx(cacheKey, CACHE_TTL.SEARCH_RESULTS, JSON.stringify({
//         edges: roomTypes.map(node => ({
//           node,
//           cursor: node.id.toString(),
//         })),
//         pageInfo: {hasNextPage, endCursor },
//         totalCountResult: totalCountResult.rows[0].count
//       }))
//     }

//     // console.log({returned: 'fas'})

//     return {
//       edges: roomTypes.map(node => ({
//         node,
//         cursor: node.id.toString(),
//       })),
//       pageInfo: { hasNextPage, endCursor },
//       totalCount: totalCountResult.rows[0].count,
//     };
//   }
  
//   async getRoomType(id: number, requestedFields: string[]): Promise<RoomType> {
//     const cacheKey = `roomType:${id}`;

//     const cached = (await redisClient.get(cacheKey))?.toString();
//     if (cached) {
//       console.log('Cache hit for property:', id);
//       return JSON.parse(cached)
//     }
//     let params = []
//     params.push(id)
//     const p_fields = requestedFields.filter(f => f.startsWith('p.')).map(f => f + ' AS ' + f.replace('.', '_'))
//     const fields = [...this.mapGraphQLFieldsToColumns(requestedFields, false), ...p_fields]
//     const query = `
//       SELECT ${fields.join(' ,')}
//       FROM room_types rt
//       JOIN properties p ON rt.property_id = p.id
//       WHERE rt.id = $${params.length}
//     `;
//     // console.log({query})
//     const result = await this.pool.query(query, params);
//     // console.log({resul: result.rows[0]})
//     const room: any = {
//       id: result.rows[0]?.id,
//       name: result.rows[0]?.name,
//       property_id: result.rows[0]?.property_id,
//       description: result.rows[0]?.description,
//       currency: result.rows[0]?.currency,
//       amenities: result.rows[0]?.amenities,
//       capacity: result.rows[0]?.capacity,
//       bedCount: result.rows[0]?.bed_count,
//       bathroomCount: result.rows[0]?.bathroom_count,
//       sizeSqft: result.rows[0]?.size_sqft,
//       basePrice: result.rows[0]?.base_price,
//       weeklyRate: result.rows[0]?.weekly_rate,
//       monthlyRate: result.rows[0]?.monthly_rate,
//       totalUnits: result.rows[0]?.total_units,
//       property: {
//         id: result.rows[0]?.p_id,
//         realtor_id: result.rows[0]?.p_realtor_id,
//         address_id: result.rows[0]?.p_address_id,
//         title: result.rows[0]?.p_title,
//         speciality: result.rows[0]?.p_speciality,
//         amenities: result.rows[0]?.p_amenities,
//         price: result.rows[0]?.p_price,
//         description: result.rows[0]?.p_description,
//         property_type: result.rows[0]?.p_property_type,
//         sale_status: result.rows[0]?.p_sale_status,
//         status: result.rows[0]?.p_status,
//         created_at: result.rows[0]?.p_created_at,
//         updated_at: result.rows[0]?.p_updated_at,
//       },
//     }

//     if (room) {
//       await redisClient.setEx(cacheKey, CACHE_TTL.PROPERTY_DETAIL, JSON.stringify(room))
//     }
//     // console.log({result: room})rs

//     return room
//   }

//   async addRoomUnit(input: Omit<Unit, 'id'>): Promise<Unit> {
//     // console.log('sosioiso')
//     const query = `
//       INSERT INTO room_units (room_type_id, unit_code, floor_number, status) VALUES ($1, $2, $3, $4) RETURNING *
//     `

//     const result = await this.pool.query(query, [
//       input.roomTypeId, input.unitCode, input.floorNumber, input.status
//     ])

//     console.log(result.rows[0])
//     return result.rows[0]
//   }

//   async getAvailability({ id, startDate, endDate }): Promise<RateCalender[]> {
//     // console.log({id, startDate, endDate})
//     const result = await this.pool.query(
//       `SELECT date, nightly_rate, min_stay, is_blocked
//        FROM rate_calendar
//        WHERE room_type_id = $1
//          AND date BETWEEN $2 AND $3
//        ORDER BY date`,
//       [id, startDate, endDate]
//     );
//     // console.log({result: result.rows})
//     return result.rows;
//   }

//   async getAvailableUnits({ id, checkIn, checkOut }): Promise<Unit[]> {
//     const params = (checkIn && checkOut) ? [id, checkIn, checkOut]: [id]
//     const result = await this.pool.query(
//       `SELECT ru.*
//        FROM room_units ru
//        WHERE ru.room_type_id = $1
//         AND ru.id NOT IN (
//           SELECT b.unit_id
//           FROM bookings b
//           WHERE b.status = 'confirmed'
//           ${(checkIn && checkOut) ? `AND daterange(check_in, check_out, '[]') && daterange($2, $3, '[]')`: ''}
//         )`,
//       [...params]
//     );
//     return result.rows;
//   }

//   async countUnits({ id }): Promise<number> {
//     console.log({id})
//     const result = await this.pool.query(
//       `SELECT COUNT(*)
//        FROM room_units ru
//        WHERE ru.room_type_id = $1
//         AND ru.id NOT IN (
//           SELECT b.unit_id
//           FROM bookings b
//           WHERE b.status = 'confirmed'
//         )`,
//       [id]
//     );

//     console.log({resos: result.rows[0]})
//     return result.rows[0]?.count;
//   }

//   async update(id: number, property: Partial<Omit<Property, 'id' | 'created_at'>> & { address?: Omit<Address, 'id' | 'created_at'>; image_urls?: string[] }): Promise<Property | null> {
//     const client = await this.pool.connect();
//     try {
//       await client.query('BEGIN');
//       const propertyData = await this.findById(id, ['id', 'realtor_id', 'address_id']);
//       if (!propertyData) return null;

//       if (property.address) {
//         const countryQuery = `
//           WITH inserted AS (
//             INSERT INTO countries (name, code)
//             VALUES ($1, $2)
//             ON CONFLICT (name) DO NOTHING
//             RETURNING id
//           )
//           SELECT id FROM inserted
//           UNION
//           SELECT id FROM countries WHERE name = $1
//         `;
//         const countryResult = await client.query(countryQuery, [
//           property.address.country,
//           property.address.country.slice(0, 2).toUpperCase()
//         ]);
//         const country_id = countryResult.rows[0].id;

//         const cityQuery = `
//           WITH inserted AS (
//             INSERT INTO cities (name, country_id)
//             VALUES ($1, $2)
//             ON CONFLICT (name, country_id) DO NOTHING
//             RETURNING id
//           )
//           SELECT id FROM inserted
//           UNION
//           SELECT id FROM cities WHERE name = $1 AND country_id = $2
//         `;
//         const cityResult = await client.query(cityQuery, [property.address.city, country_id]);
//         const city_id = cityResult.rows[0].id;

//         const addressQuery = `
//           WITH inserted AS (
//             INSERT INTO addresses (street, city_id, postal_code, latitude, longitude)
//             VALUES ($1, $2, $3, $4, $5)
//             ON CONFLICT (street, city_id, postal_code) DO NOTHING
//             RETURNING id
//           )
//           SELECT id FROM inserted
//           UNION
//           SELECT id FROM addresses WHERE street = $1 AND city_id = $2 AND (postal_code = $3 OR (postal_code IS NULL AND $3 IS NULL))
//         `;
//         const addressResult = await client.query(addressQuery, [
//           property.address.street,
//           city_id,
//           property.address.postal_code || null,
//           property.address.latitude || null,
//           property.address.longitude || null
//         ]);
//         property.address_id = addressResult.rows[0].id;
//       }

//       if (property.image_urls) {
//         await client.query('DELETE FROM property_images WHERE property_id = $1', [id]);
//         for (const imageUrl of property.image_urls) {
//           await client.query(
//             'INSERT INTO property_images (property_id, url) VALUES ($1, $2)',
//             [id, imageUrl]
//           );
//         }
//       }

//       const fields = [];
//       const values = [];
//       let index = 1;
//       for (const [key, value] of Object.entries(property)) {
//         if (value !== undefined && key !== 'address' && key !== 'image_urls') {
//           fields.push(`${key} = $${index++}`);
//           values.push(key === 'amenities' ? JSON.stringify(value) : value);
//         }
//       }
//       if (fields.length === 0) return null;
//       values.push(id);
//       const query = `
//         UPDATE properties
//         SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
//         WHERE id = $${index}
//         RETURNING *
//       `;
//       const result = await client.query(query, values);
//       await client.query('COMMIT');

//       // await this.redisClient.del(`properties:realtor:${result.rows[0].realtor_id}`);
//       // await this.redisClient.del(`properties:connection:*`);
//       // await this.redisClient.del(`properties:search:*`);
//       await Promise.all([
//         redisClient.del(`property:${id}`),
//         // invalidateSearchCache()
//       ])
//       return result.rows[0];
//     } catch (error) {
//       await client.query('ROLLBACK');
//       throw error;
//     } finally {
//       client.release();
//     }
//   }

//   async delete(id: number): Promise<boolean> {
//     const client = await this.pool.connect();
//     try {
//       await client.query('BEGIN');
//       const property = await this.findById(id, ['id', 'realtor_id']);
//       if (!property) return false;
//       const query = `DELETE FROM properties WHERE id = $1`;
//       const result = await this.pool.query(query, [id]);
//       await client.query('COMMIT');
//       await redisClient.del(`property:${id}`)
//       // await this.redisClient.del(`properties:realtor:${property.realtor_id}`);
//       // await this.redisClient.del(`properties:connection:*`);
//       await this.redisClient.del(`search:*`);
//       return (result.rowCount ?? 0) > 0;
//     } catch (error) {
//       await client.query('ROLLBACK');
//       throw error;
//     } finally {
//       client.release();
//     }
//   }
// }

// export default new PropertyModel(pool);


// -- This is what your application should use
// SELECT 
//     a.id,
//     a.street,
//     a.postal_code,
//     ci.name as city_name,
//     co.name as country_name,
//     co.code as country_code,
//     -- Weighted relevance scoring
//     (
//         CASE 
//             WHEN a.postal_code = '81651' THEN 100
//             WHEN ci.name ILIKE '81651' THEN 80
//             WHEN ci.name ILIKE '81651' || '%' THEN 60
//             ELSE ts_rank(a.search_vector, plainto_tsquery('english', '81651')) * 40
//         END
//     ) as relevance_score
// FROM addresses a
// JOIN cities ci ON a.city_id = ci.id
// JOIN countries co ON ci.country_id = co.id
// WHERE 
//     a.postal_code = '81651'
//     OR ci.name ILIKE '81651' || '%'
//     OR a.search_vector @@ plainto_tsquery('english', '81651')
// ORDER BY relevance_score DESC
// LIMIT 50;