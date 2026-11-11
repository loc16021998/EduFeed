// Web media picker — browser file input. Native: mediaPicker.ts.
import type { PickedMedia } from '@/types';

/** The browser can draw a video frame onto a canvas → automatic cover image. */
export const canCaptureFrame = true;

function chooseFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    const done = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

function readDuration(uri: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? Math.round(v.duration) : undefined);
    v.onerror = () => resolve(undefined);
    v.src = uri;
  });
}

const fromFile = (file: File, uri = URL.createObjectURL(file)): PickedMedia => ({
  uri,
  name: file.name,
  type: file.type || 'application/octet-stream',
  size: file.size,
  file,
});

export async function pickVideo(): Promise<PickedMedia | null> {
  const file = await chooseFile('video/mp4,video/quicktime,video/webm');
  if (!file) return null;
  const media = fromFile(file);
  media.durationSec = await readDuration(media.uri);
  return media;
}

export async function pickImage(): Promise<PickedMedia | null> {
  const file = await chooseFile('image/jpeg,image/png,image/webp');
  return file ? fromFile(file) : null;
}

/** Grab a frame ~1s in (or a third of the way for short clips) as a JPEG cover. */
export function captureVideoFrame(video: PickedMedia): Promise<PickedMedia | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = video.uri;
    v.onloadeddata = () => {
      v.currentTime = Math.min(1, (v.duration || 3) / 3);
    };
    v.onseeked = () => {
      const scale = Math.min(1, 1080 / Math.max(v.videoWidth, 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx || !canvas.width) return resolve(null);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(null);
          const file = new File([blob], `cover-${Date.now()}.jpg`, { type: 'image/jpeg' });
          resolve(fromFile(file));
        },
        'image/jpeg',
        0.85,
      );
    };
    v.onerror = () => resolve(null);
  });
}
