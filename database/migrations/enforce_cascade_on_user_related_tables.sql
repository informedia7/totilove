BEGIN;

-- 1) user_activity
ALTER TABLE public.user_activity
    DROP CONSTRAINT IF EXISTS user_activity_user_id_fkey,
    DROP CONSTRAINT IF EXISTS user_activity_target_user_id_fkey;

ALTER TABLE public.user_activity
    ADD CONSTRAINT user_activity_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    ADD CONSTRAINT user_activity_target_user_id_fkey
        FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 2) user_attributes
ALTER TABLE public.user_attributes
    DROP CONSTRAINT IF EXISTS user_attributes_user_id_fkey;

ALTER TABLE public.user_attributes
    ADD CONSTRAINT user_attributes_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 3) user_hobbies_multiple
ALTER TABLE public.user_hobbies_multiple
    DROP CONSTRAINT IF EXISTS user_hobbies_multiple_user_id_fkey;

ALTER TABLE public.user_hobbies_multiple
    ADD CONSTRAINT user_hobbies_multiple_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 4) user_images
ALTER TABLE public.user_images
    DROP CONSTRAINT IF EXISTS user_images_user_id_fkey;

ALTER TABLE public.user_images
    ADD CONSTRAINT user_images_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 5) user_interests_multiple
ALTER TABLE public.user_interests_multiple
    DROP CONSTRAINT IF EXISTS user_interests_multiple_user_id_fkey;

ALTER TABLE public.user_interests_multiple
    ADD CONSTRAINT user_interests_multiple_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 6) user_matches
ALTER TABLE public.user_matches
    DROP CONSTRAINT IF EXISTS matches_user1_id_fkey,
    DROP CONSTRAINT IF EXISTS matches_user2_id_fkey;

ALTER TABLE public.user_matches
    ADD CONSTRAINT matches_user1_id_fkey
        FOREIGN KEY (user1_id) REFERENCES public.users(id) ON DELETE CASCADE,
    ADD CONSTRAINT matches_user2_id_fkey
        FOREIGN KEY (user2_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 7) user_messages
-- Remove duplicate/no-action constraints and enforce cascade on sender/receiver.
ALTER TABLE public.user_messages
    DROP CONSTRAINT IF EXISTS messages_sender_id_fkey,
    DROP CONSTRAINT IF EXISTS messages_receiver_id_fkey,
    DROP CONSTRAINT IF EXISTS fk_messages_sender,
    DROP CONSTRAINT IF EXISTS fk_messages_receiver;

ALTER TABLE public.user_messages
    ADD CONSTRAINT fk_messages_sender
        FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_messages_receiver
        FOREIGN KEY (receiver_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- reply_to_sender is converted separately to ON DELETE CASCADE for full hard-delete behavior.

-- 8) user_preferences
ALTER TABLE public.user_preferences
    DROP CONSTRAINT IF EXISTS user_preferences_user_id_fkey;

ALTER TABLE public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 9) users_favorites
ALTER TABLE public.users_favorites
    DROP CONSTRAINT IF EXISTS favorites_favorited_by_fkey,
    DROP CONSTRAINT IF EXISTS favorites_favorited_user_id_fkey;

ALTER TABLE public.users_favorites
    ADD CONSTRAINT favorites_favorited_by_fkey
        FOREIGN KEY (favorited_by) REFERENCES public.users(id) ON DELETE CASCADE,
    ADD CONSTRAINT favorites_favorited_user_id_fkey
        FOREIGN KEY (favorited_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 10) users_likes
ALTER TABLE public.users_likes
    DROP CONSTRAINT IF EXISTS likes_liked_by_fkey,
    DROP CONSTRAINT IF EXISTS likes_liked_user_id_fkey;

ALTER TABLE public.users_likes
    ADD CONSTRAINT likes_liked_by_fkey
        FOREIGN KEY (liked_by) REFERENCES public.users(id) ON DELETE CASCADE,
    ADD CONSTRAINT likes_liked_user_id_fkey
        FOREIGN KEY (liked_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

COMMIT;

-- Verification query:
-- SELECT
--   src.relname AS source_table,
--   con.conname AS fk_name,
--   CASE con.confdeltype
--     WHEN 'a' THEN 'NO ACTION'
--     WHEN 'r' THEN 'RESTRICT'
--     WHEN 'c' THEN 'CASCADE'
--     WHEN 'n' THEN 'SET NULL'
--     WHEN 'd' THEN 'SET DEFAULT'
--   END AS on_delete_action
-- FROM pg_constraint con
-- JOIN pg_class src ON src.oid = con.conrelid
-- JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
-- JOIN pg_class tgt ON tgt.oid = con.confrelid
-- JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
-- WHERE con.contype = 'f'
--   AND src_ns.nspname = 'public'
--   AND tgt_ns.nspname = 'public'
--   AND tgt.relname = 'users'
--   AND src.relname IN (
--     'user_activity','user_attributes','user_hobbies_multiple','user_images',
--     'user_interests_multiple','user_matches','user_messages','user_preferences',
--     'users_favorites','users_likes'
--   )
-- ORDER BY source_table, fk_name;
