// Web QR scanner: rear camera (getUserMedia) + jsQR on a canvas. Native: QrScanner.tsx.
import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import type { QrScannerProps } from './QrScanner.types';

/** The same code is reported again only after this pause (a child holds the card in view). */
const REPEAT_MS = 2500;

export default function QrScanner({ onCode, paused = false }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const last = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const pausedRef = useRef(paused);
  const onCodeRef = useRef(onCode);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  pausedRef.current = paused;
  onCodeRef.current = onCode;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let lastScan = 0;
    let cancelled = false;

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c || pausedRef.current || v.readyState < 2 || t - lastScan < 150) return;
      lastScan = t;
      const w = Math.min(640, v.videoWidth);
      const h = Math.round((v.videoHeight * w) / v.videoWidth);
      if (!w || !h) return;
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, w, h);
      const hit = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
      if (hit?.data) {
        const now = Date.now();
        if (hit.data !== last.current.code || now - last.current.at > REPEAT_MS) {
          last.current = { code: hit.data, at: now };
          onCodeRef.current(hit.data);
        }
      }
    };

    (async () => {
      if (!window.isSecureContext) return setError('Camera chỉ hoạt động trên trang https. Hãy mở app bằng link https.');
      if (!navigator.mediaDevices?.getUserMedia) return setError('Trình duyệt không hỗ trợ camera. Dùng điểm danh trong danh sách bên dưới.');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (cancelled) return stream.getTracks().forEach((tr) => tr.stop());
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play().catch(() => {});
        setReady(true);
        raf = requestAnimationFrame(tick);
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setError(name === 'NotAllowedError' ? 'Chưa cho phép dùng camera. Bấm vào biểu tượng ổ khóa trên thanh địa chỉ để cho phép, rồi mở lại.' : 'Không mở được camera. Dùng điểm danh trong danh sách bên dưới.');
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  return (
    <View className="overflow-hidden rounded-3xl bg-black" style={{ aspectRatio: 1 }} testID="qr-scanner">
      {error ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-center text-[13px] leading-5 text-white">{error}</Text>
        </View>
      ) : (
        <>
          <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {/* Aiming frame */}
          <View pointerEvents="none" style={{ position: 'absolute', top: '18%', left: '18%', right: '18%', bottom: '18%', borderWidth: 3, borderColor: paused ? 'rgba(255,255,255,0.35)' : '#22C55E', borderRadius: 24 }} />
          {!ready && (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 16 }}>
              <Text className="text-center text-xs text-white/80">Đang mở camera…</Text>
            </View>
          )}
        </>
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </View>
  );
}
