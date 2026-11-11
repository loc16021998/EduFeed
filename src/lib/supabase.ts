import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { ENV, hasSupabase } from '@/config/env';
import type { Database } from '@/types/database';

/**
 * Typed Supabase client, or `null` when PUBLIC_SUPABASE_* aren't configured —
 * services fall back to in-app mock data in that case.
 *
 * Parents use the app anonymously. Only staff sign in (to publish videos), and their
 * session is persisted (AsyncStorage on native, localStorage on web) so they stay signed in.
 */
export const supabase: SupabaseClient<Database> | null = hasSupabase
  ? createClient<Database>(ENV.supabaseUrl, ENV.supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Native: only refresh tokens while the app is in the foreground (Supabase's recommendation).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
