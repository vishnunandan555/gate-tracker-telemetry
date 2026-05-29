# Gate Tracker Telemetry

Private telemetry dashboard and API for the Flutter app.

## Deploy checklist

### Local

1. `npm install`
2. `cp .env.example .env.local`
3. Set `DB_PROVIDER=sqlite` and `STATS_API_KEY=...`
4. `npm run dev`
5. Open `http://localhost:3000`

### Vercel

1. Push this repo to GitHub.
2. Import it into Vercel.
3. Add **Redis - Official Redis for Vercel** from the Marketplace providers screen.
4. Link the Redis resource to the project.
5. Set `DB_PROVIDER=redis` and `STATS_API_KEY=...`.
6. Deploy.

### Vercel env vars

Use the Redis vars provided by the linked service, for example:

```env
KV_REST_API_URL=
KV_REST_API_TOKEN=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

## What the app exposes

- `GET /api/health` for uptime checks.
- `POST /api/ping` for anonymous telemetry ingestion.
- `GET /api/stats` for the protected dashboard.
- `/` for the key-gated dashboard UI.

## `.vercel`

There is no committed `.vercel` file. That is correct.

Vercel creates `.vercel/` locally when you link the project. It contains project metadata and should stay uncommitted. This repo already ignores `.vercel/` in `.gitignore`.

## Flutter contract

Every supported client must:

1. Create or reuse one anonymous install ID.
2. Persist that ID locally.
3. Build `dailyToken` as SHA-256 of install ID + current UTC date.
4. Send `POST /api/ping` on launch, optionally on resume.
5. Include `version` and `platform`.
6. Never send the dashboard key to `/api/ping`.

Platform storage:

- Android: `flutter_secure_storage` or `shared_preferences`
- Web: `localStorage` or IndexedDB
- Linux: app-data file or secure storage equivalent
- Windows: app-data file or secure storage equivalent

Suggested platform values:

- `android`
- `web`
- `linux`
- `windows`

## API bodies

```json
{
  "dailyToken": "64-character-sha256-hex-token",
  "version": "1.0.0",
  "platform": "android"
}
```

`GET /api/stats` accepts `Authorization: Bearer <key>`, `x-api-key: <key>`, or `?key=<key>`.

## Verify

```bash
chmod +x test-telemetry.sh
./test-telemetry.sh
```

## Notes

- SQLite is local/self-hosted only.
- Vercel should use Redis.
- Duplicate pings for the same token on the same UTC day are ignored.