# Phát hành TH EDU Companion — checklist

App là **React Native CLI** (có thư mục `android/`, `ios/`). EAS Build build trực tiếp từ thư mục native;
`app.config.ts` chỉ mô tả app cho EAS — tên, mã gói, icon, quyền nằm trong file native (xem đầu `app.config.ts`).

| Hồ sơ (`eas.json`) | Dùng cho | Android | iOS | Mã gói Android / tên |
|---|---|---|---|---|
| `development` | lập trình viên (cần Metro) | APK debug | Debug, máy đã đăng ký | `vn.thedu.companion.dev` · "TH EDU (Dev)" |
| `preview` | giáo viên Xa La & Ngô Thì Nhậm thử nội bộ | APK cài trực tiếp | Ad-hoc, máy đã đăng ký | `vn.thedu.companion.preview` · "TH EDU (Thử)" |
| `production` | Google Play / App Store | AAB, số build tự tăng | App Store, số build tự tăng | `vn.thedu.companion` · "TH EDU Companion" |

Bản thử cài **song song** với bản chính thức (khác mã gói), không cần gỡ app.

## 0. Lần đầu (một lần)

```bash
npm i -g eas-cli            # cần >= 16
eas login
eas init                    # gắn project; ghi projectId (hoặc đặt EAS_PROJECT_ID)
eas build:version:set       # đặt versionCode / buildNumber hiện tại trên EAS (remote versioning)

# Biến môi trường CÔNG KHAI cho từng môi trường (KHÔNG đưa khoá bí mật vào đây)
eas env:create --environment preview    --name PUBLIC_SUPABASE_URL      --value https://<du-an>.supabase.co --visibility plaintext
eas env:create --environment preview    --name PUBLIC_SUPABASE_ANON_KEY --value <anon/publishable key>     --visibility plaintext
eas env:create --environment production --name PUBLIC_SUPABASE_URL      --value https://<du-an>.supabase.co --visibility plaintext
eas env:create --environment production --name PUBLIC_SUPABASE_ANON_KEY --value <anon/publishable key>     --visibility plaintext
# tương tự: PUBLIC_WEB_URL, PUBLIC_HOTLINE, PUBLIC_ZALO_OA_ID, PUBLIC_SENTRY_DSN
```

Khoá bí mật (service_role, VNPAY_HASH_SECRET, BANK_WEBHOOK_API_KEY, OTP_PEPPER, CRON_SECRET, ANTHROPIC_API_KEY,
Zalo token) **chỉ** đặt bằng `supabase secrets set` cho Edge Function — không bao giờ trong EAS / Vercel / `.env.local`.

Android ký bằng khoá do EAS quản lý (`eas credentials`). Build ngoài EAS: đặt `THEDU_UPLOAD_*` trong
`~/.gradle/gradle.properties` (xem `.env.example`) — nếu thiếu, bản release dùng khoá debug và **Google Play sẽ từ chối**.

## 1. Trước mỗi lần phát hành

```bash
npm run typecheck                               # TypeScript
npm run env:check -- --profile production       # cấu hình (không in giá trị); dừng nếu lộ khoá bí mật
npm run release:check                           # cả hai + đóng gói thử JS Android/iOS
npm run build:web                               # bản web (Vercel)
```

- Tăng `version` trong `package.json` khi có tính năng mới (Android `versionName` đọc từ đây; iOS: cập nhật
  `MARKETING_VERSION` trong Xcode cho khớp). Số build do EAS tự tăng.
- Chạy các file `supabase/sql/upgrades/*` mới (theo thứ tự) và `supabase functions deploy api` nếu Edge Function đổi.

## 2. Build thử nội bộ (2 cơ sở)

```bash
npm run build:preview                           # = eas build --profile preview --platform all
```

EAS trả về link / mã QR: giáo viên mở trên điện thoại để cài. Kiểm tra nhanh trên **cả 2 cơ sở**:
đăng nhập phụ huynh (OTP Zalo), sổ liên lạc + lời nhắn thoại, điểm danh, đặt lịch học thử, thanh toán thử
(VNPay sandbox), "Chấm vở cùng AI" (camera), chế độ tiết kiệm dữ liệu trên 4G.

## 3. Kiểm tra báo lỗi trước khi công khai

1. Đặt `PUBLIC_SENTRY_DSN` (hoặc `PUBLIC_TELEMETRY_URL`) cho môi trường preview.
2. Bản web chạy ở chế độ development (`npx vite build --mode development` rồi `npm run preview:web`): mở console,
   gõ `dispatchEvent(new Event('thedu:crash'))` → phải thấy màn hình **"Đã có sự cố xảy ra"** và một sự kiện mới
   trên Sentry với tag `role`, `route`, `campus`, **không** có số điện thoại.
3. Trên bản preview: tắt mạng giữa lúc tải ảnh lên → app báo lỗi dễ hiểu, không đóng app.
4. Sentry → Issues: lọc `environment:preview`, `release:thedu-companion@<version>`.

> Ghi chú: báo lỗi dùng HTTP trực tiếp tới Sentry (không cài SDK native) nên lỗi JavaScript được ghi đầy đủ;
> lỗi native thuần (hiếm) xem trong Play Console → Android vitals / App Store Connect → Crashes.
> Stack trace của bản release là mã đã nén — muốn đọc tên hàm cần tải source map lên Sentry (tuỳ chọn).

## 4. Phát hành

```bash
npm run build:production                        # AAB + IPA, số build tự tăng
npm run submit:production                       # Android: track "internal" (bản nháp) · iOS: TestFlight
```

Sau khi duyệt nội bộ: Play Console → chuyển bản từ Internal sang Production; App Store Connect → gửi duyệt.

## 5. Nhắc / bắt buộc cập nhật app (Supabase `app_release_config`)

Chạy một lần: `supabase/sql/upgrades/20261129090000_app_release_config.sql` (SQL Editor). Sau đó sửa trong
**Table Editor → app_release_config** (mỗi dòng một nền tảng `android` / `ios`):

| Cột | Ý nghĩa |
|---|---|
| `latest_version` | bản mới nhất trên store → máy cũ hơn thấy thẻ **"Đã có phiên bản mới"** (có "Để sau") |
| `min_supported_version` | máy **dưới** số này thấy màn hình **"Cần cập nhật ứng dụng"** (không đóng được) |
| `is_force_update` | `true` = mọi máy dưới `latest_version` đều bị bắt buộc (bản sửa lỗi nghiêm trọng) |
| `store_url` | link Google Play / App Store — **để trống thì không hiện nhắc nhở** |
| `release_notes_vi` | 1–2 câu "Có gì mới", VD "Cải thiện tốc độ tải video EduFeed và sổ liên lạc" |

Thứ tự an toàn: đưa bản mới lên store và chờ duyệt xong **rồi mới** tăng `latest_version`; chỉ tăng
`min_supported_version` khi bản cũ thật sự không dùng được (VD máy chủ đã đổi). Mất mạng / chưa chạy SQL → không chặn ai.
Xem trước giao diện (bản web development): thêm `?update=soft` hoặc `?update=force` vào địa chỉ.

## 6. Cập nhật nóng (OTA)

**Web (đang chạy):** mỗi lần Vercel deploy, file `/version.json` đổi. App đang mở sẽ phát hiện khi khởi động / quay lại
tab (tối đa 15 phút một lần, hoặc bấm "Kiểm tra cập nhật" trong Cài đặt) và hiện **"Bản cập nhật mới đã sẵn sàng —
Khởi động lại để áp dụng"**. Bản sửa lỗi khẩn: đặt biến `UPDATE_CRITICAL=1` (và `UPDATE_NOTES_VI=...`) cho lần
deploy đó trên Vercel → app hỏi tải lại ngay (cho phép "Nhắc lại sau 5 phút" để phụ huynh lưu việc đang làm).

**Android / iOS (chưa bật):** cần thêm `expo-updates` vào phần native — làm trên máy build được (Android Studio / Xcode):

```bash
npx install-expo-modules@latest     # thêm Expo modules vào android/ & ios/ (RN 0.74 ↔ Expo SDK 51)
npx expo install expo-updates
eas update:configure                # ghi updates.url / runtimeVersion vào native
npm run build:preview               # build thử, cài, mở app → phải chạy bình thường
```

Sau đó thay `nativeOta` trong `src/services/updateService.ts` bằng `Updates.checkForUpdateAsync()` →
`fetchUpdateAsync()` (tải ngầm) → `reloadAsync()` (nút "Cập nhật ngay") — giao diện banner / hộp thoại dùng lại nguyên.
Phát hành: `eas update --channel production --message "..."`. `runtimeVersion` theo `version` trong package.json nên
bản OTA chỉ đến đúng các máy cùng phiên bản native — **mỗi lần đổi thư viện native phải tăng `version` và lên store**.

## 7. Thông báo đẩy (Expo Push)

**Phía máy chủ (làm được ngay):**

1. Chạy `supabase/sql/upgrades/20261130090000_push_notifications.sql` (sau các bản trước).
2. `npx supabase functions deploy api --no-verify-jwt`
3. Chạy `supabase/sql/schedule_push_cron.sql` (mỗi phút gọi `/api/cron/push`; dùng lại secret của cron nhắc lịch).
4. Kiểm tra: `select status, count(*) from public.push_outbox group by status;`

Sự kiện → ai nhận (tự động, không cần ai bấm gửi):

| Sự kiện | Người nhận | Mở màn hình |
|---|---|---|
| Giáo viên gửi sổ liên lạc | phụ huynh của bé | Sổ liên lạc |
| Bé được điểm danh có mặt / muộn | phụ huynh của bé | Sổ liên lạc |
| Chủ nhật 19:00 — thử thách 21 ngày | phụ huynh có con đang học | Sổ liên lạc |
| Chủ nhật 19:30 — báo cáo tuần đã sẵn sàng (mục 8) | phụ huynh của bé (tuần có buổi học / luyện tập) | Báo cáo tuần |
| 15–45 phút trước giờ dạy | giáo viên của lớp | Lớp của tôi |
| Phụ huynh báo nghỉ / xin học bù | giáo viên các lớp của bé | Lớp của tôi |
| Khách đăng ký học thử | tư vấn viên cơ sở đó + quản lý | Công việc |
| Lịch học thử trong 24 giờ chưa xác nhận | tư vấn viên cơ sở đó + quản lý | Lịch học thử |

Mỗi người chọn loại muốn nhận trong **Cài đặt → Cài đặt thông báo**. Tin ưu đãi không gửi 21:00–07:00 (chờ đến
sáng); tin về bé và nhắc lịch luôn gửi ngay. Số điện thoại khách trên màn hình khoá được che (`0912 *** 678`).
Thiết bị gỡ app tự bị xoá khỏi danh sách khi Expo báo `DeviceNotRegistered`.

**Trên điện thoại (chưa bật):** cần `expo-notifications` trong phần native — làm cùng lúc với `expo-updates` (mục 6):

```bash
npx install-expo-modules@latest
npx expo install expo-notifications expo-constants
# Android: thêm google-services.json (Firebase) và tải FCM key lên Expo (eas credentials)
```

Sau đó thay `nativeProvider` trong `src/services/pushNotificationService.ts` theo ghi chú trong file
(xin quyền → `getExpoPushTokenAsync` → tạo 3 kênh Android → nghe sự kiện bấm thông báo). Đăng ký thiết bị với máy chủ,
điều hướng khi bấm và màn hình cài đặt đã sẵn sàng. Thử: `npm run build:preview`, đăng nhập, gửi một sổ liên lạc.

## 8. Báo cáo tiến độ tuần

Mỗi **tối Chủ nhật 19:30** hệ thống tự tổng hợp tuần học (thứ 2 → Chủ nhật) của mọi bé đang học, gửi thông báo
"Báo cáo tuần của bé đã sẵn sàng 🌟" cho phụ huynh (và tin Zalo nếu đã cấu hình). Không ai cần bấm gửi.

1. Chạy `supabase/sql/upgrades/20261201090000_weekly_progress_reports.sql` (sau bản 20261130 thông báo đẩy).
2. `npx supabase functions deploy api --no-verify-jwt`
3. Chạy `supabase/sql/schedule_weekly_digest_cron.sql` (Chủ nhật 19:30–21:50 mỗi 10 phút; sáng thứ 2 chạy bù nếu tối
   Chủ nhật bị gián đoạn — báo cáo đã gửi không gửi lại).
4. Tuỳ chọn: `WEEKLY_REPORT_AI=1` (Claude viết lại lời khen / gợi ý cho tự nhiên hơn — **số liệu luôn do hệ thống tính**,
   AI không được đổi), `ZNS_TEMPLATE_WEEKLY_REPORT` (mẫu ZNS: C_NAME, STUDENT_NAME, WEEK, ATTENDANCE, STREAK, REPORT_URL).

| Phần | Lấy từ |
|---|---|
| Chuyên cần `X/Y buổi` | điểm danh QR / thủ công, sổ liên lạc; ngày nghỉ có phép đã duyệt |
| Chuỗi luyện tập tại nhà | "Thử thách 21 ngày" phụ huynh đánh dấu trong app (nay được lưu cả lên máy chủ) |
| Thanh kỹ năng (chữ, không phải điểm) | nhận xét nhanh của giáo viên + đi học đúng giờ + luyện ở nhà |
| Điểm sáng, 5 phút luyện ở nhà | quy tắc theo môn (Tiền tiểu học, Luyện chữ, Toán tư duy, Bồi dưỡng) |
| Lời thầy cô | ghi chú 1 dòng của giáo viên, nếu không có thì nhận xét gần nhất trong tuần |

**Giáo viên:** Lớp của tôi → tab **"Báo cáo tuần"**: xem trước bản nháp của từng bé, thêm 1 dòng nhận xét riêng trước
19:30 Chủ nhật, và xem phụ huynh nào **đã xem** báo cáo. Tuần nghỉ (không có buổi) vẫn có báo cáo nhẹ nhàng nhưng
**không** gửi thông báo.

Chạy lại một tuần bằng tay (VD sau khi sửa dữ liệu): gọi `POST /api/cron/weekly-digest` với header `x-cron-secret`
và body `{"weekStart":"2026-11-16","force":true}` — chỉ những bé chưa có báo cáo đã gửi của tuần đó được tạo.

## 9. Thích, bình luận, chia sẻ trên EduFeed

1. Chạy `supabase/sql/upgrades/20261202090000_video_social.sql` (sau bản 20261201 báo cáo tuần). Không cần deploy lại Edge Function.
2. Mỗi video có thanh nút bên phải: ♥ (chạm đôi vào video cũng thích), 💬 bình luận, chia sẻ (kèm link video và 2 cơ sở).

- **Ai bình luận được:** phụ huynh đã đăng nhập hiện tên "Mẹ/Bố + tên bé" (không họ, không số điện thoại); khách chưa đăng
  nhập tự đặt tên (không được dùng tên kiểu "TH EDU", "Giáo viên", "Quản trị"); giáo viên / quản trị hiện huy hiệu
  **"Giáo viên TH EDU"** / **"Quản trị viên"**.
- **Chỉ giáo viên / quản trị** được trả lời (1 tầng) và **ẩn** bình luận không phù hợp (ẩn câu hỏi thì ẩn luôn câu trả lời; bấm
  "Hiện lại" để khôi phục).
- **Chống spam:** 1–500 ký tự, phụ huynh / khách không được gửi link, tối đa 5 bình luận / 10 phút và 30 / ngày mỗi người,
  không gửi trùng; tổng bình luận của khách tối đa 300 / giờ.
- Xem / kiểm duyệt nhanh: `select v.title, c.author_name, c.author_role, c.content, c.is_hidden, c.created_at from public.video_comments c join public.videos v on v.id = c.video_id order by c.created_at desc limit 50;`

## 10. Sau phát hành (24–48 giờ)

- Sentry: số lỗi mới theo `release`; lỗi `area:payment` / `area:zns` / `area:upload` cần xem ngay.
- Supabase → Logs → Edge Functions: lỗi 5xx.
- Có lỗi nghiêm trọng: build lại bản sửa (`npm run build:production`), web thì Vercel → Deployments → Promote bản trước.
