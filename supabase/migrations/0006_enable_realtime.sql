-- Enables Postgres Changes (Realtime) events for the tables the app needs to react to
-- when data changes from outside the current client's own mutation -- e.g. another
-- signed-in device adding a restaurant. Tables aren't broadcast by default; without
-- being added to this publication, a postgres_changes subscription receives nothing.
-- RLS still applies per-subscriber on top, same "authenticated" policies as 0001_init.sql.
alter publication supabase_realtime add table restaurants;
alter publication supabase_realtime add table restaurant_tags;
alter publication supabase_realtime add table tags;
