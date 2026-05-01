import userResolvers from './user.js'
import propertyResolvers from './property.js'
// import experienceResolvers from './experience.js'
import bookingResolvers from './booking.js'
import messageResolvers from './message.js'
import reviewResolvers from './review.js'
import authResolvers from './auth.js'
import room_type from './room_type.js'
import paymentResolvers from './payment.js'
import exeResolvers from './exe.js'
import agentResolvers from './agent.js'

export default {
    Query: {
        ...userResolvers.Query,
        ...propertyResolvers.Query,
        // ...experienceResolvers.Query,
        ...bookingResolvers.Query,
        ...messageResolvers.Query,
        ...reviewResolvers.Query,
        ...authResolvers.Query,
        ...room_type.Query,
        ...exeResolvers.Query,
        ...agentResolvers.Query
    },
    Mutation: {
        ...userResolvers.Mutation,
        ...propertyResolvers.Mutation,
        // ...experienceResolvers.Mutation,
        ...bookingResolvers.Mutation,
        ...messageResolvers.Mutation,
        ...reviewResolvers.Mutation,
        ...authResolvers.Mutation,
        ...paymentResolvers.Mutation,
        ...room_type.Mutation,
        ...agentResolvers.Mutation
    },
    Subscription: {
        ...messageResolvers.Subscription
    },
    Property: propertyResolvers.Property,
    Booking:  bookingResolvers.Booking,
    Conversation: messageResolvers.Conversation,
    Message: messageResolvers.Message,
    Review: reviewResolvers.Review,
    // Experience: experienceResolvers.Experience,
    RoomType: propertyResolvers.RoomType,
    Date: propertyResolvers.Date,
    DateTime: propertyResolvers.DateTime,
    MyBookingResult: bookingResolvers.MyBookingResult,
}