-- CreateEnum
CREATE TYPE "CarrierEstado" AS ENUM ('NO_REGISTRADO', 'ACTIVO', 'NO_ELEGIBLE', 'ERROR');

-- CreateEnum
CREATE TYPE "TipoMetodo" AS ENUM ('ESTANDAR', 'EXPRESS', 'RECOJO');

-- CreateEnum
CREATE TYPE "PoliticaSinTarifa" AS ENUM ('BLOQUEAR', 'COSTO_FIJO');

-- CreateEnum
CREATE TYPE "EstadoSuscripcion" AS ENUM ('PENDIENTE', 'ACTIVA', 'CANCELADA', 'VENCIDA', 'RECHAZADA', 'CONGELADA');

-- CreateEnum
CREATE TYPE "EstadoImportacion" AS ENUM ('ANALIZANDO', 'ESPERANDO_CONFIRMACION', 'IMPORTANDO', 'COMPLETADA', 'FALLIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "NivelLog" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "dominio" TEXT NOT NULL,
    "nombre" TEXT,
    "email" TEXT,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "pais" TEXT NOT NULL DEFAULT 'PE',
    "zonaHoraria" TEXT NOT NULL DEFAULT 'America/Lima',
    "planShopify" TEXT,
    "carrierServiceGid" TEXT,
    "carrierServiceEstado" "CarrierEstado" NOT NULL DEFAULT 'NO_REGISTRADO',
    "carrierServiceError" TEXT,
    "instalada" BOOLEAN NOT NULL DEFAULT true,
    "desinstaladaEn" TIMESTAMP(3),
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Departamento" (
    "codigo" CHAR(2) NOT NULL,
    "nombre" TEXT NOT NULL,
    "clave" TEXT NOT NULL,

    CONSTRAINT "Departamento_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "Provincia" (
    "codigo" CHAR(4) NOT NULL,
    "codDep" CHAR(2) NOT NULL,
    "nombre" TEXT NOT NULL,
    "clave" TEXT NOT NULL,

    CONSTRAINT "Provincia_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "Distrito" (
    "ubigeo" CHAR(6) NOT NULL,
    "codProv" CHAR(4) NOT NULL,
    "codDep" CHAR(2) NOT NULL,
    "nombre" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,

    CONSTRAINT "Distrito_pkey" PRIMARY KEY ("ubigeo")
);

-- CreateTable
CREATE TABLE "Tarifa" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "ubigeo" CHAR(6) NOT NULL,
    "codDep" CHAR(2) NOT NULL,
    "codProv" CHAR(4) NOT NULL,
    "nombreDep" TEXT NOT NULL,
    "nombreProv" TEXT NOT NULL,
    "nombreDist" TEXT NOT NULL,
    "codShopify" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "extras" JSONB,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tarifa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetodoEnvio" (
    "id" TEXT NOT NULL,
    "tarifaId" TEXT NOT NULL,
    "tipo" "TipoMetodo" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "etiqueta" TEXT,
    "descripcion" TEXT,
    "diasMin" INTEGER,
    "diasMax" INTEGER,
    "umbralEnvioGratis" DECIMAL(10,2),

    CONSTRAINT "MetodoEnvio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rango" (
    "id" TEXT NOT NULL,
    "metodoId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "montoMin" DECIMAL(10,2) NOT NULL,
    "montoMax" DECIMAL(10,2),
    "costo" DECIMAL(10,2) NOT NULL,
    "costoAlt1" DECIMAL(10,2),
    "costoAlt2" DECIMAL(10,2),
    "gratis" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Rango_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuntoRecojo" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "referencia" TEXT,
    "ubigeo" CHAR(6),
    "horario" TEXT,
    "telefono" TEXT,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "costo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PuntoRecojo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Apariencia" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "nombreEmpresa" TEXT,
    "colorPrincipal" TEXT NOT NULL DEFAULT '#0B5CFF',
    "colorBoton" TEXT NOT NULL DEFAULT '#0B5CFF',
    "colorTextoBoton" TEXT NOT NULL DEFAULT '#FFFFFF',
    "radio" INTEGER NOT NULL DEFAULT 12,
    "tituloEncabezado" TEXT NOT NULL DEFAULT '¿Dónde quieres recibir tu pedido?',
    "subtitulo" TEXT NOT NULL DEFAULT 'Detectaremos tu distrito para mostrarte las opciones de entrega disponibles.',
    "textoBoton" TEXT NOT NULL DEFAULT 'Continuar al pago',
    "mostrarExpress" BOOLEAN NOT NULL DEFAULT true,
    "mostrarRecojo" BOOLEAN NOT NULL DEFAULT true,
    "mostrarTelefono" BOOLEAN NOT NULL DEFAULT true,
    "mostrarReferencia" BOOLEAN NOT NULL DEFAULT true,
    "mostrarDocumento" BOOLEAN NOT NULL DEFAULT true,
    "mostrarTerminos" BOOLEAN NOT NULL DEFAULT true,
    "mostrarGeolocalizacion" BOOLEAN NOT NULL DEFAULT true,
    "mostrarBuscadorDireccion" BOOLEAN NOT NULL DEFAULT true,
    "actualizadaEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Apariencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ajustes" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "etiquetaEstandar" TEXT NOT NULL DEFAULT 'Envío estándar',
    "descripcionEstandar" TEXT NOT NULL DEFAULT 'Entrega en 2 a 5 días hábiles',
    "etiquetaExpress" TEXT NOT NULL DEFAULT 'Envío express',
    "descripcionExpress" TEXT NOT NULL DEFAULT 'Entrega en 24 horas',
    "etiquetaRecojo" TEXT NOT NULL DEFAULT 'Recojo en tienda',
    "descripcionRecojo" TEXT NOT NULL DEFAULT 'Sin costo de envío',
    "politicaSinTarifa" "PoliticaSinTarifa" NOT NULL DEFAULT 'BLOQUEAR',
    "costoPorDefecto" DECIMAL(10,2),
    "columnaCostoActiva" INTEGER NOT NULL DEFAULT 0,
    "terminosTexto" TEXT,
    "terminosUrl" TEXT,
    "terminosObligatorio" BOOLEAN NOT NULL DEFAULT true,
    "actualizadaEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ajustes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suscripcion" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "chargeGid" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'PROFESIONAL',
    "estado" "EstadoSuscripcion" NOT NULL DEFAULT 'PENDIENTE',
    "precio" DECIMAL(10,2),
    "moneda" TEXT NOT NULL DEFAULT 'USD',
    "pruebaHasta" TIMESTAMP(3),
    "periodoFin" TIMESTAMP(3),
    "esPrueba" BOOLEAN NOT NULL DEFAULT false,
    "actualizadaEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Importacion" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "archivo" TEXT NOT NULL,
    "estado" "EstadoImportacion" NOT NULL DEFAULT 'ANALIZANDO',
    "mapeo" JSONB,
    "totalFilas" INTEGER NOT NULL DEFAULT 0,
    "validos" INTEGER NOT NULL DEFAULT 0,
    "nuevos" INTEGER NOT NULL DEFAULT 0,
    "actualizados" INTEGER NOT NULL DEFAULT 0,
    "duplicados" INTEGER NOT NULL DEFAULT 0,
    "errores" INTEGER NOT NULL DEFAULT 0,
    "detalleErrores" JSONB,
    "progreso" INTEGER NOT NULL DEFAULT 0,
    "iniciadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEn" TIMESTAMP(3),

    CONSTRAINT "Importacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesionEnvio" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "cartToken" TEXT,
    "datos" JSONB NOT NULL,
    "metodo" "TipoMetodo" NOT NULL,
    "ubigeo" CHAR(6),
    "costo" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "usada" BOOLEAN NOT NULL DEFAULT false,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SesionEnvio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evento" (
    "id" TEXT NOT NULL,
    "shopId" TEXT,
    "nivel" "NivelLog" NOT NULL DEFAULT 'INFO',
    "tipo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "meta" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultaDocumento" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "tipoDoc" TEXT NOT NULL,
    "ultimosDigitos" CHAR(3) NOT NULL,
    "resultado" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "duracionMs" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultaDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_dominio_key" ON "Shop"("dominio");

-- CreateIndex
CREATE INDEX "Shop_instalada_idx" ON "Shop"("instalada");

-- CreateIndex
CREATE INDEX "Departamento_clave_idx" ON "Departamento"("clave");

-- CreateIndex
CREATE INDEX "Provincia_codDep_idx" ON "Provincia"("codDep");

-- CreateIndex
CREATE INDEX "Provincia_clave_idx" ON "Provincia"("clave");

-- CreateIndex
CREATE INDEX "Distrito_codProv_idx" ON "Distrito"("codProv");

-- CreateIndex
CREATE INDEX "Distrito_codDep_idx" ON "Distrito"("codDep");

-- CreateIndex
CREATE INDEX "Distrito_clave_idx" ON "Distrito"("clave");

-- CreateIndex
CREATE INDEX "Tarifa_shopId_codDep_idx" ON "Tarifa"("shopId", "codDep");

-- CreateIndex
CREATE INDEX "Tarifa_shopId_codProv_idx" ON "Tarifa"("shopId", "codProv");

-- CreateIndex
CREATE INDEX "Tarifa_shopId_activo_idx" ON "Tarifa"("shopId", "activo");

-- CreateIndex
CREATE INDEX "Tarifa_shopId_nombreDist_idx" ON "Tarifa"("shopId", "nombreDist");

-- CreateIndex
CREATE UNIQUE INDEX "Tarifa_shopId_ubigeo_key" ON "Tarifa"("shopId", "ubigeo");

-- CreateIndex
CREATE INDEX "MetodoEnvio_tipo_idx" ON "MetodoEnvio"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "MetodoEnvio_tarifaId_tipo_key" ON "MetodoEnvio"("tarifaId", "tipo");

-- CreateIndex
CREATE INDEX "Rango_metodoId_montoMin_idx" ON "Rango"("metodoId", "montoMin");

-- CreateIndex
CREATE UNIQUE INDEX "Rango_metodoId_orden_key" ON "Rango"("metodoId", "orden");

-- CreateIndex
CREATE INDEX "PuntoRecojo_shopId_activo_idx" ON "PuntoRecojo"("shopId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "Apariencia_shopId_key" ON "Apariencia"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Ajustes_shopId_key" ON "Ajustes"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Suscripcion_shopId_key" ON "Suscripcion"("shopId");

-- CreateIndex
CREATE INDEX "Importacion_shopId_iniciadaEn_idx" ON "Importacion"("shopId", "iniciadaEn");

-- CreateIndex
CREATE UNIQUE INDEX "SesionEnvio_token_key" ON "SesionEnvio"("token");

-- CreateIndex
CREATE INDEX "SesionEnvio_shopId_creadaEn_idx" ON "SesionEnvio"("shopId", "creadaEn");

-- CreateIndex
CREATE INDEX "SesionEnvio_expiraEn_idx" ON "SesionEnvio"("expiraEn");

-- CreateIndex
CREATE INDEX "Evento_shopId_creadoEn_idx" ON "Evento"("shopId", "creadoEn");

-- CreateIndex
CREATE INDEX "Evento_tipo_idx" ON "Evento"("tipo");

-- CreateIndex
CREATE INDEX "ConsultaDocumento_shopId_creadoEn_idx" ON "ConsultaDocumento"("shopId", "creadoEn");

-- AddForeignKey
ALTER TABLE "Provincia" ADD CONSTRAINT "Provincia_codDep_fkey" FOREIGN KEY ("codDep") REFERENCES "Departamento"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distrito" ADD CONSTRAINT "Distrito_codProv_fkey" FOREIGN KEY ("codProv") REFERENCES "Provincia"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarifa" ADD CONSTRAINT "Tarifa_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarifa" ADD CONSTRAINT "Tarifa_ubigeo_fkey" FOREIGN KEY ("ubigeo") REFERENCES "Distrito"("ubigeo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetodoEnvio" ADD CONSTRAINT "MetodoEnvio_tarifaId_fkey" FOREIGN KEY ("tarifaId") REFERENCES "Tarifa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rango" ADD CONSTRAINT "Rango_metodoId_fkey" FOREIGN KEY ("metodoId") REFERENCES "MetodoEnvio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuntoRecojo" ADD CONSTRAINT "PuntoRecojo_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apariencia" ADD CONSTRAINT "Apariencia_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ajustes" ADD CONSTRAINT "Ajustes_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suscripcion" ADD CONSTRAINT "Suscripcion_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Importacion" ADD CONSTRAINT "Importacion_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionEnvio" ADD CONSTRAINT "SesionEnvio_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultaDocumento" ADD CONSTRAINT "ConsultaDocumento_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

