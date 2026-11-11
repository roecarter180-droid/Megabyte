# MegaByte website and service orders

The website is built with React and Vite. Its order API uses Node.js, Express, and SQLite to store requests, status history, and optional customer photos. Customer tracking links use a private random token; administrator pages require a password.

## Configure the order API

1. Copy `.env.example` to `.env`.
2. Set `MEGABYTE_ADMIN_PASSWORD` to a unique password of at least 12 characters.
3. Set `MEGABYTE_SESSION_SECRET` to a random secret of at least 32 characters. For example, generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`.
4. Set `NODE_ENV=production` on the hosted server, keep `.env`, the `data` directory, and customer tracking links private, and serve the site over HTTPS.

The SQLite database and uploaded photos are stored in `data/` by default. Set `MEGABYTE_DATA_DIR` to a persistent writable directory to store them elsewhere. Back up this directory to retain orders and attachments.

The tracking percentage reflects the current service stage (five stages from 20% through completion at 100%), not an automatically measured amount of labor.

## Run locally

Start the API and website together:

```sh
npm run dev
```

The server prints a temporary development admin password at startup. Use it at `/admin`. The API listens on port 3001 and Vite proxies `/api` requests to it. `npm run dev:server` is also available when you need to run just the API.

The administrator dashboard is at `/admin`. Customers receive a private `/track/<token>` link after submitting a request.

## Deploy to Netlify without an order backend

The website can be published as a static site without configuring Supabase or other backend credentials. Netlify serves the Vite frontend and routes `/api/*` to a function that explicitly returns `503 Service Unavailable` until its backend is configured. The marketing site remains available, but order submissions, tracking, and the admin panel are unavailable.

1. In Netlify, import this repository and set the build command to `npm run build` and the publish directory to `dist` (also defined in `netlify.toml`).
2. No environment variables are required for the static website build.

## Enable the order API (optional)

To enable order submissions, tracking, and admin features, connect a Supabase project. Supabase Free quotas and pausing policies apply; no Netlify paid database or blob service is used.

1. Create a Supabase project on its free plan. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql) to create the tables, protected RPCs, and private photo bucket.
2. Add these environment variables in Netlify. Set `MEGABYTE_ADMIN_PASSWORD` to a unique password of at least 12 characters and `MEGABYTE_SESSION_SECRET` to a random secret of at least 32 characters. Keep the Supabase service role key secret.
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `MEGABYTE_ADMIN_PASSWORD`
   - `MEGABYTE_SESSION_SECRET`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy the site. The service-role key is used only by the serverless function; the Vite-prefixed URL and publishable anon key are public, and the database has row-level security enabled without public access.
5. To carry over local orders and photos, make sure the schema is installed, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your local `.env`, then run `npm run migrate:supabase`. The migration preserves order IDs, tracking-token hashes, status history, and attachments, and can be safely rerun.

Netlify Functions and Supabase Storage accept customer submissions only while the free tiers' limits are available. Review both providers' current quotas and policies before launch. The local Express/SQLite setup remains available for development and Node.js hosting.

## Build and run in production

```sh
npm run build
npm start
```

The Node server serves the built website and API from the same origin. Deploy it on a Node.js host with persistent disk storage; a static-only host cannot provide persistent orders or secure administration.

## Checks

```sh
npm test
npm run lint
npm run build
```
