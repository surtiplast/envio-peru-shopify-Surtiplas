-- Recargo por peso encima del precio del rango.
-- El peso va en gramos (enteros) para no arrastrar decimales en la suma.
ALTER TABLE "MetodoEnvio" ADD COLUMN "pesoIncluidoGramos" INTEGER;
ALTER TABLE "MetodoEnvio" ADD COLUMN "costoPorKiloExtra" DECIMAL(10,2) NOT NULL DEFAULT 0;
