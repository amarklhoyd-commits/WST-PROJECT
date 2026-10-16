-- Portfolia database setup for Supabase
-- Run this entire file in Supabase Dashboard -> SQL Editor -> New query.
-- The website uses Supabase Anonymous Auth and Row Level Security (RLS).
-- Each browser session can only read/change its own portfolio records.

create extension if not exists pgcrypto;

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'My Portfolio' check (char_length(title) <= 120),
  full_name text not null check (char_length(full_name) between 1 and 100),
  profile_picture text,
  email text,
  contact_number text,
  address text,
  about_me text,
  education jsonb not null default '[]'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  projects jsonb not null default '[]'::jsonb,
  experience jsonb not null default '[]'::jsonb,
  social_links jsonb not null default '[]'::jsonb,
  template text not null default 'simple' check (template in ('simple','modern','creative')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.portfolios enable row level security;

drop policy if exists "Users can view their own portfolios" on public.portfolios;
create policy "Users can view their own portfolios"
on public.portfolios for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own portfolios" on public.portfolios;
create policy "Users can create their own portfolios"
on public.portfolios for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own portfolios" on public.portfolios;
create policy "Users can update their own portfolios"
on public.portfolios for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own portfolios" on public.portfolios;
create policy "Users can delete their own portfolios"
on public.portfolios for delete to authenticated
using ((select auth.uid()) = user_id);

create index if not exists portfolios_user_id_idx on public.portfolios(user_id);
create index if not exists portfolios_updated_at_idx on public.portfolios(updated_at desc);

create or replace function public.set_portfolios_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_portfolios_updated_at on public.portfolios;
create trigger set_portfolios_updated_at
before update on public.portfolios
for each row execute function public.set_portfolios_updated_at();

-- PROFILE PICTURE STORAGE
-- Create a PUBLIC bucket named "profile-pictures" in Storage, then apply these policies.
-- Public means the image URL can be viewed by anyone who has it. Upload/update/delete
-- remains restricted to the authenticated user's own folder (folder name = auth.uid()).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-pictures', 'profile-pictures', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Users upload pictures into their own folder" on storage.objects;
create policy "Users upload pictures into their own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users update pictures in their own folder" on storage.objects;
create policy "Users update pictures in their own folder"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users delete pictures in their own folder" on storage.objects;
create policy "Users delete pictures in their own folder"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Public bucket image reads are enabled by Supabase's public bucket setting.
