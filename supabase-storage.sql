-- Run once in the Supabase SQL editor (or `psql`). Creates the private bucket TETE uses for file content.
-- No storage policies are added on purpose: only the Worker, holding the service_role key, can read or write.
insert into storage.buckets (id, name, public, file_size_limit)
values ('tete', 'tete', false, 5242880)  -- 5 MB per object
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
