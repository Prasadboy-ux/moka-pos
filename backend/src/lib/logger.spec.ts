import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';

import { requestLogSerializer, responseLogSerializer } from './logger.js';

function requestWithSecrets(): IncomingMessage {
  return {
    id: 'req-1',
    method: 'POST',
    url: '/api/orders',
    headers: {
      cookie: 'moka_session=secret-token',
      authorization: 'Bearer secret-token',
      'user-agent': 'vitest',
    },
    socket: {
      remoteAddress: '127.0.0.1',
      remotePort: 12345,
    },
  } as unknown as IncomingMessage;
}

describe('request log serializers', () => {
  it('keeps operational request fields and drops headers', () => {
    const serialized = requestLogSerializer(requestWithSecrets());

    expect(serialized).toEqual({
      id: 'req-1',
      method: 'POST',
      url: '/api/orders',
      remoteAddress: '127.0.0.1',
      remotePort: 12345,
    });
    expect(serialized).not.toHaveProperty('headers');
  });

  it('never serializes response headers', () => {
    const serialized = responseLogSerializer({
      statusCode: 200,
      getHeaders: () => ({
        'set-cookie': ['moka_session=secret-token'],
      }),
    } as unknown as ServerResponse);

    expect(serialized).toEqual({ statusCode: 200 });
    expect(serialized).not.toHaveProperty('headers');
  });
});
