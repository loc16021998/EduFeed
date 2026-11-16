-- ─────────────────────────────────────────────────────────────────────────────
-- Referral & rewards: a parent shares their code (users.referral_code); a new family books a trial with it;
-- when that family's first tuition invoice is PAID, the referrer earns a tuition voucher.
--
--   referral_program      one row: on/off + amounts. The amounts promised are snapshotted on each referral,
--                         so changing the program never changes what was already promised.
--   referral_rewards      one row per referred family (by phone): PENDING_TRIAL → PENDING_PAYMENT → REWARDED,
--                         or VOID (booking cancelled). REWARDED carries the referrer's voucher (code, amount,
--                         expiry, AVAILABLE / USED).
--   leads.referral_code / referred_by, users.referred_by
--
-- Rules (enforced here, not in the app):
--   • the code must belong to an active parent account and the program must be on;
--   • no self-referral (same phone); only NEW families (no earlier course with us); one referral per family;
--   • the new family's discount is suggested on their first invoice (the admin confirms it);
--   • the reward is created by a trigger when an invoice of the referred family becomes PAID — whichever way
--     it was paid (VietQR / VNPay webhook or confirmed by hand). The Zalo message is sent by the Edge Function.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.referral_program (
  id                    smallint primary key default 1 check (id = 1),
  is_active             boolean not null default true,
  -- Owner-specified offer (TH EDU): 200.000đ voucher for the referrer, 150.000đ off for the new family.
  referrer_reward_vnd   integer not null default 200000 check (referrer_reward_vnd between 0 and 10000000),
  referee_discount_vnd  integer not null default 150000 check (referee_discount_vnd between 0 and 10000000),
  voucher_valid_days    smallint not null default 180 check (voucher_valid_days between 7 and 730),
  updated_by            uuid references auth.users (id) on delete set null,
  updated_at            timestamptz not null default now()
);
insert into public.referral_program (id) values (1) on conflict (id) do nothing;

alter table public.users add column if not exists referred_by uuid references public.users (id) on delete set null;
alter table public.leads
  add column if not exists referral_code text check (referral_code is null or referral_code ~ '^[A-Z0-9]{4,12}$'),
  add column if not exists referred_by uuid references public.users (id) on delete set null;

create table public.referral_rewards (
  id                    uuid primary key default gen_random_uuid(),
  referrer_id           uuid not null references public.users (id) on delete cascade,
  -- The new family: their booking, phone, and parent account once they have one.
  referee_id            uuid references public.users (id) on delete set null,
  referee_lead_id       uuid unique references public.leads (id) on delete set null,
  referee_phone         text not null check (referee_phone ~ '^0[35789][0-9]{8}$'),
  referee_name          text not null,
  status                text not null default 'PENDING_TRIAL' check (status in ('PENDING_TRIAL', 'PENDING_PAYMENT', 'REWARDED', 'VOID')),
  void_reason           text,
  -- Promised at booking time (program snapshot).
  promised_reward_vnd   integer not null check (promised_reward_vnd >= 0),
  referee_discount_vnd  integer not null check (referee_discount_vnd >= 0),
  voucher_valid_days    smallint not null,
  -- Set when REWARDED.
  reward_amount         numeric(12, 0),
  invoice_id            uuid references public.tuition_invoices (id) on delete set null,
  rewarded_at           timestamptz,
  voucher_code          text unique,
  voucher_status        text check (voucher_status is null or voucher_status in ('AVAILABLE', 'USED')),
  voucher_expires_at    timestamptz,
  voucher_used_at       timestamptz,
  voucher_invoice_id    uuid references public.tuition_invoices (id) on delete set null,
  notified_at           timestamptz,
  notification_log      jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint referral_rewarded_fields check (status <> 'REWARDED' or (reward_amount is not null and rewarded_at is not null))
);
create unique index referral_rewards_family_once_idx on public.referral_rewards (referee_phone) where status <> 'VOID';
create index referral_rewards_referrer_idx on public.referral_rewards (referrer_id, created_at desc);
create index referral_rewards_notify_idx on public.referral_rewards (rewarded_at) where status = 'REWARDED' and notified_at is null;
create trigger referral_rewards_set_updated_at before update on public.referral_rewards
  for each row execute function public.set_updated_at();

alter table public.referral_program enable row level security;
alter table public.referral_rewards enable row level security;
create policy "public read referral program" on public.referral_program for select to anon, authenticated using (true);
create policy "referrer and admin read rewards" on public.referral_rewards for select to authenticated
  using (referrer_id = public.current_parent_id() or public.is_admin());
revoke insert, update, delete on public.referral_program, public.referral_rewards from anon, authenticated;
revoke all on public.referral_rewards from anon;

-- ─── Code check (booking form, anonymous) ───────────────────────────────────
-- Says only whether a code can be used and the new family's discount — never who owns it.
create or replace function public.referral_check(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_prog public.referral_program;
begin
  select * into v_prog from public.referral_program where id = 1;
  if not coalesce(v_prog.is_active, false) then
    return jsonb_build_object('valid', false, 'reason', 'INACTIVE');
  end if;
  if v_code !~ '^[A-Z0-9]{4,12}$'
     or not exists (select 1 from public.users where referral_code = v_code and is_active and role = 'PARENT') then
    return jsonb_build_object('valid', false, 'reason', 'NOT_FOUND');
  end if;
  return jsonb_build_object('valid', true, 'code', v_code, 'discount_vnd', v_prog.referee_discount_vnd);
end;
$$;

-- Link a just-created lead to a referral. Never fails the booking: returns {applied, reason}.
create or replace function public.referral_attach(p_lead_id uuid, p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code  text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_prog  public.referral_program;
  v_ref   public.users;
  v_lead  public.leads;
  v_user  uuid;
begin
  select * into v_prog from public.referral_program where id = 1;
  if not coalesce(v_prog.is_active, false) then
    return jsonb_build_object('applied', false, 'reason', 'INACTIVE');
  end if;
  select * into v_ref from public.users where referral_code = v_code and is_active and role = 'PARENT';
  if not found then
    return jsonb_build_object('applied', false, 'reason', 'NOT_FOUND');
  end if;
  select * into v_lead from public.leads where id = p_lead_id;
  if not found then
    return jsonb_build_object('applied', false, 'reason', 'NOT_FOUND');
  end if;
  if v_lead.phone_number = v_ref.phone then
    return jsonb_build_object('applied', false, 'reason', 'SELF');
  end if;
  -- Only families new to TH EDU: no course with us under this phone.
  if exists (select 1 from public.enrollments e join public.leads l on l.id = e.lead_id where l.phone_number = v_lead.phone_number)
     or exists (select 1 from public.users u join public.parent_student_links k on k.parent_id = u.id
                  join public.enrollments e on e.student_id = k.student_id where u.phone = v_lead.phone_number) then
    return jsonb_build_object('applied', false, 'reason', 'NOT_NEW');
  end if;
  if exists (select 1 from public.referral_rewards where referee_phone = v_lead.phone_number and status <> 'VOID') then
    return jsonb_build_object('applied', false, 'reason', 'ALREADY');
  end if;

  select id into v_user from public.users where phone = v_lead.phone_number;
  insert into public.referral_rewards (referrer_id, referee_id, referee_lead_id, referee_phone, referee_name,
                                       promised_reward_vnd, referee_discount_vnd, voucher_valid_days)
  values (v_ref.id, v_user, v_lead.id, v_lead.phone_number, v_lead.parent_name,
          v_prog.referrer_reward_vnd, v_prog.referee_discount_vnd, v_prog.voucher_valid_days);
  update public.leads set referral_code = v_code, referred_by = v_ref.id where id = v_lead.id;
  if v_user is not null then
    update public.users set referred_by = coalesce(referred_by, v_ref.id) where id = v_user;
  end if;
  return jsonb_build_object('applied', true, 'discount_vnd', v_prog.referee_discount_vnd);
end;
$$;

-- submit_lead: same as before (promo code + UTM) and now the referral code.
create or replace function public.submit_lead(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_res   jsonb;
  v_promo text := nullif(p ->> 'promo_code', '');
  v_ref   text := nullif(btrim(coalesce(p ->> 'referral_code', '')), '');
  v_core  jsonb := p - 'referral_code';
begin
  if v_promo is not null and v_promo not in ('EBOOK_VAO_LOP_1', 'CLB_PHU_HUYNH_100K') then
    raise exception 'Mã ưu đãi không hợp lệ' using hint = 'VALIDATION:promo_code';
  end if;
  if v_ref is not null and upper(v_ref) !~ '^[A-Z0-9]{4,12}$' then
    raise exception 'Mã giới thiệu không hợp lệ' using hint = 'VALIDATION:referral_code';
  end if;
  if v_promo is not null and v_promo <> 'EBOOK_VAO_LOP_1' then
    v_core := v_core - 'promo_code';
  end if;

  v_res := public.submit_lead_core(v_core);

  if not coalesce((v_res ->> 'duplicate')::boolean, false) then
    update public.leads
       set utm_source   = public.clean_utm(p ->> 'utm_source'),
           utm_medium   = public.clean_utm(p ->> 'utm_medium'),
           utm_campaign = nullif(left(btrim(coalesce(p ->> 'utm_campaign', '')), 150), ''),
           promo_code   = coalesce(promo_code, v_promo)
     where id = (v_res ->> 'id')::uuid;
    if v_ref is not null then
      v_res := v_res || jsonb_build_object('referral', public.referral_attach((v_res ->> 'id')::uuid, v_ref));
    end if;
  end if;
  return v_res;
end;
$$;

-- ─── Status follows the lead and the invoice ────────────────────────────────

create or replace function public.referral_on_lead_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('COMPLETED_TRIAL', 'ENROLLED') then
    update public.referral_rewards set status = 'PENDING_PAYMENT'
     where referee_lead_id = new.id and status = 'PENDING_TRIAL';
  elsif new.status = 'CANCELLED' then
    update public.referral_rewards set status = 'VOID', void_reason = 'Lịch học thử đã hủy'
     where referee_lead_id = new.id and status = 'PENDING_TRIAL';
  end if;
  return null;
end;
$$;

create trigger leads_referral_status
  after update of status on public.leads
  for each row when (old.status is distinct from new.status)
  execute function public.referral_on_lead_status();

-- A parent account created later (OTP sign-up or by an admin) for a referred phone gets referred_by.
create or replace function public.referral_on_user_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.referral_rewards;
begin
  select * into v_r from public.referral_rewards where referee_phone = new.phone and status <> 'VOID' limit 1;
  if found then
    update public.referral_rewards set referee_id = new.id where id = v_r.id and referee_id is null;
    update public.users set referred_by = v_r.referrer_id where id = new.id and referred_by is null;
  end if;
  return null;
end;
$$;

create trigger users_referral_link
  after insert on public.users
  for each row execute function public.referral_on_user_insert();

-- Invoice PAID → reward the referrer (once). Invoice CANCELLED → its voucher becomes available again.
create or replace function public.referral_on_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phones text[];
  v_r      public.referral_rewards;
begin
  if new.status = 'PAID' and old.status is distinct from 'PAID' then
    -- Phones of the family that paid: the booking's phone and the parents linked to the student.
    select array_agg(distinct p) into v_phones from (
      select l.phone_number as p from public.leads l
       where l.id in (new.lead_id, (select e.lead_id from public.enrollments e where e.id = new.enrollment_id))
      union
      select u.phone from public.enrollments e
        join public.parent_student_links k on k.student_id = e.student_id
        join public.users u on u.id = k.parent_id
       where e.id = new.enrollment_id
    ) x where p is not null;

    for v_r in select * from public.referral_rewards
                where referee_phone = any (coalesce(v_phones, '{}')) and status in ('PENDING_TRIAL', 'PENDING_PAYMENT')
                for update loop
      update public.referral_rewards
         set status = 'REWARDED',
             reward_amount = v_r.promised_reward_vnd,
             invoice_id = new.id,
             rewarded_at = now(),
             voucher_code = case when v_r.promised_reward_vnd > 0
                                 then 'GT' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) end,
             voucher_status = case when v_r.promised_reward_vnd > 0 then 'AVAILABLE' end,
             voucher_expires_at = case when v_r.promised_reward_vnd > 0 then now() + make_interval(days => v_r.voucher_valid_days) end
       where id = v_r.id;
    end loop;
  elsif new.status = 'CANCELLED' and old.status is distinct from 'CANCELLED' then
    update public.referral_rewards set voucher_status = 'AVAILABLE', voucher_used_at = null, voucher_invoice_id = null
     where voucher_invoice_id = new.id and voucher_status = 'USED';
  end if;
  return null;
end;
$$;

create trigger tuition_invoices_referral
  after update of status on public.tuition_invoices
  for each row execute function public.referral_on_invoice();

-- ─── Parent: my referrals ───────────────────────────────────────────────────

create or replace function public.parent_referrals()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_parent uuid := public.current_parent_id();
begin
  if v_parent is null then
    raise exception 'Cần đăng nhập tài khoản phụ huynh' using hint = 'UNAUTHORIZED';
  end if;
  return (
    select jsonb_build_object(
      'code', u.referral_code,
      'program', (select jsonb_build_object('active', p.is_active, 'referrer_reward_vnd', p.referrer_reward_vnd,
                                            'referee_discount_vnd', p.referee_discount_vnd, 'voucher_valid_days', p.voucher_valid_days)
                    from public.referral_program p where p.id = 1),
      'stats', (select jsonb_build_object(
                  'invited', count(*) filter (where r.status <> 'VOID'),
                  'rewarded', count(*) filter (where r.status = 'REWARDED'),
                  'earned_vnd', coalesce(sum(r.reward_amount) filter (where r.status = 'REWARDED'), 0))
                from public.referral_rewards r where r.referrer_id = u.id),
      'vouchers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'code', r.voucher_code, 'amount_vnd', r.reward_amount, 'expires_at', r.voucher_expires_at,
          'status', case when r.voucher_status = 'AVAILABLE' and r.voucher_expires_at < now() then 'EXPIRED' else r.voucher_status end,
          'used_at', r.voucher_used_at) order by r.rewarded_at desc)
        from public.referral_rewards r where r.referrer_id = u.id and r.voucher_code is not null), '[]'::jsonb),
      -- Friends: given name only (last word), no phone.
      'friends', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', regexp_replace(btrim(r.referee_name), '^.*\s', ''), 'status', r.status,
          'reward_vnd', r.reward_amount, 'created_at', r.created_at, 'rewarded_at', r.rewarded_at) order by r.created_at desc)
        from public.referral_rewards r where r.referrer_id = u.id), '[]'::jsonb))
    from public.users u where u.id = v_parent);
end;
$$;

-- ─── Admin: program, list, vouchers on invoices ─────────────────────────────

create or replace function public.admin_referral_program_update(p_active boolean, p_referrer_reward int, p_referee_discount int, p_valid_days int)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v public.referral_program;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được sửa chương trình giới thiệu' using hint = 'FORBIDDEN';
  end if;
  if p_referrer_reward is null or p_referrer_reward not between 0 and 10000000 then
    raise exception 'Quà người giới thiệu 0–10.000.000đ' using hint = 'VALIDATION:referrer_reward';
  end if;
  if p_referee_discount is null or p_referee_discount not between 0 and 10000000 then
    raise exception 'Ưu đãi học viên mới 0–10.000.000đ' using hint = 'VALIDATION:referee_discount';
  end if;
  if p_valid_days is null or p_valid_days not between 7 and 730 then
    raise exception 'Hạn voucher 7–730 ngày' using hint = 'VALIDATION:valid_days';
  end if;
  update public.referral_program
     set is_active = coalesce(p_active, is_active), referrer_reward_vnd = p_referrer_reward,
         referee_discount_vnd = p_referee_discount, voucher_valid_days = p_valid_days,
         updated_by = auth.uid(), updated_at = now()
   where id = 1
  returning * into v;
  return to_jsonb(v);
end;
$$;

create or replace function public.admin_referrals(p_limit int default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên' using hint = 'FORBIDDEN';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'status', r.status, 'void_reason', r.void_reason, 'created_at', r.created_at, 'rewarded_at', r.rewarded_at,
      'referrer_name', u.full_name, 'referrer_phone', u.phone, 'referee_name', r.referee_name, 'referee_phone', r.referee_phone,
      'promised_reward_vnd', r.promised_reward_vnd, 'referee_discount_vnd', r.referee_discount_vnd,
      'voucher_code', r.voucher_code, 'voucher_status', r.voucher_status, 'voucher_expires_at', r.voucher_expires_at,
      'notified_at', r.notified_at) order by r.created_at desc)
    from (select * from public.referral_rewards order by created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 300)) r
    join public.users u on u.id = r.referrer_id), '[]'::jsonb);
end;
$$;

-- Invoice draft, now with the new family's referral discount and the family's own vouchers.
create or replace function public.payment_invoice_draft(p_enrollment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_e      public.enrollments;
  v_phone  text;
  v_phones text[];
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được lập hóa đơn học phí' using hint = 'FORBIDDEN';
  end if;
  select * into v_e from public.enrollments where id = p_enrollment_id;
  if not found then
    raise exception 'Không tìm thấy khóa học của học viên' using hint = 'NOT_FOUND';
  end if;
  select phone_number into v_phone from public.leads where id = v_e.lead_id;
  select array_agg(distinct p) into v_phones from (
    select v_phone as p
    union select u.phone from public.parent_student_links k join public.users u on u.id = k.parent_id where k.student_id = v_e.student_id
  ) x where p is not null;

  return jsonb_build_object(
    'base_amount_vnd', (select monthly_fee_vnd from public.course_fees where course_code = v_e.course_code),
    'is_alumni', exists (
      select 1 from public.enrollments x
       left join public.leads l on l.id = x.lead_id
      where x.id <> v_e.id and x.status = 'COMPLETED'
        and (x.lead_id = v_e.lead_id or (v_phone is not null and l.phone_number = v_phone))),
    'open_invoice_id', (select id from public.tuition_invoices where enrollment_id = v_e.id and status = 'PENDING_PAYMENT'),
    -- New family referred by a friend, first payment not made yet.
    'referral', (select jsonb_build_object('id', r.id, 'discount_vnd', r.referee_discount_vnd)
                   from public.referral_rewards r
                  where r.referee_phone = any (coalesce(v_phones, '{}')) and r.status in ('PENDING_TRIAL', 'PENDING_PAYMENT')
                    and r.referee_discount_vnd > 0
                  limit 1),
    -- Vouchers this family earned by referring others.
    'vouchers', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'code', r.voucher_code, 'amount_vnd', r.reward_amount, 'expires_at', r.voucher_expires_at)
                       order by r.voucher_expires_at)
      from public.referral_rewards r join public.users u on u.id = r.referrer_id
      where u.phone = any (coalesce(v_phones, '{}')) and r.voucher_status = 'AVAILABLE' and r.voucher_expires_at > now()), '[]'::jsonb));
end;
$$;

-- Mark a voucher used by an invoice whose discount already includes it.
create or replace function public.referral_voucher_redeem(p_reward_id uuid, p_invoice_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_r   public.referral_rewards;
  v_inv public.tuition_invoices;
  v_ok  boolean;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được dùng voucher' using hint = 'FORBIDDEN';
  end if;
  select * into v_r from public.referral_rewards where id = p_reward_id for update;
  if not found or v_r.voucher_status is distinct from 'AVAILABLE' or v_r.voucher_expires_at <= now() then
    raise exception 'Voucher không còn dùng được' using hint = 'CONFLICT';
  end if;
  select * into v_inv from public.tuition_invoices where id = p_invoice_id;
  if not found or v_inv.status <> 'PENDING_PAYMENT' then
    raise exception 'Hóa đơn không còn chờ thanh toán' using hint = 'CONFLICT';
  end if;
  if v_inv.discount_vnd < v_r.reward_amount then
    raise exception 'Ưu đãi trên hóa đơn chưa gồm giá trị voucher' using hint = 'VALIDATION:discount_vnd';
  end if;
  -- The voucher belongs to a parent of this family.
  select exists (
    select 1 from public.users u where u.id = v_r.referrer_id and (
      u.phone = (select l.phone_number from public.leads l where l.id = v_inv.lead_id)
      or exists (select 1 from public.enrollments e join public.parent_student_links k on k.student_id = e.student_id
                  where e.id = v_inv.enrollment_id and k.parent_id = u.id))) into v_ok;
  if not v_ok then
    raise exception 'Voucher không thuộc gia đình của học viên này' using hint = 'FORBIDDEN';
  end if;
  update public.referral_rewards set voucher_status = 'USED', voucher_used_at = now(), voucher_invoice_id = v_inv.id where id = v_r.id;
  return jsonb_build_object('id', v_r.id, 'voucher_status', 'USED');
end;
$$;

-- ─── Zalo message to the referrer (Edge Function, service role) ─────────────

create or replace function public.referral_pending_notices(p_limit int default 20)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'reward_vnd', r.reward_amount, 'voucher_code', r.voucher_code, 'voucher_expires_at', r.voucher_expires_at,
    'friend', regexp_replace(btrim(r.referee_name), '^.*\s', ''),
    'referrer', jsonb_build_object('full_name', u.full_name, 'phone', u.phone, 'zalo_id', u.zalo_id))), '[]'::jsonb)
  from (select * from public.referral_rewards
         where status = 'REWARDED' and notified_at is null and coalesce(reward_amount, 0) > 0
         order by rewarded_at limit least(greatest(coalesce(p_limit, 20), 1), 100)) r
  join public.users u on u.id = r.referrer_id;
$$;

create or replace function public.referral_mark_notified(p_id uuid, p_log jsonb)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  -- Sent or permanently skipped: don't try again (a skip reason is kept in the log).
  update public.referral_rewards set notified_at = now(), notification_log = p_log where id = p_id;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on function public.referral_check(text) from public;
grant execute on function public.referral_check(text) to anon, authenticated;

revoke all on function public.referral_attach(uuid, text) from public, anon, authenticated;
revoke all on function public.referral_on_lead_status() from public, anon, authenticated;
revoke all on function public.referral_on_user_insert() from public, anon, authenticated;
revoke all on function public.referral_on_invoice() from public, anon, authenticated;

revoke all on function public.submit_lead(jsonb) from public;
grant execute on function public.submit_lead(jsonb) to anon, authenticated, service_role;

revoke all on function public.parent_referrals() from public, anon;
grant execute on function public.parent_referrals() to authenticated;

revoke all on function public.admin_referral_program_update(boolean, int, int, int) from public, anon;
revoke all on function public.admin_referrals(int) from public, anon;
revoke all on function public.referral_voucher_redeem(uuid, uuid) from public, anon;
grant execute on function public.admin_referral_program_update(boolean, int, int, int) to authenticated;
grant execute on function public.admin_referrals(int) to authenticated;
grant execute on function public.referral_voucher_redeem(uuid, uuid) to authenticated;

revoke all on function public.payment_invoice_draft(uuid) from public, anon;
grant execute on function public.payment_invoice_draft(uuid) to authenticated;

revoke all on function public.referral_pending_notices(int) from public, anon, authenticated;
revoke all on function public.referral_mark_notified(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.referral_pending_notices(int) to service_role;
grant execute on function public.referral_mark_notified(uuid, jsonb) to service_role;
