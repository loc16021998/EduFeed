import { Bell, BellOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { StatusBanner } from '@/components/ux';
import { DEFAULT_NOTIFICATION_PREFS, fetchNotificationPrefs, push, saveNotificationPrefs, type NotificationPrefs } from '@/services/pushNotificationService';
import { useParentStore, useStaffStore } from '@/store';
import { COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';

type Key = keyof NotificationPrefs;

const ROWS: { key: Key; title: string; parent: string; staff: string }[] = [
  { key: 'allowClassUpdates', title: 'Cập nhật lớp học', parent: 'Sổ liên lạc, ảnh bài vở, bé đã đến lớp', staff: 'Phụ huynh báo nghỉ / xin học bù' },
  { key: 'allowRemindersAndBilling', title: 'Nhắc lịch & học phí', parent: 'Lịch học, học phí sắp đến hạn', staff: 'Sắp tới giờ dạy, khách mới đăng ký, lịch học thử cần xác nhận' },
  { key: 'allowPromotionsAndStreaks', title: 'Ưu đãi & thử thách', parent: 'Thử thách 21 ngày cùng con, quà và ưu đãi học phí', staff: 'Tin ưu đãi của trung tâm' },
  { key: 'quietHoursEnabled', title: 'Giờ yên tĩnh (21:00 – 07:00)', parent: 'Tin ưu đãi chờ đến sáng; tin về bé vẫn đến ngay', staff: 'Tin ưu đãi chờ đến sáng; nhắc lịch vẫn đến ngay' },
];

/** "Cài đặt thông báo": 4 switches saved to notification_preferences (per account, all devices). */
export default function NotificationSettingsCard() {
  const staffIn = useStaffStore((s) => s.status === 'signedIn' && s.isStaff);
  const parentIn = useParentStore((s) => s.status === 'signedIn');
  const signedIn = staffIn || parentIn;
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<Key | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    fetchNotificationPrefs()
      .then((p) => alive && (setPrefs(p), setLoaded(true)))
      .catch((e) => alive && (setError(e instanceof Error ? e.message : 'Không tải được cài đặt'), setLoaded(true)));
    return () => {
      alive = false;
    };
  }, [signedIn]);

  const toggle = async (key: Key, value: boolean) => {
    const before = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next); // optimistic
    setSaving(key);
    setError(null);
    haptics.light();
    try {
      await saveNotificationPrefs(next);
    } catch (e) {
      setPrefs(before);
      setError(e instanceof Error ? e.message : 'Chưa lưu được, thử lại sau');
    } finally {
      setSaving(null);
    }
  };

  const allOff = !prefs.allowClassUpdates && !prefs.allowRemindersAndBilling && !prefs.allowPromotionsAndStreaks;

  return (
    <View className="gap-3 rounded-3xl bg-white p-4" testID="notification-settings">
      <View className="flex-row items-center gap-2">
        {allOff ? <BellOff size={18} color={COLORS.ink} /> : <Bell size={18} color={COLORS.ink} />}
        <Text className="flex-1 text-[14px] font-bold text-ink">Cài đặt thông báo</Text>
      </View>
      {!push.available && (
        <Text className="text-[13px] leading-[19px] text-ink-muted" testID="push-status">
          {push.reason}
        </Text>
      )}
      {!signedIn ? (
        <Text className="text-[13px] leading-[19px] text-ink-muted">Đăng nhập (sổ liên lạc hoặc tài khoản giáo viên) để chọn loại thông báo muốn nhận.</Text>
      ) : (
        <>
          {!!error && <StatusBanner tone="error" text={error} onDismiss={() => setError(null)} />}
          {ROWS.map((r) => (
            <View key={r.key} className="min-h-14 flex-row items-center gap-3 border-t border-slate-100 pt-3" testID={`pref-${r.key}`}>
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-ink">{r.title}</Text>
                <Text className="text-[13px] leading-[18px] text-ink-muted">{staffIn ? r.staff : r.parent}</Text>
              </View>
              <Switch
                value={prefs[r.key]}
                onValueChange={(v) => toggle(r.key, v)}
                disabled={!loaded || saving !== null || (r.key === 'quietHoursEnabled' && !prefs.allowPromotionsAndStreaks)}
                trackColor={{ true: COLORS.brand, false: '#CBD5E1' }}
                thumbColor="#FFFFFF"
                accessibilityLabel={r.title}
                testID={`switch-${r.key}`}
              />
            </View>
          ))}
          {allOff && <Text className="text-xs leading-[17px] text-amber-700">Ba mẹ / thầy cô sẽ không nhận thông báo nào. Có thể bật lại bất cứ lúc nào.</Text>}
        </>
      )}
    </View>
  );
}
