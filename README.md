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
- **Tài khoản nhân viên:** tạo trong Supabase và cấp quyền `staff` — xem [supabase/README.md](supabase/README.md#staff-accounts-who-can-publish-videos).
- **Chưa kết nối Supabase:** bản dev có *chế độ thử* (email bất kỳ, mật khẩu ≥ 6 ký tự); video thử chỉ lưu tạm, mất khi tải lại.

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
