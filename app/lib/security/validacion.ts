/**
 * Validación y saneamiento de la entrada del comprador.
 * Se ejecuta en el servidor SIEMPRE, aunque el formulario ya haya validado.
 */

export interface ErrorCampo {
  campo: string;
  mensaje: string;
}

/** Caracteres de control ASCII: no deben llegar nunca a la base de datos. */
const CONTROLES = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

/** Quita caracteres de control, recorta y limita longitud. */
export function limpiar(valor: unknown, maxLongitud = 200): string {
  return String(valor ?? "").replace(CONTROLES, "").trim().slice(0, maxLongitud);
}

/** Teléfono peruano: móvil 9XXXXXXXX o fijo. Acepta +51, espacios y guiones. */
export function telefonoValido(valor: string): boolean {
  const soloDigitos = valor.replace(/[\s()-]/g, "").replace(/^\+?51/, "");
  return /^9\d{8}$/.test(soloDigitos) || /^0?[1-8]\d{6,7}$/.test(soloDigitos);
}

export function normalizarTelefono(valor: string): string {
  return valor.replace(/[\s()-]/g, "").replace(/^\+?51/, "");
}

export function emailValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(valor) && valor.length <= 254;
}

export interface DatosEnvio {
  nombre: string;
  apellido: string;
  telefono: string;
  email: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  razonSocial?: string;
  ubigeo: string;
  direccion: string;
  referencia?: string;
  metodo: string;
  puntoRecojoId?: string;
  aceptaTerminos?: boolean;
  latitud?: number;
  longitud?: number;
}

export interface ReglasValidacion {
  exigirTelefono: boolean;
  exigirReferencia: boolean;
  exigirTerminos: boolean;
  exigirDocumento: boolean;
}

export function validarDatosEnvio(datos: Partial<DatosEnvio>, reglas: ReglasValidacion): ErrorCampo[] {
  const errores: ErrorCampo[] = [];
  const push = (campo: string, mensaje: string) => errores.push({ campo, mensaje });

  if (!limpiar(datos.nombre)) push("nombre", "Ingresa tu nombre.");
  if (!limpiar(datos.apellido)) push("apellido", "Ingresa tus apellidos.");

  const email = limpiar(datos.email, 254);
  if (!email) push("email", "Ingresa tu correo electrónico.");
  else if (!emailValido(email)) push("email", "El correo no parece válido.");

  const telefono = limpiar(datos.telefono, 20);
  if (reglas.exigirTelefono) {
    if (!telefono) push("telefono", "Ingresa tu teléfono.");
    else if (!telefonoValido(telefono)) push("telefono", "El teléfono debe tener 9 dígitos y empezar por 9.");
  } else if (telefono && !telefonoValido(telefono)) {
    push("telefono", "El teléfono debe tener 9 dígitos y empezar por 9.");
  }

  if (reglas.exigirDocumento) {
    const tipo = limpiar(datos.tipoDocumento, 8).toUpperCase();
    // El CE puede llevar letras; DNI y RUC son solo dígitos.
    const numero =
      tipo === "CE"
        ? limpiar(datos.numeroDocumento, 15).replace(/[^0-9A-Za-z]/g, "")
        : limpiar(datos.numeroDocumento, 15).replace(/\D/g, "");
    if (!numero) push("numeroDocumento", "Ingresa tu número de documento.");
    else if (tipo === "DNI" && !/^\d{8}$/.test(numero)) push("numeroDocumento", "El DNI debe tener 8 dígitos.");
    else if (tipo === "RUC" && !/^\d{11}$/.test(numero)) push("numeroDocumento", "El RUC debe tener 11 dígitos.");
    else if (tipo === "CE" && (numero.length < 8 || numero.length > 12)) {
      push("numeroDocumento", "El carné de extranjería tiene entre 8 y 12 caracteres.");
    }
  }

  const metodo = limpiar(datos.metodo, 20).toUpperCase();
  if (!["ESTANDAR", "EXPRESS", "RECOJO"].includes(metodo)) {
    push("metodo", "Elige cómo quieres recibir tu pedido.");
  }

  if (metodo === "RECOJO") {
    if (!limpiar(datos.puntoRecojoId)) push("puntoRecojoId", "Elige la tienda donde recogerás tu pedido.");
  } else {
    if (!/^\d{6}$/.test(limpiar(datos.ubigeo, 6))) push("ubigeo", "Selecciona departamento, provincia y distrito.");
    if (!limpiar(datos.direccion)) push("direccion", "Ingresa tu dirección.");
    if (reglas.exigirReferencia && !limpiar(datos.referencia)) {
      push("referencia", "Ingresa una referencia para facilitar la entrega.");
    }
  }

  if (reglas.exigirTerminos && !datos.aceptaTerminos) {
    push("aceptaTerminos", "Debes aceptar los términos y condiciones.");
  }

  return errores;
}
