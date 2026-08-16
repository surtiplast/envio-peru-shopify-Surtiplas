/**
 * Suscripciones con la Billing API de Shopify.
 *
 * La app NO ve ni almacena datos de tarjeta: Shopify cobra al comerciante en
 * su factura y nos notifica por webhook. Aquí solo guardamos el estado.
 */
import prisma from "../../db.server";
import type { ClienteAdmin } from "./carrier.server";
import { registrarEvento } from "./tienda.server";

const CREAR_SUSCRIPCION = `#graphql
  mutation crearSuscripcion(
    $name: String!
    $returnUrl: URL!
    $trialDays: Int
    $test: Boolean
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      trialDays: $trialDays
      test: $test
      lineItems: $lineItems
    ) {
      confirmationUrl
      appSubscription { id status currentPeriodEnd trialDays }
      userErrors { field message }
    }
  }
`;

const SUSCRIPCION_ACTUAL = `#graphql
  query suscripcionActual {
    currentAppInstallation {
      activeSubscriptions { id name status currentPeriodEnd test trialDays }
    }
  }
`;

const CANCELAR = `#graphql
  mutation cancelar($id: ID!) {
    appSubscriptionCancel(id: $id) {
      appSubscription { id status }
      userErrors { field message }
    }
  }
`;

export const PLAN = {
  nombre: process.env.BILLING_PLAN_NAME ?? "Plan Profesional",
  precio: Number(process.env.BILLING_PLAN_AMOUNT ?? 19.9),
  moneda: process.env.BILLING_PLAN_CURRENCY ?? "USD",
  diasPrueba: Number(process.env.BILLING_TRIAL_DAYS ?? 7),
  prestaciones: [
    "Tarifas y distritos ilimitados",
    "Envío estándar, express y recojo en tienda",
    "Importación y exportación CSV / Excel",
    "Probador de tarifas",
    "Personalización del formulario",
    "Geolocalización y consulta DNI / RUC",
    "Soporte por correo",
  ],
};

export async function iniciarSuscripcion(admin: ClienteAdmin, shopId: string, dominio: string, appUrl: string) {
  const r = await admin.graphql(CREAR_SUSCRIPCION, {
    variables: {
      name: PLAN.nombre,
      returnUrl: `${appUrl.replace(/\/+$/, "")}/app/suscripcion?resultado=ok&shop=${dominio}`,
      trialDays: PLAN.diasPrueba,
      test: (process.env.BILLING_TEST ?? "true") === "true",
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: PLAN.precio, currencyCode: PLAN.moneda },
              interval: "EVERY_30_DAYS",
            },
          },
        },
      ],
    },
  });

  const datos = (await r.json())?.data?.appSubscriptionCreate;
  if (datos?.userErrors?.length) {
    throw new Error(datos.userErrors.map((e: any) => e.message).join("; "));
  }

  await prisma.suscripcion.upsert({
    where: { shopId },
    create: {
      shopId,
      chargeGid: datos.appSubscription?.id,
      plan: "PROFESIONAL",
      estado: "PENDIENTE",
      precio: PLAN.precio,
      moneda: PLAN.moneda,
      esPrueba: (process.env.BILLING_TEST ?? "true") === "true",
    },
    update: { chargeGid: datos.appSubscription?.id, estado: "PENDIENTE" },
  });

  return datos.confirmationUrl as string;
}

/** Consulta el estado real en Shopify y lo refleja en la base de datos. */
export async function sincronizarSuscripcion(admin: ClienteAdmin, shopId: string) {
  const r = await admin.graphql(SUSCRIPCION_ACTUAL);
  const activa = (await r.json())?.data?.currentAppInstallation?.activeSubscriptions?.[0];

  if (!activa) {
    await prisma.suscripcion.updateMany({
      where: { shopId, estado: "ACTIVA" },
      data: { estado: "CANCELADA" },
    });
    return null;
  }

  const estado =
    activa.status === "ACTIVE" ? "ACTIVA"
    : activa.status === "CANCELLED" ? "CANCELADA"
    : activa.status === "EXPIRED" ? "VENCIDA"
    : activa.status === "DECLINED" ? "RECHAZADA"
    : activa.status === "FROZEN" ? "CONGELADA"
    : "PENDIENTE";

  await prisma.suscripcion.upsert({
    where: { shopId },
    create: {
      shopId,
      chargeGid: activa.id,
      estado,
      precio: PLAN.precio,
      moneda: PLAN.moneda,
      esPrueba: Boolean(activa.test),
      periodoFin: activa.currentPeriodEnd ? new Date(activa.currentPeriodEnd) : null,
    },
    update: {
      chargeGid: activa.id,
      estado,
      esPrueba: Boolean(activa.test),
      periodoFin: activa.currentPeriodEnd ? new Date(activa.currentPeriodEnd) : null,
    },
  });

  return activa;
}

export async function cancelarSuscripcion(admin: ClienteAdmin, shopId: string) {
  const suscripcion = await prisma.suscripcion.findUnique({ where: { shopId } });
  if (!suscripcion?.chargeGid) return false;

  const r = await admin.graphql(CANCELAR, { variables: { id: suscripcion.chargeGid } });
  const datos = (await r.json())?.data?.appSubscriptionCancel;
  if (datos?.userErrors?.length) throw new Error(datos.userErrors.map((e: any) => e.message).join("; "));

  await prisma.suscripcion.update({ where: { shopId }, data: { estado: "CANCELADA" } });
  await registrarEvento(shopId, "billing.cancelada", "El comerciante canceló la suscripción");
  return true;
}

/** ¿Puede usar la app? Durante la prueba y con suscripción activa, sí. */
export async function suscripcionVigente(shopId: string): Promise<boolean> {
  const s = await prisma.suscripcion.findUnique({ where: { shopId } });
  if (!s) return false;
  if (s.estado === "ACTIVA") return true;
  if (s.pruebaHasta && s.pruebaHasta > new Date()) return true;
  return false;
}
