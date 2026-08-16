import { describe, expect, it } from "vitest";
import {
  emailValido,
  limpiar,
  normalizarTelefono,
  telefonoValido,
  validarDatosEnvio,
} from "../app/lib/security/validacion";
import { dniValido, rucValido, ultimosDigitos } from "../app/lib/documents/proveedor";
import { firmarToken, verificarToken } from "../app/lib/security/proxy.server";
import { permitido } from "../app/lib/security/limite.server";

const REGLAS = {
  exigirTelefono: true,
  exigirReferencia: true,
  exigirTerminos: true,
  exigirDocumento: false,
};

const VALIDO = {
  nombre: "Rolando",
  apellido: "Pérez García",
  telefono: "987654321",
  email: "rolando@ejemplo.com",
  ubigeo: "150120",
  direccion: "Av. Brasil 1234",
  referencia: "Frente al parque",
  metodo: "ESTANDAR",
  aceptaTerminos: true,
};

describe("saneamiento", () => {
  it("elimina caracteres de control y recorta espacios", () => {
    // Tabulador + texto + carácter nulo + salto de línea: lo que llega cuando
    // alguien pega una dirección desde Excel.
    const sucio = String.fromCharCode(9) + "Av. Brasil 1234" + String.fromCharCode(0) + String.fromCharCode(10);
    expect(limpiar(sucio)).toBe("Av. Brasil 1234");
    expect(limpiar("a".repeat(500), 10)).toHaveLength(10);
    expect(limpiar(null)).toBe("");
    expect(limpiar(undefined)).toBe("");
  });
});

describe("teléfono peruano", () => {
  it("acepta móviles con y sin prefijo de país", () => {
    expect(telefonoValido("987654321")).toBe(true);
    expect(telefonoValido("+51 987 654 321")).toBe(true);
    expect(telefonoValido("51987654321")).toBe(true);
  });
  it("rechaza los que no son válidos", () => {
    expect(telefonoValido("12345")).toBe(false);
    expect(telefonoValido("98765432")).toBe(false);
    expect(telefonoValido("abcdefghi")).toBe(false);
  });
  it("normaliza quitando el prefijo del país", () => {
    expect(normalizarTelefono("+51 987-654-321")).toBe("987654321");
  });
});

describe("correo electrónico", () => {
  it("distingue correos válidos de inválidos", () => {
    expect(emailValido("a@b.pe")).toBe(true);
    expect(emailValido("rolando@ejemplo.com.pe")).toBe(true);
    expect(emailValido("sin-arroba.com")).toBe(false);
    expect(emailValido("a@b")).toBe(false);
  });
});

describe("validación del formulario", () => {
  it("acepta un formulario completo", () => {
    expect(validarDatosEnvio(VALIDO, REGLAS)).toEqual([]);
  });

  it("señala cada campo obligatorio que falta", () => {
    const campos = validarDatosEnvio({ metodo: "ESTANDAR" }, REGLAS).map((e) => e.campo);
    expect(campos).toContain("nombre");
    expect(campos).toContain("apellido");
    expect(campos).toContain("email");
    expect(campos).toContain("telefono");
    expect(campos).toContain("ubigeo");
    expect(campos).toContain("direccion");
    expect(campos).toContain("aceptaTerminos");
  });

  it("con recojo no pide dirección pero sí la sede", () => {
    const errores = validarDatosEnvio(
      { ...VALIDO, metodo: "RECOJO", ubigeo: "", direccion: "", referencia: "" },
      REGLAS,
    );
    expect(errores.map((e) => e.campo)).toEqual(["puntoRecojoId"]);
  });

  it("no exige teléfono ni referencia si el comerciante los ocultó", () => {
    const errores = validarDatosEnvio(
      { ...VALIDO, telefono: "", referencia: "" },
      { ...REGLAS, exigirTelefono: false, exigirReferencia: false },
    );
    expect(errores).toEqual([]);
  });

  it("valida el DNI cuando el documento es obligatorio", () => {
    const errores = validarDatosEnvio(
      { ...VALIDO, tipoDocumento: "DNI", numeroDocumento: "123" },
      { ...REGLAS, exigirDocumento: true },
    );
    expect(errores.some((e) => e.campo === "numeroDocumento")).toBe(true);
  });

  it("rechaza un método de entrega inventado", () => {
    expect(validarDatosEnvio({ ...VALIDO, metodo: "DRON" }, REGLAS).some((e) => e.campo === "metodo")).toBe(true);
  });

  it("rechaza un ubigeo con formato incorrecto", () => {
    expect(validarDatosEnvio({ ...VALIDO, ubigeo: "15" }, REGLAS).some((e) => e.campo === "ubigeo")).toBe(true);
  });
});

describe("documentos peruanos", () => {
  it("valida el formato del DNI", () => {
    expect(dniValido("12345678")).toBe(true);
    expect(dniValido("1234567")).toBe(false);
    expect(dniValido("1234567a")).toBe(false);
  });

  it("valida el dígito verificador del RUC (módulo 11 de SUNAT)", () => {
    expect(rucValido("20100070970")).toBe(true);
    expect(rucValido("20100070971")).toBe(false);
    expect(rucValido("30100070970")).toBe(false);
    expect(rucValido("2010007097")).toBe(false);
  });

  it("solo expone los últimos dígitos para la bitácora", () => {
    expect(ultimosDigitos("12345678")).toBe("678");
    expect(ultimosDigitos("12345678")).not.toContain("12345");
  });
});

describe("tokens firmados", () => {
  it("acepta un token propio y rechaza uno alterado", () => {
    const token = firmarToken("sesion-123", "secreto-de-prueba");
    expect(verificarToken(token, "secreto-de-prueba")).toBe("sesion-123");
    expect(verificarToken(token, "otro-secreto")).toBeNull();
    expect(verificarToken("sesion-999." + token.split(".").pop(), "secreto-de-prueba")).toBeNull();
    expect(verificarToken("sin-firma", "secreto-de-prueba")).toBeNull();
  });
});

describe("limitador de peticiones", () => {
  it("corta al superar el máximo dentro de la ventana", () => {
    const clave = "prueba-" + Math.random();
    for (let i = 0; i < 3; i++) expect(permitido(clave, 3, 10000)).toBe(true);
    expect(permitido(clave, 3, 10000)).toBe(false);
  });

  it("cada cliente tiene su propio contador", () => {
    expect(permitido("cliente-a-" + Math.random(), 1, 10000)).toBe(true);
    expect(permitido("cliente-b-" + Math.random(), 1, 10000)).toBe(true);
  });
});

import { normalizarColor } from "../app/lib/color";

describe("normalización de colores", () => {
  it("añade la almohadilla que falta", () => {
    // Es el error real que cometió el comerciante: pegar el hexadecimal sin #.
    // Sin normalizar, el navegador ignora el valor y el formulario sale con
    // el color por defecto sin explicación.
    expect(normalizarColor("FE1D00")).toBe("#FE1D00");
  });

  it("acepta la forma corta de tres dígitos", () => {
    expect(normalizarColor("#F00")).toBe("#FF0000");
    expect(normalizarColor("abc")).toBe("#AABBCC");
  });

  it("pasa a mayúsculas y recorta espacios", () => {
    expect(normalizarColor("  #fe1d00  ")).toBe("#FE1D00");
  });

  it("cae al respaldo si no es un color", () => {
    expect(normalizarColor("rojo", "#0B5CFF")).toBe("#0B5CFF");
    expect(normalizarColor("", "#0B5CFF")).toBe("#0B5CFF");
    expect(normalizarColor("#12345", "#0B5CFF")).toBe("#0B5CFF");
  });
});


describe("carné de extranjería", () => {
  const reglas = {
    exigirTelefono: false,
    exigirReferencia: false,
    exigirTerminos: false,
    exigirDocumento: true,
  };
  const base = {
    nombre: "Ana", apellido: "Pérez", email: "ana@ejemplo.com",
    ubigeo: "150101", direccion: "Av. Siempre Viva 123", metodo: "ESTANDAR",
  };

  it("acepta un CE con letras", () => {
    // Al DNI y al RUC se les quitan las letras; al CE no, porque las lleva de
    // verdad y filtrarlas guardaría un documento que no existe.
    const errores = validarDatosEnvio(
      { ...base, tipoDocumento: "CE", numeroDocumento: "00A123456" },
      reglas,
    );
    expect(errores.find((e) => e.campo === "numeroDocumento")).toBeUndefined();
  });

  it("rechaza un CE demasiado corto", () => {
    const errores = validarDatosEnvio(
      { ...base, tipoDocumento: "CE", numeroDocumento: "123" },
      reglas,
    );
    expect(errores.find((e) => e.campo === "numeroDocumento")).toBeDefined();
  });

  it("sigue exigiendo 8 dígitos al DNI", () => {
    const errores = validarDatosEnvio(
      { ...base, tipoDocumento: "DNI", numeroDocumento: "1234" },
      reglas,
    );
    expect(errores.find((e) => e.campo === "numeroDocumento")).toBeDefined();
  });
});
