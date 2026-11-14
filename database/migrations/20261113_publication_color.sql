-- Aplicar antes de iniciar esta versión. Conserva las publicaciones existentes.
ALTER TABLE publications ADD COLUMN IF NOT EXISTS color varchar(16) NOT NULL DEFAULT 'peach';
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_color_check;
ALTER TABLE publications ADD CONSTRAINT publications_color_check CHECK (color IN ('peach','rose','lavender','lilac','sky','mint','sage','lemon','sand','aqua'));
