import { useNavigation } from '@react-navigation/native';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { checklistItemCount, getChecklist } from '@/content/checklists';
import { useChecklistStore } from '@/store/useChecklistStore';
import { COLORS } from '@/utils/constants';

/** Entry point to an interactive parent checklist, showing saved progress. */
export default function ChecklistEntryCard({ checklistId }: { checklistId: string }) {
  const navigation = useNavigation();
  const checklist = getChecklist(checklistId);
  const done = useChecklistStore((s) => s.checked[checklistId]?.length ?? 0);
  if (!checklist) return null;

  const total = checklistItemCount(checklist);
  const pct = Math.round((done / total) * 100);

  return (
    <Pressable
      onPress={() => navigation.navigate('Checklist', { id: checklistId })}
      accessibilityRole="button"
      accessibilityLabel={`${checklist.title}, đã hoàn thành ${done} trên ${total}`}
      className="gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 active:opacity-90"
    >
      <View className="flex-row items-center gap-3">
        <Text className="text-3xl">{checklist.emoji}</Text>
        <View className="flex-1">
          <Text className="text-[15px] font-bold leading-5 text-ink">{checklist.title}</Text>
          <Text className="text-[12px] text-ink-muted">{done > 0 ? `Đã xong ${done}/${total} việc` : checklist.subtitle}</Text>
        </View>
        <ChevronRight size={20} color={COLORS.muted} />
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-amber-100">
        <View className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
      </View>
    </Pressable>
  );
}
