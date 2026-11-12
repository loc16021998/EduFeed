# TH EDU Companion

Ứng dụng React Native **không dùng Expo**: một mã nguồn chạy trên **Web** (Vite + react-native-web), **Android** và **iOS** (React Native CLI 0.74).

## Yêu cầu

| Nền tảng | Cần cài |
|---|---|
| Web | Node.js 18+ |
| Android | Node.js 18+, **JDK 17**, **Android Studio** (Android SDK 34, một máy ảo hoặc điện thoại bật USB debugging) |
| iOS | **macOS**, **Xcode 15+**, CocoaPods (qua Ruby `bundler`) |

Hướng dẫn cài môi trường chính thức: https://reactnative.dev/docs/0.74/set-up-your-environment

## Cài đặt

```bash
npm install
cp .env.example .env.local     # điền Supabase / Zalo OA (để trống = dùng dữ liệu mẫu)
```

## Chạy

```bash
npm run dev          # Web  → http://localhost:5173
npm run android      # Android (tự mở Metro, cài app lên máy ảo/điện thoại)
npm run pods         # iOS: chạy 1 lần, và mỗi khi thêm thư viện native
npm run ios          # iOS (chỉ trên macOS)
```

Đổi `.env.local` xong: web tự cập nhật khi khởi động lại `npm run dev`; native cần `npm start -- --reset-cache`.

## Đăng video (dành cho giáo viên / nhân viên)

- **Vào khu quản lý:** trên web mở `/quan-ly`; trong app **nhấn giữ logo TH EDU 1 giây** ở EduFeed.
  Khi đã đăng nhập, EduFeed có thêm nút **"+ Đăng video"**.
- **Đăng video:** chọn video (MP4/MOV, ≤ 50 MB — nên quay dọc, 30–90 giây, xuất 720p) → ảnh bìa
  (trên web tự lấy từ video) → tiêu đề, khóa học, giáo viên, hashtag, nút kêu gọi → xem trước → **Đăng ngay** hoặc **Lưu nháp**.
- **Chia sẻ:** mỗi video có link `PUBLIC_WEB_URL/v/<mã>` để đăng Facebook, Zalo, nhóm phụ huynh.
  Lượt đăng ký học thử qua link (và qua nút trên EduFeed) được tính cho từng video trong danh sách quản lý.
- **Tài khoản:** hai quyền, hai khu riêng — **Quản trị** (`/quan-tri`: tổng quan kinh doanh, học phí, tài khoản; vẫn dùng được
  công cụ giáo viên) và **Giáo viên / nhân viên** (`/quan-ly`: video, lịch học thử). Đăng nhập xong app tự mở đúng khu theo quyền.
  Tài khoản quản trị đầu tiên tạo một lần trong Supabase + chạy `supabase/sql/make_admin.sql`; sau đó quản trị viên tạo tài khoản
  ngay trong app: *Trang quản trị → Tài khoản nhân viên* (web: `/quan-tri/tai-khoan`).
  Giáo viên / nhân viên cũng có thể **tự đăng ký** ở trang đăng nhập (`/quan-ly/dang-ky`); tài khoản chờ quản trị viên duyệt
  ở *Trang quản trị → Duyệt tài khoản*. Cần bật *Allow new users to sign up* trong Supabase (xem supabase/README.md). Tạo tài khoản / đặt lại mật khẩu cần triển khai
  Edge Function `api` — xem [supabase/README.md](supabase/README.md#staff-accounts-who-can-publish-videos).
- **Chưa kết nối Supabase:** bản dev có *chế độ thử* (email bất kỳ, mật khẩu ≥ 6 ký tự); video thử chỉ lưu tạm, mất khi tải lại.

## Tổng quan kinh doanh (chủ trung tâm / quản lý)

Web: `/quan-tri/tong-quan` (rộng toàn màn hình trên máy tính) · App: *Trang quản trị → Tổng quan kinh doanh* (chỉ tài khoản Quản trị).

- **Đăng ký mới** (so với kỳ trước), **tỉ lệ chốt sau học thử**, **học thử hôm nay**, **doanh thu dự kiến** của tháng.
- **Nguồn khách hàng** theo link quảng cáo, **phễu chuyển đổi**, **danh sách đăng ký** (lọc cơ sở / thời gian / trạng thái, nút Gọi và Chat Zalo).
- Số liệu chỉ lấy từ dữ liệu thật. Ba việc cần làm để các ô có số:
  1. **Gắn UTM vào link quảng cáo**, ví dụ `PUBLIC_WEB_URL/feed?utm_source=facebook&utm_medium=cpc&utm_campaign=khai-giang-t11`
     (`tiktok`, `zalo`, `referral` tương tự). Link không gắn sẽ hiện là *Chưa gắn nguồn*.
  2. **Nhập học phí** từng khóa (nút *Nhập học phí* trên ô doanh thu). Khóa nào chưa có giá sẽ được báo thiếu, không tự đoán.
  3. **Đánh dấu "Đã nhập học"** trong *Lịch học thử* khi phụ huynh đóng tiền.
- Lượt vào app / xem video được đếm **ẩn danh** (mỗi phiên 1 lần, không gắn với phụ huynh), bắt đầu từ khi nâng cấp cơ sở dữ liệu.

## Build bản phát hành

**Web** — `npm run build:web` → thư mục `dist/` (host tĩnh: Netlify, Vercel, Nginx…). Cấu hình server trả `index.html` cho mọi đường dẫn (`/booking`, `/phu-huynh`, `/v/…`, `/quan-ly`…), và đặt `PUBLIC_WEB_URL` = địa chỉ web này để link chia sẻ video đúng.

**Android**
1. Tạo keystore phát hành (một lần, giữ bí mật, **không commit**):
   `keytool -genkeypair -v -storetype PKCS12 -keystore android/app/thedu-release.keystore -alias thedu -keyalg RSA -keysize 2048 -validity 10000`
2. Khai báo `signingConfigs.release` trong `android/app/build.gradle` (mật khẩu đặt trong `~/.gradle/gradle.properties`).
3. `cd android && ./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab` (nộp Google Play)
   hoặc `./gradlew assembleRelease` → file `.apk` cài trực tiếp.

**iOS** — mở `ios/THEduCompanion.xcworkspace` trong Xcode → chọn Team (tài khoản Apple Developer) → *Product › Archive* → *Distribute App*.

Mã định danh app: `vn.thedu.companion` (Android & iOS). Deep link: `thedu://booking?course=…`.

## Kiểm tra nhanh

```bash
npm run typecheck      # TypeScript
npm run build:web      # build web
npm run bundle:check   # đóng gói JS cho Android + iOS (không cần Android SDK/Xcode)
```

## Cấu trúc

```
index.js              entry native (Android/iOS)
src/main.web.tsx      entry web
App.tsx               gốc ứng dụng chung
android/, ios/        project native (commit vào git)
vite.config.mjs       build web
metro.config.js       build native
src/components/media/ VideoPlayer, Gradient: file .tsx = native, .web.tsx = web
src/utils/haptics.ts  rung phản hồi (haptics.web.ts = không làm gì trên web)
supabase/             database, Edge Function, xem supabase/README.md
```

File có đuôi `.web.tsx` / `.web.ts` chỉ dùng cho web; Metro (native) bỏ qua chúng, Vite (web) ưu tiên chúng.
