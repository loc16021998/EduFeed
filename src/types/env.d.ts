// `process.env.PUBLIC_*` is replaced at build time (babel-plugin-transform-inline-environment-variables).
// Declared here because the app does not include Node's type definitions.
declare const process: {
  env: {
    NODE_ENV?: 'development' | 'production' | 'test';
    PUBLIC_SUPABASE_URL?: string;
    PUBLIC_SUPABASE_ANON_KEY?: string;
    PUBLIC_ZALO_OA_ID?: string;
    PUBLIC_WEB_URL?: string;
    PUBLIC_HOTLINE?: string;
  };
};
