/**
 * Validación de fechas en formato ISO. Función pura, sin dependencias.
 */

/**
 * ¿Es "AAAA-MM-DD" y además una fecha que existe?
 *
 * La expresión regular sola no basta: "2025-02-31" tiene la forma correcta
 * pero no existe, y Shopify rechaza ese valor al guardar el metacampo de
 * cumpleaños. Comprobamos que el día siga siendo el mismo tras construir la
 * fecha, que es lo que delata un desbordamiento de mes.
 */
export function fechaIsoValida(valor: string | null | undefined): boolean {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;

  const [anio, mes, dia] = valor.split("-").map(Number);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;

  // El mes va de 0 a 11 en Date; se usa UTC para que la zona horaria del
  // servidor no desplace el día.
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    d.getUTCFullYear() === anio &&
    d.getUTCMonth() === mes - 1 &&
    d.getUTCDate() === dia
  );
}
