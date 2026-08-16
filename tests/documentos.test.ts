import { describe, expect, it, vi, afterEach } from "vitest";
import { ProveedorApiDocumentos } from "../app/lib/documents/api";

/** Doble de fetch que captura la URL y las cabeceras, y responde lo que le digamos. */
function simularFetch(respuesta: unknown, estado = 200) {
  const espia = vi.fn().mockResolvedValue({
    ok: estado >= 200 && estado < 300,
    status: estado,
    json: async () => respuesta,
  });
  vi.stubGlobal("fetch", espia);
  return espia;
}

afterEach(() => vi.unstubAllGlobals());

describe("plantillas de URL", () => {
  it("pone el número en la ruta y el token en la URL", async () => {
    const espia = simularFetch({ nombres: "JUAN", apellidoPaterno: "PEREZ", apellidoMaterno: "GARCIA" });
    const p = new ProveedorApiDocumentos(
      "https://ejemplo.pe/api/v1/dni/{numero}?token={token}",
      "",
      "MI-TOKEN",
      "none",
    );
    await p.consultarDni("12345678");
    expect(espia.mock.calls[0][0]).toBe("https://ejemplo.pe/api/v1/dni/12345678?token=MI-TOKEN");
  });

  it("añade ?numero= cuando la plantilla no lo lleva", async () => {
    const espia = simularFetch({ nombres: "ANA" });
    const p = new ProveedorApiDocumentos("https://ejemplo.pe/v2/reniec/dni", "", "T", "bearer");
    await p.consultarDni("12345678");
    expect(espia.mock.calls[0][0]).toBe("https://ejemplo.pe/v2/reniec/dni?numero=12345678");
    expect(espia.mock.calls[0][1].headers.Authorization).toBe("Bearer T");
  });

  it("cae a la URL base cuando no hay endpoints específicos", async () => {
    const espia = simularFetch({ nombres: "LUIS" });
    const p = new ProveedorApiDocumentos("", "", "T", "bearer", "X-Api-Key", "token", 6000, "https://ejemplo.pe/api");
    await p.consultarDni("12345678");
    expect(espia.mock.calls[0][0]).toBe("https://ejemplo.pe/api/dni?numero=12345678");
  });

  it("admite autenticación por cabecera propia", async () => {
    const espia = simularFetch({ nombres: "SARA" });
    const p = new ProveedorApiDocumentos("https://ejemplo.pe/dni", "", "CLAVE", "header", "X-Mi-Clave");
    await p.consultarDni("12345678");
    expect(espia.mock.calls[0][1].headers["X-Mi-Clave"]).toBe("CLAVE");
  });
});

describe("interpretación de respuestas", () => {
  it("acepta la respuesta envuelta en data", async () => {
    simularFetch({ success: true, data: { nombres: "MARIA", apellidoPaterno: "LOPEZ", apellidoMaterno: "DIAZ" } });
    const p = new ProveedorApiDocumentos("https://e.pe/dni", "", "T");
    const r = await p.consultarDni("12345678");
    expect(r.ok).toBe(true);
    if (r.ok && r.datos.tipo === "DNI") {
      expect(r.datos.nombres).toBe("MARIA");
      expect(r.datos.nombreCompleto).toBe("MARIA LOPEZ DIAZ");
    }
  });

  it("trata success:false como no encontrado", async () => {
    simularFetch({ success: false, message: "no existe" });
    const p = new ProveedorApiDocumentos("https://e.pe/dni", "", "T");
    const r = await p.consultarDni("12345678");
    expect(r).toMatchObject({ ok: false, codigo: "NO_ENCONTRADO" });
  });

  it("distingue credenciales rechazadas de un fallo cualquiera", async () => {
    simularFetch({}, 401);
    const p = new ProveedorApiDocumentos("https://e.pe/dni", "", "T");
    expect(await p.consultarDni("12345678")).toMatchObject({ ok: false, codigo: "NO_CONFIGURADO" });
  });

  it("informa del límite de consultas", async () => {
    simularFetch({}, 429);
    const p = new ProveedorApiDocumentos("https://e.pe/dni", "", "T");
    expect(await p.consultarDni("12345678")).toMatchObject({ ok: false, codigo: "LIMITE" });
  });
});

describe("validación previa: no gasta consultas en balde", () => {
  it("rechaza un DNI mal formado sin llamar a la API", async () => {
    const espia = simularFetch({});
    const p = new ProveedorApiDocumentos("https://e.pe/dni", "", "T");
    expect(await p.consultarDni("123")).toMatchObject({ ok: false, codigo: "INVALIDO" });
    expect(espia).not.toHaveBeenCalled();
  });

  it("rechaza un RUC con dígito verificador incorrecto sin llamar a la API", async () => {
    const espia = simularFetch({});
    const p = new ProveedorApiDocumentos("", "https://e.pe/ruc", "T");
    expect(await p.consultarRuc("20100070971")).toMatchObject({ ok: false, codigo: "INVALIDO" });
    expect(espia).not.toHaveBeenCalled();
  });

  it("un RUC válido sí consulta", async () => {
    const espia = simularFetch({ razonSocial: "EMPRESA SAC", direccion: "AV. LIMA 100", estado: "ACTIVO" });
    const p = new ProveedorApiDocumentos("", "https://e.pe/ruc/{numero}", "T", "none");
    const r = await p.consultarRuc("20100070970");
    expect(espia.mock.calls[0][0]).toBe("https://e.pe/ruc/20100070970");
    expect(r.ok).toBe(true);
    if (r.ok && r.datos.tipo === "RUC") expect(r.datos.razonSocial).toBe("EMPRESA SAC");
  });
});

describe("disponibilidad", () => {
  it("no está disponible sin token", () => {
    expect(new ProveedorApiDocumentos("https://e.pe/dni", "", "").disponible()).toBe(false);
  });
  it("no está disponible sin ninguna URL", () => {
    expect(new ProveedorApiDocumentos("", "", "T").disponible()).toBe(false);
  });
  it("está disponible con URL y token", () => {
    expect(new ProveedorApiDocumentos("https://e.pe/dni", "", "T").disponible()).toBe(true);
  });
});
