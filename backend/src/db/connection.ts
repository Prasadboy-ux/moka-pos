import mongoose from 'mongoose';

/**
 * MongoDB lifecycle.
 *
 * The connection is opened once at boot and closed on shutdown. Nothing else in
 * the app touches `mongoose.connect` — modules just import models, and
 * Mongoose buffers them against this connection.
 */

export type DatabaseState =
  'up' | 'down' | 'connecting' | 'disconnecting' | 'uninitialised';

export async function connectDatabase(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);

  // Idempotent. Mongoose throws if asked to open a second connection with a
  // different URI, which is exactly what happens when the seed runs inside a
  // process that is already connected (the test suite, for one).
  if (mongoose.connection.readyState === 1) return;

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: true,
  });

  mongoose.connection.on('error', (error) => {
    console.error('[mongo] connection error', error);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[mongo] disconnected');
  });
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
