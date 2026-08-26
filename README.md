# KOTHA's AURA

```bash
server
├─ package-lock.json
├─ package.json
├─ README.md
└─ src
   ├─ config
   │  └─ mongodb.js
   ├─ controllers
   ├─ middleware
   ├─ routes
   ├─ app.js
   ├─ server.js
   └─ utils

```

## Environment configuration

Required: `DB_USER`, `DB_PASS`, `DB_NAME=kothasaura`, `JWT_SECRET`, and `CLIENT_URL`.

Firebase Admin must be configured on the server using either `FIREBASE_SERVICE_ACCOUNT`
(the complete service-account JSON as one environment value), or all three of:
`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.
Never expose these values through Vite/client variables.

For future Cloudinary uploads, configure server-only `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`. Image uploads are intentionally
not active yet; products currently accept image URLs.

## Development admin promotion

Register normally first so the verified Firebase identity creates the MongoDB user.
Then use MongoDB Atlas or `mongosh` to update that one known user directly:

```javascript
use("kothasaura")
db.users.updateOne(
  { email: "your-verified-email@example.com" },
  { $set: { role: "admin", updatedAt: new Date() } },
)
```

Log out and back in afterward. There is deliberately no public role-promotion endpoint.
