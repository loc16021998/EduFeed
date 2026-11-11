/**
 * CRM message orchestration: T+0 confirmation, the 15-minute reminder tick, and post-trial messages.
 *
 * Every send follows the same safe sequence:
 *   crm_lead_context → planDelivery → crm_claim_message (PENDING, unique per lead+kind)
 *   → send → crm_finish_message (SENT advances the lead status / FAILED allows a retry, max 3)
 * The claim is what prevents double sends when cron runs overlap or a request is retried.
 *
 * Dependencies are injected (database RPC + sender + clock) so this runs unchanged in the
 * Edge Function and in unit tests.
 */
import { planDelivery, type CrmMessageKind, type DeliveryPlan, type LeadContext, type MessagingConfig, type SendResult } from './znsService.ts';

export interface CrmDeps {
  /** Service-role database RPC. Must throw on error. */
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<T>;
  send: (plan: Exclude<DeliveryPlan, { skip: string }>) => Promise<SendResult>;
  now: () => Date;
}

export type SendOutcome = 'SENT' | 'FAILED' | 'SKIPPED' | 'ALREADY_HANDLED' | 'LEAD_NOT_FOUND';

export async function sendCrmMessage(
  deps: CrmDeps,
  cfg: MessagingConfig,
  leadId: string,
  kind: CrmMessageKind,
): Promise<{ outcome: SendOutcome; detail?: string }> {
  const ctx = await deps.rpc<LeadContext | null>('crm_lead_context', { p_lead_id: leadId });
  if (!ctx) return { outcome: 'LEAD_NOT_FOUND' };

  const plan = planDelivery(kind, ctx, cfg);
  if ('skip' in plan) {
    await deps.rpc('crm_skip_message', { p_lead_id: leadId, p_kind: kind, p_reason: plan.skip });
    return { outcome: 'SKIPPED', detail: plan.skip };
  }

  const logId = await deps.rpc<string | null>('crm_claim_message', {
    p_lead_id: leadId,
    p_kind: kind,
    p_channel: plan.channel,
    p_payload: plan.payload,
  });
  if (!logId) return { outcome: 'ALREADY_HANDLED' };

  let result: SendResult;
  try {
    result = await deps.send(plan);
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  await deps.rpc('crm_finish_message', {
    p_log_id: logId,
    p_status: result.ok ? 'SENT' : 'FAILED',
    p_provider_id: result.providerMessageId ?? null,
    p_error: result.error ?? null,
  });
  return { outcome: result.ok ? 'SENT' : 'FAILED', detail: result.error };
}

export interface TickSummary {
  startedAt: string;
  due: number;
  sent: number;
  failed: number;
  skipped: number;
  alreadyHandled: number;
  errors: string[];
  /** True if the run stopped early to stay within the function's time limit. */
  truncated: boolean;
}

/**
 * One scheduler tick (every 15 minutes): send everything `crm_due_messages()` reports.
 * Sequential on purpose (Zalo rate limits); stops after `budgetMs` and leaves the rest for the next tick.
 */
export async function runReminderTick(
  deps: CrmDeps,
  cfg: MessagingConfig,
  { limit = 50, budgetMs = 100_000 }: { limit?: number; budgetMs?: number } = {},
): Promise<TickSummary> {
  const start = deps.now();
  const summary: TickSummary = { startedAt: start.toISOString(), due: 0, sent: 0, failed: 0, skipped: 0, alreadyHandled: 0, errors: [], truncated: false };

  const due = await deps.rpc<{ lead_id: string; kind: CrmMessageKind }[]>('crm_due_messages', {
    p_now: start.toISOString(),
    p_limit: limit,
  });
  summary.due = due.length;

  for (const item of due) {
    if (deps.now().getTime() - start.getTime() > budgetMs) {
      summary.truncated = true;
      break;
    }
    try {
      const { outcome, detail } = await sendCrmMessage(deps, cfg, item.lead_id, item.kind);
      if (outcome === 'SENT') summary.sent++;
      else if (outcome === 'FAILED') {
        summary.failed++;
        summary.errors.push(`${item.kind} ${item.lead_id}: ${detail}`);
      } else if (outcome === 'SKIPPED') summary.skipped++;
      else summary.alreadyHandled++;
    } catch (e) {
      // A database error for one lead must not stop the others.
      summary.failed++;
      summary.errors.push(`${item.kind} ${item.lead_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return summary;
}
