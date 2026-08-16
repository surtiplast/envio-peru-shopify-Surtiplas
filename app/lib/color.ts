/**
 * Normaliza lo que escriba el comerciante a un color hexadecimal válido.
 *
 * Acepta "FE1D00", "#fe1d00", "#F00" y devuelve siempre "#FE1D00". Sin esto,
 * un valor sin almohadilla se guarda tal cual y el navegador lo ignora: el
 * formulario sale con el color por defecto y no es evidente por qué.
 */
export function normalizarColor(valor: string, respaldo = "#000000"): string {
  const limpio = valor.trim().replace(/^#/, "").toUpperCase();

  if (/^[0-9A-F]{6}$/.test(limpio)) return `#${limpio}`;
  // Forma corta: F00 -> FF0000
  if (/^[0-9A-F]{3}$/.test(limpio)) {
    return `#${limpio[0]}${limpio[0]}${limpio[1]}${limpio[1]}${limpio[2]}${limpio[2]}`;
  }
  return respaldo;
}
