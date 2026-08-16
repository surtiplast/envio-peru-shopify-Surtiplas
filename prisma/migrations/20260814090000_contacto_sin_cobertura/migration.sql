-- Contacto para los compradores cuyo distrito no tiene cobertura.
ALTER TABLE "Ajustes" ADD COLUMN "contactoWhatsapp" TEXT;
ALTER TABLE "Ajustes" ADD COLUMN "contactoEmail" TEXT;
