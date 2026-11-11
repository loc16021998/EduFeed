/**
 * Upload to Supabase Storage with progress. supabase-js' upload() has no progress callback,
 * so this talks to the Storage REST endpoint with XMLHttpRequest (works on web and native).
 */
import { ENV } from '@/config/env';
import { supabase } from '@/lib/supabase';
import type { PickedMedia } from '@/types';

export const MEDIA_BUCKET = 'feed-media';

/** Keep in sync with the project's Storage upload limit (50 MB on the Supabase Free plan). */
export const MAX_VIDEO_MB = 50;
export const MAX_IMAGE_MB = 5;

export const publicMediaUrl = (path: string) => `${ENV.supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;

const ERROR_VI: [RegExp, string][] = [
  [/exceeded the maximum allowed size|Payload too large|413/i, `File quá lớn. Video tối đa ${MAX_VIDEO_MB} MB — hãy xuất video 720p hoặc cắt ngắn lại.`],
  [/mime type|not supported/i, 'Định dạng file không được hỗ trợ (video: MP4/MOV/WEBM, ảnh: JPG/PNG/WEBP).'],
  [/row-level security|Unauthorized|403|401/i, 'Tài khoản không có quyền đăng video. Liên hệ quản trị để được cấp quyền.'],
];

function friendlyError(raw: string): string {
  return ERROR_VI.find(([re]) => re.test(raw))?.[1] ?? 'Tải file lên thất bại. Kiểm tra mạng rồi thử lại.';
}

export async function uploadMedia(path: string, media: PickedMedia, onProgress?: (fraction: number) => void): Promise<string> {
  if (!supabase) throw new Error('Chưa kết nối máy chủ');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');

  const form = new FormData();
  form.append('cacheControl', '31536000');
  if (media.file) {
    form.append('', media.file, media.name);
  } else {
    // React Native's FormData accepts { uri, name, type } for local files.
    form.append('', { uri: media.uri, name: media.name, type: media.type } as unknown as Blob);
  }

  const url = `${ENV.supabaseUrl}/storage/v1/object/${MEDIA_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', ENV.supabaseAnonKey);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new Error(friendlyError(`${xhr.status} ${xhr.responseText}`)));
      }
    };
    xhr.onerror = () => reject(new Error('Mất kết nối khi tải file. Kiểm tra mạng rồi thử lại.'));
    xhr.send(form);
  });

  return publicMediaUrl(path);
}

export async function removeMedia(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p);
  if (!supabase || list.length === 0) return;
  await supabase.storage.from(MEDIA_BUCKET).remove(list);
}

/** Validate a picked file before uploading. Returns an error message or null. */
export function checkMedia(media: PickedMedia, kind: 'video' | 'image'): string | null {
  const okTypes = kind === 'video' ? /^video\/(mp4|quicktime|webm)$/ : /^image\/(jpeg|png|webp)$/;
  if (media.type && !okTypes.test(media.type)) {
    return kind === 'video' ? 'Chỉ hỗ trợ video MP4, MOV hoặc WEBM.' : 'Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.';
  }
  const maxMb = kind === 'video' ? MAX_VIDEO_MB : MAX_IMAGE_MB;
  if (media.size > maxMb * 1024 * 1024) {
    return kind === 'video'
      ? `Video ${(media.size / 1048576).toFixed(0)} MB vượt giới hạn ${MAX_VIDEO_MB} MB. Hãy xuất lại ở 720p hoặc cắt ngắn.`
      : `Ảnh vượt giới hạn ${MAX_IMAGE_MB} MB.`;
  }
  return null;
}
