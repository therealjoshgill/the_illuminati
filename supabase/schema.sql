-- Run this in your Supabase SQL Editor (https://app.supabase.com → SQL Editor)

create table if not exists conversations (
  id         uuid        default gen_random_uuid() primary key,
  title      text        not null,
  created_at timestamptz default now() not null,
  turns      jsonb       not null default '[]'::jsonb
);

-- Enable real-time so the sidebar updates live when new conversations are saved.
-- (Supabase Dashboard → Database → Replication → supabase_realtime publication
--  must also have this table toggled on if the ALTER below isn't sufficient.)
alter publication supabase_realtime add table conversations;
