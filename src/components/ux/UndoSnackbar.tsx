import { Undo2 } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import type { PendingUndo } from './useUndoAction';

export interface UndoSnackbarProps {
  pending: PendingUndo | null;
  onUndo: () => void;
  /** Distance from the bottom edge (e.g. above a ThumbBar). */
  bottom?: number;
}

/** Dark pill in the thumb zone: "Đã hủy lịch · Hoàn tác". Pair with useUndoAction. */
export default function UndoSnackbar({ pending, onUndo, bottom = 16 }: UndoSnackbarProps) {
  if (!pending) return null;
  return (
    <View pointerEvents="box-none" className="absolute left-0 right-0 px-4" style={{ bottom }}>
      <View
        className="min-h-14 flex-row items-center gap-3 rounded-2xl bg-slate-900 py-1.5 pl-4 pr-1.5 shadow-lg"
        accessibilityLiveRegion="polite"
        testID="undo-snackbar"
      >
        <Text className="flex-1 text-[14px] font-semibold leading-5 text-white">{pending.message}</Text>
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityLabel="Hoàn tác"
          className="min-h-12 flex-row items-center gap-1.5 rounded-xl bg-white/10 px-3.5 active:bg-white/20"
          testID="undo-button"
        >
          <Undo2 size={17} color="#FDE68A" />
          <Text className="text-[14px] font-extrabold text-amber-200">Hoàn tác</Text>
        </Pressable>
      </View>
    </View>
  );
}
