-- Run once in the Supabase SQL editor (or `psql`). Creates the private bucket TETE uses for file content.
-- No storage policies are added on purpose: only the Worker, holding the service_role key, can read or write.
insert into storage.buckets (id, name, public, file_size_limit)
values ('tete', 'tete', false, 52428800)  -- 50 MB: the Supabase Free plan ceiling; TETE enforces 25 MB for public uploads itself
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
