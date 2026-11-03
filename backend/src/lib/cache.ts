import type { RequestHandler } from 'express';

/**
 * Every API response carries live session and business data, so none of it may
 * be stored by a browser, proxy, or CDN. `no-store` is the strongest of the
 * cache directives: it forbids writing the response to disk at all, which is
 * what a shared till or a kiosk browser needs.
 */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
