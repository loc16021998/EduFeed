/**
 * Daily lifecycle job (09:00 Vietnam time, pg_cron → POST /api/cron/lifecycle).
 * Also run right after a teacher completes a course (only that enrollment), so the certificate arrives at once.
 *
 * Per due follow-up:  lifecycle_context → (T+14: lifecycle_flag_advisor) → plan
 *                     → lifecycle_claim (atomic; a lost claim = another run has it) → send → lifecycle_finish
 * Failures are retried on later runs, at most 3 attempts. Dependencies are injected for tests.
 */
import { planLifecycleDelivery, type LifecycleConfig, type LifecycleContext, type LifecyclePlan, type LifecycleStage } from './lifecycleMessages.ts';
import type { SendResult } from './znsService.ts';

export interface LifecycleDeps {
  /** Service-role database RPC. Must throw on error. */
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<T>;
  send: (plan: Exclude<LifecyclePlan, { skip: string }>) => Promise<SendResult>;
  now: () => Date;
}

export interface LifecycleSummary {
  startedAt: string;
  due: number;
  sent: number;
  failed: number;
  skipped: number;
  alreadyHandled: number;
  flaggedForAdvisor: number;
  errors: string[];
  truncated: boolean;
  /** Not run: outside 07:00–20:59 Vietnam time (promotional messages). */
  quietHours?: boolean;
}

const vnHour = (d: Date) => new Date(d.getTime() + 7 * 3600_000).getUTCHours();

export async function runLifecycleTick(
  deps: LifecycleDeps,
  cfg: LifecycleConfig,
  { limit = 50, budgetMs = 100_000, enrollmentId }: { limit?: number; budgetMs?: number; enrollmentId?: string } = {},
): Promise<LifecycleSummary> {
  const start = deps.now();
  const summary: LifecycleSummary = {
    startedAt: start.toISOString(), due: 0, sent: 0, failed: 0, skipped: 0, alreadyHandled: 0, flaggedForAdvisor: 0, errors: [], truncated: false,
  };
  const h = vnHour(start);
  if (h < 7 || h > 20) return { ...summary, quietHours: true };

  const due = await deps.rpc<{ automation_id: string; enrollment_id: string; stage: LifecycleStage }[]>('lifecycle_due', {
    p_now: start.toISOString(),
    p_limit: limit,
    p_enrollment_id: enrollmentId ?? null,
  });
  summary.due = due.length;

  for (const item of due) {
    if (deps.now().getTime() - start.getTime() > budgetMs) {
      summary.truncated = true;
      break;
    }
    try {
      const ctx = await deps.rpc<LifecycleContext | null>('lifecycle_context', { p_automation_id: item.automation_id });
      if (!ctx) continue;

      // T+14: the advisor call list does not depend on whether the message can be delivered.
      if (item.stage === 'FINAL_CALL') {
        await deps.rpc('lifecycle_flag_advisor', { p_enrollment_id: item.enrollment_id });
        summary.flaggedForAdvisor++;
      }

      const plan = planLifecycleDelivery(ctx, cfg, start);
      const claimed = await deps.rpc<boolean>('lifecycle_claim', {
        p_automation_id: item.automation_id,
        p_channel: 'skip' in plan ? null : plan.channel,
      });
      if (!claimed) {
        summary.alreadyHandled++;
        continue;
      }
      if ('skip' in plan) {
        await deps.rpc('lifecycle_finish', { p_automation_id: item.automation_id, p_status: 'SKIPPED', p_provider_id: null, p_error: plan.skip });
        summary.skipped++;
        continue;
      }

      let result: SendResult;
      try {
        result = await deps.send(plan);
      } catch (e) {
        result = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      await deps.rpc('lifecycle_finish', {
        p_automation_id: item.automation_id,
        p_status: result.ok ? 'SENT' : 'FAILED',
        p_provider_id: result.providerMessageId ?? null,
        p_error: result.error ?? null,
      });
      if (result.ok) summary.sent++;
      else {
        summary.failed++;
        summary.errors.push(`${item.stage} ${item.automation_id}: ${result.error}`);
      }
    } catch (e) {
      summary.failed++;
      summary.errors.push(`${item.stage} ${item.automation_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return summary;
}
