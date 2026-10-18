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

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    // Atlas terminates TLS; do not let a self-signed local cluster be the reason
    // a connection is silently downgraded.
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
