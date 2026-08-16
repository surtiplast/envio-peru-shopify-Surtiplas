-- Más control de apariencia: colores del cuerpo y juego de iconos.
ALTER TABLE "Apariencia" ADD COLUMN "colorTexto" TEXT NOT NULL DEFAULT '#1A1A1A';
ALTER TABLE "Apariencia" ADD COLUMN "colorFondo" TEXT NOT NULL DEFAULT '#FFFFFF';
ALTER TABLE "Apariencia" ADD COLUMN "colorBorde" TEXT NOT NULL DEFAULT '#E3E3E3';
ALTER TABLE "Apariencia" ADD COLUMN "juegoIconos" TEXT NOT NULL DEFAULT 'LINEA';
