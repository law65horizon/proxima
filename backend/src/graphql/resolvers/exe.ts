// resolvers/homeResolver.js
// Assumes: pool = pg Pool instance, imported from your db module
// Assumes: resolvers are merged into your main resolver map

import pool from "../../config/database.js"
import { getRequestedFields } from "../../utils/getyRequestedFields.js"

/**
 * Fetches recently published, active room types for the featured carousel.
 * Ordered by created_at DESC, optionally filtered by property type / sale status.
 * Falls back to top-rated if lat/lng provided (proximity bias).
 */


async function featuredRoomTypes(_parent, { input }: {input: any}, __, info) {

  const fields = getRequestedFields(info)
  console.log({fields,})

  const pFields = fields
    .filter((f) => f.startsWith("p.") && f !== 'p.images')
    .map((f) => `${f} AS ${f.replace(".", "_")}`);

  const {
    latitude,
    longitude,
    radiusKm = 100,
    propertyType,
    saleStatus,
    limit = 6,
  } = input

  const conditions = [
    `p.status = 'published'`,
    `p.deleted_at IS NULL`,
    `rt.is_active = TRUE`,
    `rt.deleted_at IS NULL`,
    `rt.base_price IS NOT NULL`,
  ]
  const params = []

  if (propertyType) {
    params.push(propertyType)
    conditions.push(`p.property_type = $${params.length}`)
  }

  if (saleStatus) {
    params.push(saleStatus)
    conditions.push(`p.sale_status = $${params.length}`)
  }

  // Proximity filter when coordinates provided
  let orderClause = `rt.created_at DESC`
  if (latitude != null && longitude != null) {
    params.push(longitude, latitude, radiusKm * 1000)
    const geoIdx = params.length
    conditions.push(
      `ST_DWithin(a.geom, ST_SetSRID(ST_MakePoint($${geoIdx - 2}, $${geoIdx - 1}), 4326)::geography, $${geoIdx})`
    )
    // Bias: closer + newer first
    orderClause = `ST_Distance(a.geom, ST_SetSRID(ST_MakePoint($${geoIdx - 2}, $${geoIdx - 1}), 4326)::geography) ASC, rt.created_at DESC`
  }

  params.push(limit)
  const limitIdx = params.length

  const sql = `
    SELECT
      rt.id,
      rt.property_id,
      rt.name,
      rt.description,
      rt.capacity,
      rt.bed_count,
      rt.bathroom_count,
      rt.size_sqft,
      rt.base_price,
      rt.weekly_rate,
      rt.monthly_rate,
      rt.currency,
      rt.is_active,
      rt.amenities,
      rt.min_nights,
      rt.max_nights,
      rt.created_at,
      ${pFields.join(", ")},
      p.address_id AS p_address_id,
      p.realtor_id AS p_realtor_id,
      -- Avg rating from reviews
      ROUND(AVG(rv.rating)::numeric, 1)  AS avg_rating,
      COUNT(rv.id)                        AS total_reviews,
      -- Available unit count
      (
        SELECT COUNT(*)
        FROM room_units ru
        WHERE ru.room_type_id = rt.id
          AND ru.status = 'active'
      ) AS available_units
    FROM room_types rt
    JOIN properties p ON p.id = rt.property_id
    LEFT JOIN addresses a ON a.id = p.address_id
    LEFT JOIN reviews rv ON rv.room_type_id = rt.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY rt.id, p.id, a.geom
    ORDER BY ${orderClause}
    LIMIT $${limitIdx}
  `
  console.log({sql})

  const { rows } = await pool.query(sql, params)
  console.log({rows, params})
  return rows.map(mapRoomTypeRow)
}

/**
 * Returns cities ranked by number of published active listings,
 * with an optional proximity bias.
 */
async function popularCities(_parent, { latitude, longitude, limit = 8 }) {
  const params = [limit]

  // If coordinates given, order by distance first then count
  let orderClause = `listing_count DESC`
  let geoSelect = `NULL::float AS latitude, NULL::float AS longitude`
  let geoJoin = ``

  if (latitude != null && longitude != null) {
    params.push(longitude, latitude)
    geoSelect = `
      ST_Y(ST_Centroid(ST_Collect(a.geom::geometry))) AS latitude,
      ST_X(ST_Centroid(ST_Collect(a.geom::geometry))) AS longitude
    `
    orderClause = `
      ST_Distance(
        ST_Centroid(ST_Collect(a.geom::geometry)),
        ST_SetSRID(ST_MakePoint($2, $3), 4326)
      ) ASC,
      listing_count DESC
    `
  }

  const sql = `
    SELECT
      ci.id AS city_id,
      ci.name AS city,
      co.name AS country,
      COUNT(DISTINCT p.id) AS listing_count,
      MIN(i.cdn_url) AS cover_image_url,
      ${geoSelect}
    FROM properties p
    JOIN addresses a    ON a.id = p.address_id
    JOIN cities ci      ON ci.id = a.city_id
    JOIN countries co   ON co.id = ci.country_id
    -- Grab a cover image from the first published room type in this city
    LEFT JOIN room_types rt     ON rt.property_id = p.id AND rt.is_active = TRUE AND rt.deleted_at IS NULL
    LEFT JOIN room_type_images rti ON rti.room_type_id = rt.id AND rti.is_primary = TRUE
    LEFT JOIN images i           ON i.id = rti.image_id
    WHERE p.status = 'published'
      AND p.deleted_at IS NULL
    GROUP BY ci.id, ci.name, co.name
    HAVING COUNT(DISTINCT p.id) > 0
    ORDER BY ${orderClause}
    LIMIT $1
  `

  const { rows } = await pool.query(sql, params)
  return rows.map(row => ({
    id: row.city_id,
    city: row.city,
    country: row.country,
    listingCount: parseInt(row.listing_count, 10),
    coverImageUrl: row.cover_image_url ?? null,
    latitude: row.latitude ? parseFloat(row.latitude) : null,
    longitude: row.longitude ? parseFloat(row.longitude) : null,
  }))
}

/**
 * Composite resolver — fetches featured rooms + popular cities in parallel.
 * This is what the home screen calls in a single round-trip.
 */
async function homeScreen(_parent, { latitude, longitude }, context, info) {
  const [featured, popularCities_] = await Promise.all([
    featuredRoomTypes(null, { input: { latitude, longitude, limit: 6 } }, context, info),
    popularCities(null, { latitude, longitude, limit: 8 }),
  ])
  return { featured, popularCities: popularCities_ }
}

// ── Row mapper (mirrors your existing RoomType GraphQL shape) ─────────────────

function mapRoomTypeRow(row) {
  return {
    id: String(row.id),
    property_id: String(row.property_id),
    name: row.name,
    description: row.description ?? null,
    capacity: row.capacity ?? null,
    bed_count: row.bed_count ?? null,
    bathroom_count: row.bathroom_count ?? null,
    size_sqft: row.size_sqft ?? null,
    base_price: row.base_price != null ? parseFloat(row.base_price) : null,
    weekly_rate: row.weekly_rate != null ? parseFloat(row.weekly_rate) : null,
    monthly_rate: row.monthly_rate != null ? parseFloat(row.monthly_rate) : null,
    currency: row.currency ?? 'USD',
    isActive: row.is_active,
    amenities: row.amenities ?? [],
    avg_rating: row.avg_rating != null ? parseFloat(row.avg_rating) : null,
    totalReviews: parseInt(row.total_reviews ?? 0, 10),
    availableUnits: parseInt(row.available_units ?? 0, 10),
    created_at: row.created_at,
    updated_at: row.updated_at,
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
    // Nested resolvers (property, images, reviews) handled by field resolvers
  }
}

// ── Export — merge into your resolver map ─────────────────────────────────────

export default {
  Query: {
    homeScreen,
    featuredRoomTypes,
    popularCities,
  },
}