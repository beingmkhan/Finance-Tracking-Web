-- Run this in the Supabase SQL Editor AFTER supabase_setup.sql
-- Adds: a profiles table (so you can see who signed up) and a
-- categories table (so category options can be edited without code).

-- One row per signed-up user.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Helper: checks if the currently logged-in user is an admin.
-- security definer lets it read the profiles table without
-- triggering RLS recursion on the policy below.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

alter table profiles enable row level security;

create policy "Users can view own profile or admins view all"
  on profiles for select
  using (auth.uid() = id or public.is_admin());

-- Automatically create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Category options shown in the dropdowns. Any signed-in user can
-- read them; only admins can add or remove them.
create table categories (
  id bigint generated always as identity primary key,
  type text not null check (type in ('expenses', 'income', 'investments', 'assets', 'loans')),
  name text not null,
  created_at timestamptz not null default now(),
  unique (type, name)
);

alter table categories enable row level security;

create policy "Any signed-in user can view categories"
  on categories for select
  using (auth.uid() is not null);

create policy "Only admins can add categories"
  on categories for insert
  with check (public.is_admin());

create policy "Only admins can remove categories"
  on categories for delete
  using (public.is_admin());

-- Seed with the same categories the app used to have hardcoded.
insert into categories (type, name) values
  ('expenses', 'Food'), ('expenses', 'Transportation'), ('expenses', 'Entertainment'),
  ('expenses', 'Utilities'), ('expenses', 'Healthcare'), ('expenses', 'Shopping'),
  ('expenses', 'Education'), ('expenses', 'Other'),
  ('income', 'Primary Job'), ('income', 'Freelance'), ('income', 'Business'),
  ('income', 'Investment Returns'), ('income', 'Other'),
  ('investments', 'Equity'), ('investments', 'Debt'), ('investments', 'Gold'),
  ('investments', 'Real Estate'), ('investments', 'Crypto'),
  ('assets', 'Real Estate'), ('assets', 'Vehicle'), ('assets', 'Cash'),
  ('assets', 'Jewelry'), ('assets', 'Electronics'), ('assets', 'Other'),
  ('loans', 'Real Estate'), ('loans', 'Vehicle'), ('loans', 'Personal'),
  ('loans', 'Education'), ('loans', 'Credit Card'), ('loans', 'Other');

-- LAST STEP (do this after you've signed up on the site at least once):
-- make your own account the admin. Replace the email, then run just
-- this one line by itself.
-- update profiles set is_admin = true where email = 'youremail@example.com';
