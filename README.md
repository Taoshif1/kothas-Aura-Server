# Kotha's Aura Server

Backend API for **Kotha's Aura**, a full-stack e-commerce project in **Gazi Taoshif's commercial portfolio**, presented through **[Taoshiflex Studio](https://taoshiflexstudio.me)**.

**Studio:** https://taoshiflexstudio.me  
**Frontend:** https://github.com/Taoshif1/kothas-Aura-Client

## Backend Scope

Express 5 and the MongoDB native driver power the V1 store. The modular backend lives under `src/modules` and uses Firebase Admin verification, an identity-only HttpOnly JWT session, MongoDB-authoritative roles, transactions, server-side commerce calculations, and Supertest/Vitest tests.

Modules cover:

- Authentication and users
- Products and categories
- Cart and wishlist
- Addresses and checkout
- Orders
- Store settings
- Reviews
- Coupons
- Contact messages
- Newsletter subscribers

## Authentication and Roles

1. Firebase authenticates the browser.
2. `POST /api/auth/jwt` verifies its ID token with Firebase Admin.
3. The server creates an HttpOnly JWT containing identity only.
4. `verifyJWT` reloads the MongoDB user on protected requests, enforcing current `role` and `isBlocked`.
5. `verifyAdmin` authorizes the current MongoDB role.

There is deliberately no public Admin-promotion endpoint.

## Commerce Integrity

Checkout reloads products and settings, calculates price/delivery/coupons server-side, and creates orders inside a MongoDB transaction. Order idempotency is bound to actor identity and a deterministic material-request fingerprint.

Stock and coupon usage are changed once, while cancellation restores inventory transactionally. COD remains due; bKash/Nagad submissions remain pending manual verification.

Approved reviews alone update product rating aggregates. Contact and newsletter endpoints persist submissions but send no external email.

## Setup

```bash
npm install
copy .env.example .env
npm start
```

Use `DB_NAME=kothasaura`. No startup seeding or destructive migration is performed.

## Testing

```bash
npm test
```

Tests use mocks/pure services and must never connect to Atlas. Also run JavaScript syntax checks and perform a real local startup/API smoke test before release.

## Deployment

1. Configure every variable from `.env.example` in the host, not Git.
2. Allow the host network in MongoDB Atlas and use the `kothasaura` database.
3. Configure Firebase Admin credentials and client authorized domains.
4. Set `CLIENT_URL`/`LIVE_CLIENT_URL` to exact HTTPS origins.
5. Use HTTPS end-to-end. Production cookies are Secure, HttpOnly, and `SameSite=None`; credentialed CORS never uses a wildcard.
6. Verify `/api/health`, `/api/products`, `/api/categories`, and `/api/settings` before release.

## Work With Gazi Taoshif

For e-commerce systems, business websites, and custom web applications, visit **[Taoshiflex Studio](https://taoshiflexstudio.me)**.
