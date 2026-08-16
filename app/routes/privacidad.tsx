import { APP, CORREO_CONTACTO, EMPRESA, paginaLegal } from "../lib/legal.server";

/**
 * Política de privacidad pública: /privacidad
 *
 * Esta URL es la que se pega en la ficha de la App Store y en el formulario de
 * datos protegidos del cliente. Describe lo que la app hace DE VERDAD; si el
 * código cambia (un proveedor nuevo, un dato nuevo), hay que actualizarla.
 */
export const loader = () =>
  paginaLegal(
    "Política de privacidad",
    `
<p>
  ${APP} (en adelante, «la app») es una aplicación de Shopify desarrollada por
  ${EMPRESA} que calcula costos de envío en Perú según el distrito de destino
  (UBIGEO). Esta política explica qué datos personales trata la app, con qué
  finalidad, durante cuánto tiempo y con quién se comparten.
</p>
<p>
  La app se instala en tiendas Shopify. En esa relación, el comerciante dueño de
  la tienda es el <strong>responsable del tratamiento</strong> y ${EMPRESA}
  actúa como <strong>encargado</strong>: tratamos los datos únicamente
  siguiendo sus instrucciones y para prestarle el servicio.
</p>

<h2>1. Qué datos tratamos y por qué</h2>
<table>
  <tr><th>Dato</th><th>Finalidad</th><th>Origen</th></tr>
  <tr>
    <td>Dirección de envío (departamento, provincia, distrito, calle, número, referencia)</td>
    <td>Calcular la tarifa de envío y reponer el distrito en el pedido cuando el checkout de Shopify lo descarta. Es la función principal de la app.</td>
    <td>Formulario que completa el comprador</td>
  </tr>
  <tr>
    <td>Nombres y apellidos</td>
    <td>Identificar a quien recibe el paquete y emitir el comprobante electrónico peruano.</td>
    <td>Formulario / pedido de Shopify</td>
  </tr>
  <tr>
    <td>Teléfono</td>
    <td>Que el transportista coordine la entrega. Registrar el consentimiento de SMS si el comprador lo marca.</td>
    <td>Formulario / pedido de Shopify</td>
  </tr>
  <tr>
    <td>Correo electrónico</td>
    <td>Enviar el comprobante. Registrar el consentimiento de marketing si el comprador lo marca.</td>
    <td>Formulario / pedido de Shopify</td>
  </tr>
  <tr>
    <td>Documento de identidad (DNI, CE o RUC)</td>
    <td>Emitir boleta o factura electrónica, obligatorio por la normativa tributaria peruana.</td>
    <td>Formulario</td>
  </tr>
  <tr>
    <td>Fecha de nacimiento</td>
    <td>Solo si el comerciante activa ese campo. Se guarda en la ficha del cliente en Shopify para campañas de cumpleaños del propio comerciante.</td>
    <td>Formulario (opcional)</td>
  </tr>
  <tr>
    <td>Coordenadas de geolocalización</td>
    <td>Solo cuando el comprador pulsa «usar mi ubicación actual», para sugerirle su distrito. Se resuelven en el servidor y <strong>no se almacenan</strong>.</td>
    <td>Navegador, con permiso explícito</td>
  </tr>
</table>

<h2>2. Lo que no hacemos</h2>
<ul>
  <li>No vendemos datos personales ni los cedemos a terceros con fines comerciales.</li>
  <li>No usamos los datos de los compradores de un comerciante en beneficio de otro.</li>
  <li>No hacemos perfilado ni decisiones automatizadas con efectos jurídicos sobre las personas. Calcular un precio de envío según el distrito no lo es.</li>
  <li>No usamos los datos para entrenar modelos ni para publicidad propia.</li>
  <li>No copiamos datos reales de compradores a entornos de prueba o desarrollo.</li>
</ul>

<h2>3. Consentimiento de marketing</h2>
<p>
  La app solo marca a un comprador como suscrito al correo o a los SMS cuando él
  marca expresamente la casilla correspondiente en el formulario. La app
  <strong>nunca da de baja</strong> a nadie ni sobrescribe un consentimiento
  existente: si el comprador ya estaba suscrito o dado de baja en Shopify, esa
  decisión se respeta.
</p>

<h2>4. Con quién se comparten</h2>
<p>Solo con los proveedores necesarios para que el servicio funcione:</p>
<ul>
  <li><strong>Shopify Inc.</strong> — plataforma donde vive la tienda y el pedido.</li>
  <li><strong>Render</strong> — alojamiento del servidor de la app (región Ohio, EE. UU.).</li>
  <li><strong>Neon</strong> — base de datos PostgreSQL gestionada.</li>
  <li><strong>Google Maps Platform</strong> — solo geocodificación, y solo si el comprador pide usar su ubicación. Recibe unas coordenadas o un texto de dirección, nunca su nombre, correo ni documento.</li>
  <li><strong>Proveedor de consulta RENIEC/SUNAT</strong> — solo si el comerciante activa la búsqueda por documento. Recibe únicamente el número de documento.</li>
</ul>
<p>
  También puede compartirse cuando lo exija una autoridad competente conforme a
  la ley aplicable.
</p>

<h2>5. Transferencias internacionales</h2>
<p>
  Los servidores están en Estados Unidos. Al instalar la app, el comerciante
  acepta que los datos se traten allí, con las garantías contractuales de cada
  proveedor.
</p>

<h2>6. Cuánto tiempo los guardamos</h2>
<ul>
  <li>Los datos de una tienda se conservan mientras la app esté instalada.</li>
  <li>Al desinstalarla, el webhook <code>app/uninstalled</code> elimina la sesión de acceso de inmediato.</li>
  <li>Cuando Shopify envía <code>shop/redact</code> (48 horas después de la desinstalación), se borran los datos de esa tienda.</li>
  <li>Cuando Shopify envía <code>customers/redact</code>, se borran los datos del comprador indicado.</li>
  <li>Las sesiones de envío del comprador (el vínculo temporal entre el formulario y el checkout) caducan solas a las pocas horas.</li>
  <li>La bitácora técnica guarda solo los tres últimos dígitos de un documento consultado, nunca el número completo.</li>
</ul>

<h2>7. Seguridad</h2>
<ul>
  <li>Todo el tráfico va por HTTPS con TLS.</li>
  <li>La base de datos está cifrada en reposo con AES-256, y sus copias de seguridad también.</li>
  <li>Las llamadas del formulario van firmadas con HMAC por el App Proxy de Shopify; una petición sin firma válida se rechaza.</li>
  <li>Las claves y secretos viven solo en variables de entorno del servidor, nunca en el repositorio ni en el navegador.</li>
  <li>Las claves de geolocalización y de consulta de documento se usan exclusivamente en el servidor: el navegador del comprador nunca las ve.</li>
  <li>La pantalla de diagnóstico interna exige una clave; sin ella responde 404.</li>
  <li>Hay límite de peticiones por IP en todos los endpoints públicos.</li>
</ul>

<h2>8. Derechos de las personas</h2>
<p>
  Cualquier comprador puede solicitar acceso, rectificación, supresión,
  oposición o portabilidad de sus datos. Como actuamos por cuenta del
  comerciante, lo habitual es dirigir la solicitud a la tienda donde se hizo la
  compra; Shopify nos traslada esas solicitudes automáticamente mediante los
  webhooks <code>customers/data_request</code> y <code>customers/redact</code>,
  que la app atiende. También puedes escribirnos directamente a
  <a href="mailto:${CORREO_CONTACTO}">${CORREO_CONTACTO}</a> y responderemos en
  un plazo máximo de 30 días.
</p>
<p>
  En Perú, estos derechos están reconocidos por la Ley 29733 de Protección de
  Datos Personales y su reglamento, y puedes reclamar ante la Autoridad Nacional
  de Protección de Datos Personales. Si resides en el Espacio Económico Europeo,
  te amparan además los artículos 15 a 22 del RGPD.
</p>

<h2>9. Menores de edad</h2>
<p>
  La app no está dirigida a menores de edad y no recoge datos de ellos a
  sabiendas.
</p>

<h2>10. Cambios en esta política</h2>
<p>
  Si cambiamos algo sustancial, actualizaremos la fecha del encabezado y, cuando
  el cambio afecte a cómo tratamos los datos, avisaremos a los comerciantes con
  la app instalada por correo electrónico.
</p>

<h2>11. Acuerdo de tratamiento de datos</h2>
<p>
  Esta sección, junto con el resto de esta política, constituye el
  <strong>acuerdo de tratamiento de datos</strong> entre ${EMPRESA} y el
  comerciante que instala la app. Al instalarla, el comerciante acepta estos
  términos.
</p>
<h3>11.1 Papeles de cada parte</h3>
<p>
  El comerciante es el <strong>responsable del tratamiento</strong>: decide qué
  datos se recogen y para qué. ${EMPRESA} es el <strong>encargado</strong>:
  trata esos datos únicamente para prestar el servicio descrito en esta
  política y siguiendo las instrucciones del comerciante.
</p>
<h3>11.2 Objeto, duración y naturaleza</h3>
<ul>
  <li><strong>Objeto:</strong> calcular tarifas de envío por distrito peruano, precargar la dirección en el checkout y completar los datos del pedido.</li>
  <li><strong>Duración:</strong> mientras la app esté instalada, más los plazos de supresión del apartado 6.</li>
  <li><strong>Categorías de interesados:</strong> compradores de la tienda.</li>
  <li><strong>Categorías de datos:</strong> los enumerados en el apartado 1.</li>
</ul>
<h3>11.3 Obligaciones de ${EMPRESA}</h3>
<ul>
  <li>Tratar los datos solo para las finalidades declaradas, nunca para fines propios.</li>
  <li>Mantener la confidencialidad, también después de terminar la relación.</li>
  <li>Aplicar las medidas de seguridad del apartado 7.</li>
  <li>No incorporar subencargados distintos de los del apartado 4 sin avisar al comerciante con antelación razonable, para que pueda oponerse.</li>
  <li>Asistir al comerciante cuando un comprador ejerza sus derechos, y ante evaluaciones de impacto o consultas de una autoridad.</li>
  <li><strong>Notificar sin demora indebida</strong> cualquier violación de seguridad que afecte a sus datos, conforme a <a href="/seguridad">nuestro plan de respuesta a incidentes</a>.</li>
  <li>Suprimir o devolver los datos al terminar el servicio, salvo obligación legal de conservarlos.</li>
  <li>Poner a disposición del comerciante la información necesaria para demostrar el cumplimiento de estas obligaciones.</li>
</ul>
<h3>11.4 Obligaciones del comerciante</h3>
<ul>
  <li>Contar con base legal para el tratamiento y para encargárnoslo.</li>
  <li>Informar a sus compradores conforme a la normativa aplicable.</li>
  <li>Dar instrucciones que no infrinjan la ley.</li>
</ul>
<h3>11.5 Subencargados</h3>
<p>
  El comerciante autoriza a los proveedores del apartado 4, con los que
  ${EMPRESA} mantiene obligaciones de protección de datos equivalentes a las
  de este acuerdo.
</p>
<h3>11.6 Legislación aplicable</h3>
<p>
  Este acuerdo se rige por la Ley 29733 de Protección de Datos Personales del
  Perú y su reglamento. Cuando el tratamiento quede sujeto al RGPD, se
  entenderán incorporadas las obligaciones de su artículo 28.
</p>
<p>
  Si tu organización necesita un acuerdo firmado aparte o con cláusulas
  propias, escríbenos a
  <a href="mailto:${CORREO_CONTACTO}">${CORREO_CONTACTO}</a>.
</p>

<h2>12. Contacto</h2>
<p>
  ${EMPRESA} · <a href="mailto:${CORREO_CONTACTO}">${CORREO_CONTACTO}</a><br>
  Para asuntos de privacidad, escribe con el asunto «Privacidad» y el dominio de
  tu tienda.
</p>
`,
  );
