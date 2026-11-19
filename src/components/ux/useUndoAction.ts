import { useCallback, useEffect, useRef, useState } from 'react';

import { haptics } from '@/utils/haptics';

export interface PendingUndo {
  id: number;
  message: string;
}

interface Entry extends PendingUndo {
  commit: () => unknown;
  onUndo?: () => void;
  onError?: (e: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export const UNDO_MS = 5000;

/**
 * Delayed commit with "Hoàn tác": the action is applied on screen at once but only sent to the
 * server after a few seconds, so an accidental tap can be undone without any server-side undo.
 * Leaving the screen (unmount) sends it right away — nothing is ever silently lost.
 */
export function useUndoAction() {
  const entry = useRef<Entry | null>(null);
  const seq = useRef(0);
  const [pending, setPending] = useState<PendingUndo | null>(null);

  const run = useCallback((e: Entry) => {
    clearTimeout(e.timer);
    if (entry.current === e) entry.current = null;
    Promise.resolve()
      .then(e.commit)
      .catch((err) => e.onError?.(err));
  }, []);

  const flush = useCallback(() => {
    const e = entry.current;
    if (!e) return;
    run(e);
    setPending(null);
  }, [run]);

  const schedule = useCallback(
    (message: string, commit: () => unknown, opts: { onUndo?: () => void; onError?: (e: unknown) => void; ms?: number } = {}) => {
      // Only one undo at a time: an earlier pending action is sent now.
      if (entry.current) run(entry.current);
      const id = ++seq.current;
      const e: Entry = {
        id,
        message,
        commit,
        onUndo: opts.onUndo,
        onError: opts.onError,
        timer: setTimeout(() => {
          if (entry.current?.id !== id) return;
          run(e);
          setPending((p) => (p?.id === id ? null : p));
        }, opts.ms ?? UNDO_MS),
      };
      entry.current = e;
      setPending({ id, message });
    },
    [run],
  );

  const undo = useCallback(() => {
    const e = entry.current;
    if (!e) return;
    clearTimeout(e.timer);
    entry.current = null;
    setPending(null);
    haptics.medium();
    e.onUndo?.();
  }, []);

  // Leaving the screen = the parent meant it: send now.
  useEffect(() => () => {
    if (entry.current) run(entry.current);
  }, [run]);

  return { pending, schedule, undo, flush };
}
