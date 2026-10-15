# SmartStay API

Node.js + Express API with MySQL migrations, database-backed login sessions, and server-side role guards. This backend is isolated from the existing static frontend; its mock `apiService.js` has not been replaced yet.

## Requirements

- Node.js 20 or newer
- MySQL 8.0 or newer

## Setup

1. Create a MySQL database and separate runtime/migration users. For example, in MySQL Workbench:

   ```sql
   CREATE DATABASE smartstay CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
    CREATE USER 'smartstay_app'@'localhost' IDENTIFIED BY 'use-a-strong-app-password';
    GRANT SELECT, INSERT, UPDATE, DELETE ON smartstay.* TO 'smartstay_app'@'localhost';
    CREATE USER 'smartstay_migrator'@'localhost' IDENTIFIED BY 'use-a-strong-migration-password';
    GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
       ON smartstay.* TO 'smartstay_migrator'@'localhost';
   ```

2. Copy `.env.example` to `.env` and set the MySQL values and frontend origin. Never commit `.env`.
   The API uses `MYSQL_USER`/`MYSQL_PASSWORD`; migrations use `MYSQL_MIGRATION_USER`/`MYSQL_MIGRATION_PASSWORD`.

3. Install dependencies and apply migrations:

   ```powershell
   npm install
   npm run migrate
   ```

4. Start the API:

   ```powershell
   npm run dev
   ```

The readiness endpoint is `GET http://localhost:3000/api/health`; it returns success only when MySQL is reachable.

## Authentication API

- `POST /api/auth/register` accepts `{ "name", "email", "password", "role" }`. `role` may be `tenant` or `owner`; public registration cannot create admins. Passwords must be at least 12 characters.
- `POST /api/auth/login` accepts `{ "email", "password" }`.
- `POST /api/auth/logout` revokes the current database session and clears its cookie.
- `GET /api/auth/me` returns the authenticated user.
- `PATCH /api/admin/properties/:id/verification` approves or rejects a property, with an admin role required by server middleware. Rejections require a reason; the decision, audit entry, and owner notification are committed together.
- `GET /api/admin/audit-logs` requires a valid session whose database role is `admin`.

Public signup intentionally cannot grant the `admin` role. To provision the first administrator, first register that person normally, then use a privileged MySQL account to promote the verified account:

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
```

Run that statement only through trusted database administration access, never from a public API endpoint.

Successful registration and login set an HttpOnly `smartstay.sid` cookie. Only its SHA-256 hash is stored in MySQL. Production cookies are `Secure`; set HTTPS and `NODE_ENV=production` in production.

## Checks

```powershell
npm test
```

The initial migration creates users, sessions, properties, property images, verification documents, saved properties, inquiries, reviews, reports, notifications, and admin audit logs. Apply later numbered SQL migrations with `npm run migrate`; applied migration filenames are recorded in `schema_migrations`.