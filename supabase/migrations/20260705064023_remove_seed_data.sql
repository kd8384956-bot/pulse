-- Remove all seed data (system polls with NULL created_by)
DELETE FROM polls WHERE created_by IS NULL;