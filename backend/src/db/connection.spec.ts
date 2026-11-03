import { describe, expect, it } from 'vitest';
import { redactMongoUri } from './connection.js';

describe('redactMongoUri', () => {
  it('strips credentials before a URI reaches the startup log', () => {
    expect(
      redactMongoUri('mongodb+srv://moka:s3cret@cluster.example/moka-pos'),
    ).toBe('mongodb+srv://***:***@cluster.example/moka-pos');
  });

  it('leaves a credential-free URI alone', () => {
    expect(redactMongoUri('mongodb://127.0.0.1:27019/moka-pos')).toBe(
      'mongodb://127.0.0.1:27019/moka-pos',
    );
  });
});
