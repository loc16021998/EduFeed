import { BookOpen } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import Button from '@/components/Button';
import { ROLE_LABEL, type OnboardingRole } from '@/config/onboardingSlides';
import { useStaffStore } from '@/store';
import { useRoleOnboardingStore } from '@/store/onboardingStore';
import { COLORS } from '@/utils/constants';

const ROLES: OnboardingRole[] = ['PARENT', 'TEACHER', 'ADVISOR'];

/**
 * "Xem lại hướng dẫn sử dụng": replays the signed-in user's walkthrough. Owners / managers (isAdmin) can
 * preview every role's guide — handy when training new staff or showing parents at the front desk.
 */
export default function ReplayGuideCard() {
  const currentRole = useRoleOnboardingStore((s) => s.currentRole);
  const replay = useRoleOnboardingStore((s) => s.resetOnboardingForPreview);
  const isAdmin = useStaffStore((s) => s.isAdmin);
  const own: OnboardingRole = currentRole ?? 'PARENT';

  return (
    <View className="gap-3 rounded-3xl bg-white p-4" testID="replay-guide">
      <View className="flex-row items-center gap-2">
        <BookOpen size={18} color={COLORS.ink} />
        <Text className="flex-1 text-[14px] font-bold text-ink">Hướng dẫn sử dụng</Text>
      </View>
      {isAdmin ? (
        <>
          <Text className="text-[13px] leading-[19px] text-ink-muted">Xem hướng dẫn mà từng vai trò thấy khi đăng nhập lần đầu.</Text>
          <View className="flex-row flex-wrap gap-2">
            {ROLES.map((r) => (
              <Pressable
                key={r}
                onPress={() => replay(r)}
                accessibilityRole="button"
                className="min-h-12 justify-center rounded-full border border-slate-200 px-4 active:bg-slate-50"
                testID={`replay-${r}`}
              >
                <Text className="text-[14px] font-semibold text-ink">{ROLE_LABEL[r]}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <Button title="Xem lại hướng dẫn sử dụng" variant="outline" onPress={() => replay(own)} testID="replay-own" />
      )}
    </View>
  );
}
