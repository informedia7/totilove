-- Migration: Allow multiple reactions per user for each message
-- Purpose: Preserve all selected reactions instead of replacing prior reaction.
--
-- Old design: PRIMARY KEY (message_id, user_id)
-- New design: PRIMARY KEY (message_id, user_id, reaction_emoji)

DO $$
DECLARE
    rec record;
BEGIN
    -- Drop old or incorrect primary key definition if present.
    FOR rec IN
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_schema = kcu.constraint_schema
         AND tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
         AND tc.table_name = kcu.table_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'user_icon_reaction'
          AND tc.constraint_type = 'PRIMARY KEY'
        GROUP BY tc.constraint_name
        HAVING array_agg(kcu.column_name::text ORDER BY kcu.ordinal_position)
               <> ARRAY['message_id', 'user_id', 'reaction_emoji']::text[]
    LOOP
        EXECUTE format('ALTER TABLE public.user_icon_reaction DROP CONSTRAINT %I', rec.constraint_name);
    END LOOP;

    -- Drop legacy UNIQUE constraints that enforce one reaction per user/message.
    FOR rec IN
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_schema = kcu.constraint_schema
         AND tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
         AND tc.table_name = kcu.table_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'user_icon_reaction'
          AND tc.constraint_type = 'UNIQUE'
        GROUP BY tc.constraint_name
        HAVING array_agg(kcu.column_name::text ORDER BY kcu.ordinal_position)
               = ARRAY['message_id', 'user_id']::text[]
    LOOP
        EXECUTE format('ALTER TABLE public.user_icon_reaction DROP CONSTRAINT %I', rec.constraint_name);
    END LOOP;

    -- Drop legacy non-unique indexes on (message_id, user_id) to avoid confusion.
    FOR rec IN
        SELECT i.indexname
        FROM pg_indexes i
        WHERE i.schemaname = 'public'
          AND i.tablename = 'user_icon_reaction'
          AND i.indexdef ILIKE 'CREATE%INDEX%ON public.user_icon_reaction USING btree (message_id, user_id)%'
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I', rec.indexname);
    END LOOP;

    -- Safety: remove exact duplicates before adding the composite PK.
    DELETE FROM public.user_icon_reaction u
    USING (
        SELECT ctid
        FROM (
            SELECT ctid,
                   row_number() OVER (
                       PARTITION BY message_id, user_id, reaction_emoji
                       ORDER BY ctid
                   ) AS rn
            FROM public.user_icon_reaction
        ) d
        WHERE d.rn > 1
    ) dup
    WHERE u.ctid = dup.ctid;

    -- Ensure the new multi-reaction PK exists.
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_schema = kcu.constraint_schema
         AND tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
         AND tc.table_name = kcu.table_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'user_icon_reaction'
          AND tc.constraint_type = 'PRIMARY KEY'
        GROUP BY tc.constraint_name
        HAVING array_agg(kcu.column_name::text ORDER BY kcu.ordinal_position)
               = ARRAY['message_id', 'user_id', 'reaction_emoji']::text[]
    ) THEN
        ALTER TABLE public.user_icon_reaction
            ADD CONSTRAINT user_icon_reaction_pk
            PRIMARY KEY (message_id, user_id, reaction_emoji);
    END IF;
END $$;
