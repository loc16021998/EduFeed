// Native (Android / iOS) media picker — react-native-image-picker. Web: mediaPicker.web.ts.
import { launchCamera, launchImageLibrary, type Asset, type ImageLibraryOptions } from 'react-native-image-picker';

import type { PickedMedia } from '@/types';

/** Native can't grab a frame from a local video without another library; staff pick a cover image. */
export const canCaptureFrame = false;

const toPicked = (a: Asset, fallbackName: string, fallbackType: string): PickedMedia => ({
  uri: a.uri ?? '',
  name: a.fileName ?? fallbackName,
  type: a.type ?? fallbackType,
  size: a.fileSize ?? 0,
  durationSec: a.duration,
});

export async function pickVideo(): Promise<PickedMedia | null> {
  const res = await launchImageLibrary({ mediaType: 'video', selectionLimit: 1, videoQuality: 'high', formatAsMp4: true });
  if (res.didCancel) return null;
  if (res.errorCode) throw new Error(res.errorMessage ?? 'Không mở được thư viện video');
  const asset = res.assets?.[0];
  return asset?.uri ? toPicked(asset, `video-${Date.now()}.mp4`, 'video/mp4') : null;
}

export async function pickImage(): Promise<PickedMedia | null> {
  const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, maxWidth: 1080, maxHeight: 1920, quality: 0.8 });
  if (res.didCancel) return null;
  if (res.errorCode) throw new Error(res.errorMessage ?? 'Không mở được thư viện ảnh');
  const asset = res.assets?.[0];
  return asset?.uri ? toPicked(asset, `cover-${Date.now()}.jpg`, 'image/jpeg') : null;
}

export async function captureVideoFrame(_video: PickedMedia): Promise<PickedMedia | null> {
  return null;
}

// ─── Notebook photo (AI check) ──────────────────────────────────────────────

export interface NotebookPhoto {
  uri: string;
  /** JPEG, base64 without the data: prefix. */
  base64: string;
  mediaType: 'image/jpeg';
}

export async function pickNotebookPhoto(source: 'camera' | 'library'): Promise<NotebookPhoto | null> {
  const opts: ImageLibraryOptions = { mediaType: 'photo', maxWidth: 1600, maxHeight: 1600, quality: 0.8, includeBase64: true };
  const res = source === 'camera' ? await launchCamera({ ...opts, saveToPhotos: false, cameraType: 'back' }) : await launchImageLibrary({ ...opts, selectionLimit: 1 });
  if (res.didCancel) return null;
  if (res.errorCode === 'camera_unavailable') throw new Error('Máy không mở được camera. Ba mẹ chọn ảnh từ thư viện nhé.');
  if (res.errorCode === 'permission') throw new Error('Chưa được phép dùng camera. Hãy cho phép trong Cài đặt rồi thử lại.');
  if (res.errorCode) throw new Error(res.errorMessage ?? 'Không lấy được ảnh');
  const a = res.assets?.[0];
  return a?.uri && a.base64 ? { uri: a.uri, base64: a.base64, mediaType: 'image/jpeg' } : null;
}

// ─── Short voice clip (Classroom Flash) — web only for now (needs a native audio-recorder module) ─────

export const canRecordAudio = false;

export interface AudioRecording {
  stop: () => void;
  done: Promise<PickedMedia>;
}

export async function startAudioRecording(_maxSec = 5): Promise<AudioRecording> {
  throw new Error('Ghi âm hiện chỉ hỗ trợ trên trình duyệt web.');
}
