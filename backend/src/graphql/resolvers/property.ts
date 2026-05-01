// Updated property resolver
import DataLoader from "dataloader";  
import cloudinary from "../../config/cloudinary.js";
import PropertyModel, { Property } from "../../models/Property.js";
import { getNestedRequestedFields, getRequestedFields, getRequestedFieldss } from "../../utils/getyRequestedFields.js";
import { addressLoader, userLoader } from "./user.js";
import pool from "../../config/database.js";
import { GraphQLError, GraphQLScalarType, Kind } from "graphql";
import { reveiwLoader } from "./review.js";
import { info } from "console"
import { User, Recents, AuthUser } from "../../types/index.js";
import { SearchRoomsInput } from "../../types/input.js";
import { requireAgent, requireAuth, requireOwnerOrAdmin } from "../../middleware/guards.js";

// Date scalar
const dateScalar = new GraphQLScalarType({
  name: 'Date',
  description: 'Date custom scalar type',
  serialize(value: any) {
    return value instanceof Date ? value.toISOString().split('T')[0] : value;
  },
  parseValue(value: any) {
    return new Date(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

// DateTime scalar
const dateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime custom scalar type',
  serialize(value: any) {
    return value instanceof Date ? value.toISOString() : value;
  },
  parseValue(value: any) {
    return new Date(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

export default {
  Date: dateScalar,
  DateTime: dateTimeScalar,
  Query: {
    getProperty: async (_: any, { id }: { id: string }, { user }: { user: AuthUser }, info: any) => {
      console.log('wowiowiwo')
      const requestedFields = getRequestedFields(info);
      const property = await PropertyModel.findById(parseInt(id), requestedFields);
      if (!property) return null;
      return property;
    },    
    myProperties: async (_: any, __: any, context, info: any) => {
      // console.log({realtor_id})
      const user = requireAuth(context)
      const requestedFields = getRequestedFields(info);
      return await PropertyModel.findByRealtor(user.id, requestedFields);
    },

    searchRoomTypes: async (_: any, {input}: {input: SearchRoomsInput}, __: any, info: any) => {
      console.time('srt resolver')
      const requestedFields = getNestedRequestedFields(info)
      // console.log({input})
      const result = await PropertyModel.searchRoomTypes(input, requestedFields)
      console.timeEnd('srt resolver')
      return result
    },

    getAvailability: async (_, { id, startDate, endDate }) => {
      return await PropertyModel.getAvailability({id, startDate, endDate})
    },
    getAvailableUnits: async (_, { id, checkIn, checkOut }) => {
      return await PropertyModel.getAvailableUnits({id, checkIn, checkOut})
    },
    getRoomType: async (_, {id}: {id: number}, __: any, info: any) => {
      const requestedFields = getRequestedFields(info)          
      return await PropertyModel.getRoomType(id, requestedFields)
    },

    getRoomTypes: async (_, {ids}: {ids: string[]}, __: any, info: any) => {
      const requiredFields = getNestedRequestedFields(info)
      return await PropertyModel.getRoomTypes(ids.map(id => parseInt(id)), requiredFields)
    },
    
    quickSearch: async (_, {query, latitude, longitude, radius}: {query: string, latitude: number, longitude: number, radius: number}, __:any, info: any) => {
      const quick = await PropertyModel.quickSearch(query)
      console.log({quick: quick.quickSearch[0]})
      return quick
      // return await PropertyModel.quickSearch(query, latitude, longitude, radius)
    },

    searchRecents: async (_, { userId }: { userId: string }, context: { user: AuthUser }) => {
      const user = requireAuth(context);
      if (user.id !== userId) {
        throw new GraphQLError('You can only view your own recents.', {
          extensions: { code: 'FORBIDDEN', http: { status: 403 } },
        });
      }
      return await PropertyModel.searchRecents(parseInt(userId));
    },
  },
  Mutation: {
    createProperty: async (_: any, { input }: { input: any }, context: { user: AuthUser }) => {
      requireAgent(context)
      const property = await PropertyModel.create(input);
      propertyImageLoader.clear(property.id);
      return property;
    },
    updateProperty: async (_: any, { id, input }: { id: string; input: any }, context: { user: AuthUser }) => {
      const user = requireAuth(context);
      const property = await PropertyModel.findById(parseInt(id));
      if (!property) throw new GraphQLError('Property not found.', {
        extensions: { code: 'NOT_FOUND', http: { status: 404 } },
      });
      requireOwnerOrAdmin(context, property.realtor_id);
      const updatedProperty = await PropertyModel.update(parseInt(id), input);
      propertyImageLoader.clear(parseInt(id));
      return updatedProperty;
    },
    deleteProperty: async (_: any, { id }: { id: string }, context: { user: AuthUser }) => {
      const property = await PropertyModel.findById(parseInt(id));
      if (!property) throw new GraphQLError('Property not found.', {
        extensions: { code: 'NOT_FOUND', http: { status: 404 } },
      });
      requireOwnerOrAdmin(context, property.realtor_id);
      const result = await PropertyModel.delete(parseInt(id));
      propertyImageLoader.clear(parseInt(id));
      return result;
    },

    generateCloudinarySignature: async (_: any, __: any, context: { user: AuthUser }) => {
      requireAuth(context);
      const timestamp = Math.round(new Date().getTime() / 1000).toString();
      const signature = cloudinary.utils.api_sign_request(
        { timestamp, folder: "properties" },
        process.env.CLOUDINARY_API_SECRET!
      );
      return {
        signature,
        timestamp,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
      };
    },

    addToRecents: async (_, { input }: { input: Omit<Recents, 'userId'> & { userId: string } }, context: { user: AuthUser }) => {
      const user = requireAuth(context);
      return await PropertyModel.addToRecents(input);
    },
  },
  Property: {
    realtor: async (parent: Property) => {
      return await userLoader.load(parent.realtor_id,);
    },
    address: async (parent: Property) => {
      return await addressLoader.load(parent.address_id);
    },
    images: async (parent: Property) => {
      return await propertyImageLoader.load(parent.id);
    },
    bookings: async (parent: Property) => {
      return await propertyBookingLoader.load(parent.id);
    },
    reviews: async (parent: Property) => {
      return await propertyReviewLoader.load(parent.id);
    },
    roomTypes: async (parent: Property) => {
      return await roomTypesLoader.load(parent.id)
    },

  },
  RoomType: {
    units: async (parent) => {
      return await roomUnitLoader.load(parent.id)
    },
    pricing: async (parent) => {
      console.log({check: "iosiosi"})
      return await rateCalendarLoader.load(parent.id)
    },
    images: async (parent) => {
      return await roomImageLoader.load(parent.id)
    }, 
    reviews: async (parent) => {
      return await reveiwLoader.load(parent.id)
    }
    // property: async(parent, _, __, info) => {
    //   const requestedFields = getRequestedFields(info)
    //   console.log({requestedFields})
    //   return await PropertyModel.findById(parent.property_id, requestedFields)
    // },
    // availableUnits: async (parent) => {
    //   // console.log({parent: parent.id})
    //   // return 10
    //   return await PropertyModel.countUnits({id: parent.id})
    // },
  },
};

const propertyImageLoader = new DataLoader(async (propertyIds: readonly number[]) => {
  // console.log({propertyIds})
  const query = `
    SELECT 
      pi.id, 
      pi.property_id, 
      i.cdn_url,
      i.width,
      i.height
    FROM property_images pi
    JOIN Images i On i.id = pi.image_id
    WHERE pi.property_id = ANY($1)
  `;
  const result = await pool.query(query, [propertyIds]);
  return propertyIds.map(id => result.rows.filter(row => row.property_id == id));
});

const roomImageLoader = new DataLoader(async (propertyIds: readonly number[]) => {
  const query = `
    SELECT 
      i.id, 
      i.cdn_url as url, 
      rti.caption
    FROM room_type_images rti
    JOIN images i ON rti.image_id = i.id
    WHERE rti.room_type_id = ANY($1) AND i.deleted_at IS NULL
  `;
  const result = await pool.query(query, [propertyIds]);
  return propertyIds.map(id => result.rows.filter(row => row.imageable_id == id));
});

const propertyBookingLoader = new DataLoader(async (propertyIds: readonly number[]) => {
  const query = `
    SELECT * FROM bookings
    WHERE property_id = ANY($1)
  `;
  const result = await pool.query(query, [propertyIds]);
  return propertyIds.map(id => result.rows.filter(row => row.property_id == id));
}); 

const propertyReviewLoader = new DataLoader(async (propertyIds: readonly number[]) => {
  const query = `
    SELECT 
      id, 
      property_id, 
      user_id, 
      rating, 
      comment, 
      created_at
    FROM property_reviews
    WHERE property_id = ANY($1)
  `;
  const result = await pool.query(query, [propertyIds]);
  return propertyIds.map(id => result.rows.filter(row => row.property_id == id));
});

export const roomTypesLoader = new DataLoader(async (propertyIds: readonly number[]) => {
  const query = `
    SELECT * FROM room_types
    WHERE property_id = ANY($1) AND deleted_at IS NULL
  `;
  const result = await pool.query(query, [propertyIds]);
  return propertyIds.map(id => result.rows.filter(row => row.property_id == id));
});

export const roomUnitLoader = new DataLoader(async (roomTypesIds: readonly number[]) => {

  const query = `
    SELECT * FROM room_units
    WHERE room_type_id = ANY($1)
  `;
  const result = await pool.query(query, [roomTypesIds]);
  return roomTypesIds.map(id => result.rows.filter(row => row.room_type_id == id));
});

export const roomUnitLoader0 = new DataLoader(async (roomTypesIds: readonly number[]) => {
  const query = `
    SELECT * FROM room_units
    WHERE id = ANY($1)
  `;

  const result = await pool.query(query, [roomTypesIds]);
  const rows = result.rows;

  // Create a map: id → row
  const rowMap = new Map<number, any>();
  rows.forEach(row => rowMap.set(row.id, row));

  // Return array in the same order as input keys
  return roomTypesIds.map(id => rowMap.get(id) ?? null);
});

// const pricingRulesLoader = new DataLoader(async (roomTypesIds: readonly number[]) => {
//   const query = `
//     SELECT * FROM room_pricing_rules
//     WHERE room_type_id = ANY($1)
//   `;
//   const result = await pool.query(query, [roomTypesIds]);
//   return roomTypesIds.map(id => result.rows.filter(row => row.room_type_id == id));
// });

// const durationDiscountsLoader = new DataLoader(async (roomTypesIds: readonly number[]) => {
//   const query = `
//     SELECT * FROM room_duration_discounts
//     WHERE room_type_id = ANY($1)
//   `;
//   const result = await pool.query(query, [roomTypesIds]);
//   return roomTypesIds.map(id => result.rows.filter(row => row.room_type_id == id));
// });

const rateCalendarLoader = new DataLoader(async (roomTypesIds: readonly number[]) => {
  console.log({roomTypesIds})
  const query = `
    SELECT * FROM rate_calendar
    WHERE room_type_id = ANY($1)
  `;
  const result = await pool.query(query, [roomTypesIds]);
  // console.log(roomTypesIds.map(id => result.rows.filter(row => row.room_type_id == id)))
  return roomTypesIds.map(id => result.rows.filter(row => row.room_type_id == id));
});

// const roomBlocksLoader = new DataLoader(async (roomTypesIds: readonly number[]) => {
//   const query = `
//     SELECT * FROM room_blocks
//     WHERE room_type_id = ANY($1)
//   `;
//   const result = await pool.query(query, [roomTypesIds]);
//   return roomTypesIds.map(id => result.rows.filter(row => row.room_type_id == id));
// });
