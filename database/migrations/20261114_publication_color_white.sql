-- Aplicar después de 20261113_publication_color.sql. No modifica las elecciones existentes.
BEGIN;
ALTER TABLE publications ALTER COLUMN color SET DEFAULT 'white';
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_color_check;
ALTER TABLE publications ADD CONSTRAINT publications_color_check CHECK (color IN ('white','peach','rose','lavender','lilac','sky','mint','sage','lemon','sand','aqua'));
COMMIT;
