


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."check_daily_streak"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  _group_id uuid;
  active_players_count int;
  finished_players_count int;
  _last_streak_date date;
  _current_streak int;
begin
  -- Find the group
  select group_id into _group_id from public.goals where id = new.goal_id;

  -- Get current group stats
  select last_streak_date, current_streak 
  into _last_streak_date, _current_streak
  from public.groups where id = _group_id;

  -- Handle fresh groups
  if _last_streak_date is null then _last_streak_date := '1970-01-01'; end if;

  -- RESET LOGIC: If streak is old, reset it to 0 immediately
  if _last_streak_date < (new.date::date - interval '1 day') then
     update public.groups set current_streak = 0 where id = _group_id;
     _current_streak := 0; -- Update local var
  end if;

  -- STOP if we already updated the streak for today
  if _last_streak_date = new.date::date and _current_streak > 0 then
     return new;
  end if;

  -- COUNT ACTIVE (People with goals)
  select count(distinct g.user_id) into active_players_count
  from public.goals g
  join public.group_members gm on g.user_id = gm.user_id
  where g.group_id = _group_id;

  -- COUNT FINISHED (People with logs TODAY)
  -- Note: We trust the logs table because this is an AFTER trigger
  select count(distinct l.user_id) into finished_players_count
  from public.logs l
  join public.goals g on l.goal_id = g.id
  where g.group_id = _group_id
  and l.date = new.date;

  -- UPDATE LOGIC
  if finished_players_count >= active_players_count then
     if _last_streak_date = (new.date::date - interval '1 day') then
        -- Yesterday was hit, increment streak
        update public.groups 
        set current_streak = current_streak + 1, last_streak_date = new.date::date
        where id = _group_id;
     else
        -- Streak was broken or new, start at 1
        update public.groups 
        set current_streak = 1, last_streak_date = new.date::date
        where id = _group_id;
     end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."check_daily_streak"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_heatmap_logs"("p_user_id" "uuid") RETURNS TABLE("log_date" "text", "completed_count" integer)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT 
    date AS log_date, 
    COUNT(*)::integer AS completed_count
  FROM public.logs
  WHERE user_id = p_user_id
    -- POPRAWKA: Rzutujemy tekstową kolumnę na datę (date::date), 
    -- żeby móc sprawdzić, czy jest starsza niż 84 dni
    AND date::date >= (CURRENT_DATE - INTERVAL '84 days')::date 
  GROUP BY date
  ORDER BY date ASC;
$$;


ALTER FUNCTION "public"."get_heatmap_logs"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_group_stats"() RETURNS TABLE("group_id" "uuid", "name" "text", "current_streak" integer, "invite_code" "text", "last_streak_date" "date", "icon" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _group_id uuid;
  _last_date date;
  _current_streak int;
  _yesterday date;
BEGIN
  -- 1. Find the user's group
  select gm.group_id into _group_id
  from group_members gm
  where gm.user_id = auth.uid();

  if _group_id is null then
    return; 
  end if;

  -- 2. Get the raw stats
  select g.last_streak_date, g.current_streak 
  into _last_date, _current_streak
  from public.groups g 
  where g.id = _group_id;

  if _last_date is null then _last_date := '1970-01-01'; end if;
  _yesterday := (now()::date - interval '1 day');

  -- 3. THE FIX
  if _last_date < _yesterday and _current_streak > 0 then
    update public.groups
    set current_streak = 0
    where id = _group_id;
    
    _current_streak := 0;
  end if;

  -- 4. Return fresh data
  return query
  select g.id as group_id, g.name, g.current_streak, g.invite_code, g.last_streak_date, g.icon
  from public.groups g
  where g.id = _group_id; -- Zwracamy id jako group_id!
END;
$$;


ALTER FUNCTION "public"."get_my_group_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_group_member"("_group_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return exists (
    select 1
    from group_members
    where group_id = _group_id
    and user_id = auth.uid()
  );
end;
$$;


ALTER FUNCTION "public"."is_group_member"("_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_group_via_code"("code_input" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  target_group_id uuid;
  my_id uuid := auth.uid();
begin
  -- Find group by code
  select id into target_group_id from public.groups where invite_code = code_input;

  if target_group_id is null then
    return json_build_object('success', false, 'message', 'Invalid code');
  end if;

  -- Add user to members
  insert into public.group_members (group_id, user_id)
  values (target_group_id, my_id)
  on conflict do nothing; -- Ignore if already inside

  return json_build_object('success', true, 'group_id', target_group_id);
end;
$$;


ALTER FUNCTION "public"."join_group_via_code"("code_input" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "group_id" "uuid",
    "title" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "icon" "text",
    "repeat_days" integer[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6] NOT NULL
);


ALTER TABLE "public"."goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."group_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "creator_id" "uuid",
    "invite_code" "text" DEFAULT SUBSTRING("md5"(("random"())::"text") FROM 0 FOR 7),
    "current_streak" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_streak_date" "date",
    "icon" "text" DEFAULT '👥'::"text" NOT NULL
);


ALTER TABLE "public"."groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "goal_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "nickname" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_user_id_key" UNIQUE ("group_id", "user_id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logs"
    ADD CONSTRAINT "logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



CREATE OR REPLACE TRIGGER "on_log_added" AFTER INSERT ON "public"."logs" FOR EACH ROW EXECUTE FUNCTION "public"."check_daily_streak"();



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id");



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."logs"
    ADD CONSTRAINT "logs_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."logs"
    ADD CONSTRAINT "logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



CREATE POLICY "Create goals" ON "public"."goals" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Create groups" ON "public"."groups" FOR INSERT WITH CHECK (("auth"."uid"() = "creator_id"));



CREATE POLICY "Create logs" ON "public"."logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Edit habits" ON "public"."goals" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Enable delete for users based on user_id" ON "public"."goals" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Join groups" ON "public"."group_members" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Public profiles" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "See group goals" ON "public"."goals" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("user_id" IN ( SELECT "group_members"."user_id"
   FROM "public"."group_members"
  WHERE ("group_members"."group_id" IN ( SELECT "group_members_1"."group_id"
           FROM "public"."group_members" "group_members_1"
          WHERE ("group_members_1"."user_id" = "auth"."uid"())))))));



CREATE POLICY "See group logs" ON "public"."logs" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("user_id" IN ( SELECT "group_members"."user_id"
   FROM "public"."group_members"
  WHERE ("group_members"."group_id" IN ( SELECT "group_members_1"."group_id"
           FROM "public"."group_members" "group_members_1"
          WHERE ("group_members_1"."user_id" = "auth"."uid"())))))));



CREATE POLICY "See group members" ON "public"."group_members" FOR SELECT USING ("public"."is_group_member"("group_id"));



CREATE POLICY "See my groups" ON "public"."groups" FOR SELECT USING (("public"."is_group_member"("id") OR ("creator_id" = "auth"."uid"())));



CREATE POLICY "Users can delete their own logs" ON "public"."logs" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members can update group" ON "public"."groups" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."group_members" "gm"
  WHERE (("gm"."group_id" = "groups"."id") AND ("gm"."user_id" = "auth"."uid"()))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."group_members" "gm"
  WHERE (("gm"."group_id" = "groups"."id") AND ("gm"."user_id" = "auth"."uid"())))) AND ("creator_id" = ( SELECT "g"."creator_id"
   FROM "public"."groups" "g"
  WHERE ("g"."id" = "groups"."id"))) AND ("invite_code" = ( SELECT "g"."invite_code"
   FROM "public"."groups" "g"
  WHERE ("g"."id" = "groups"."id")))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."check_daily_streak"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_daily_streak"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_daily_streak"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_heatmap_logs"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_heatmap_logs"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_heatmap_logs"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_group_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_group_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_group_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_group_member"("_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_member"("_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_member"("_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."join_group_via_code"("code_input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_group_via_code"("code_input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_group_via_code"("code_input" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."goals" TO "anon";
GRANT ALL ON TABLE "public"."goals" TO "authenticated";
GRANT ALL ON TABLE "public"."goals" TO "service_role";



GRANT ALL ON TABLE "public"."group_members" TO "anon";
GRANT ALL ON TABLE "public"."group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."group_members" TO "service_role";



GRANT ALL ON TABLE "public"."groups" TO "anon";
GRANT ALL ON TABLE "public"."groups" TO "authenticated";
GRANT ALL ON TABLE "public"."groups" TO "service_role";



GRANT ALL ON TABLE "public"."logs" TO "anon";
GRANT ALL ON TABLE "public"."logs" TO "authenticated";
GRANT ALL ON TABLE "public"."logs" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


