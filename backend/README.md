# Moka-POS backend

Express + MongoDB API for Moka-POS, an Indonesian point-of-sale system for
coffee shops. Serves the Next.js frontend in [`../frontend`](../frontend).

## Status

Under construction. The API is specified in
[`../frontend/docs/API-CONTRACT.md`](../frontend/docs/API-CONTRACT.md) and not
yet implemented. See [`docs/README.md`](docs/README.md) for the documentation map.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 24, TypeScript strict, ESM |
| HTTP | Express 5 |
| Database | MongoDB (Atlas), Mongoose |
| Validation | Zod |
| Sessions | httpOnly cookie, JWT via `jose` |
| Passwords | `node:crypto` scrypt |
| Tests | Vitest + Supertest |
| Lint | oxlint, Prettier |

## Layout

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Documentation

Start at [`docs/README.md`](docs/README.md).