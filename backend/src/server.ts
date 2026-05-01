import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express5';
import express from 'express';
import { connectDB } from './config/database.js';
import http from 'http';
import { typeDefs } from './graphql/schema/index.js';
import resolvers from './graphql/resolvers/index.js';
import { gql } from 'graphql-tag';
import { Pool } from 'pg';
import pool from './config/database.js';
import { Context } from './graphql/context.js';
import { pubsub } from './services/pubsub.js';
import cors from "cors"
// import { createEmailTransporter } from './utils/emailTransport.js';
import { error } from 'console';
import jwt from 'jsonwebtoken';
// import { authMiddleWare } from './middleware/auth.js';
import { verifyToken } from './services/auth.js';
import { createWebhookRouter } from './routes/createWebHook.js';
import { connectRedis } from './config/redis.js';
import { authenticateJWT } from './middleware/auth.js';
import { createServer } from 'http';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';
import SessionManager from './middleware/session.js';
import { Token } from 'graphql';


const app = express();
const httpServer = createServer(app);

app.use(cors({
  origin: '*', // Allow all origins for development; restrict in production
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'x-apollo-operation-name'],
}));

app.use('/webhooks', createWebhookRouter(pool))

app.use(express.json())

const schema = makeExecutableSchema({typeDefs, resolvers})

const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/subscriptions'
})

const serverCleanup = useServer(
  {
    schema,
    context: async (ctx, msg, args) => {
      return getDynamicContext(ctx, msg, args)
    },
  },
  wsServer
)

const startServer = async () => {
  const server = new ApolloServer<Context>({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose()
            }
          }
        }
      }
    ],
    csrfPrevention: false,
    formatError: (error) => {
      console.error('GraphQl Error:', error)
      return error
    }
    // context: ({req}) => ({ pool, req, pubsub }),
  });

  try {
    // await createEmailTransporter()
    await connectDB();
    await connectRedis()
    await server.start();
    console.log('Apollo Server started successfully');

    // app.use(
    //   '/',
    //   express.json(),
    //   expressMiddleware(server, {
    //     context: async ({ req, }) => ({ req, pubsub, db: pool }),
    //   })
    // );

    app.use(
      '/',
      express.json(),
      expressMiddleware(server, {
        context: async ({req, res}) => {
          await new Promise<void>((resolve, reject) => {
            authenticateJWT(req, res, (err?: any) => (err ? reject(err) : resolve()) )
          })

          return {
            req,
            pubsub, 
            user: (req as any).user,
            auth_msg: (req as any)?.auth_msg
          }
        }
      })
    );

    await new Promise<void>((resolve) => httpServer.listen({ port: 4000, host: '0.0.0.0' }, resolve));
    console.log(`🚀 Server ready at http://localhost:4000/`);
  } catch (error) {
    console.error('Error starting server:', error);
  }
};

startServer();

const getDynamicContext = async (ctx:any, msg:any, args:any) => {
  if (ctx.connectionParams.authorization) {
    const token = ctx.connectionParams.authorization.replace('Bearer ', '')
    console.log({token})
    const currentUser = await SessionManager.verifyAccessToken(token);
    console.log({currentUser})
    return {user: currentUser}
  }
  console.log({not: ctx})

  return null
}

