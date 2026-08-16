-- Fecha de nacimiento del comprador: se guarda en el metacampo estandar
-- facts.birth_date del cliente cuando se crea el pedido.
ALTER TABLE "Apariencia" ADD COLUMN "mostrarCumpleanos" BOOLEAN NOT NULL DEFAULT false;
