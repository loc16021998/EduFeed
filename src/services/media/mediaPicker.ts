// Native (Android / iOS) media picker — react-native-image-picker. Web: mediaPicker.web.ts.
import { launchImageLibrary, type Asset } from 'react-native-image-picker';

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
