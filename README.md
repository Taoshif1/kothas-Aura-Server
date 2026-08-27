# Kotha's Aura Server

Express 5 and MongoDB-native-driver API for the Kotha's Aura V1 store. The modular backend lives under `src/modules` and uses Firebase Admin verification, an identity-only HttpOnly JWT session, MongoDB-authoritative roles, transactions, server-side commerce calculations, and Supertest/Vitest tests.

## Setup

```bash
npm install
copy .env.example .env
npm start
```

Use `DB_NAME=kothasaura`. No startup seeding or destructive migration is performed. Existing ObjectIds, Dates, and manually managed documents remain valid.

## Authentication and roles

1. Firebase authenticates the browser.
2. `POST /api/auth/jwt` verifies its ID token with Firebase Admin.
3. The server creates an HttpOnly JWT containing identity only.
4. `verifyJWT` reloads the MongoDB user on protected requests, enforcing current `role` and `isBlocked`.
5. `verifyAdmin` authorizes the current MongoDB role.

To create an Admin in V1, register/login normally, locate that existing MongoDB user document, set `role` to `admin`, then log out/in or refresh the session. There is deliberately no public promotion endpoint.

## Modules and collections

Modules cover auth, users, products, categories, cart, wishlist, addresses, checkout, orders, settings, reviews, coupons, contact, and newsletter. Collections include `users`, `products`, `categories`, `carts`, `wishlist`, `orders`, `settings`, `reviews`, `coupons`, `contactMessages`, and `newsletterSubscribers`.

Checkout always reloads products and settings, calculates price/delivery/coupons server-side, and creates orders inside a MongoDB transaction. Order idempotency is bound to actor identity and a deterministic material-request fingerprint. Stock and coupon usage are changed once; cancellation claims inventory restoration transactionally. COD remains due; bKash/Nagad submissions remain pending manual verification.

Approved reviews alone update product rating aggregates. Contact and newsletter endpoints persist submissions but send no external email.

## Testing

```bash
npm test
```

Tests use mocks/pure services and must never connect to Atlas. Also run JavaScript syntax checks and perform a real local startup/API smoke test before release.

## Deployment (Render or equivalent)

1. Configure every variable from `.env.example` in the host—not Git.
2. Allow the host network in MongoDB Atlas and use the `kothasaura` database.
3. Configure Firebase Admin credentials and client authorized domains.
4. Set `CLIENT_URL`/`LIVE_CLIENT_URL` to exact HTTPS origins (comma-separated values are supported).
5. Use HTTPS end-to-end. Production cookies are Secure, HttpOnly, and `SameSite=None`; credentialed CORS never uses a wildcard.
6. The app trusts one production reverse-proxy hop for correct rate-limiter client IP handling.

Do not deploy until tests, syntax checks, startup logs, and `/api/health`, `/api/products`, `/api/categories`, and `/api/settings` smoke checks pass.
