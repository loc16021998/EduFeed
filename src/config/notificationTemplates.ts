// Same templates as the server (Edge Function) — one source of truth for copy, channels and routing.
export {
  ANDROID_CHANNELS,
  TEMPLATES,
  campusName,
  isPushEvent,
  maskPhone,
  renderPush,
  type AndroidChannelDef,
  type PushCategory,
  type PushData,
  type PushEvent,
  type PushRole,
  type PushRoute,
} from '../../supabase/functions/_shared/notificationTemplates';
