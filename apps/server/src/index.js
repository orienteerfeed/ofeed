import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import cors from 'cors';
import express from 'express';
import { useServer } from 'graphql-ws/use/ws';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { WebSocketServer } from 'ws';

import restRoutes from './restRoutes.js';
import { error, success } from './utils/responseApi.js';

import { schemaWithDirectives } from './graphql/executableSchema.js';
import prisma from './utils/context.js';
import { buildAuthContextFromRequest } from './utils/jwtToken.js';

import packageJson from '../package.json' with { type: 'json' };

const { PORT = 3001 } = process.env;

const app = express();

// setup the logger middleware
app.use(morgan('tiny'));

app.use(express.json());
//TODO: adjust CORS settings for production, and move to environment variables
app.use(
  cors({
    origin: [
      'localhost:3000',
      'http://localhost:3000',
      'https://orienteerfeed.com',
      'https://www.orienteerfeed.com',
    ],
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-orienteerfeed-app-activate-user-url',
      'x-ofeed-app-reset-password-url',
    ],
    maxAge: 86400,
  })
);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);

// TODO: set up express rate limiters

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/mrb/assets', express.static('mrb/assets', { fallthrough: false }));

const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.3',
    info: {
      title: 'OrienteerFeed API',
      version: '1.1.0',
      description:
        'This is a REST API application made with Express. It includes competitor data updates and real-time results for orienteering events.',
      contact: {
        email: 'martin.krivda@kobchocen.cz',
      },
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
    ],
  },
  apis: ['./src/index.js', './src/modules/**/*.js'], // files containing annotations as above
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
console.log(swaggerDocs);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

/**
 * @swagger
 * /:
 *  get:
 *    summary: Hello World! Test endpoint.
 *    description: Get hello world
 *    responses:
 *      200:
 *        description: Return page with string Hello World!
 */
app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.get('/mrb*', (req, res) => {
  res.sendFile(path.join('mrb', 'index.html'), { root: '.' });
});

// Set up Apollo Server
const gplServer = new ApolloServer({
  schema: schemaWithDirectives,
});
await gplServer.start();

/**
 * @swagger
 * /graphql:
 *  get:
 *    summary: Play with Graphql in sandbox
 *    description: GraphQL Playground
 *    responses:
 *      200:
 *        description: Success
 */
app.use(
  '/graphql',
  expressMiddleware(gplServer, {
    context: async ({ req }) => {
      // Get the Authorization header
      const auth = await buildAuthContextFromRequest(req);

      return {
        prisma: prisma,
        auth,
        activationUrl: req.headers['x-orienteerfeed-app-activate-user-url'] || 'localhost',
        resetPasswordUrl: req.headers['x-ofeed-app-reset-password-url'] || 'localhost',
      };
    },
  })
);

// API ENDPOINTS
app.use(restRoutes);

// Get API version number
app.get('/version', (req, res) => {
  return res.status(200).json(success(`Version: ${packageJson.version}`));
});

// Healthcheck endpoint
app.get('/readyz', (req, res) => {
  return res.status(200).send('OK');
});

// 404 - not found handling
app.use((req, res) => {
  return res.status(404).json(error('404: Not found.', res.statusCode));
});

const server = app.listen(PORT, () =>
  console.log(`
🚀 Server ready at: http://localhost:${PORT}
⭐️ See sample requests: http://localhost:${PORT}/api-docs
🔢 Running version: ${packageJson.version}`)
);

// Attach WebSocket server for subscriptions
const wsServer = new WebSocketServer({
  server, // Attach the WebSocket server to the existing HTTP server
  path: '/graphql', // Same path as GraphQL endpoint
});

wsServer.on('listening', () => {
  console.log('WebSocket server is running on ws://localhost:3001/graphql');
});

wsServer.on('connection', () => {
  console.log('New WebSocket connection established');
});

wsServer.on('error', err => {
  console.error('WebSocket server error:', err);
});

wsServer.on('close', () => {
  console.log('WebSocket server closed');
});

// Set up GraphQL WebSocket server
const serverCleanup = useServer(
  {
    schema: schemaWithDirectives,
    context: async ctx => {
      console.log('WebSocket context initialized');
      return { prisma };
    },
  },
  wsServer
);

server.on('close', async () => {
  console.log('HTTP server shutting down...');
  await serverCleanup.dispose();
  console.log('WebSocket server cleanup completed');
});
