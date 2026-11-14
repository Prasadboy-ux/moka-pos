import mongoose from 'mongoose';
import { env, mongoAutoIndex } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * MongoDB lifecycle.
 *
 * The connection is opened once at boot and closed on shutdown. Nothing else in
 * the app touches `mongoose.connect` — modules just import models, and
 * Mongoose buffers them against this connection.
 */

export type DatabaseState =
  'up' | 'down' | 'connecting' | 'disconnecting' | 'uninitialised';

/**
 * A connection string with any `user:password@` part replaced. Startup logs
 * name the host and port so a stale `.env` is obvious, but never the secret.
 */
export function redactMongoUri(uri: string): string {
  return uri.replace(/\/\/[^@/]*@/, '//***:***@');
}

let listenersBound = false;

export async function connectDatabase(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);

  // Idempotent. Mongoose throws if asked to open a second connection with a
  // different URI, which is exactly what happens when the seed runs inside a
  // process that is already connected (the test suite, for one).
  if (mongoose.connection.readyState === 1) return;

  const settings = env();
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: settings.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    maxPoolSize: settings.MONGODB_MAX_POOL_SIZE,
    minPoolSize: settings.MONGODB_MIN_POOL_SIZE,
    maxIdleTimeMS: settings.MONGODB_MAX_IDLE_TIME_MS,
    autoIndex: mongoAutoIndex(),
  });

  if (!listenersBound) {
    mongoose.connection.on('error', (error) => {
      logger.error({ err: error }, 'mongo connection error');
    });
    mongoose.connection.on('disconnected', () => {
      logger.warn('mongo disconnected');
    });
    listenersBound = true;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function databaseState(): DatabaseState {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'up';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'uninitialised';
  }
}
