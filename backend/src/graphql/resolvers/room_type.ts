import { GraphQLError } from "graphql";
import RoomTypeModel, { CreateRoomTypeInput, CreateRoomUnitInput, UpdateRoomUnitInput } from "../../models/RoomType.js";
import { Context, User } from "../../types/index.js";
import { roomTypesLoader, roomUnitLoader } from "./property.js";
import { requireAgent, requireAuth, requireOwnerOrAdmin } from "../../middleware/guards.js";


export default {
    Query: {
    },
    Mutation: {
        createRoomType: async (_, {input}: {input: Omit<CreateRoomTypeInput, 'property_id'> & {property_id: string}}, context: Context) => {
            const user = requireAgent(context)
            const result = await RoomTypeModel.createRoomType({...input, property_id: parseInt(input.property_id)}, user)
            roomTypesLoader.clearAll()
            return result
        },
        updateRoomType: async (_, {id, input}: {id: string, input: Omit<CreateRoomTypeInput, 'property_id'> & {property_id: string}}, context: Context) => {
            const user = requireAgent(context)
            const result = await RoomTypeModel.updateRoomType(parseInt(id), {...input, property_id: parseInt(input.property_id)}, user)
            roomTypesLoader.clear(parseInt(id))
            return result
        },
        deleteRoomType: async (_:any, {id}: {id: string}, context: Context) => {
            const user = requireAuth(context)

            const result = await RoomTypeModel.deleteRoomType(parseInt(id), user)
            roomTypesLoader.clearAll()
            return result
        },

        // units
        createRoomUnit: async (_: any, {input}: {input: Omit<CreateRoomUnitInput, 'room_type_id'> & {room_type_id: string}}, context: Context) => {
            const user = requireAuth(context)

            const result = await RoomTypeModel.createRoomUnit({...input, room_type_id: parseInt(input.room_type_id)}, user)
            roomUnitLoader.clearAll()
            return result
        },

        updateRoomUnit: async (_: any, {id, input}: {id: string, input: UpdateRoomUnitInput}, context: Context) => {
            const user = requireAuth(context)

            const result = await RoomTypeModel.updateRoomUnit(parseInt(id), input, user)
            roomUnitLoader.clear(parseInt(id))
            return result
        },

        deleteRoomUnit: async (_: any, {id}: {id: string}, context: Context) => {
            const user = requireAuth(context)

            const result = await RoomTypeModel.deleteRoomUnit(parseInt(id), user)
            roomUnitLoader.clearAll()
            return result
        }
    }
}