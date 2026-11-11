# TH EDU — Supabase backend

## Layout

| Path | What |
|---|---|
| `migrations/20261111090000_core_schema.sql` | `categories`, `branches`, `videos`, `portfolios`, `leads` + indexes, triggers |
| `migrations/20261111090100_rls_policies.sql` | RLS: public read (feed/portfolio), public insert (leads), staff read/update |
| `migrations/20261111090200_functions.sql` | `get_feed()` keyset pagination, `submit_lead()` validated/idempotent/rate-limited insert |
| `migrations/20261112090000_trust.sql` | `trust_stats`, `testimonials`, `recent_activity()`, `leads.promo_code` |
| `migrations/20261113090000_video_publishing.sql` | Storage bucket `feed-media` (staff-only upload), `videos.share_slug`, `leads.source_ref`, `staff_video_stats()` |
| `migrations/20261114090000_crm_automation.sql` | Lead lifecycle statuses, `appointment_time`, `trial_slots`, `crm_logs`, `crm_*()` functions |
| `seed.sql` | Dev data generated from `src/utils/mockData.ts` (deliberately **no** trust stats/testimonials — those must be real) |
| `sql/` | Paste-ready SQL: `01_setup.sql` (fresh), `upgrades/<migration>.sql` (existing projects), `schedule_reminders_cron.sql` |
| `functions/api/index.ts` | Edge Function: feed, lead submit, staff CRM actions, cron entry point |
| `functions/_shared/contracts.ts` | Request/response types + validation, **shared with the app** |
| `functions/_shared/zaloPayloads.ts` | ZNS / OA payload builders, **shared with the app** |
| `functions/_shared/znsService.ts` | Parent messages: template mapping per message kind, delivery planning, Zalo gateway |
| `functions/_shared/reminderCron.ts` | Claim → send → record orchestration; the 15-minute reminder tick |
| `functions/_shared/security.ts` | Cron secret (constant-time) + bearer token helpers |
| `functions/_shared/notify.ts` | Staff alerts (ZNS to admins, webhook) after a lead is saved |

`_shared/contracts.ts` and `_shared/zaloPayloads.ts` must stay import-free — Metro and Deno both load them.

## Setup

### Option A — Dashboard SQL Editor (no CLI)

1. `npm run sql:bundle` (already generated in `supabase/sql/`).
2. Dashboard → **SQL Editor** → paste `supabase/sql/01_setup.sql` → **Run**. Once, on a fresh project.
3. Optional: paste `supabase/sql/02_demo_content_optional.sql` → Run (sample content, all hidden).
4. Copy *Project URL* + *anon / publishable* key into `.env.local` (see `.env.example`).

### Option B — Supabase CLI

```bash
npx supabase init                       # creates config.toml (once)
npx supabase link --project-ref <ref>
npx supabase db push                    # apply migrations
npx supabase functions deploy api --no-verify-jwt
npx supabase secrets set --env-file supabase/.env.functions   # see ../.env.example
npx supabase gen types typescript --linked > src/types/database.ts
```

If the database was set up with Option A first, run the `migration repair` command printed at the top of
`01_setup.sql` before `db push`.

**Why `--no-verify-jwt`:** `/api/feed` and `/api/leads/submit` are public by design (anonymous parents) and
validate their own input. Newer projects use non-JWT *publishable* keys (`sb_publishable_…`), which the
gateway's JWT check would reject with 401.

Local: `npx supabase start && npx supabase db reset` (runs migrations + seed).

## Staff accounts (who can publish videos)

Parents never sign in. Staff (teachers, admins) sign in with email + password to publish videos.

1. Dashboard → **Authentication → Users → Add user** → email + password, tick *Auto Confirm User*.
2. Grant the staff role (SQL editor):
   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role":"staff"}'
   where email = 'co.huong@thedu.vn';
   ```
3. Disable public sign-ups: **Authentication → Providers → Email → "Allow new users to sign up" = off**.
   Staff accounts are created only by an admin.

A user without the role can sign in but cannot upload or create videos (Storage + table RLS).
Removing the role takes effect when their session token refreshes (≤ 1 hour), or immediately if you also delete the user.

## Video uploads

- Files go to Storage bucket `feed-media` (public read): `videos/<id>-<stamp>.mp4`, `thumbnails/…jpg`.
- **Size limit**: the app allows 50 MB per video (`MAX_VIDEO_MB` in `src/services/media/storageUpload.ts`),
  matching the Supabase **Free plan** global limit. On Pro, raise *Storage → Settings → Upload file size limit*
  and `MAX_VIDEO_MB` together. Tip for staff: export 720p, 30–90 s (≈ 15–40 MB).
- Deleting a video in the app also deletes its files.

## Share links & attribution

Each video has a `share_slug`. The app builds `PUBLIC_WEB_URL/v/<share_slug>` — set `PUBLIC_WEB_URL` to the
deployed web app's address. Parents who book through that page are saved with `source = 'SHARE_LINK'` and
`source_ref = <video id>`; bookings from the feed button use `source = 'FEED'` with the same `source_ref`.
The staff video list shows the count per video (`staff_video_stats()`).

Link previews on Facebook/Zalo show the site's generic title/icon: the web app is a single-page app, so per-video
preview images need server-side rendering of Open Graph tags on your web host (e.g. a Netlify/Vercel edge function
for `/v/*`). Not included yet.

## API

Base URL: `https://<ref>.supabase.co/functions/v1`. Send `Authorization: Bearer <anon key>`
(`supabase.functions.invoke` does this for you).

### `GET /api/feed?category=&limit=&cursor=`
- `category`: optional, one of the course codes (`ALL` or omitted = everything)
- `limit`: 1–50, default 10
- `cursor`: opaque, from the previous page's `nextCursor`
- → `200 { items: VideoDTO[], nextCursor: string | null }` (cached 60s)

### `POST /api/leads/submit`
- Body: `LeadSubmitRequest` (see `contracts.ts`). `id` is a client UUID used as an **idempotency key** — retry with the same id after a network error.
- → `201 { id, code, createdAt, duplicate: false }` new lead (admins notified in background)
- → `200 { …, duplicate: true }` same id, or same phone + child + course within 30 min
- → `422 { error: { code: "VALIDATION", field, message } }`
- → `429 { error: { code: "RATE_LIMITED" } }` more than 5 leads per phone per 24h

## Staff access

Leads are invisible to the public. To let a staff account read/update leads in a dashboard, set
`raw_app_meta_data = '{"role":"staff"}'` on their `auth.users` row (SQL editor or Admin API).

## CRM automation (lead lifecycle + Zalo reminders)

```
NEW ──T+0 confirmation sent──▶ CONFIRMED ──T-24h──▶ REMINDED_24H ──T-2h──▶ REMINDED_2H
 │  (or staff confirms by phone)     └──────────────── T-2h ───────────────────┘   │
 │                                                                                ▼
 └─▶ CONTACTED / CANCELLED (staff)        teacher: complete-trial ──▶ COMPLETED_TRIAL ──T+2h message──▶ ENROLLED (staff)
```

| Message | When | Sent by |
|---|---|---|
| T+0 confirmation | right after booking | `POST /api/leads/submit` (background) — success sets `CONFIRMED` |
| T-24h reminder + video link | appointment within 24h (and > 3h), only if booked ≥ 26h ahead | cron |
| T-2h reminder + Google Maps | appointment within 2h | cron |
| T+2h feedback + voucher | ≥ 2h after the trial, 07:00–21:00 VN, within 3 days of completion | cron (or immediately when the teacher completes it late) |

- **Reminders only go to `CONFIRMED` leads.** Without ZNS configured, staff confirm by phone:
  `POST /api/leads/:id/status {"status":"CONFIRMED"}`.
- **Never twice:** each message is claimed in `crm_logs` first (unique per lead + kind). Failures are retried on
  the next ticks, at most 3 attempts. Messages that can't be sent (template / voucher / hotline missing, invalid
  phone) are logged as `SKIPPED` with the reason.
- **Channel:** approved ZNS template for that kind → ZNS to the phone; otherwise, if the parent linked Zalo → OA
  message; otherwise skipped.
- **Voucher:** the post-trial message is only sent when `POST_TRIAL_VOUCHER` holds a real offer — nothing is invented.
- **Scheduling:** run `sql/schedule_reminders_cron.sql` once (pg_cron every 15 min → `/api/cron/reminders`,
  authenticated with `CRON_SECRET` stored in Vault).

Staff endpoints (send the staff user's access token as `Authorization: Bearer …`):

```bash
curl -X POST "$URL/functions/v1/api/leads/<lead-id>/complete-trial" -H "Authorization: Bearer $STAFF_JWT" \
  -H "Content-Type: application/json" -d '{"teacherNote":"Bé cầm bút đúng, viết đều nét; cần luyện thêm nét khuyết."}'
# → { id, status: "COMPLETED_TRIAL", postTrialDueAt, postTrialMessage: "SCHEDULED" | "SENT" | "SKIPPED" | "FAILED" }

curl -X POST "$URL/functions/v1/api/leads/<lead-id>/status" -H "Authorization: Bearer $STAFF_JWT" \
  -H "Content-Type: application/json" -d '{"status":"CANCELLED","note":"Phụ huynh báo bận"}'
```

Message history per lead: `select * from crm_logs where lead_id = '…' order by created_at;` (staff only).

**In the app:** staff open *Quản lý video → Lịch học thử & khách hàng* (web: `/quan-ly/hoc-thu`) to confirm, cancel,
complete a trial with feedback, and mark enrolment. It calls `crm_set_status()` / `crm_complete_trial()` with the staff
session, so it works even before the Edge Function is deployed.

## Zalo access token (automatic refresh)

Zalo rotates tokens: each refresh returns a new access token **and** a new refresh token, and the old refresh token
stops working. The token pair therefore lives in `zalo_oa_tokens` (server-only) and is refreshed under a database lock
(`zalo_token_begin_refresh`), so two requests can never refresh at once and invalidate the pair.

1. Set `ZALO_APP_ID` and `ZALO_APP_SECRET` (Edge Function secrets).
2. Get a first token pair from Zalo (OAuth authorisation or the API Explorer on developers.zalo.me) and store it once:
   `select zalo_token_set('<access_token>', '<refresh_token>', <expires_in_seconds>);`
3. The 15-minute cron refreshes it whenever less than 20 minutes remain (uses Zalo's `expires_in`; sources disagree
   on 1h vs 25h, so nothing is hard-coded). Each refresh also renews the refresh token, keeping it alive.

Check health: `select access_expires_at, refreshed_at, last_error from zalo_oa_tokens;` — if `last_error` says the
refresh token is invalid/expired, repeat step 2 (re-authorise). Until then, messages are skipped, never sent with a
dead token.

## Trust content (stats, testimonials, activity ticker)

Everything parents see as social proof comes from these tables, managed by staff:

- **`trust_stats`** — cannot be published without a `source_note` (≥10 chars). The app shows the source when a badge is tapped.
- **`testimonials`** — cannot be published without `consent_confirmed`. Keep the signed consent form on file.
- **`recent_activity()`** — real bookings from the last 7 days, masked to "Phụ huynh T.", times rounded to 5 min. Empty → the ticker hides itself.

With no backend, development builds show clearly-labelled sample content ("Dữ liệu mẫu"); production builds show nothing.

## Personal data

Portfolios are public only when `is_published AND parent_consent`. Do not set `parent_consent`
without the parent's written consent. Leads contain phone numbers: no public read, staff only.
