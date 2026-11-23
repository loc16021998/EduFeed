/**
 * App config read by EAS CLI (project link, build metadata).
 *
 * IMPORTANT — this is a React Native CLI ("bare") project: the native folders are the source of truth.
 * EAS documents that for existing React Native projects "the values in native code take precedence",
 * so the settings below DESCRIBE the app for EAS; they do not generate native code:
 *   - app name / id per profile → android/app/build.gradle (APP_ENV → ".preview" / ".dev" suffix,
 *     "TH EDU (Thử)" label) and ios/THEduCompanion/Info.plist
 *   - icons → android/app/src/main/res/mipmap-*, ios/THEduCompanion/Images.xcassets/AppIcon.appiconset
 *   - splash → android/app/src/main/res/values/styles.xml, ios LaunchScreen.storyboard
 *   - permissions → AndroidManifest.xml, Info.plist (NSCameraUsageDescription, NSPhotoLibraryUsageDescription)
 *   - versionCode / buildNumber → EAS remote versioning (eas.json "appVersionSource": "remote")
 * Keep `version`, the bundle id and the package name below in sync with those files.
 *
 * Not type-checked with the app (excluded in tsconfig.json): it runs in Node inside EAS CLI.
 */
import pkg from './package.json';

type AppEnv = 'development' | 'preview' | 'production';

const APP_ENV: AppEnv = ((): AppEnv => {
  const v = process.env.APP_ENV ?? process.env.PUBLIC_APP_ENV;
  return v === 'development' || v === 'preview' ? v : 'production';
})();

const BASE_ID = 'vn.thedu.companion';
const SUFFIX: Record<AppEnv, string> = { development: '.dev', preview: '.preview', production: '' };
const NAME: Record<AppEnv, string> = { development: 'TH EDU (Dev)', preview: 'TH EDU (Thử)', production: 'TH EDU Companion' };

const PROJECT_ID = process.env.EAS_PROJECT_ID;

export default () => ({
  name: NAME[APP_ENV],
  slug: 'thedu-companion',
  version: pkg.version,
  orientation: 'portrait',
  scheme: 'thedu',
  // ── OTA (EAS Update) — takes effect once expo-updates is installed (docs/RELEASE.md → "Cập nhật OTA").
  // runtimeVersion = app version: an OTA bundle is only delivered to binaries with the SAME version, so
  // a JS update that needs new native code can never reach an older binary (no startup crash). Bump
  // package.json "version" for every store release that changes native code or native libraries.
  // Bare projects: EAS writes this into Expo.plist / AndroidManifest at build time.
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    url: PROJECT_ID ? `https://u.expo.dev/${PROJECT_ID}` : undefined,
    // The app decides when to check (launch + foreground, src/services/updateService.ts), never blocks
    // start-up waiting for the network.
    checkAutomatically: 'ON_ERROR_RECOVERY',
    fallbackToCacheTimeout: 0,
  },
  ios: {
    // iOS keeps one bundle id for every profile (internal builds are ad-hoc signed to registered phones).
    bundleIdentifier: BASE_ID,
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription: 'Cho phép chụp ảnh vở của bé để "Chấm vở cùng AI" và chụp ảnh bài làm gửi vào sổ liên lạc.',
      NSPhotoLibraryUsageDescription: 'Cho phép chọn ảnh hoặc video từ thư viện để gửi vào sổ liên lạc, cộng đồng phụ huynh hoặc đăng lên EduFeed.',
    },
  },
  android: {
    package: `${BASE_ID}${SUFFIX[APP_ENV]}`,
    permissions: ['INTERNET'],
  },
  extra: {
    appEnv: APP_ENV,
    // Filled by `eas init` (or set EAS_PROJECT_ID in the shell / EAS environment).
    eas: { projectId: PROJECT_ID },
  },
});
