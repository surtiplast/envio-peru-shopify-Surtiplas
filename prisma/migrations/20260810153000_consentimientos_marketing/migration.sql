-- Consentimientos de marketing recogidos en el formulario de envío.
-- Se aplican al cliente con customerEmailMarketingConsentUpdate /
-- customerSmsMarketingConsentUpdate cuando se crea el pedido.
ALTER TABLE "Apariencia" ADD COLUMN "mostrarMarketingEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Apariencia" ADD COLUMN "mostrarMarketingSms" BOOLEAN NOT NULL DEFAULT false;
