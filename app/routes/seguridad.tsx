import { APP, CORREO_CONTACTO, EMPRESA, paginaLegal } from "../lib/legal.server";

/**
 * Plan de respuesta a incidentes de seguridad: /seguridad
 *
 * Shopify pregunta en el formulario de datos protegidos si existe una política
 * de respuesta a incidentes. Esta página es esa política, y su URL sirve como
 * prueba. También indica a quién reportar una vulnerabilidad encontrada.
 */
export const loader = () =>
  paginaLegal(
    "Plan de respuesta a incidentes de seguridad",
    `
<p>
  Este documento describe cómo ${EMPRESA} detecta, contiene, comunica y resuelve
  un incidente de seguridad que afecte a ${APP} o a los datos que trata por
  cuenta de los comerciantes.
</p>

<h2>1. Qué consideramos un incidente</h2>
<p>
  Cualquier evento que comprometa la confidencialidad, la integridad o la
  disponibilidad de los datos o del servicio. Por ejemplo:
</p>
<ul>
  <li>Acceso no autorizado a la base de datos o al panel de alojamiento.</li>
  <li>Filtración o exposición de una credencial (clave de API, cadena de conexión, secreto de la app).</li>
  <li>Un fallo de la aplicación que permita a una tienda ver datos de otra.</li>
  <li>Pérdida o corrupción de datos.</li>
  <li>Suplantación del App Proxy o de los webhooks para inyectar datos falsos.</li>
  <li>Caída prolongada que impida a los comerciantes cobrar envíos.</li>
</ul>

<h2>2. Clasificación</h2>
<table>
  <tr><th>Nivel</th><th>Ejemplo</th><th>Respuesta inicial</th></tr>
  <tr>
    <td><strong>Crítico</strong></td>
    <td>Datos personales expuestos o accesibles por quien no debe; credencial de producción filtrada.</td>
    <td>Inmediata, sin esperar a horario laboral</td>
  </tr>
  <tr>
    <td><strong>Alto</strong></td>
    <td>Aislamiento entre tiendas roto sin evidencia de explotación; servicio caído por completo.</td>
    <td>Dentro de 4 horas</td>
  </tr>
  <tr>
    <td><strong>Medio</strong></td>
    <td>Vulnerabilidad reportada sin explotación conocida; degradación parcial.</td>
    <td>Dentro de 24 horas</td>
  </tr>
  <tr>
    <td><strong>Bajo</strong></td>
    <td>Dependencia con CVE que la app no expone; error puntual sin impacto en datos.</td>
    <td>Siguiente ciclo de mantenimiento</td>
  </tr>
</table>

<h2>3. Detección</h2>
<ul>
  <li>Comprobación de estado continua en <code>/salud</code> desde el alojamiento.</li>
  <li>Bitácora de eventos por tienda dentro de la app, revisable en la pantalla de diagnóstico protegida por clave.</li>
  <li>Alertas de despliegue y de caída del proveedor de alojamiento.</li>
  <li>Escaneo de secretos de GitHub, que avisa si una credencial acaba publicada en el repositorio.</li>
  <li>Avisos de terceros: Shopify, un comerciante o un investigador que escriba a
      <a href="mailto:${CORREO_CONTACTO}">${CORREO_CONTACTO}</a>.</li>
</ul>

<h2>4. Pasos ante un incidente</h2>
<h3>Paso 1 — Contener</h3>
<ul>
  <li>Si hay una credencial comprometida, rotarla de inmediato: contraseña de la base de datos, secreto de la app en el Partner Dashboard, claves de API de terceros.</li>
  <li>Si la fuga es por una ruta de la app, desactivarla o revertir al despliegue anterior.</li>
  <li>No borrar registros: hacen falta para reconstruir lo ocurrido.</li>
</ul>
<h3>Paso 2 — Evaluar</h3>
<ul>
  <li>Determinar qué datos y qué tiendas se han visto afectados, y durante cuánto tiempo.</li>
  <li>Dejar constancia escrita de la línea temporal desde el primer indicio.</li>
</ul>
<h3>Paso 3 — Comunicar</h3>
<ul>
  <li><strong>A Shopify</strong>, sin demora indebida en cuanto se confirme que hay datos de compradores implicados, a través del canal de soporte para Partners.</li>
  <li><strong>A los comerciantes afectados</strong>, por correo, explicando qué pasó, qué datos, qué hemos hecho y qué deben hacer ellos.</li>
  <li><strong>A la autoridad de protección de datos</strong> cuando la ley lo exija: en el Espacio Económico Europeo, dentro de las 72 horas conforme al artículo 33 del RGPD; en Perú, conforme a la Ley 29733 y su reglamento.</li>
  <li>Se comunica aunque la noticia sea incómoda o el incidente sea culpa nuestra. No se minimiza ni se retrasa para quedar mejor.</li>
</ul>
<h3>Paso 4 — Erradicar y restaurar</h3>
<ul>
  <li>Corregir la causa raíz y desplegar el arreglo.</li>
  <li>Si hubo pérdida de datos, restaurar desde la copia de seguridad al punto anterior al incidente.</li>
  <li>Verificar que el vector de entrada está cerrado antes de dar por resuelto el caso.</li>
</ul>
<h3>Paso 5 — Aprender</h3>
<ul>
  <li>Escribir un análisis posterior sin buscar culpables: qué falló en el sistema, no quién se equivocó.</li>
  <li>Añadir una prueba automatizada que detecte esa misma clase de fallo en el futuro.</li>
</ul>

<h2>5. Copias de seguridad y recuperación</h2>
<ul>
  <li>La base de datos gestionada mantiene copias automáticas con recuperación a un punto en el tiempo.</li>
  <li>Las copias están cifradas en reposo, igual que los datos vivos.</li>
  <li>El catálogo UBIGEO y el esquema se reconstruyen desde el repositorio, así que un despliegue limpio deja el servicio operativo aunque haya que partir de cero.</li>
</ul>

<h2>6. Prevención</h2>
<ul>
  <li>Secretos únicamente en variables de entorno; el repositorio no contiene ninguno.</li>
  <li>Entornos de prueba y de producción separados, con bases de datos distintas y secretos distintos. No se copian datos reales al de prueba.</li>
  <li>Toda consulta a datos de negocio filtra por tienda, y hay pruebas automatizadas que verifican ese aislamiento.</li>
  <li>Firma HMAC obligatoria en App Proxy y webhooks.</li>
  <li>Límite de peticiones por IP en los endpoints públicos.</li>
  <li>Acceso a los paneles de administración limitado al personal estrictamente necesario, con autenticación en dos pasos.</li>
</ul>

<h2>7. Reportar una vulnerabilidad</h2>
<p>
  Si encuentras un problema de seguridad, escríbenos a
  <a href="mailto:${CORREO_CONTACTO}">${CORREO_CONTACTO}</a> con el asunto
  «Seguridad». Agradecemos los reportes responsables: confirmamos la recepción
  en un plazo de 72 horas y te mantenemos al tanto hasta el cierre. Te pedimos
  que no publiques el detalle hasta que exista una corrección desplegada, y que
  no accedas a datos de terceros más allá de lo mínimo para demostrar el fallo.
</p>

<h2>8. Revisión</h2>
<p>
  Este plan se revisa al menos una vez al año y después de cada incidente de
  nivel alto o crítico.
</p>
`,
  );
