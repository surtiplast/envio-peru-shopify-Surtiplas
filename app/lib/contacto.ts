/**
 * Enlaces de contacto para el comprador sin cobertura.
 *
 * Función pura: sin red ni base de datos, para poder probarla.
 */

/**
 * Convierte un número peruano en un enlace de WhatsApp.
 *
 * Acepta lo que el comerciante escriba de forma natural —"987 654 321",
 * "+51 987654321", "(01) 987-654-321"— y devuelve el formato que exige wa.me:
 * solo dígitos y con prefijo de país. Un enlace mal formado no da error, abre
 * WhatsApp con un número inexistente, así que preferimos no generar ninguno
 * cuando el número no cuadra.
 */
export function urlWhatsapp(numero: string | null | undefined): string | null {
  if (!numero) return null;

  let digitos = numero.replace(/\D/g, "");
  if (!digitos) return null;

  // Un móvil peruano son 9 dígitos y empieza por 9. Si ya trae el 51 delante,
  // se respeta; si no, se añade.
  if (/^9\d{8}$/.test(digitos)) digitos = `51${digitos}`;
  else if (/^51\d{9}$/.test(digitos)) { /* ya viene completo */ }
  else if (digitos.length < 8 || digitos.length > 15) return null;

  return `https://wa.me/${digitos}`;
}

/** Enlace de correo, solo si parece una dirección de verdad. */
export function urlCorreo(email: string | null | undefined): string | null {
  if (!email) return null;
  const limpio = email.trim();
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(limpio) ? `mailto:${limpio}` : null;
}
