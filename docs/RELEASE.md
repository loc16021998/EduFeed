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

## 5. Sau phát hành (24–48 giờ)

- Sentry: số lỗi mới theo `release`; lỗi `area:payment` / `area:zns` / `area:upload` cần xem ngay.
- Supabase → Logs → Edge Functions: lỗi 5xx.
- Có lỗi nghiêm trọng: build lại bản sửa (`npm run build:production`), web thì Vercel → Deployments → Promote bản trước.
