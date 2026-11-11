import { Heart, Map, MessageSquareQuote } from 'lucide-react-native';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';

import { SampleDataTag, ScreenHeader, StickyCta, TrustBadges } from '@/components';
import type { RootStackScreenProps } from '@/navigation/types';
import { useTrustStore } from '@/store/useTrustStore';
import type { Testimonial } from '@/types';
import { COLORS } from '@/utils/constants';

import ChecklistEntryCard from './components/ChecklistEntryCard';
import CurriculumAccordion from './components/CurriculumAccordion';
import MediaViewer from './components/MediaViewer';
import { LetterCard, VideoTestimonialCard } from './components/TestimonialCards';

/** "Góc Phụ huynh" — reviews, handwritten letters, transparent curriculum, parent tools. */
export default function TestimonialsScreen({ navigation, route }: RootStackScreenProps<'Testimonials'>) {
  const { data: testimonials, origin } = useTrustStore((s) => s.testimonials);
  const loadTestimonials = useTrustStore((s) => s.loadTestimonials);
  const [viewing, setViewing] = useState<Testimonial | null>(null);

  useEffect(() => {
    loadTestimonials();
  }, [loadTestimonials]);

  const videos = useMemo(() => testimonials.filter((t) => t.kind === 'VIDEO'), [testimonials]);
  const letters = useMemo(() => testimonials.filter((t) => t.kind !== 'VIDEO'), [testimonials]);
  const letterRows = useMemo(() => {
    const rows: Testimonial[][] = [];
    for (let i = 0; i < letters.length; i += 2) rows.push(letters.slice(i, i + 2));
    return rows;
  }, [letters]);

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Góc Phụ huynh" onBack={() => navigation.goBack()} />

      <ScrollView className="flex-1" contentContainerClassName="gap-6 pb-8 pt-1">
        <View className="px-4">
          <TrustBadges />
        </View>

        {/* Video testimonials */}
        <Section
          icon={<MessageSquareQuote size={18} color={COLORS.brand} />}
          title="Phụ huynh nói gì về TH EDU"
          right={<SampleDataTag origin={origin} />}
        >
          {videos.length ? (
            <FlatList
              horizontal
              data={videos}
              keyExtractor={(t) => t.id}
              renderItem={({ item }) => <VideoTestimonialCard item={item} onPress={setViewing} />}
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-3 px-4"
            />
          ) : (
            <Empty text="Video cảm nhận đang được cập nhật." />
          )}
        </Section>

        {/* Letters & notebooks */}
        <Section icon={<Heart size={18} color="#EC4899" />} title="Thư cảm ơn & vở của các con">
          {letterRows.length ? (
            <View className="gap-3 px-4">
              {letterRows.map((row) => (
                <View key={row[0].id} className="flex-row gap-3">
                  {row.map((t) => (
                    <LetterCard key={t.id} item={t} onPress={setViewing} />
                  ))}
                  {row.length === 1 && <View className="flex-1" />}
                </View>
              ))}
            </View>
          ) : (
            <Empty text="Ảnh thư tay và vở của các con đang được cập nhật." />
          )}
        </Section>

        {/* Transparent curriculum */}
        <Section icon={<Map size={18} color="#10B981" />} title="Lộ trình học minh bạch – từng tuần">
          <View className="px-4">
            <CurriculumAccordion initialCourse={route.params?.course} />
          </View>
        </Section>

        <View className="px-4">
          <ChecklistEntryCard checklistId="vao-lop-1" />
        </View>
      </ScrollView>

      <StickyCta
        title="📅 Đặt lịch học thử miễn phí"
        subtitle="Ba mẹ dự giờ cùng con · Không ràng buộc đăng ký"
        onPress={() => navigation.navigate('MainTabs', { screen: 'Booking', params: { course: route.params?.course } })}
      />

      <MediaViewer item={viewing} onClose={() => setViewing(null)} />
    </View>
  );
}

function Section({ icon, title, right, children }: { icon: ReactNode; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2 px-4">
        {icon}
        <Text className="flex-1 text-[16px] font-bold text-ink" accessibilityRole="header">
          {title}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View className="mx-4 items-center rounded-2xl border border-dashed border-slate-300 p-5">
      <Text className="text-center text-[13px] text-ink-muted">{text}</Text>
    </View>
  );
}
