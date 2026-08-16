import { describe, expect, it } from "vitest";
import { urlCorreo, urlWhatsapp } from "../app/lib/contacto";

describe("enlace de WhatsApp", () => {
  it("añade el prefijo de Perú a un móvil de 9 dígitos", () => {
    expect(urlWhatsapp("987654321")).toBe("https://wa.me/51987654321");
  });

  it("acepta el número como lo escribiría cualquiera", () => {
    expect(urlWhatsapp("+51 987 654 321")).toBe("https://wa.me/51987654321");
    expect(urlWhatsapp("(51) 987-654-321")).toBe("https://wa.me/51987654321");
  });

  it("no duplica el prefijo si ya viene", () => {
    expect(urlWhatsapp("51987654321")).toBe("https://wa.me/51987654321");
  });

  it("devuelve null si el número no cuadra", () => {
    // Un enlace mal formado no da error: abre WhatsApp con un número que no
    // existe. Es peor que no ofrecer el botón.
    expect(urlWhatsapp("123")).toBeNull();
    expect(urlWhatsapp("")).toBeNull();
    expect(urlWhatsapp(null)).toBeNull();
  });
});

describe("enlace de correo", () => {
  it("acepta una dirección válida", () => {
    expect(urlCorreo(" ventas@tienda.com ")).toBe("mailto:ventas@tienda.com");
  });

  it("rechaza lo que no es un correo", () => {
    expect(urlCorreo("ventas")).toBeNull();
    expect(urlCorreo(null)).toBeNull();
  });
});
