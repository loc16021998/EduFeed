import { Camera, Lock, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import Avatar from '@/components/Avatar';
import Button from '@/components/Button';
import { StatusBanner } from '@/components/ux';
import FormField from '@/screens/Booking/components/FormField';
import { requestAccountDeletion, updateMyProfile, validateDisplayName, type MyAccount } from '@/services/account';
import { COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';

import { SettingsSheet } from './SettingsSection';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Không thực hiện được, vui lòng thử lại.');

// ─── Edit profile ───────────────────────────────────────────────────────────

export function EditProfileSheet({ visible, account, onClose, onSaved, onChangeAvatar, avatarBusy }: {
  visible: boolean;
  account: MyAccount;
  onClose: () => void;
  onSaved: (a: MyAccount) => void;
  onChangeAvatar: () => void;
  avatarBusy?: boolean;
}) {
  const [name, setName] = useState(account.fullName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visible) {
      setName(account.fullName);
      setError(null);
    }
  }, [visible, account.fullName]);

  const save = async () => {
    const bad = validateDisplayName(name);
    if (bad) return setError(bad);
    setBusy(true);
    try {
      const a = await updateMyProfile(name, account.avatarUrl);
      haptics.success();
      onSaved(a);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const staff = account.role !== 'PARENT';
  return (
    <SettingsSheet visible={visible} title="Chỉnh sửa hồ sơ" onClose={onClose} testID="edit-profile-sheet">
      <View className="flex-row items-center gap-3">
        <Avatar uri={account.avatarUrl ?? undefined} name={name || account.fullName} size={56} />
        <View className="flex-1">
          <Button title={account.avatarUrl ? 'Đổi ảnh đại diện' : 'Thêm ảnh đại diện'} variant="outline" size="sm" loading={avatarBusy} icon={<Camera size={16} color={COLORS.brand} />} onPress={onChangeAvatar} testID="sheet-avatar" />
        </View>
      </View>
      <FormField
        label={staff ? 'Tên hiển thị (phụ huynh thấy tên này)' : 'Họ tên ba mẹ'}
        value={name}
        onChangeText={(t) => {
          setName(t);
          setError(null);
        }}
        maxLength={60}
        placeholder={staff ? 'VD: Cô Hường' : 'VD: Trần Thị Lan'}
        error={error ?? undefined}
        testID="profile-name-input"
      />
      <View className="gap-1 rounded-2xl bg-slate-50 p-3">
        <Text className="text-[13px] font-semibold text-ink">{staff ? 'Email đăng nhập' : 'Số điện thoại đăng nhập'}</Text>
        <Text className="text-[13px] text-ink-muted">{staff ? account.email ?? '—' : account.phone ?? '—'}</Text>
        <Text className="text-xs leading-[17px] text-ink-subtle">
          {staff ? 'Đổi email / vai trò / cơ sở: nhờ quản trị viên trong mục Tài khoản nhân viên.' : 'Muốn đổi số điện thoại, ba mẹ nhắn Zalo OA hoặc gọi hotline để trung tâm xác minh.'}
        </Text>
      </View>
      <Button title="Lưu thay đổi" size="lg" loading={busy} onPress={save} testID="save-profile" />
    </SettingsSheet>
  );
}

// ─── Privacy ────────────────────────────────────────────────────────────────

const PRIVACY: { title: string; body: string }[] = [
  { title: 'Ảnh và bài vở của bé', body: 'Lưu trong kho riêng tư, chỉ ba mẹ có liên kết với bé và giáo viên của lớp xem được. Mỗi đường dẫn ảnh chỉ mở được trong 1 giờ, không thể chia sẻ lan truyền.' },
  { title: 'Số điện thoại của ba mẹ', body: 'Chỉ trung tâm (tư vấn viên, giáo viên được giao) thấy để liên hệ. Ở Cộng đồng và bình luận, ba mẹ hiện là "Mẹ/Bố + tên bé", không bao giờ hiện số điện thoại.' },
  { title: 'Phân quyền theo vai trò', body: 'Cơ sở dữ liệu kiểm tra quyền ở từng dòng dữ liệu (Row Level Security): giáo viên chỉ thấy học viên lớp mình, tư vấn viên chỉ thấy khách được giao và cơ sở của mình.' },
  { title: 'Thông báo và Zalo', body: 'Chỉ gửi tin liên quan đến bé và lịch học. Tin ưu đãi có thể tắt bất cứ lúc nào, và luôn chờ sau giờ yên tĩnh.' },
  { title: 'Quyền của ba mẹ', body: 'Ba mẹ có thể sửa thông tin, tắt thông báo, hoặc yêu cầu xoá tài khoản ngay trong ứng dụng. Trung tâm xử lý trong 7 ngày làm việc.' },
];

export function PrivacySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <SettingsSheet visible={visible} title="Bảo mật & quyền riêng tư của bé" onClose={onClose} testID="privacy-sheet">
      <View className="flex-row items-center gap-2 rounded-2xl bg-emerald-50 p-3">
        <ShieldCheck size={18} color="#047857" />
        <Text className="flex-1 text-[13px] leading-[19px] text-emerald-900">TH EDU không bán hay chia sẻ dữ liệu của bé cho bên thứ ba.</Text>
      </View>
      {PRIVACY.map((p) => (
        <View key={p.title} className="gap-1 border-t border-slate-100 pt-3">
          <View className="flex-row items-center gap-1.5">
            <Lock size={14} color={COLORS.brand} />
            <Text className="text-[15px] font-bold text-ink">{p.title}</Text>
          </View>
          <Text className="text-[13px] leading-[20px] text-ink-muted">{p.body}</Text>
        </View>
      ))}
    </SettingsSheet>
  );
}

// ─── Delete account ─────────────────────────────────────────────────────────

export function DeleteAccountSheet({ visible, account, onClose, onDone }: { visible: boolean; account: MyAccount; onClose: () => void; onDone: (a: MyAccount) => void }) {
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visible) {
      setReason('');
      setConfirm('');
      setError(null);
    }
  }, [visible]);

  const ready = confirm.trim().toUpperCase() === 'XOA' || confirm.trim().toUpperCase() === 'XOÁ';
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const a = await requestAccountDeletion(reason);
      haptics.success();
      onDone(a);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const parent = account.role === 'PARENT';
  return (
    <SettingsSheet visible={visible} title="Yêu cầu xoá tài khoản" onClose={onClose} testID="delete-sheet">
      <View className="gap-2 rounded-2xl bg-red-50 p-3">
        <View className="flex-row items-center gap-1.5">
          <Trash2 size={16} color="#B91C1C" />
          <Text className="text-[14px] font-bold text-red-800">Sau khi trung tâm xác nhận:</Text>
        </View>
        {(parent
          ? ['Tài khoản không đăng nhập được nữa', 'Ảnh đại diện và liên kết Zalo bị xoá', 'Không nhận thông báo, nhắc lịch và ưu đãi', 'Kết quả học tập của bé được trung tâm lưu theo quy định']
          : ['Tài khoản nhân viên bị khoá', 'Lớp và khách hàng được giao cho người khác', 'Không nhận thông báo nội bộ']
        ).map((t) => (
          <Text key={t} className="text-[13px] leading-[19px] text-red-900">
            • {t}
          </Text>
        ))}
      </View>
      <View className="gap-1.5">
        <Text className="text-[13px] font-semibold text-ink-muted">Lý do (không bắt buộc)</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          maxLength={500}
          multiline
          placeholder="Giúp trung tâm làm tốt hơn…"
          placeholderTextColor={COLORS.subtle}
          accessibilityLabel="Lý do xoá tài khoản"
          className="min-h-[88px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-ink"
          style={{ textAlignVertical: 'top' }}
          testID="delete-reason"
        />
      </View>
      <FormField label='Gõ "XOA" để xác nhận' value={confirm} onChangeText={setConfirm} autoCapitalize="characters" maxLength={6} testID="delete-confirm" />
      {!!error && <StatusBanner tone="error" text={error} onDismiss={() => setError(null)} />}
      <Button title="Gửi yêu cầu xoá tài khoản" size="lg" disabled={!ready} loading={busy} onPress={send} testID="delete-send" />
      <Text className="text-center text-xs leading-[17px] text-ink-subtle">Trung tâm sẽ gọi xác nhận trong 7 ngày làm việc. Ba mẹ có thể huỷ yêu cầu trước khi được xử lý.</Text>
    </SettingsSheet>
  );
}
