-- Run once in the Supabase SQL editor. The API uses the service-role key (bypasses RLS);
-- RLS is enabled with no public policies, so the anon key can read/write nothing.
create table if not exists public.orders (
  id          text primary key,
  status      text not null default 'pending' check (status in ('pending','paid')),
  amount      integer not null,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz,
  data        jsonb not null            -- full order (customer, address, package, slip file name)
);
create index if not exists orders_created_idx on public.orders (created_at desc);
alter table public.orders enable row level security;

-- private bucket for payment slips (5 MB limit, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slips', 'slips', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
