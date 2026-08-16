import { json } from "@remix-run/node";
import prisma from "../db.server";

/**
 * Comprobación de estado para el balanceador de Render.
 *
 * Devuelve 200 aunque la base de datos no responda: si devolviera error,
 * Render reiniciaría el servicio en bucle durante un corte pasajero de la
 * base, que es justo lo contrario de lo que queremos. El estado real va en el
 * cuerpo de la respuesta para poder diagnosticarlo.
 */
export const loader = async () => {
  let baseDatos = "desconocida";
  let distritos: number | null = null;

  try {
    distritos = await prisma.distrito.count();
    baseDatos = "conectada";
  } catch (e) {
    baseDatos = `error: ${(e as Error).message.slice(0, 120)}`;
  }

  return json(
    {
      estado: "ok",
      version: "1.0.0",
      /**
       * Commit desplegado. Render lo expone solo en RENDER_GIT_COMMIT.
       *
       * Sirve para responder de un vistazo a «¿los dos servicios corren el
       * mismo código?». Sin esto hay que deducirlo por el comportamiento, que
       * es justo lo que nos costó horas comparando dos tiendas que parecían
       * iguales. No es información sensible: es el hash de un commit.
       */
      commit: (process.env.RENDER_GIT_COMMIT ?? "desconocido").slice(0, 8),
      baseDatos,
      distritosCargados: distritos,
      catalogoCompleto: distritos === 1874,
      hora: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};
