// graphql/resolvers/messages.resolvers.ts (IMPROVED VERSION)
import { GraphQLError } from 'graphql';
import { pubsub } from '../../services/pubsub.js';
import pool from '../../config/database.js';
import { withFilter } from 'graphql-subscriptions';
import DataLoader from 'dataloader';
import { userLoader } from './user.js';
import { propertyBookingLoader } from './booking.js';
import { subscribe } from 'diagnostics_channel';
import { AuthUser, Message } from '../../types/index.js';
import { requireAuth } from '../../middleware/guards.js';

const MESSAGE_ADDED = 'MESSAGE_ADDED';
const MESSAGE_READ = 'MESSAGE_READ';
const CONVERSATION_UPDATED = 'CONVERSATION_UPDATED'

interface Context {
  user: AuthUser;
  loaders?: any;
}

interface ConversationMessage extends Message {
  conversation_id: string
}

const unreadCountLoader = new DataLoader(async (keys: readonly { conversationId: number, userId: number }[]) => {
    const conversationIds = keys.map(k => k.conversationId);
    const userId = keys[0].userId;

    const result = await pool.query(
      `SELECT conversation_id, COUNT(*) as count 
       FROM messages
       WHERE conversation_id = ANY($1) 
         AND sender_id != $2 
         AND read_at IS NULL
       GROUP BY conversation_id`,
      [conversationIds, userId]
    );

    const countMap = new Map(result.rows.map(r => [r.conversation_id, parseInt(r.count)]));
    return conversationIds.map(id => countMap.get(id) || 0);
  })

export default {
  Query: {
    conversations: async (_: any, { first = 20, after, filter }: any, context: Context) => {
      const user = requireAuth(context)

      let query = `
        SELECT
          c.*,
          COUNT(*) OVER() as total_count
        FROM conversations c
        WHERE (c.host_id = $1 OR c.guest_id = $1)
      `;

      const params: any[] = [user.id];
      let paramIndex = 2;

      if (filter?.propertyId) {
        query += ` AND c.property_id = $${paramIndex++}`;
        params.push(filter.propertyId);
      }

      if (filter?.hasUnread) {
        query += ` AND EXISTS (
          SELECT 1 FROM messages m 
          WHERE m.conversation_id = c.id 
            AND m.read_at IS NULL 
            AND m.sender_id != $1
        )`;
      }

      if (filter?.searchQuery) {
        query += ` AND EXISTS (
          SELECT 1 FROM messages m
          JOIN users u ON m.sender_id = u.id
          WHERE m.conversation_id = c.id
            AND (m.content ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex})
        )`;
        params.push(`%${filter.searchQuery}%`);
        paramIndex++;
      }

      if (after) {
        const cursor = Buffer.from(after, 'base64').toString('ascii');
        const [timestamp, id] = cursor.split('_');
        query += ` AND (c.last_message_at < $${paramIndex} 
                     OR (c.last_message_at = $${paramIndex} AND c.id < $${paramIndex + 1}))`;
        params.push(timestamp, id);
        paramIndex += 2;
      }

      query += ` ORDER BY c.last_message_at DESC, c.id DESC LIMIT $${paramIndex}`;
      params.push(first + 1);
      console.log({query})

      console.time('db')
      const result = await pool.query(query, params);
      console.timeEnd('db')
      console.log({result: result.rows})
      const conversations = result.rows;
      const hasNextPage = conversations.length > first;
      
      if (hasNextPage) conversations.pop();

      const edges = conversations.map((conv: any) => ({
        node: conv,
        cursor: Buffer.from(`${conv.last_message_at}_${conv.id}`).toString('base64'),
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!after,
          startCursor: edges[0]?.cursor,
          endCursor: edges[edges.length - 1]?.cursor,
        },
        totalCount: conversations[0]?.total_count || 0,
      };
    },
    
    conversation: async (_: any, { conversationId, recipient, limit, offset }: any, context: Context) => {
      const user = requireAuth(context)
      console.log(conversationId, user?.id, recipient)
      if (!conversationId && !recipient) throw new Error('Invalid input')

      let result

      if (!conversationId) {
        result = await pool.query(
          `SELECT c.* FROM conversations c
           WHERE (host_id, guest_id) IN (($1, $2), ($2, $1))`,
          [3, parseInt(recipient)]
        );
      } else {
        result = await pool.query(
          `SELECT c.* FROM conversations c
          WHERE c.id = $1 AND (c.guest_id = $2 OR c.host_id = $2) `,
          [conversationId, user.id]
        )
      }

      // console.log(result.rows[0])
      

      if (!result.rows[0]) {
        throw new Error('Conversation not found');
      }

      // const messa = result.rows[0]

      // const message = {
      //   id: messa.id,
      //   messages: [messa.m]
      // }

      return result.rows[0];
    },

    messages: async (_: any, { conversationId, limit = 50, offset = 0 }: any, context: Context) => {
      const user = requireAuth(context)

      // Verify access with single query
      // const result = await pool.query(
      //   `SELECT m.* FROM messages m
      //    INNER JOIN conversations c ON m.conversation_id = c.id
      //    WHERE m.conversation_id = $1 
      //      AND m.deleted_at IS NULL
      //      AND (c.host_id = $2 OR c.guest_id = $2)
      //    ORDER BY m.created_at ASC
      //    LIMIT $3 OFFSET $4`,
      //   [conversationId, user.id, limit, offset]
      // );

      const result = await pool.query(
        `SELECT m.* FROM messages m
         WHERE m.conversation_id = $1 
           AND m.deleted_at IS NULL
         ORDER BY m.created_at ASC
         LIMIT $2 OFFSET $3`,
        [conversationId, limit, offset]
      );

      if (result.rows.length === 0 && offset === 0) {
        // Check if conversation exists
        const convCheck = await pool.query(
          `SELECT 1 FROM conversations 
           WHERE id = $1 AND (host_id = $2 OR guest_id = $2)`,
          [conversationId, user.id]
        );

        if (!convCheck.rows[0]) {
          throw new GraphQLError('Not authorized', {
            extensions: { code: 'FORBIDDEN', http: { status: 403 } }
          });
        }
      }

      return result.rows;
    },
  },

  Mutation: {
    createConversation: async (_: any, { input }: any, context: Context) => {
      const user = requireAuth(context)
    
      const { propertyId, guestId, bookingId, initialMessage } = input;
    
      // Determine host_id from property
      const hostId = user?.id || 1;
      if (propertyId) {
        const propResult = await pool.query(
          'SELECT realtor_id FROM properties WHERE id = $1',
          [propertyId]
        );
        if (!propResult.rows[0]) {
          throw new Error('Property not found');
        }
        // hostId = propResult.rows[0].realtor_id;
      }
    
      // Check if conversation already exists
      const existingConv = await pool.query(
        `SELECT * FROM conversations 
         WHERE property_id = $1 AND host_id = $2 AND guest_id = $3`,
        [propertyId, hostId, guestId]
      );
    
      let conversation;
      if (existingConv.rows[0]) {
        conversation = existingConv.rows[0];
      } else {
        const convResult = await pool.query(
          `INSERT INTO conversations (property_id, host_id, guest_id, booking_id)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [propertyId, hostId, guestId, bookingId]
        );
        conversation = convResult.rows[0];
      }
    
      // Send initial message
      await pool.query(
        `INSERT INTO messages (conversation_id, sender_id, content)
         VALUES ($1, $2, $3)`,
        [conversation.id, user?.id || 1, initialMessage]
      );
      
      pubsub.publish(CONVERSATION_UPDATED, {
        conversationUpdated: conversation,
        userId: conversation.host_id === user.id ? conversation.guest_id : user.id
      })
    
      return conversation;
    },

    sendMessage: async (_: any, { input }: any, context: Context) => {
      const user = requireAuth(context)
      console.time('sendMessage')

      const { conversationId, content, messageType = 'text' } = input;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Insert message with authorization check in one query
        const result = await client.query(
          `WITH conv_check AS (
            SELECT id, host_id, guest_id FROM conversations 
            WHERE id = $1 AND (host_id = $2 OR guest_id = $2)
          )
          INSERT INTO messages (conversation_id, sender_id, content, message_type)
          SELECT $1, $2, $3, $4
          FROM conv_check
          RETURNING *, 
          (SELECT host_id FROM conv_check) AS host_id,
          (SELECT guest_id FROM conv_check) AS guest_id
          `,
          [conversationId, user?.id || 6, content, messageType.toLowerCase()]
        );

        // const result = await client.query(
        //   `
        //   WITH conv_check AS (
        //     SELECT id, host_id, guest_id
        //     FROM conversations
        //     WHERE id = $1
        //       AND (host_id = $2 OR guest_id = $2)
        //   ),
        //   inserted_message AS (
        //     INSERT INTO messages (conversation_id, sender_id, content, message_type)
        //     SELECT $1, $2, $3, $4
        //     FROM conv_check
        //     RETURNING *
        //   )
        //   SELECT 
        //     im.*,
        //     cc.host_id,
        //     cc.guest_id,
        //     (
        //       SELECT COUNT(*)
        //       FROM messages m
        //       WHERE m.conversation_id = cc.id
        //         AND m.sender_id <> $2
        //         AND m.read_at IS NULL
        //     ) AS unread_count
        //   FROM inserted_message im
        //   JOIN conv_check cc ON true;
        //   `,
        //   [conversationId, user?.id || 6, content, messageType.toLowerCase()]
        // )

        if (result.rowCount === 0) {
          throw new GraphQLError('Not authorized', {
            extensions: { code: 'FORBIDDEN', http: { status: 403 } }
          });
        }

        // Update conversation last_message_at (handled by trigger now, but keep for safety)
        // await client.query(
        //   'UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1',
        //   [conversationId]
        // );

        await client.query('COMMIT');

        const message = result.rows[0];
        console.log({message})

        // Publish to subscription
        pubsub.publish(MESSAGE_ADDED, {
          messageAdded: message,
          conversationId: parseInt(conversationId)
        });

        console.log({user})
        const id = user?.id || 6
        const ishost = message.host_id === id
        console.log({ishost})

        pubsub.publish(CONVERSATION_UPDATED, {
          conversationUpdated: {
            id: conversationId,
            lastMessage: message,
            last_message_at: message.created_at,
            guest_id: message.guest_id,
            host_id: message.host_id,
          },
          userId: ishost ? message.guest_id : message.host_id
        })

        return message;

      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        console.timeEnd('sendMessage')
        client.release();
      }
    },

    markMessagesAsRead: async (_: any, { conversationId, messageIds }: any, context: Context) => {
      const user = requireAuth(context)

      let query = `
        UPDATE messages 
        SET read_at = CURRENT_TIMESTAMP
        WHERE conversation_id = $1 
          AND sender_id != $2 
          AND read_at IS NULL
      `;
      const params = [conversationId, user.id];

      if (messageIds && messageIds.length > 0) {
        query += ` AND id = ANY($3)`;
        params.push(messageIds);
      }

      query += ` RETURNING *`;

      const result = await pool.query(query, params);

      // Publish read receipts
      if (result.rows.length > 0) {
        result.rows.forEach(msg => {
          pubsub.publish(MESSAGE_READ, {
            messageRead: msg,
            conversationId: parseInt(conversationId)
          });
        });
      }

      return true;
    },

    markAllAsRead: async (_: any, __: any, context: Context) => {
      const user = requireAuth(context)


      const result = await pool.query(
        `UPDATE messages m
         SET read_at = CURRENT_TIMESTAMP
         FROM conversations c
         WHERE m.conversation_id = c.id
           AND m.sender_id != $1
           AND m.read_at IS NULL
           AND (c.host_id = $1 OR c.guest_id = $1)
         RETURNING m.*, c.id as conversation_id`,
        [user.id]
      );
      const messages: ConversationMessage[] = result.rows;

      // Group by conversation and publish
      const byConversation = messages.reduce((acc, msg) => {
        if (!acc[msg.conversation_id]) acc[msg.conversation_id] = [];
        acc[msg.conversation_id].push(msg);
        return acc;
      }, {} as Record<number, any[]>);

      Object.entries(byConversation).forEach(([convId, messages]) => {
        messages.forEach(msg => {
          pubsub.publish(MESSAGE_READ, {
            messageRead: msg,
            conversationId: parseInt(convId)
          });
        });
      });

      return true;
    },
  },

  Subscription: {
    messageAdded: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator([MESSAGE_ADDED]),
        (payload, variables) => {
          console.log('message')
          return payload.conversationId === parseInt(variables.conversationId);
        }
      )
    },

    messageRead: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator([MESSAGE_READ]),
        (payload, variables) => {
          console.log('messageread')
          return payload.conversationId === parseInt(variables.conversationId);
        }
      )
    },

    conversationUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator([CONVERSATION_UPDATED]),
        (payload, variables, context) => {
          // console.log({context: context?.user})
          return payload.userId === parseInt(variables.userId)
        }
      )
    }
  },

  // Field resolvers with DataLoader
  Conversation: {
    // property: async (parent: any, _: any) => {
    //   if (!parent.property_id) return null;
    //   return propertyBookingLoader.load(parent.property_id);
    // },

    host: async (parent: any, _: any) => {
      return userLoader.load(parent.host_id);
    },
    messages: async (parent: any, {limit, offset}: any) => {
      console.log({limit, offset})
      const result = await pool.query(
        `SELECT m.* FROM messages m
         WHERE m.conversation_id = $1 
           AND m.deleted_at IS NULL
         ORDER BY m.created_at ASC
         LIMIT $2 OFFSET $3`,
        [parent.id, limit, offset]
      );
      return result.rows
    },

    guest: async (parent: any, _: any) => {
      // console.log({parent})
      return userLoader.load(parent.guest_id);
    },

    unreadCount: async (parent: any, _: any, context: any) => {
      if (!context.user) return 0;
      const count = await unreadCountLoader.load({
        conversationId: parent.id,
        userId: context.user.id,   // BUG FIX: was context.user.userId
      });
      return count;
    },

    lastMessage: async (parent: any, _: any) => {
      const result = await pool.query(
        `SELECT * FROM messages 
         WHERE conversation_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [parent.id]
      );
      return result.rows[0];
    },
  },

  Message: {
    sender: async (parent: any, _: any) => {
      return userLoader.load(parent.sender_id);
    },
  },
};

// // graphql/resolvers/messages.resolvers.ts
// import { GraphQLError } from 'graphql';
// import { pubsub } from '../../services/pubsub.js';
// import pool from '../../config/database.js';
// import { withFilter } from 'graphql-subscriptions';
// import { subscribe } from 'diagnostics_channel';

// const MESSAGE_ADDED = 'MESSAGE_ADDED';
// const MESSAGE_READ = 'MESSAGE_READ';
// const CONVERSATION_UPDATED = 'CONVERSATION_UPDATED';

// interface Context {
//   user?: { id: number; email: string };
// }

// export default {
//   Query: {
//     conversations: async (_: any, { first = 20, after, filter }: any, context: Context) => {
//       if (!user) {
//         throw new GraphQLError('Access token expired', {
//           extensions: {
//             code: 'UNAUTHENTICATED',
//             http: {status: 401 }
//           }
//         })
//       }
//       console.log(user)

//       let query = `
//         SELECT c.*, 
//           COUNT(*) OVER() as total_count,
//           (SELECT COUNT(*) FROM messages m 
//            WHERE m.conversation_id = c.id AND m.read_at IS NULL AND m.sender_id != $1
//           ) as unread_count
//         FROM conversations c
//         WHERE (c.host_id = $1 OR c.guest_id = $1)
//       `;

//       const params: any[] = [user.id];
//       let paramIndex = 2;

//       if (filter?.propertyId) {
//         query += ` AND c.property_id = $${paramIndex++}`;
//         params.push(filter.propertyId);
//       }

//       if (filter?.hasUnread) {
//         query += ` AND EXISTS (
//           SELECT 1 FROM messages m 
//           WHERE m.conversation_id = c.id 
//             AND m.read_at IS NULL 
//             AND m.sender_id != $1
//         )`;
//       }

//       if (filter?.searchQuery) {
//         query += ` AND EXISTS (
//           SELECT 1 FROM messages m
//           JOIN users u ON m.sender_id = u.id
//           WHERE m.conversation_id = c.id
//             AND (m.content ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex})
//         )`;
//         params.push(`%${filter.searchQuery}%`);
//         paramIndex++;
//       }

//       if (after) {
//         const cursor = Buffer.from(after, 'base64').toString('ascii');
//         const [timestamp, id] = cursor.split('_');
//         query += ` AND (c.last_message_at < $${paramIndex} OR (c.last_message_at = $${paramIndex} AND c.id < $${paramIndex + 1}))`;
//         params.push(timestamp, id);
//         paramIndex += 2;
//       }

//       query += ` ORDER BY c.last_message_at DESC, c.id DESC LIMIT $${paramIndex}`;
//       params.push(first + 1);
//       console.log({query})

//       const result = await pool.query(query, params);
//       console.log({result: result.rows})
//       const conversations = result.rows;
//       const hasNextPage = conversations.length > first;
      
//       if (hasNextPage) conversations.pop();

//       const edges = conversations.map((conv: any) => ({
//         node: conv,
//         cursor: Buffer.from(`${conv.last_message_at}_${conv.id}`).toString('base64'),
//       }));

//       return {
//         edges,
//         pageInfo: {
//           hasNextPage,
//           hasPreviousPage: !!after,
//           startCursor: edges[0]?.cursor,
//           endCursor: edges[edges.length - 1]?.cursor,
//         },
//         totalCount: conversations[0]?.total_count || 0,
//       };
//     },

//     conversation: async (_: any, { id }: any, { user }: Context) => {
//       if (!user) {
//         throw new GraphQLError('Access token expired', {
//           extensions: {
//             code: 'UNAUTHENTICATED',
//             http: {status: 401 }
//           }
//         })
//       }

//       const result = await pool.query(
//         `SELECT c.* FROM conversations c
//          WHERE c.id = $1 AND (c.host_id = $2 OR c.guest_id = $2)`,
//         [id, user.id]
//       );

//       if (!result.rows[0]) {
//         throw new Error('Conversation not found');
//       }

//       return result.rows[0];
//     },

//     messages: async (_: any, { conversationId, limit = 50, offset = 0 }: any, { user }: Context) => {
//       if (!user) {
//         throw new GraphQLError('Access token expired', {
//           extensions: {
//             code: 'UNAUTHENTICATED',
//             http: {status: 401 }
//           }
//         })
//       }

//       // Verify user has access to this conversation
//       const convCheck = await pool.query(
//         `SELECT 1 FROM conversations 
//          WHERE id = $1 AND (host_id = $2 OR guest_id = $2)`,
//         [conversationId, user.id]
//       );

//       if (!convCheck.rows[0]) {
//         throw new Error('Not authorized');
//       }

//       const result = await pool.query(
//         `SELECT m.* FROM messages m
//          WHERE m.conversation_id = $1 AND m.deleted_at IS NULL
//          ORDER BY m.created_at DESC
//          LIMIT $2 OFFSET $3`,
//         [conversationId, limit, offset]
//       );

//       return result.rows.reverse();
//     },

//     totalUnreadCount: async (_: any, __: any, { user }: Context) => {
//       if (!user) {
//         throw new GraphQLError('Access token expired', {
//           extensions: {
//             code: 'UNAUTHENTICATED',
//             http: {status: 401 }
//           }
//         })
//       }

//       const result = await pool.query(
//         `SELECT COUNT(*) as count FROM messages m
//          JOIN conversations c ON m.conversation_id = c.id
//          WHERE m.read_at IS NULL 
//            AND m.sender_id != $1
//            AND (c.host_id = $1 OR c.guest_id = $1)`,
//         [user.id]
//       );

//       return parseInt(result.rows[0]?.count || 0);
//     },
//   },

//   Mutation: {
//     sendMessage: async (_: any, { input }: any, { user }) => {
//       if (!user) {
//         throw new GraphQLError('Access token expired', {
//           extensions: {
//             code: 'UNAUTHENTICATED',
//             http: {status: 401 }
//           }
//         })
//       }
//       console.log('working',)

//       const { conversationId, content, messageType = 'TEXT' } = input;
//       console.log({conversationId})

//       let client;
//       try {
//         console.time('db_total');
//         client = await pool.connect();

//         // 2. Secure Insert (Only inserts if user belongs to conversation)
//         const result = await client.query(
//           `INSERT INTO messages (conversation_id, sender_id, content, message_type)
//            SELECT $1, $2, $3, $4
//            FROM conversations
//            WHERE id = $1 AND (host_id = $2 OR guest_id = $2)
//            RETURNING *`,
//           [conversationId, user.id, content, messageType.toLowerCase()]
//         );

//         if (result.rowCount === 0) {
//           throw new Error('Not authorized to post in this conversation');
//         }

//         console.timeEnd('db_total');
//         const message = result.rows[0]
//         pubsub.publish(MESSAGE_ADDED, {
//           messageAdded:message
//         });
//         return message;

//       } catch (err) {
//         console.error(err);
//         throw err;
//       } finally {
//         if (client) client.release(); // VERY IMPORTANT: return connection to pool
//       }
//     },

//     createConversation: async (_: any, { input }: any, { user }: Context) => {
//       if (!user) {
//         throw new GraphQLError('Access token expired', {
//           extensions: {
//             code: 'UNAUTHENTICATED',
//             http: {status: 401 }
//           }
//         })
//       }

//       const { propertyId, guestId, bookingId, initialMessage } = input;

//       // Determine host_id from property
//       const hostId = user.id;
//       if (propertyId) {
//         const propResult = await pool.query(
//           'SELECT realtor_id FROM properties WHERE id = $1',
//           [propertyId]
//         );
//         if (!propResult.rows[0]) {
//           throw new Error('Property not found');
//         }
//         // hostId = propResult.rows[0].realtor_id;
//       }

//       // Check if conversation already exists
//       const existingConv = await pool.query(
//         `SELECT * FROM conversations 
//          WHERE property_id = $1 AND host_id = $2 AND guest_id = $3`,
//         [propertyId, hostId, guestId]
//       );

//       let conversation;
//       if (existingConv.rows[0]) {
//         conversation = existingConv.rows[0];
//       } else {
//         const convResult = await pool.query(
//           `INSERT INTO conversations (property_id, host_id, guest_id, booking_id)
//            VALUES ($1, $2, $3, $4)
//            RETURNING *`,
//           [propertyId, hostId, guestId, bookingId]
//         );
//         conversation = convResult.rows[0];
//       }

//       // Send initial message
//       await pool.query(
//         `INSERT INTO messages (conversation_id, sender_id, content)
//          VALUES ($1, $2, $3)`,
//         [conversation.id, user.id, initialMessage]
//       );

//       return conversation;
//     },

//     markMessagesAsRead: async (_: any, { conversationId }: any, { user }: Context) => {
//       if (!user) {
//         throw new GraphQLError('Access token expired', {
//           extensions: {
//             code: 'UNAUTHENTICATED',
//             http: {status: 401 }
//           }
//         })
//       }

//       const result = await pool.query(
//         `UPDATE messages 
//          SET read_at = CURRENT_TIMESTAMP
//          WHERE conversation_id = $1 
//            AND sender_id != $2 
//            AND read_at IS NULL`,
//         [conversationId, user.id]
//       );
      
//       if (result.rows.length> 0) {
//         result.rows.forEach(msg => {
//           pubsub.publish(MESSAGE_READ, {
//             messageRead: msg,
//             conversationId: parseInt(conversationId)
//           })
//         })
//       }

//       return true;
//     },

//     markAllAsRead: async (_: any, __: any, { user }: Context) => {
//       if (!user) {
//         throw new GraphQLError('Access token expired', {
//           extensions: {
//             code: 'UNAUTHENTICATED',
//             http: {status: 401 }
//           }
//         })
//       }

//       await pool.query(
//         `UPDATE messages m
//          SET read_at = CURRENT_TIMESTAMP
//          FROM conversations c
//          WHERE m.conversation_id = c.id
//            AND m.sender_id != $1
//            AND m.read_at IS NULL
//            AND (c.host_id = $1 OR c.guest_id = $1)`,
//         [user.id]
//       );

//       return true;
//     },
//   },

//   Subscription: {

//     messageAdded: {
//       subscribe: withFilter(
//         () => pubsub.asyncIterableIterator(MESSAGE_ADDED),
//         (payload, variables) => {
//           // console.log({payload: payload.messageAdded.conversation_id === variables.conversationId, variables})
//           return(
//             payload.messageAdded.conversation_id === variables.conversationId
//           )
//         }
//       )
//     },

//     messageRead: {
//       subscribe: withFilter(
//         () => pubsub.asyncIterableIterator([MESSAGE_READ]),
//         (payload, variables) => {
//           return payload.conversationId === variables.conversationId
//         }
//       )
//     },

//     conversationUpdated: {
//       subscribe: withFilter(
//         () => pubsub.asyncIterableIterator(CONVERSATION_UPDATED),
//         (payload, variables) => {
//           return (
//             payload.userId === parseInt(variables.userId)
//           )
//         }
//       )
//     },
//   },

//   // Field resolvers
//   Conversation: {
//     property: async (parent: any, _: any,) => {
//       if (!parent.property_id) return null;
//       const result = await pool.query(
//         'SELECT * FROM properties WHERE id = $1',
//         [parent.property_id]
//       );
//       return result.rows[0];
//     },

//     host: async (parent: any, _: any,) => {
//       const result = await pool.query(
//         'SELECT * FROM users WHERE id = $1',
//         [parent.host_id]
//       );
//       return result.rows[0];
//     },

//     guest: async (parent: any, _: any,) => {
//       const result = await pool.query(
//         'SELECT * FROM users WHERE id = $1',
//         [parent.guest_id]
//       );
//       return result.rows[0];
//     },

//     booking: async (parent: any, _: any,) => {
//       if (!parent.booking_id) return null;
//       const result = await pool.query(
//         'SELECT * FROM bookings WHERE id = $1',
//         [parent.booking_id]
//       );
//       return result.rows[0];
//     },

//     messages: async (parent: any, { limit = 50, offset = 0 }: any,) => {
//       const result = await pool.query(
//         `SELECT * FROM messages 
//          WHERE conversation_id = $1 AND deleted_at IS NULL
//          ORDER BY created_at DESC
//          LIMIT $2 OFFSET $3`,
//         [parent.id, limit, offset]
//       );
//       return result.rows.reverse();
//     },

//     unreadCount: async (parent: any, _: any, { user }: Context) => {
//       if (!user) return 0;
//       const result = await pool.query(
//         `SELECT COUNT(*) as count FROM messages
//          WHERE conversation_id = $1 
//            AND sender_id != $2 
//            AND read_at IS NULL`,
//         [parent.id, user.id]
//       );
//       return parseInt(result.rows[0]?.count || 0);
//     },

//     lastMessage: async (parent: any, _: any,) => {
//       const result = await pool.query(
//         `SELECT * FROM messages 
//          WHERE conversation_id = $1 AND deleted_at IS NULL
//          ORDER BY created_at DESC
//          LIMIT 1`,
//         [parent.id]
//       );
//       return result.rows[0];
//     },
//   },

//   Message: {
//     conversation: async (parent: any, _: any,) => {
//       const result = await pool.query(
//         'SELECT * FROM conversations WHERE id = $1',
//         [parent.conversation_id]
//       );
//       return result.rows[0];
//     },

//     sender: async (parent: any, _: any,) => {
//       const result = await pool.query(
//         'SELECT * FROM users WHERE id = $1',
//         [parent.sender_id]
//       );
//       return result.rows[0];
//     },
//   },
// };