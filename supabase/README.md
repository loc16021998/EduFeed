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
| `migrations/20261115090000_zalo_tokens.sql` | `zalo_oa_tokens` + locked refresh helpers |
| `migrations/20261116090000_dashboard_analytics.sql` | UTM + `channel` + `enrolled_at` on leads, `course_fees`, anonymous `funnel_events`, `track_event()`, `dashboard_summary()` |
| `migrations/20261117090000_admin_accounts.sql` | `admin` role (`is_staff()` includes it), `is_admin()`, `admin_list_staff()`, `admin_set_role()` |
| `migrations/20261118090000_admin_only_business.sql` | `dashboard_summary()` and `course_fees` restricted to admins |
| `migrations/20261119090000_staff_signup_requests.sql` | Teacher / staff self-registration: `staff_requests`, sign-up trigger, `admin_list_staff_requests()`, `admin_decide_staff_request()` |
| `migrations/20261120090000_parent_club_promo.sql` | Promo code `CLB_PHU_HUYNH_100K` (CLB Phụ huynh reward) accepted by `submit_lead()` / `leads.promo_code` |
| `migrations/20261121090000_parent_booking_actions.sql` | Parents view / reschedule / cancel their own booking (id + phone): `parent_booking_status()`, `parent_reschedule_booking()`, `parent_cancel_booking()` |
| `migrations/20261122090000_lifecycle_upsell.sql` | `enrollments`, `lifecycle_automations`, course completion + certificate, follow-up queue, advisor call list |
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

Two roles in `app_metadata.role`: **`admin`** (owner / manager — everything, plus managing accounts) and **`staff`**
(teachers — videos, trial schedule). Accounts without a role can sign in but see nothing (RLS).

The app has two separate areas: **admin** at `/quan-tri` (business overview, tuition, accounts — plus links to the
teacher tools) and **teacher / staff** at `/quan-ly` (videos, trial schedule). Signing in opens the area for the role.
Business data (`dashboard_summary()`, `course_fees`) is admin-only in the database as well, not just hidden in the UI.

**First admin (once):** Dashboard → Authentication → Users → *Add user* (tick *Auto Confirm User*), then run
`sql/make_admin.sql` with that e-mail. Everything after that is done in the app: *Trang quản trị → Tài khoản nhân viên*
(web: `/quan-tri/tai-khoan`).

| In the app | How |
|---|---|
| List accounts, promote / demote, revoke access | `admin_list_staff()` / `admin_set_role()` with the admin's session — works without the Edge Function. You cannot change your own role; the last admin cannot be removed. |
| Create account, reset password | `POST /api/admin/users`, `POST /api/admin/users/:id/password` — these need the Auth admin API (service role), so the **`api` Edge Function must be deployed**: `npx supabase login` → `npx supabase functions deploy api --no-verify-jwt --project-ref <ref>`. Passwords: ≥ 8 characters, letters + digits. |

Role changes reach a signed-in user when their token refreshes (≤ 1 hour) or when they sign in again.

### Self-registration (teachers / staff) + approval

The login page has **Đăng ký giáo viên / nhân viên** (`/quan-ly/dang-ky`) and **Đăng ký tài khoản quản trị**.

- **Teacher / staff:** `supabase.auth.signUp()` with `user_metadata.signup_kind = 'staff'`. The trigger
  `on_auth_user_staff_signup` files a `PENDING` row in `staff_requests`. The account has **no role**, so it can sign in but
  sees nothing until approved. Admins see a notification (count + banner) on `/quan-tri` and approve / reject in
  *Duyệt tài khoản* (`/quan-tri/duyet-tai-khoan`). Approval sets `app_metadata.role = 'staff'`; the applicant signs in again.
  `user_metadata` is written by the client and is never used for permissions.
- **Admin:** locked. Only a signed-in admin can open it (others are asked to sign in as admin first); it uses
  `POST /api/admin/users`, so the Edge Function must be deployed.

**Required Supabase settings** (Dashboard → Authentication):
1. *Sign In / Providers* → **Allow new users to sign up = ON** (otherwise the form shows "Trung tâm chưa mở đăng ký").
   This is safe here because new accounts get no permissions until an admin approves them.
2. *Email* → keep **Confirm email = ON** so applicants prove they own the address. Supabase's built-in mailer only sends a
   few e-mails per hour (testing only) — configure your own SMTP (*Authentication → Emails → SMTP Settings*) before staff
   start registering.
3. *URL Configuration* → add `PUBLIC_WEB_URL` to *Redirect URLs* so the confirmation link returns to `/quan-ly/dang-nhap`.

Notifications are in-app (admin area). Push / Zalo alerts to admins are not sent for sign-ups.

Manual alternative (no app):

Parents never sign in. Staff (teachers, admins) sign in with email + password to publish videos.

1. Dashboard → **Authentication → Users → Add user** → email + password, tick *Auto Confirm User*.
2. Grant the staff role (SQL editor):
   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role":"staff"}'
   where email = 'co.huong@thedu.vn';
   ```

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

## Student lifecycle after a course (certificate → review → alumni offer → advisor call)

- A lead marked `ENROLLED` automatically gets an `ACTIVE` row in `enrollments` (lead = family + child; no separate students table).
- A teacher completes the course in the app (*Khu giáo viên → Học viên & lộ trình*) or with
  `POST /api/enrollments/:id/complete {"teacherNote", "endDate"?, "level"?}` → `enrollment_complete()` issues a certificate
  code and queues 4 follow-ups at 09:00 VN: **T+0** certificate (`/chung-nhan/<code>`), **T+3** teacher review,
  **T+7** alumni offer (**only** when `ALUMNI_VOUCHER` holds a real offer), **T+14** flag for an advisor call + message
  announcing the call (no "few seats left" — there is no seat data).
- Next-course rules: `_shared/recommendations.ts` (shared with the app). "Nâng cao" / "cấp 2" are **levels** of the existing courses.
- Follow-ups stop when the family enrols in another course, the course is marked dropped, or an advisor records the call.
- Job: `_shared/lifecycleCron.ts`, `POST /api/cron/lifecycle` (cron secret), scheduled daily by `sql/schedule_lifecycle_cron.sql`.
  Claim → send → finish, at most 3 attempts; quiet hours 21:00–07:00. Templates: `ZNS_TEMPLATE_COMPLETION_CERT`,
  `…_TEACHER_REVIEW`, `…_ALUMNI_DISCOUNT`, `…_FINAL_CALL` (params in `_shared/lifecycleMessages.ts`).
- Channels: ZNS (approved template) or Zalo OA. App push notifications are not sent (parents have no accounts / no FCM yet).

## Tuition payments (VietQR + VNPay)

Migration `20261123090000_tuition_payments.sql` (upgrade file in `sql/upgrades/`).

- **Invoice:** an admin opens *Học viên & lộ trình* → **Lập hóa đơn học phí**. The amount defaults to the course fee and
  can be edited. A discount is optional; the admin types its amount and label, and the label is only *suggested*
  ("Ưu đãi học viên cũ") when the family already completed a course. The parent receives the link
  `<web>/thanh-toan/<invoice id>`. That uuid is the only key, and the page shows no phone number.
  `enrollments.payment_status` becomes `PENDING_PAYMENT`. The course lifecycle `status` is separate and unchanged.
- **VietQR:** the QR code is generated by the Edge Function from `VIETQR_*`, with the amount and the transfer content
  pre-filled (content = invoice ref `THEDU` + 8 hex characters, letters and digits only so banks keep it).
  - **Automatic confirmation** needs a bank-notification service. The implemented one is **SePay**: connect the receiving
    account, then *Webhook → URL* `https://<ref>.supabase.co/functions/v1/api/payment/ipn`, auth *API Key* = `BANK_WEBHOOK_API_KEY`.
  - Without the key, the page says the centre confirms by hand: the admin taps **Đã nhận tiền**.
- **VNPay 2.1.0:** set `VNPAY_TMN_CODE` and `VNPAY_HASH_SECRET`; the URL defaults to sandbox.
  - In the VNPay merchant portal, register the **IPN URL** `https://<ref>.supabase.co/functions/v1/api/payment/ipn`.
  - The checkout URL is signed on the server (HMAC-SHA512 over the sorted query). Each attempt gets its own `vnp_TxnRef` (`<ref>V<n>`).
  - The return URL only brings the parent back to the page. Payment is recorded **only** from the verified IPN.
- **IPN / webhook** (`_shared/paymentWebhook.ts`): VNPay is checked by signature plus merchant code; SePay by API key
  (constant-time comparison). Then `payment_apply()` is called.
  - **Idempotency:** one row per provider transaction in `payment_events`.
  - **Amount rules:** VNPay must match exactly; for a bank transfer, paying more is accepted (and noted) and paying less is not.
  - **When it matches:** a receipt number `BLyymmdd-nnnnn` is issued and the enrollment becomes `PAID`.
  - **Flagged for an admin:** transfers without a recognisable ref, and money arriving for a cancelled invoice. They are
    stored but never applied automatically.
- **Receipt:** the parent's page polls the status: every 3 s at first, slower later, paused in the background. It then
  turns into the digital receipt (print / PDF on web).
  - **Zalo:** ZNS `ZNS_TEMPLATE_PAYMENT_RECEIPT` (C_NAME, STUDENT_NAME, COURSE, AMOUNT, RECEIPT_NO, PAID_AT,
    RECEIPT_URL), or an OA message, or skipped (the reason is logged in `tuition_invoices.notification_log`).
- **Secrets:** `VNPAY_HASH_SECRET` and `BANK_WEBHOOK_API_KEY` are Edge Function secrets only, never in the app or Vercel.
  The account number and name are public (they are printed on the QR).
- **Roles:** creating, cancelling and manually confirming invoices is admin-only (`is_admin()`). Teachers / staff can see
  the payment status and share the link. `payment_events` is readable by admins only.

## Parent portal (`/con-toi`), OTP sign-in, parent accounts

Migration `20261124090000_parent_portal.sql` (upgrade file in `sql/upgrades/`).

**Tables**

| Table | Contents |
|---|---|
| `users` | Parents, one row per phone. `auth_user_id` → Supabase Auth user with `app_metadata.role = 'parent'`. |
| `students` | Children. |
| `parent_student_links` | Which parent can see which child. |
| `daily_reports` | Contact book entry per student, course and session. |
| `attendance_requests` | Leave / make-up requests. |
| `parent_otps` | Sign-in codes; service role only. |

`enrollments` gains `student_id`, `sessions_total`, `sessions_remaining` and `schedule`
(`[{d: 2…8, start, end}]`, where 8 = Sunday).

**Sign-in** (`_shared/parentAuth.ts`, `POST /api/parent/otp/request | otp/verify | signup`)
- **Code:** a 4-digit code generated server-side and sent with the approved ZNS template `ZNS_TEMPLATE_OTP`
  (parameter name in `ZNS_OTP_PARAM`, default `otp`). Only `HMAC(OTP_PEPPER, phone:code)` is stored.
- **Limits:** the code expires after 5 min and allows 5 attempts; at most 1 send per 60 s and 5 per hour per phone, 20 per hour per IP.
- **Phone already exists** (created by an admin, or an earlier sign-up): the parent is signed in at once.
- **New phone:** a one-time token (15 min) allows a single quick profile step (parent + first child + campus).
- **Session:** the Edge Function creates or refreshes the parent's Auth user with a fresh random password and an
  internal e-mail `parent-<id>@PARENT_EMAIL_DOMAIN`. That address is confirmed and never mailed. It then returns the session.
- **Without `ZNS_TEMPLATE_OTP`:** sign-in answers "chưa kích hoạt". Sample-data mode uses code 1234.

**Privacy**
- Every parent rule goes through `current_parent_id()`, i.e. the signed-in and **active** parent.
  Locking an account in admin removes access immediately.
- Parents read only children linked to them (RLS on `students`, `daily_reports`, `attendance_requests`, links, `users`).
  `enrollments` is not exposed; `parent_portal()` returns curated fields only.
- Children's work photos go to the **private** bucket `class-reports/<student_id>/…`. Parents of that child and staff
  read them through 1-hour signed URLs.

**Contact book:** in *Học viên & lộ trình*, teachers tap **Ghi sổ liên lạc** (date, attendance, feedback, up to 6 photos).
- "Có mặt" (present) uses one session from `sessions_remaining`; "Vắng" (absent) and "Nghỉ có phép" (excused leave) do not.
- Attendance rate = present ÷ (present + absent); excused leave is not counted.
- The teacher name comes from the staff account's `full_name`.

**Admin** (*Quản trị → Phụ huynh & học viên*, `/quan-tri/phu-huynh`)
- Search by name, phone or child, and filter by campus and status:
  - Đang học: has an active course.
  - Sắp hết buổi: fewer than 3 sessions left.
  - Khách: no active course.
  - Đã khóa: account locked.
- Create an account by phone (or add children to an existing phone), creating the student, course, sessions and weekly schedule.
- Allow or lock sign-in, and adjust sessions ±1.
- Approve or reject leave / make-up requests.

**Referral:** each parent has a code (`TH` + 6 characters). The share link is
`/booking?utm_source=referral&utm_medium=parent&utm_campaign=<code>`, so sign-ups show up in the dashboard's UTM sources.
A reward is shown **only** when `PUBLIC_REFERRAL_REWARD` holds a real offer.

## Referral & rewards (`/con-toi/gioi-thieu`)

Migration `20261125090000_referral_rewards.sql`. Run it after `…parent_portal`.

- **Program:** the `referral_program` table holds one row: on/off, the referrer's voucher (default **200.000đ**), the
  new family's discount (default **150.000đ**) and the voucher validity (180 days).
  Admins change it in *Phụ huynh & học viên → Giới thiệu*. Every referral keeps the amounts in force when the family
  booked, so a later program change never alters an existing promise.
- **Booking:** the form has an optional "Mã giới thiệu (Nếu có)" field.
  - It is checked live with `referral_check()`, which only says valid/invalid and the discount, never who owns the code.
  - Shared links `/booking?ref=CODE` fill it in automatically.
  - `submit_lead()` applies the code via `referral_attach()`. A bad code never blocks the booking; the response's
    `referral` field says whether it was applied and why not.
- **Rules (database):**
  - The code must belong to an active parent and the program must be on.
  - No self-referral (same phone).
  - New families only (no course with TH EDU yet).
  - One referral per family (phone).
- **Status:**
  - `PENDING_TRIAL` when the trial is booked.
  - `PENDING_PAYMENT` once the trial is completed or the child is enrolled.
  - `VOID` if the trial is cancelled.
  - `REWARDED` when the referred family pays an invoice, through any route (VietQR / VNPay webhook or confirmed by hand).
    This is done by the trigger `tuition_invoices_referral`, which also issues the voucher (`GT…`, status AVAILABLE).
- **Discount and vouchers on invoices:** in *Lập hóa đơn học phí*:
  - The new family's discount is pre-filled ("Ưu đãi mã giới thiệu").
  - The family's own vouchers appear as chips. Picking one adds it to the discount and marks it USED (`referral_voucher_redeem`).
  - Cancelling that invoice frees the voucher again.
- **Zalo:** after each payment and in the daily job (`/api/cron/lifecycle`), the Edge Function messages new referrers.
  It uses the ZNS template `ZNS_TEMPLATE_REFERRAL_REWARD` (params C_NAME, AMOUNT, FRIEND, VOUCHER_CODE, EXPIRY), or an
  OA message. If neither is configured, the message waits and is sent once one is.
- **Privacy:** parents see their friends by given name only (no phone), and RLS limits `referral_rewards` to the referrer and admins.

## Staff roles, classes, attendance & tasks

Migration `20261126090000_staff_rbac_tasks.sql`. Run it after `…referral_rewards`.

**Roles** (*Tài khoản nhân viên → Vai trò*): each staff account gets a `staff_profiles` row with a kind
(Giáo viên / Tư vấn / Quản lý) and a campus (empty = every campus).

| Role | Sees / does |
|---|---|
| Admin | Everything |
| Quản lý, or staff **without a role yet** | Everything, so existing accounts keep working until roles are assigned |
| Tư vấn (advisor) | Leads assigned to them or at their campus; enrollments, students and invoices at their campus |
| Giáo viên (teacher) | Trial leads at their campus; enrollments, students, contact-book entries and photos **only in their classes** |

- **Enforcement:** RLS on `leads`, `crm_logs`, `enrollments`, `lifecycle_automations`, `students`, `daily_reports`,
  `attendance_requests`, `tuition_invoices` and storage. The staff actions are also guarded by scope:
  `crm_set_status`, `crm_complete_trial`, `enrollment_complete`, `enrollment_drop`, `enrollment_mark_contacted` and
  `daily_report_create` are now wrappers around their `…_core` versions.

**Classes** (*Quản trị → Lớp học & phân công*): name, course, level, campus, teacher and weekly schedule. Students
are added from the active enrollments of the same course and campus.

**Teacher, "Lớp của tôi"** (`/quan-ly/lop-hoc`):
- **Attendance:** by QR or by tapping Có mặt / Muộn / Vắng / Phép.
  - Each child has an unguessable `students.qr_token`. Parents show it from *Sổ liên lạc → Mã điểm danh của bé*.
  - A scan more than 10 minutes after today's class start is recorded as LATE.
- **Batch contact book:** select the students, add quick tags, a note and up to 6 class photos. Photos are stored under
  `class-reports/class/<class_id>/…`, readable by the class teacher and parents of that class.
  Present or late students use one session.
- **Web QR scanning** uses the rear camera + `jsqr` and needs https. The native app currently has no camera module:
  teachers type the code or use the roll call (`src/components/QrScanner.tsx`).

**Tasks** (`/quan-ly/cong-viec`): Overdue / Today / Upcoming, with buttons to call, open a Zalo chat
(`https://zalo.me/<phone>`), start and complete (with a note). Admins and managers can assign tasks and see the whole centre.
Tasks are also created automatically:
- **New trial lead:** assigned to the campus advisor with the fewest open tasks (`leads.assigned_advisor`), as a
  "Gọi xác nhận học thử" task due within 2 hours.
- **Approved make-up request:** a task for the teacher of the child's class.
- **T+14 advisor call after a course:** a task for the advisor.

## Parent engagement: AI notebook check, class moments, 21-day challenge

Database: `migrations/20261127090000_parent_engagement.sql` (upgrade: run after `20261126090000_staff_rbac_tasks.sql`).

**Chấm vở cùng AI** (`/con-toi/cham-vo`). The parent photographs one page (luyện chữ or toán); the app shrinks it to
≤1600 px JPEG and sends it to `POST /api/ai/notebook-check` (parent JWT). The Edge Function asks Claude
(`claude-opus-5-5`, vision, structured JSON output, `_shared/notebookCheck.ts`) for 1–5 estimates per criterion,
checked exercises (toán), strengths, home-practice tips and a short encouragement signed "Trợ lý AI TH EDU".
- The photo is **not stored**; `ai_checks` keeps only the kind, status and the JSON result.
- Limit: 10 checks per parent per day (`ai_check_begin`, service role only).
- Unreadable / non-notebook photos come back as "chụp lại"; scores are labelled "AI ước lượng" in the app.
- Enable: `npx supabase secrets set ANTHROPIC_API_KEY=… --project-ref <ref>` then redeploy `api`. Without the
  key the route answers 503 "chưa được kích hoạt". Demo mode (no Supabase) shows a fixed sample, labelled.

**Khoảnh khắc lớp học.** Teachers (Lớp của tôi → tab "Khoảnh khắc") post one photo or a ≤5 s voice note (web
MediaRecorder; the native app posts photos) into `class-reports/class/<class_id>/…`, then `flash_create`. Parents of
that class see them for 7 days in "Con tôi" (`flash_feed`), react ❤️ "Thả tim" / 🌟 "Tự hào quá" (`flash_react`,
toggle) and reply (`flash_reply`, ≤300 chars, 5 per moment). The teacher's tab lists counts and every reply.

**Thử thách 21 ngày.** A small daily habit per child (chosen from the child's courses), ticked by the parent;
streak + 21 dots + confetti. Stored on the device only (`useHabitStore`), nothing is sent to the centre.

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

## Admin dashboard (`/quan-tri/tong-quan`)

Every number comes from `dashboard_summary(p_branch, p_days)` (staff only) or the `leads` table — nothing is estimated in the app.
Apply `sql/upgrades/20261116090000_dashboard_analytics.sql` on existing projects.

| KPI | Definition |
|---|---|
| Đăng ký mới | leads created in the last *N* days vs the *N* days before |
| Tỉ lệ chốt sau học thử | of the trials completed in the period (`trial_completed_at`), the share now `ENROLLED` |
| Học thử hôm nay | `appointment_time` today (Vietnam time), not cancelled; and how many are done |
| Doanh thu dự kiến | Σ `course_fees.monthly_fee_vnd` of leads with `enrolled_at` this month. Courses without a fee are listed as missing, never guessed. First-month tuition of new students only — not total centre revenue. |
| Nguồn khách hàng | `leads.channel`, derived from UTM by `lead_channel()` |
| Phễu | anonymous sessions that opened the app / watched a video ≥ 3 s (`funnel_events`), then the period's leads → trial done → enrolled |

**Traffic sources.** The app reads `utm_source` / `utm_medium` / `utm_campaign` from the link a parent opens (kept 30 days on the
device) and sends them with the booking. `lead_channel()`: `facebook|fb|instagram|ig|meta|messenger…` → FACEBOOK, `tiktok…` → TIKTOK,
`zalo…` → ZALO, `utm_source`/`utm_medium` = `referral` (or `?ref=…`) → REFERRAL, any other source → OTHER, none → UNTRACKED.
Without UTM, Facebook/TikTok click ids (`fbclid`, `ttclid`) still count for that network. Leads created before this upgrade are UNTRACKED.

**Funnel events** are anonymous: a random per-session id, no phone, no link to the booking. `track_event()` stores at most one row per
session + kind (+ video) and ignores unpublished videos. Anyone can call it, so visit counts can be inflated by someone scripting
requests — treat them as indicative; the booking stages are exact.

**Enrolment date.** `leads.enrolled_at` is set by a trigger whenever the status becomes `ENROLLED` (cleared if it changes back).
Existing enrolled leads were back-filled with their last update time.

`submit_lead()` is now a wrapper that calls `submit_lead_core()` (the previous implementation, no longer callable by clients) and then
stores the UTM fields. Change validation in `submit_lead_core`.

## Trust content (stats, testimonials, activity ticker)

Everything parents see as social proof comes from these tables, managed by staff:

- **`trust_stats`** — cannot be published without a `source_note` (≥10 chars). The app shows the source when a badge is tapped.
- **`testimonials`** — cannot be published without `consent_confirmed`. Keep the signed consent form on file.
- **`recent_activity()`** — real bookings from the last 7 days, masked to "Phụ huynh T.", times rounded to 5 min. Empty → the ticker hides itself.

With no backend, development builds show clearly-labelled sample content ("Dữ liệu mẫu"); production builds show nothing.

## Personal data

Portfolios are public only when `is_published AND parent_consent`. Do not set `parent_consent`
without the parent's written consent. Leads contain phone numbers: no public read, staff only.
