-- Workout Log: Supabase schema
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- Safe to re-run: tables/indexes/columns use IF NOT EXISTS, policies and check
-- constraints are dropped and recreated, and the exercise seed skips rows that already
-- exist (it only fills in their muscle list if that is still empty).
--
-- Upgrading from the first version of this file? Just run the whole file again. The
-- "Upgrades" section adds exercises.muscles and workouts.tags to existing tables.
--
-- Security model (read README.md): there are no passwords. The public "anon" key in
-- config.js can read and write every table, so anyone who has the site URL can edit
-- any data. That is the intended trade-off for a small, trusted group.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 40),
  created_at  timestamptz not null default now()
);
-- Names are unique, ignoring case ("Sam" and "sam" are the same person).
create unique index if not exists users_name_unique on public.users (lower(name));

create table if not exists public.exercises (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 1 and 60),
  equipment     text not null check (equipment in
                  ('barbell', 'dumbbell', 'machine', 'smith', 'cable',
                   'bodyweight', 'kettlebell', 'band', 'other')),
  muscle_group  text not null default 'other' check (muscle_group in
                  ('chest', 'back', 'shoulders', 'legs', 'arms', 'core', 'other')),
  -- Body-map regions this exercise works (see MUSCLES in js/exercises-seed.js).
  muscles       text[] not null default '{}',
  -- Who added it; null for the built-in seed. Deleting a user keeps their exercises.
  created_by    uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
-- The same movement on different equipment is a separate exercise,
-- but the same name + equipment can only exist once.
create unique index if not exists exercises_name_equipment_unique
  on public.exercises (lower(name), equipment);

create table if not exists public.workouts (
  id          uuid primary key default gen_random_uuid(),
  -- Deleting a user deletes their workouts (and, through workouts, their sets).
  user_id     uuid not null references public.users (id) on delete cascade,
  date        date not null default current_date,
  notes       text,
  -- Day tags such as 'push' or 'cardio' (see WORKOUT_TAGS in js/store.js).
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  -- One workout per person per day; the app adds to it all day.
  constraint workouts_user_date_unique unique (user_id, date)
);
create index if not exists workouts_date_idx on public.workouts (date desc, created_at desc);

create table if not exists public.sets (
  id           uuid primary key default gen_random_uuid(),
  -- Deleting a workout deletes its sets.
  workout_id   uuid not null references public.workouts (id) on delete cascade,
  -- An exercise that has logged sets cannot be deleted (history is never lost).
  exercise_id  uuid not null references public.exercises (id) on delete restrict,
  set_order    integer not null default 1,
  reps         integer not null default 0 check (reps >= 0 and reps <= 1000),
  weight_lb    numeric(7, 2) not null default 0 check (weight_lb >= 0 and weight_lb <= 5000),
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists sets_workout_idx on public.sets (workout_id);
create index if not exists sets_exercise_idx on public.sets (exercise_id);

-- ---------------------------------------------------------------------------
-- Upgrades (no-ops on a fresh install; bring an older install up to date)
-- ---------------------------------------------------------------------------

alter table public.exercises add column if not exists muscles text[] not null default '{}';
alter table public.workouts  add column if not exists tags    text[] not null default '{}';

alter table public.exercises drop constraint if exists exercises_muscles_allowed;
alter table public.exercises add constraint exercises_muscles_allowed check (muscles <@ array[
  'chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'traps', 'lats',
  'middle back', 'lower back', 'glutes', 'quads', 'hamstrings', 'adductors', 'calves'
]::text[]);

alter table public.workouts drop constraint if exists workouts_tags_allowed;
alter table public.workouts add constraint workouts_tags_allowed check (tags <@ array[
  'push', 'pull', 'legs', 'upper', 'lower', 'full body', 'cardio', 'trainer', 'other'
]::text[]);

-- ---------------------------------------------------------------------------
-- Access: RLS on, with policies that let the anon role do everything.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete
  on table public.users, public.exercises, public.workouts, public.sets
  to anon, authenticated;

alter table public.users     enable row level security;
alter table public.exercises enable row level security;
alter table public.workouts  enable row level security;
alter table public.sets      enable row level security;

-- users
drop policy if exists "anon select users" on public.users;
drop policy if exists "anon insert users" on public.users;
drop policy if exists "anon update users" on public.users;
drop policy if exists "anon delete users" on public.users;
create policy "anon select users" on public.users for select to anon, authenticated using (true);
create policy "anon insert users" on public.users for insert to anon, authenticated with check (true);
create policy "anon update users" on public.users for update to anon, authenticated using (true) with check (true);
create policy "anon delete users" on public.users for delete to anon, authenticated using (true);

-- exercises
drop policy if exists "anon select exercises" on public.exercises;
drop policy if exists "anon insert exercises" on public.exercises;
drop policy if exists "anon update exercises" on public.exercises;
drop policy if exists "anon delete exercises" on public.exercises;
create policy "anon select exercises" on public.exercises for select to anon, authenticated using (true);
create policy "anon insert exercises" on public.exercises for insert to anon, authenticated with check (true);
create policy "anon update exercises" on public.exercises for update to anon, authenticated using (true) with check (true);
create policy "anon delete exercises" on public.exercises for delete to anon, authenticated using (true);

-- workouts
drop policy if exists "anon select workouts" on public.workouts;
drop policy if exists "anon insert workouts" on public.workouts;
drop policy if exists "anon update workouts" on public.workouts;
drop policy if exists "anon delete workouts" on public.workouts;
create policy "anon select workouts" on public.workouts for select to anon, authenticated using (true);
create policy "anon insert workouts" on public.workouts for insert to anon, authenticated with check (true);
create policy "anon update workouts" on public.workouts for update to anon, authenticated using (true) with check (true);
create policy "anon delete workouts" on public.workouts for delete to anon, authenticated using (true);

-- sets
drop policy if exists "anon select sets" on public.sets;
drop policy if exists "anon insert sets" on public.sets;
drop policy if exists "anon update sets" on public.sets;
drop policy if exists "anon delete sets" on public.sets;
create policy "anon select sets" on public.sets for select to anon, authenticated using (true);
create policy "anon insert sets" on public.sets for insert to anon, authenticated with check (true);
create policy "anon update sets" on public.sets for update to anon, authenticated using (true) with check (true);
create policy "anon delete sets" on public.sets for delete to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Seed exercises (mirrors js/exercises-seed.js; muscles = each entry's `primary`).
-- Existing rows keep everything, except an empty muscle list gets filled in.
-- ---------------------------------------------------------------------------

insert into public.exercises (name, equipment, muscle_group, muscles) values
  ('Bench Press', 'barbell', 'chest', array['chest']::text[]),
  ('Incline Bench Press', 'barbell', 'chest', array['chest', 'shoulders']::text[]),
  ('Back Squat', 'barbell', 'legs', array['quads', 'glutes']::text[]),
  ('Front Squat', 'barbell', 'legs', array['quads']::text[]),
  ('Deadlift', 'barbell', 'back', array['hamstrings', 'glutes', 'lower back']::text[]),
  ('Romanian Deadlift', 'barbell', 'legs', array['hamstrings', 'glutes']::text[]),
  ('Overhead Press', 'barbell', 'shoulders', array['shoulders']::text[]),
  ('Bent-Over Row', 'barbell', 'back', array['lats', 'middle back']::text[]),
  ('Biceps Curl', 'barbell', 'arms', array['biceps']::text[]),
  ('Hip Thrust', 'barbell', 'legs', array['glutes']::text[]),
  ('Bench Press', 'dumbbell', 'chest', array['chest']::text[]),
  ('Incline Bench Press', 'dumbbell', 'chest', array['chest', 'shoulders']::text[]),
  ('Chest Fly', 'dumbbell', 'chest', array['chest']::text[]),
  ('Shoulder Press', 'dumbbell', 'shoulders', array['shoulders']::text[]),
  ('Lateral Raise', 'dumbbell', 'shoulders', array['shoulders']::text[]),
  ('One-Arm Row', 'dumbbell', 'back', array['lats', 'middle back']::text[]),
  ('Biceps Curl', 'dumbbell', 'arms', array['biceps']::text[]),
  ('Hammer Curl', 'dumbbell', 'arms', array['biceps', 'forearms']::text[]),
  ('Goblet Squat', 'dumbbell', 'legs', array['quads', 'glutes']::text[]),
  ('Walking Lunge', 'dumbbell', 'legs', array['quads', 'glutes']::text[]),
  ('Romanian Deadlift', 'dumbbell', 'legs', array['hamstrings', 'glutes']::text[]),
  ('Leg Press', 'machine', 'legs', array['quads', 'glutes']::text[]),
  ('Leg Extension', 'machine', 'legs', array['quads']::text[]),
  ('Leg Curl', 'machine', 'legs', array['hamstrings']::text[]),
  ('Calf Raise', 'machine', 'legs', array['calves']::text[]),
  ('Chest Press', 'machine', 'chest', array['chest']::text[]),
  ('Pec Deck', 'machine', 'chest', array['chest']::text[]),
  ('Shoulder Press', 'machine', 'shoulders', array['shoulders']::text[]),
  ('Bench Press', 'smith', 'chest', array['chest']::text[]),
  ('Incline Bench Press', 'smith', 'chest', array['chest', 'shoulders']::text[]),
  ('Squat', 'smith', 'legs', array['quads', 'glutes']::text[]),
  ('Lat Pulldown', 'cable', 'back', array['lats']::text[]),
  ('Seated Row', 'cable', 'back', array['middle back', 'lats']::text[]),
  ('Triceps Pushdown', 'cable', 'arms', array['triceps']::text[]),
  ('Face Pull', 'cable', 'shoulders', array['shoulders']::text[]),
  ('Cable Fly', 'cable', 'chest', array['chest']::text[]),
  ('Cable Crunch', 'cable', 'core', array['abs']::text[]),
  ('Pull-Up', 'bodyweight', 'back', array['lats']::text[]),
  ('Chin-Up', 'bodyweight', 'back', array['lats', 'biceps']::text[]),
  ('Push-Up', 'bodyweight', 'chest', array['chest']::text[]),
  ('Dip', 'bodyweight', 'chest', array['chest', 'triceps']::text[]),
  ('Hanging Leg Raise', 'bodyweight', 'core', array['abs']::text[]),
  ('Kettlebell Swing', 'kettlebell', 'legs', array['glutes', 'hamstrings']::text[])
on conflict ((lower(name)), equipment) do update
  set muscles = excluded.muscles
  where public.exercises.muscles = '{}';
