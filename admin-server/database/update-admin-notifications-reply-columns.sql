-- Update only admin_notifications table with support reply fields

ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal';
ALTER TABLE admin_notifications DROP COLUMN IF EXISTS created_by_admin_id;

ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS admin_reply TEXT;
ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS admin_replied_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS replied_by_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_name = 'admin_notifications'
		  AND column_name = 'admin_replied_by_admin_id'
	) THEN
		EXECUTE '
			UPDATE admin_notifications
			SET replied_by_admin_id = admin_replied_by_admin_id
			WHERE replied_by_admin_id IS NULL
			  AND admin_replied_by_admin_id IS NOT NULL
		';

		EXECUTE 'ALTER TABLE admin_notifications DROP COLUMN admin_replied_by_admin_id';
	END IF;
END $$;
