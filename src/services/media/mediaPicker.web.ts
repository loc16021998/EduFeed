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

// ─── Notebook photo (AI check) ──────────────────────────────────────────────

export interface NotebookPhoto {
  /** Preview URI. */
  uri: string;
  /** JPEG, base64 without the data: prefix. */
  base64: string;
  mediaType: 'image/jpeg';
}

/** Camera (phones open the rear camera via `capture`) or library → resized to ≤1600 px, JPEG 0.85. */
export async function pickNotebookPhoto(source: 'camera' | 'library'): Promise<NotebookPhoto | null> {
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (source === 'camera') input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    const done = (f: File | null) => {
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
  if (!file) return null;
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Không đọc được ảnh này. Ba mẹ chọn ảnh JPG/PNG khác nhé.'));
      i.src = src;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Trình duyệt không xử lý được ảnh');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { uri: dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(src);
  }
}

// ─── Short voice clip (Classroom Flash) ─────────────────────────────────────

export const canRecordAudio =
  typeof window !== 'undefined' && typeof (window as { MediaRecorder?: unknown }).MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export interface AudioRecording {
  stop: () => void;
  /** Resolves with the clip when stopped (or after maxSec). */
  done: Promise<PickedMedia>;
}

/** Record from the microphone; stops by itself after maxSec. */
export async function startAudioRecording(maxSec = 5): Promise<AudioRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
    throw new Error('Chưa được phép dùng micro. Hãy cho phép micro trong trình duyệt rồi thử lại.');
  });
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  const started = Date.now();
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<PickedMedia>((resolve, reject) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
      const blob = new Blob(chunks, { type });
      if (!blob.size) return reject(new Error('Không ghi được âm thanh, thử lại nhé.'));
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([blob], `voice-${Date.now()}.${ext}`, { type });
      resolve({ ...fromFile(file), type, durationSec: Math.min(maxSec, Math.round(((Date.now() - started) / 1000) * 10) / 10) });
    };
  });
  rec.start();
  const timer = setTimeout(() => rec.state !== 'inactive' && rec.stop(), maxSec * 1000);
  return {
    stop: () => {
      clearTimeout(timer);
      if (rec.state !== 'inactive') rec.stop();
    },
    done,
  };
}
