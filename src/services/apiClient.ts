import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

import type { ApiErrorBody, ApiErrorCode } from '../../supabase/functions/_shared/contracts';

export class ApiError extends Error {
  constructor(
    message: string,
    /** FUNCTION_UNAVAILABLE = the `api` Edge Function is not deployed (callers may fall back to RPC). */
    readonly code: ApiErrorCode | 'NETWORK' | 'NOT_CONFIGURED' | 'FUNCTION_UNAVAILABLE',
    readonly status?: number,
    readonly field?: string,
  ) {
    super(message);
  }
}

/**
 * Call the `api` Edge Function: callApi('feed?limit=10') → GET /functions/v1/api/feed?limit=10.
 * Normalises every failure into ApiError with a parent-friendly Vietnamese message.
 */
export async function callApi<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  if (!supabase) throw new ApiError('Chưa cấu hình máy chủ', 'NOT_CONFIGURED');

  const { data, error } = await supabase.functions.invoke<T>(`api/${path}`, {
    method: init.method ?? 'GET',
    ...(init.body !== undefined ? { body: init.body as Record<string, unknown> } : {}),
  });

  if (!error) return data as T;

  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    // Gateway 404 without our error envelope = function not deployed.
    if (res.status === 404 && !body?.error) {
      throw new ApiError('Máy chủ chưa sẵn sàng.', 'FUNCTION_UNAVAILABLE', 404);
    }
    throw new ApiError(
      body?.error?.message ?? 'Máy chủ đang bận, ba mẹ vui lòng thử lại sau.',
      body?.error?.code ?? 'INTERNAL',
      res.status,
      body?.error?.field,
    );
  }
  if (error instanceof FunctionsRelayError) {
    throw new ApiError('Máy chủ chưa sẵn sàng.', 'FUNCTION_UNAVAILABLE');
  }
  if (error instanceof FunctionsFetchError) {
    throw new ApiError('Mất kết nối mạng. Ba mẹ kiểm tra Internet rồi thử lại nhé.', 'NETWORK');
  }
  throw new ApiError('Đã có lỗi xảy ra, vui lòng thử lại.', 'INTERNAL');
}
