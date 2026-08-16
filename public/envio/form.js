/**
 * Formulario de envío — Perú.
 * JavaScript sin dependencias: se sirve desde el dominio de la tienda a través
 * del App Proxy, así que /cart.js y /cart/update.js son del mismo origen.
 */
(function () {
  "use strict";

  /**
   * Configuración y contenedor.
   *
   * Hay dos formas de usar este formulario:
   *
   *  1. En su propia página (/apps/envio): el servidor incrusta la
   *     configuración en un <script id="ep-config"> y el contenedor ya existe.
   *  2. Incrustado en el tema (por ejemplo en la página del carrito): solo hay
   *     un <div id="ep-app"> y la configuración se pide a la API.
   *
   * Por eso nada se resuelve al cargar el archivo, sino en arrancar().
   */
  var CFG = null;
  var API = null;
  var app = null;

  // ---------------------------------------------------------------- estado
  var estado = {
    /** 1 = identificación, 2 = método de entrega y datos. */
    paso: 1,
    /** Primer nivel de la elección: DESPACHO o RECOJO. */
    familia: "DESPACHO",
    carrito: null,
    subtotal: 0,
    departamentos: [],
    provincias: [],
    distritos: [],
    codDep: "",
    codProv: "",
    ubigeo: "",
    opciones: [],
    metodo: "",
    puntoRecojo: "",
    costoEnvio: 0,
    sugerencias: [],
    direccionDetectada: null,
    errores: {},
    avisoDoc: null,
    cargando: { cotizar: false, geo: false, doc: false, enviar: false },
    datos: {
      nombre: "", apellido: "", telefono: "", email: "",
      tipoComprobante: "BOLETA", tipoDocumento: "DNI", numeroDocumento: "", razonSocial: "",
      fechaNacimiento: "",
      direccion: "", referencia: "", aceptaTerminos: false,
      aceptaMarketingEmail: false, aceptaMarketingSms: false,
    },
  };

  // ------------------------------------------------------------- utilidades
  function soles(centimos) {
    return "S/ " + (centimos / 100).toFixed(2);
  }

  function esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function pedir(ruta, opciones) {
    return fetch(API + ruta, Object.assign({ headers: { "Content-Type": "application/json" } }, opciones))
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
  }

  function rebotar(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  // -------------------------------------------------------------- carrito
  function cargarCarrito() {
    return fetch("/cart.js", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (c) {
        estado.carrito = c;
        // items_subtotal_price ya viene con descuentos de línea aplicados.
        estado.subtotal = c.items_subtotal_price != null ? c.items_subtotal_price : c.total_price;
        return c;
      })
      .catch(function () {
        estado.carrito = { items: [], item_count: 0 };
        estado.subtotal = 0;
      });
  }

  // ------------------------------------------------------------- cotización
  function cotizar() {
    if (!estado.ubigeo) { estado.opciones = []; return Promise.resolve(); }
    estado.cargando.cotizar = true;
    pintar();

    return pedir("/cotizar", {
      method: "POST",
      body: JSON.stringify({ ubigeo: estado.ubigeo, subtotal: estado.subtotal }),
    })
      .then(function (r) {
        estado.opciones = (r.opciones || []).filter(function (o) {
          if (o.tipo === "EXPRESS" && !CFG.apariencia.mostrarExpress) return false;
          if (o.tipo === "RECOJO" && !CFG.apariencia.mostrarRecojo) return false;
          return true;
        });
        // Si el comerciante configuró puntos de recojo, siempre ofrecemos recojo.
        if (CFG.apariencia.mostrarRecojo && !estado.opciones.some(function (o) { return o.tipo === "RECOJO"; })) {
          estado.opciones.push({
            tipo: "RECOJO",
            etiqueta: "Recojo en tienda",
            descripcion: "Retira tu pedido sin costo de envío",
            costo: 0, gratis: true,
          });
        }
        var candidatas = estado.familia === "RECOJO"
          ? estado.opciones.filter(function (o) { return o.tipo === "RECOJO"; })
          : estado.opciones.filter(function (o) { return o.tipo !== "RECOJO"; });

        var elegida = candidatas.filter(function (o) { return o.tipo === estado.metodo; })[0];
        if (!elegida) {
          // Si no hay ninguna opción en esta familia, dejamos el método vacío.
          // Antes se quedaba el anterior y el costo caía a 0, que se pinta como
          // GRATIS: exactamente lo contrario de "no llegamos a este distrito".
          estado.metodo = candidatas.length ? candidatas[0].tipo : "";
          elegida = candidatas[0];
        }
        estado.costoEnvio = elegida ? elegida.costo : 0;
      })
      .catch(function () { estado.opciones = []; })
      .then(function () {
        estado.cargando.cotizar = false;
        pintar();
      });
  }

  // ----------------------------------------------------- selector dependiente
  function cargarProvincias(codDep) {
    estado.codDep = codDep;
    estado.codProv = "";
    estado.ubigeo = "";
    estado.provincias = [];
    estado.distritos = [];
    estado.opciones = [];
    if (!codDep) { pintar(); return; }
    pedir("/ubigeo?dep=" + encodeURIComponent(codDep)).then(function (r) {
      estado.provincias = r.provincias || [];
      pintar();
    });
    pintar();
  }

  function cargarDistritos(codProv) {
    estado.codProv = codProv;
    estado.ubigeo = "";
    estado.distritos = [];
    estado.opciones = [];
    if (!codProv) { pintar(); return; }
    pedir("/ubigeo?prov=" + encodeURIComponent(codProv)).then(function (r) {
      estado.distritos = r.distritos || [];
      pintar();
    });
    pintar();
  }

  function elegirDistrito(ubigeo) {
    estado.ubigeo = ubigeo;
    delete estado.errores.ubigeo;
    cotizar();
  }

  // ------------------------------------------------------- geolocalización
  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      estado.errores.geo = "Tu navegador no permite compartir la ubicación.";
      pintar();
      return;
    }
    estado.cargando.geo = true;
    delete estado.errores.geo;
    pintar();

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        pedir("/geo", {
          method: "POST",
          body: JSON.stringify({
            accion: "inversa",
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        })
          .then(aplicarUbicacion)
          .catch(function () {
            estado.errores.geo = "No pudimos detectar tu distrito. Selecciónalo manualmente.";
          })
          .then(function () { estado.cargando.geo = false; pintar(); });
      },
      function (err) {
        estado.cargando.geo = false;
        estado.errores.geo =
          err.code === 1
            ? "No nos diste permiso para usar tu ubicación. Puedes elegir tu distrito manualmente."
            : "No pudimos obtener tu ubicación. Selecciona tu distrito manualmente.";
        pintar();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  function aplicarUbicacion(r) {
    if (!r || !r.direccion) {
      estado.errores.geo = r && r.motivo === "LIMITE"
        ? "El servicio de mapas está ocupado. Espera unos segundos o elige tu distrito en la lista."
        : "No pudimos identificar tu distrito. Selecciónalo manualmente.";
      return;
    }
    estado.direccionDetectada = r.direccion;
    // Preferimos la calle y el número. El texto completo del mapa empieza por
    // el edificio más cercano y repite distrito, provincia y país, que ya van
    // en sus propios campos.
    var calle = r.direccion.direccionCorta || r.direccion.direccionCompleta;
    if (calle && !estado.datos.direccion) {
      estado.datos.direccion = calle;
    }
    if (r.ubigeo && !r.requiereConfirmacion) {
      estado.codDep = r.ubigeo.codDep;
      estado.codProv = r.ubigeo.codProv;
      estado.ubigeo = r.ubigeo.ubigeo;
      estado.provincias = r.provincias || [];
      estado.distritos = r.distritos || [];
      delete estado.errores.ubigeo;
      cotizar();
    } else {
      estado.errores.geo = "Encontramos tu dirección, pero confirma tu distrito para calcular el envío.";
      if (r.ubigeo) {
        estado.codDep = r.ubigeo.codDep;
        estado.provincias = r.provincias || [];
      }
    }
  }

  var buscarDireccion = rebotar(function (texto) {
    if (!texto || texto.length < 4) { estado.sugerencias = []; pintar(); return; }
    pedir("/geo", { method: "POST", body: JSON.stringify({ accion: "autocompletar", texto: texto }) })
      .then(function (r) { estado.sugerencias = r.sugerencias || []; pintar(); })
      .catch(function () { estado.sugerencias = []; });
  }, 350);

  function elegirSugerencia(referencia, descripcion) {
    estado.sugerencias = [];
    estado.datos.direccion = descripcion;
    estado.cargando.geo = true;
    pintar();
    pedir("/geo", { method: "POST", body: JSON.stringify({ accion: "detalle", referencia: referencia }) })
      .then(aplicarUbicacion)
      .catch(function () { estado.errores.geo = "No pudimos ubicar esa dirección."; })
      .then(function () { estado.cargando.geo = false; pintar(); });
  }

  // ------------------------------------------------------------- DNI / RUC
  function consultarDocumento() {
    var tipo = estado.datos.tipoDocumento;
    if (tipo === "CE") return; // no hay servicio de consulta para el carné
    var numero = (estado.datos.numeroDocumento || "").replace(/\D/g, "");
    var largo = tipo === "DNI" ? 8 : 11;

    if (numero.length !== largo) {
      estado.errores.numeroDocumento = "El " + tipo + " debe tener " + largo + " dígitos.";
      pintar();
      return;
    }

    estado.cargando.doc = true;
    estado.avisoDoc = null;
    delete estado.errores.numeroDocumento;
    pintar();

    pedir("/documento", { method: "POST", body: JSON.stringify({ tipo: tipo, numero: numero }) })
      .then(function (r) {
        if (r.ok && r.datos) {
          if (r.datos.tipo === "DNI") {
            estado.datos.nombre = r.datos.nombres || estado.datos.nombre;
            estado.datos.apellido = [r.datos.apellidoPaterno, r.datos.apellidoMaterno].filter(Boolean).join(" ") || estado.datos.apellido;
            estado.avisoDoc = { tono: "exito", texto: "Datos encontrados" };
          } else {
            // La razón social es de la EMPRESA. El nombre y los apellidos son de
            // la persona que recibe el pedido, y no se deducen del RUC: se
            // dejan para que los escriba quien compra.
            estado.datos.razonSocial = r.datos.razonSocial;
            if (r.datos.direccionFiscal && !estado.datos.direccion) {
              estado.datos.direccion = r.datos.direccionFiscal;
            }
            // Si SUNAT devuelve el ubigeo del domicilio fiscal, preseleccionamos
            // el distrito: al comprador le ahorra tres desplegables.
            if (r.datos.ubigeo && /^\d{6}$/.test(r.datos.ubigeo) && !estado.ubigeo) {
              preseleccionarUbigeo(r.datos.ubigeo);
            }
            estado.avisoDoc = {
              tono: "exito",
              texto: "Empresa encontrada: " + r.datos.razonSocial + (r.datos.estado ? " · " + r.datos.estado : ""),
            };
          }
        } else {
          estado.avisoDoc = { tono: "atencion", texto: r.mensajeUsuario || r.mensaje || "No encontramos ese documento." };
        }
      })
      .catch(function () {
        estado.avisoDoc = {
          tono: "atencion",
          texto: "No pudimos consultar los datos automáticamente. Puedes completar tus datos manualmente.",
        };
      })
      .then(function () { estado.cargando.doc = false; pintar(); });
  }

  /** Rellena departamento, provincia y distrito a partir de un UBIGEO. */
  function preseleccionarUbigeo(ubigeo) {
    var codDep = ubigeo.slice(0, 2);
    var codProv = ubigeo.slice(0, 4);

    pedir("/ubigeo?dep=" + encodeURIComponent(codDep))
      .then(function (r) {
        estado.provincias = r.provincias || [];
        estado.codDep = codDep;
        return pedir("/ubigeo?prov=" + encodeURIComponent(codProv));
      })
      .then(function (r) {
        estado.distritos = r.distritos || [];
        estado.codProv = codProv;
        if (estado.distritos.some(function (d) { return d.ubigeo === ubigeo; })) {
          estado.ubigeo = ubigeo;
          delete estado.errores.ubigeo;
          cotizar();
        }
        pintar();
      })
      .catch(function () { /* si falla, el comprador los elige a mano */ });
  }

  // ------------------------------------------------------------- validación
  function validar() {
    var e = {};
    var d = estado.datos;

    if (!d.nombre.trim()) e.nombre = "Ingresa tu nombre.";
    if (!d.apellido.trim()) e.apellido = "Ingresa tus apellidos.";
    if (!d.email.trim()) e.email = "Ingresa tu correo electrónico.";
    else if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(d.email)) e.email = "El correo no parece válido.";

    if (CFG.apariencia.mostrarTelefono) {
      var tel = (d.telefono || "").replace(/[\s()-]/g, "").replace(/^\+?51/, "");
      if (!tel) e.telefono = "Ingresa tu teléfono.";
      else if (!/^9\d{8}$/.test(tel)) e.telefono = "Debe tener 9 dígitos y empezar por 9.";
    }

    if (estado.datos.tipoComprobante === "FACTURA") {
      var ruc = (estado.datos.numeroDocumento || "").replace(/\D/g, "");
      if (ruc.length !== 11) e.numeroDocumento = "Para factura necesitamos tu RUC de 11 dígitos.";
    }

    if (!estado.metodo) e.metodo = "Elige cómo quieres recibir tu pedido.";

    if (estado.metodo === "RECOJO") {
      if (!estado.puntoRecojo) e.puntoRecojo = "Elige la tienda donde recogerás tu pedido.";
    } else {
      if (!estado.ubigeo) e.ubigeo = "Selecciona tu departamento, provincia y distrito.";
      else if (!estado.opciones.some(function (o) { return o.tipo !== "RECOJO"; })) {
        e.ubigeo = "No realizamos envíos a este distrito.";
      }
      if (!d.direccion.trim()) e.direccion = "Ingresa tu dirección.";
      if (CFG.apariencia.mostrarReferencia && !d.referencia.trim()) e.referencia = "Ingresa una referencia.";
    }

    if (CFG.apariencia.mostrarTerminos && CFG.terminos.obligatorio && !d.aceptaTerminos) {
      e.aceptaTerminos = "Debes aceptar los términos y condiciones.";
    }

    estado.errores = e;
    return Object.keys(e).length === 0;
  }

  /** Comprueba los datos personales antes de dejar pasar al paso 2. */
  function irAPaso2() {
    var e = {};
    var d = estado.datos;

    if (!d.nombre.trim()) e.nombre = "Ingresa tu nombre.";
    if (!d.apellido.trim()) e.apellido = "Ingresa tus apellidos.";
    if (!d.email.trim()) e.email = "Ingresa tu correo electrónico.";
    else if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(d.email)) e.email = "El correo no parece válido.";

    if (CFG.apariencia.mostrarTelefono) {
      var tel = (d.telefono || "").replace(/[\s()-]/g, "").replace(/^\+?51/, "");
      if (!tel) e.telefono = "Ingresa tu teléfono.";
      else if (!/^9\d{8}$/.test(tel)) e.telefono = "Debe tener 9 dígitos y empezar por 9.";
    }

    if (d.tipoComprobante === "FACTURA") {
      var ruc = (d.numeroDocumento || "").replace(/\D/g, "");
      if (ruc.length !== 11) e.numeroDocumento = "Para factura necesitamos tu RUC de 11 dígitos.";
    }

    estado.errores = e;
    if (Object.keys(e).length) {
      pintar();
      var primero = document.querySelector(".ep-invalido");
      if (primero) primero.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    estado.paso = 2;
    pintar();
    if (app.scrollIntoView) app.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /**
   * Copia las propiedades en TODAS las líneas del carrito.
   *
   * Shopify no le pasa los atributos del carrito al CarrierService: su petición
   * solo incluye `items[].properties`. Así que lo que la app necesita para
   * calcular la tarifa (método elegido, UBIGEO y sede) tiene que viajar en cada
   * línea, no en los atributos.
   *
   * Van de una en una y en orden: el carrito de Shopify no admite cambios en
   * paralelo, y si se lanzan a la vez unos pisan a otros.
   */
  function marcarLineas(propiedades) {
    if (!propiedades) return Promise.resolve();

    return fetch("/cart.js", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (carrito) {
        var lineas = carrito.items || [];
        return lineas.reduce(function (cadena, linea) {
          return cadena.then(function () {
            // Conservamos las propiedades que ya tuviera la línea (talla, color,
            // grabados…): solo añadimos las nuestras.
            var mezcladas = Object.assign({}, linea.properties || {}, propiedades);
            return fetch("/cart/change.js", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: linea.key, properties: mezcladas }),
            }).catch(function () { /* una línea que falla no debe frenar el pago */ });
          });
        }, Promise.resolve());
      })
      .catch(function () { /* si el carrito no responde, seguimos al checkout */ });
  }

  // ------------------------------------------------- envío y paso a checkout
  function continuar() {
    if (!validar()) {
      pintar();
      var primero = document.querySelector(".ep-invalido, .ep-error-campo");
      if (primero) primero.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    estado.cargando.enviar = true;
    pintar();

    var cuerpo = {
      datos: Object.assign({}, estado.datos, {
        ubigeo: estado.ubigeo,
        metodo: estado.metodo,
        puntoRecojoId: estado.puntoRecojo,
        latitud: estado.direccionDetectada ? estado.direccionDetectada.latitud : undefined,
        longitud: estado.direccionDetectada ? estado.direccionDetectada.longitud : undefined,
      }),
      subtotal: estado.subtotal,
      cartToken: estado.carrito ? estado.carrito.token : null,
    };

    pedir("/confirmar", { method: "POST", body: JSON.stringify(cuerpo) })
      .then(function (r) {
        if (!r.ok) {
          estado.errores = (r.errores || []).reduce(function (acc, x) { acc[x.campo] = x.mensaje; return acc; }, {});
          throw new Error("validacion");
        }
        // 1) Guardamos todo en los atributos del carrito. Es lo que sobrevive
        //    hasta el pedido y lo que lee el callback del CarrierService.
        return fetch("/cart/update.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attributes: r.atributos }),
        })
          // Y en las líneas, que es lo único que llega al CarrierService.
          .then(function () { return marcarLineas(r.propiedades); })
          .then(function () { return r; });
      })
      .then(function (r) {
        // 2) Al checkout oficial de Shopify, con los datos que Shopify admite
        //    precargar por parámetro.
        window.location.href = r.urlCheckout;
      })
      .catch(function (err) {
        estado.cargando.enviar = false;
        if (err.message !== "validacion") {
          estado.errores.general = "No pudimos continuar. Revisa tu conexión e inténtalo de nuevo.";
        }
        pintar();
      });
  }

  // ------------------------------------------------------------------ vista
  function campo(id, etiqueta, valor, opciones) {
    opciones = opciones || {};
    var error = estado.errores[id];
    return (
      '<div class="ep-campo">' +
      '<label for="ep-' + id + '">' + esc(etiqueta) +
      (opciones.obligatorio ? '<span class="ep-req">*</span>' : "") +
      (opciones.opcional ? ' <span class="ep-opcional">(opcional)</span>' : "") +
      "</label>" +
      '<input class="ep-input' + (error ? " ep-invalido" : "") + '" id="ep-' + id + '" ' +
      'type="' + (opciones.tipo || "text") + '" ' +
      'inputmode="' + (opciones.inputmode || "text") + '" ' +
      'autocomplete="' + (opciones.autocomplete || "off") + '" ' +
      'placeholder="' + esc(opciones.placeholder || "") + '" ' +
      (opciones.soloLectura ? "readonly " : "") +
      'value="' + esc(valor) + '" data-campo="' + id + '">' +
      (error ? '<span class="ep-error-campo">' + esc(error) + "</span>" : "") +
      "</div>"
    );
  }

  /**
   * Aviso de zona sin cobertura, con vía de contacto.
   *
   * Decirle al comprador "no llegamos" y nada más es perderlo. Si el
   * comerciante configuró un WhatsApp o un correo, se le ofrece preguntar.
   */
  function sinCobertura(donde) {
    var c = (CFG && CFG.contacto) || {};
    var html = '<div class="ep-aviso ep-aviso-atencion ep-sin-cobertura">' +
      "<b>Aún no llegamos a " + esc(donde) + "</b>" +
      "<span>Escríbenos y vemos si podemos coordinarlo.</span>";

    if (c.whatsapp || c.correoUrl) {
      html += '<span class="ep-contacto">';
      if (c.whatsapp) {
        html += '<a href="' + esc(c.whatsapp) + '" target="_blank" rel="noopener">WhatsApp</a>';
      }
      if (c.correoUrl) {
        html += '<a href="' + esc(c.correoUrl) + '">' + esc(c.correo) + "</a>";
      }
      html += "</span>";
    }
    return html + "</div>";
  }

  /**
   * Cumpleaños en un solo campo, con formato DD/MM/AAAA.
   *
   * No se usa `<input type="date">` porque se dibuja con el calendario del
   * sistema: un teléfono configurado en calendario japonés mostraba
   * "ago 13, Reiwa 8", que el comprador peruano no entiende. Escribiéndolo
   * nosotros, se ve igual en cualquier dispositivo y siempre en español.
   */
  function fechaVisible(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "";
  }

  /** Da formato mientras se escribe y guarda la fecha en ISO cuando está completa. */
  function escribirCumple(el) {
    var digitos = el.value.replace(/\D/g, "").slice(0, 8);
    var texto = digitos;
    if (digitos.length > 4) {
      texto = digitos.slice(0, 2) + "/" + digitos.slice(2, 4) + "/" + digitos.slice(4);
    } else if (digitos.length > 2) {
      texto = digitos.slice(0, 2) + "/" + digitos.slice(2);
    }
    // Se escribe en el propio input, sin repintar: repintar aquí devolvería el
    // cursor al principio en mitad de la palabra.
    el.value = texto;

    estado.datos.fechaNacimiento =
      digitos.length === 8
        ? digitos.slice(4) + "-" + digitos.slice(2, 4) + "-" + digitos.slice(0, 2)
        : "";
  }

  function barra(texto) {
    return '<div class="ep-barra">' + esc(texto) + "</div>";
  }

  // --- PASO 1: identificación ----------------------------------------------
  function vistaIdentificacion() {
    var a = CFG.apariencia;
    var html = '<div class="ep-card ep-card-plano">';
    html += barra("Registro para elegir tu método de envío");
    html += '<p class="ep-nota">Solicitamos únicamente la información esencial para finalizar tu compra.</p>';
    html += '<h3 class="ep-paso-titulo">1. Identificación</h3>';

    var esCE = estado.datos.tipoDocumento === "CE";

    if (a.mostrarDocumento) {
      html += '<div class="ep-campo"><label for="ep-comprobante">Comprobante<span class="ep-req">*</span></label>' +
        '<select class="ep-select" id="ep-comprobante" data-campo="tipoComprobante">' +
        '<option value="BOLETA"' + (estado.datos.tipoComprobante === "BOLETA" ? " selected" : "") + ">Boleta electrónica</option>" +
        '<option value="FACTURA"' + (estado.datos.tipoComprobante === "FACTURA" ? " selected" : "") + ">Factura electrónica</option>" +
        "</select></div>";

      html += '<div class="ep-rejilla-3">' +
        '<div class="ep-campo"><label for="ep-tipodoc">Tipo documento<span class="ep-req">*</span></label>' +
        '<select class="ep-select" id="ep-tipodoc" data-campo="tipoDocumento">' +
        '<option value="DNI"' + (estado.datos.tipoDocumento === "DNI" ? " selected" : "") + ">DNI</option>" +
        '<option value="RUC"' + (estado.datos.tipoDocumento === "RUC" ? " selected" : "") + ">RUC</option>" +
        '<option value="CE"' + (estado.datos.tipoDocumento === "CE" ? " selected" : "") + ">CE</option>" +
        "</select></div>" +
        '<div class="ep-campo"><label for="ep-numdoc">N° de documento<span class="ep-req">*</span></label><div class="ep-grupo">' +
        '<input class="ep-input' + (estado.errores.numeroDocumento ? " ep-invalido" : "") + '" id="ep-numdoc" ' +
        // El CE admite letras, así que ni teclado numérico ni tope de 11.
        'inputmode="' + (esCE ? "text" : "numeric") + '" maxlength="' + (esCE ? 12 : 11) + '" ' +
        'placeholder="' + (esCE ? "001234567" : estado.datos.tipoDocumento === "DNI" ? "12345678" : "20123456789") + '" ' +
        'value="' + esc(estado.datos.numeroDocumento) + '" data-campo="numeroDocumento">' +
        // Sin lupa para el CE: no existe un servicio público que lo consulte,
        // así que el comprador escribe el número y sus datos a mano.
        (esCE
          ? ""
          : '<button type="button" class="ep-btn-sec" data-accion="documento"' + (estado.cargando.doc ? " disabled" : "") + ">" +
            (estado.cargando.doc ? '<span class="ep-spinner"></span>' : "Buscar") + "</button>") +
        "</div>" +
        (estado.errores.numeroDocumento ? '<span class="ep-error-campo">' + esc(estado.errores.numeroDocumento) + "</span>" : "") +
        "</div>" +
        campo("email", "Correo electrónico", estado.datos.email, { tipo: "email", inputmode: "email", autocomplete: "email", placeholder: "tucorreo@ejemplo.com", obligatorio: true }) +
        "</div>";

      if (estado.avisoDoc) {
        html += '<div class="ep-aviso ep-aviso-' + estado.avisoDoc.tono + '">' +
          (estado.avisoDoc.tono === "exito" ? '<span class="ep-check">✓</span> ' : "") + esc(estado.avisoDoc.texto) + "</div>";
      }
    } else {
      html += campo("email", "Correo electrónico", estado.datos.email, { tipo: "email", inputmode: "email", autocomplete: "email", placeholder: "tucorreo@ejemplo.com", obligatorio: true });
    }

    // Con RUC consultado mostramos la razón social, sea boleta o factura:
    // el comprador debe poder verla y corregirla antes de que llegue al pedido.
    if (estado.datos.tipoDocumento === "RUC" && estado.datos.razonSocial) {
      html += campo("razonSocial", "Razón social", estado.datos.razonSocial, {
        placeholder: "Nombre legal de la empresa",
      });
    }

    html += '<div class="ep-rejilla-3">' +
      campo("nombre", "Nombre", estado.datos.nombre, { autocomplete: "given-name", obligatorio: true }) +
      campo("apellido", "Apellido", estado.datos.apellido, { autocomplete: "family-name", obligatorio: true }) +
      (a.mostrarTelefono
        ? campo("telefono", "Teléfono", estado.datos.telefono, { tipo: "tel", inputmode: "tel", autocomplete: "tel", placeholder: "987654321", obligatorio: true })
        : "") +
      "</div>";

    if (a.mostrarCumpleanos) {
      html += '<div class="ep-cumple">' +
        '<div class="ep-cumple-campo">' +
        campo("fechaNacimiento", "Fecha de cumpleaños", fechaVisible(estado.datos.fechaNacimiento), {
          inputmode: "numeric",
          placeholder: "DD/MM/AAAA",
          opcional: true,
        }) +
        "</div>" +
        '<p class="ep-cumple-nota">🎂 Déjanos tu fecha y te saludamos en tu cumpleaños con una sorpresa.</p>' +
        "</div>";
    }

    html += '<div class="ep-centro"><button type="button" class="ep-btn-principal ep-btn-medio" data-accion="paso2">Continuar</button></div>';
    html += '<p class="ep-nota-pie">Los campos con <span class="ep-req">*</span> son obligatorios.</p>';
    html += "</div>";
    return html;
  }

  // --- PASO 2: método de entrega -------------------------------------------
  /**
   * Juegos de iconos de los métodos de entrega.
   *
   * Los SVG usan `currentColor` y un viewBox de 24×24: así toman el color de
   * marca y se escalan desde el CSS sin tocar el código. El juego EMOJI no se
   * puede colorear —lo dibuja el sistema operativo— y se ve distinto en cada
   * dispositivo; está para quien prefiera ese aire informal.
   *
   * Esta tabla está duplicada en form.js y en calculadora.js a propósito: son
   * dos scripts independientes, sin empaquetador, y compartirla obligaría a
   * cargar un tercer archivo en cada página de la tienda.
   */
  var JUEGOS_ICONOS = {
    LINEA: {
      ESTANDAR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4h13v11H1z"/><path d="M14 8h4l3 4v3h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
      EXPRESS: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M5 17l4-8h5l3 8M9 9L8 6H5.5"/></svg>',
      RECOJO: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18v12H3z"/><path d="M2 9l2-5h16l2 5"/><path d="M9 21v-6h6v6"/></svg>',
    },
    SOLIDO: {
      ESTANDAR: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 4h12v10H1z"/><path d="M14 7h4.2l3.3 4.4V14H14z"/><circle cx="6" cy="18" r="2.4"/><circle cx="17" cy="18" r="2.4"/></svg>',
      EXPRESS: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="17" r="3.2"/><circle cx="19" cy="17" r="3.2"/><path d="M8.6 8.2 5.9 15h2.2l2.3-5.4h3l2.3 5.4h2.2l-3.1-8.4H9.4L8.6 4H5v2h2.6z"/></svg>',
      RECOJO: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 9h20v12h-6v-6H8v6H2z"/><path d="M4 3h16l2.2 5H1.8z"/></svg>',
    },
    EMOJI: {
      ESTANDAR: "🚚",
      EXPRESS: "⚡",
      RECOJO: "🏪",
    },
  };

  /** Devuelve el icono del método según el juego configurado. */
  function iconoDe(tipo) {
    var nombre = tipo === "DESPACHO" ? "ESTANDAR" : tipo;
    var juego = JUEGOS_ICONOS[((CFG.apariencia && CFG.apariencia.juegoIconos) || "LINEA")] || JUEGOS_ICONOS.LINEA;
    return juego[nombre] || juego.ESTANDAR;
  }



  function tarjeta(valor, icono, titulo, subtitulo, activa, atributo) {
    return '<button type="button" class="ep-tarjeta' + (activa ? " ep-activa" : "") + '" ' +
      atributo + '="' + valor + '">' +
      '<span class="ep-tarjeta-icono">' + icono + "</span>" +
      '<span class="ep-tarjeta-titulo">' + esc(titulo) + "</span>" +
      (subtitulo ? '<span class="ep-tarjeta-sub">' + esc(subtitulo) + "</span>" : "") +
      "</button>";
  }

  function vistaEntrega() {
    var a = CFG.apariencia;
    var esRecojo = estado.familia === "RECOJO";
    var html = '<div class="ep-card ep-card-plano">';
    html += barra("Elige tu método de envío");

    // Primer nivel: despacho o retiro
    html += '<div class="ep-tarjetas">';
    html += tarjeta("DESPACHO", iconoDe("ESTANDAR"), "Despacho", "", !esRecojo, "data-familia");
    if (a.mostrarRecojo) {
      html += tarjeta("RECOJO", iconoDe("RECOJO"), "Retiro en tienda", "", esRecojo, "data-familia");
    }
    html += "</div>";

    html += '<p class="ep-subtitulo-centro">Detalle de la entrega</p>';

    if (esRecojo) {
      html += vistaRecojo();
    } else {
      html += vistaDespacho();
    }

    // Consentimientos de marketing.
    //
    // Shopify no permite marcar desde fuera sus casillas del checkout, así que
    // las recogemos aquí y suscribimos al cliente por API cuando se crea el
    // pedido. El comprador ve una sola vez la pregunta, no dos.
    // Marketing y términos van juntos en un solo bloque alineado a la
    // izquierda. Centrados uno a uno, sus bordes no coincidían y el conjunto
    // quedaba escalonado.
    var hayConsentimientos = a.mostrarMarketingEmail || a.mostrarMarketingSms || a.mostrarTerminos;
    if (hayConsentimientos) {
      html += '<div class="ep-consentimientos">';
      if (a.mostrarMarketingEmail) {
        html += '<label class="ep-terminos">' +
          '<input type="checkbox" data-campo="aceptaMarketingEmail"' + (estado.datos.aceptaMarketingEmail ? " checked" : "") + ">" +
          "<span>Enviarme novedades y ofertas por correo electrónico</span></label>";
      }
      if (a.mostrarMarketingSms) {
        html += '<label class="ep-terminos">' +
          '<input type="checkbox" data-campo="aceptaMarketingSms"' + (estado.datos.aceptaMarketingSms ? " checked" : "") + ">" +
          "<span>Enviarme novedades y ofertas por SMS</span></label>";
      }
      if (a.mostrarTerminos) {
        html += '<label class="ep-terminos">' +
          '<input type="checkbox" data-campo="aceptaTerminos"' + (estado.datos.aceptaTerminos ? " checked" : "") + ">" +
          "<span>" + esc(CFG.terminos.texto) +
          (CFG.terminos.url ? ' <a href="' + esc(CFG.terminos.url) + '" target="_blank" rel="noopener">Leer</a>' : "") +
          "</span></label>";
        if (estado.errores.aceptaTerminos) {
          html += '<p class="ep-error-campo">' + esc(estado.errores.aceptaTerminos) + "</p>";
        }
      }
      html += "</div>";
    }

    if (estado.errores.general) {
      html += '<div class="ep-aviso ep-aviso-error">' + esc(estado.errores.general) + "</div>";
    }

    html += '<div class="ep-centro"><button type="button" class="ep-btn-principal" data-accion="continuar"' +
      (estado.cargando.enviar ? " disabled" : "") + ">" +
      (estado.cargando.enviar ? '<span class="ep-spinner"></span> Procesando…' : esc(a.textoBoton)) +
      "</button></div>";

    html += '<p class="ep-nota-pie"><button type="button" class="ep-enlace" data-accion="paso1">← Volver a mis datos</button></p>';
    html += "</div>";
    return html;
  }

  /** Tarjeta ancha, con el icono a la izquierda. Para Regular / Express. */
  function tarjetaAncha(valor, icono, titulo, descripcion, precio, activa, disponible) {
    return '<button type="button" class="ep-tarjeta-ancha' + (activa ? " ep-activa" : "") +
      (disponible === false ? " ep-no-disponible" : "") + '" ' +
      (disponible === false ? "disabled " : "") +
      'data-metodo="' + valor + '">' +
      '<span class="ep-ta-icono">' + icono + "</span>" +
      '<span class="ep-ta-texto">' +
      '<span class="ep-ta-titulo">' + esc(titulo) + "</span>" +
      (descripcion ? '<span class="ep-ta-sub">' + esc(descripcion) + "</span>" : "") +
      "</span>" +
      (precio ? '<span class="ep-ta-precio">' + esc(precio) + "</span>" : "") +
      "</button>";
  }

  function vistaDespacho() {
    var a = CFG.apariencia;
    var html = '<div class="ep-bloque">';

    // Segundo nivel: regular o express
    var opEstandar = estado.opciones.filter(function (o) { return o.tipo === "ESTANDAR"; })[0];
    var opExpress = estado.opciones.filter(function (o) { return o.tipo === "EXPRESS"; })[0];
    // El recojo en tienda se añade siempre que el comerciante lo tenga activo,
    // así que no sirve para saber si hay despacho a este distrito.
    var hayEnvio = !!(opEstandar || opExpress);

    html += '<div class="ep-tarjetas-anchas' + (a.mostrarExpress ? "" : " ep-una") + '">';
    html += tarjetaAncha("ESTANDAR", iconoDe("ESTANDAR"),
      opEstandar ? opEstandar.etiqueta : "Envío regular",
      opEstandar ? opEstandar.descripcion : "",
      opEstandar ? (opEstandar.gratis ? "GRATIS" : soles(opEstandar.costo)) : "",
      estado.metodo === "ESTANDAR", !!opEstandar);
    if (a.mostrarExpress) {
      html += tarjetaAncha("EXPRESS", iconoDe("EXPRESS"),
        opExpress ? opExpress.etiqueta : "Envío express",
        opExpress ? opExpress.descripcion : "",
        opExpress ? (opExpress.gratis ? "GRATIS" : soles(opExpress.costo)) : "",
        estado.metodo === "EXPRESS", !!opExpress);
    }
    html += "</div>";

    html += '<h3 class="ep-paso-titulo">2. Datos de envío</h3>';

    // Ubicación en cuatro columnas, con el costo al lado
    html += '<div class="ep-rejilla-4">';

    html += '<div class="ep-campo"><label for="ep-dep">Departamento<span class="ep-req">*</span></label>' +
      '<select class="ep-select' + (estado.errores.ubigeo ? " ep-invalido" : "") + '" id="ep-dep" data-campo="dep"><option value="">Seleccionar</option>';
    estado.departamentos.forEach(function (d) {
      html += '<option value="' + d.codigo + '"' + (d.codigo === estado.codDep ? " selected" : "") + ">" + esc(d.nombre) + "</option>";
    });
    html += "</select></div>";

    html += '<div class="ep-campo"><label for="ep-prov">Provincia<span class="ep-req">*</span></label>' +
      '<select class="ep-select" id="ep-prov" data-campo="prov"' + (estado.codDep ? "" : " disabled") + '><option value="">Seleccionar</option>';
    estado.provincias.forEach(function (p) {
      html += '<option value="' + p.codigo + '"' + (p.codigo === estado.codProv ? " selected" : "") + ">" + esc(p.nombre) + "</option>";
    });
    html += "</select></div>";

    html += '<div class="ep-campo"><label for="ep-dist">Distrito<span class="ep-req">*</span></label>' +
      '<select class="ep-select" id="ep-dist" data-campo="dist"' + (estado.codProv ? "" : " disabled") + '><option value="">Seleccionar</option>';
    estado.distritos.forEach(function (d) {
      html += '<option value="' + d.ubigeo + '"' + (d.ubigeo === estado.ubigeo ? " selected" : "") + ">" + esc(d.distrito) + "</option>";
    });
    html += "</select></div>";

    // Costo de envío, solo lectura
    var textoCosto = estado.cargando.cotizar
      ? "Calculando…"
      : !estado.ubigeo
        ? ""
        : !hayEnvio
          ? "No disponible"
          : estado.costoEnvio === 0
            ? "GRATIS"
            : soles(estado.costoEnvio);
    html += '<div class="ep-campo"><label for="ep-costo">Costo de envío</label>' +
      '<input class="ep-input ep-solo-lectura" id="ep-costo" readonly value="' + esc(textoCosto) + '"></div>';

    html += "</div>"; // fin rejilla-4

    if (estado.errores.ubigeo) html += '<span class="ep-error-campo">' + esc(estado.errores.ubigeo) + "</span>";

    if (estado.ubigeo && !estado.cargando.cotizar && !hayEnvio) {
      var elegido = estado.distritos.filter(function (d) { return d.ubigeo === estado.ubigeo; })[0];
      html += sinCobertura(elegido ? elegido.distrito : "este distrito");
    }

    // Botones de ubicación, si están activados
    if (a.mostrarGeolocalizacion || a.mostrarBuscadorDireccion) {
      html += '<div class="ep-ubicacion-acciones">';
      if (a.mostrarGeolocalizacion) {
        html += '<button type="button" class="ep-btn-ubicacion" data-accion="geo">' +
          (estado.cargando.geo ? '<span class="ep-spinner"></span>' : "📍") + " Usar mi ubicación actual</button>";
      }
      if (a.mostrarBuscadorDireccion) {
        html += '<button type="button" class="ep-btn-ubicacion" data-accion="buscar">🔎 Buscar dirección</button>';
      }
      html += "</div>";
    }

    if (estado.errores.geo) {
      html += '<div class="ep-aviso ep-aviso-atencion">' + esc(estado.errores.geo) + "</div>";
    }

    if (estado.mostrarBuscador && a.mostrarBuscadorDireccion) {
      html += '<div class="ep-campo"><label for="ep-buscador">Busca tu dirección</label>' +
        '<input class="ep-input" id="ep-buscador" placeholder="Ingresa tu dirección" autocomplete="off" value="' + esc(estado.textoBusqueda || "") + '">';
      if (estado.sugerencias.length) {
        html += '<ul class="ep-sugerencias">';
        estado.sugerencias.forEach(function (sg) {
          html += '<li data-ref="' + esc(sg.referencia) + '" data-desc="' + esc(sg.descripcion) + '">' +
            '<div class="ep-sugerencia-principal">' + esc(sg.principal || sg.descripcion) + "</div>" +
            (sg.secundario ? '<div class="ep-sugerencia-secundaria">' + esc(sg.secundario) + "</div>" : "") + "</li>";
        });
        html += "</ul>";
      }
      html += "</div>";
    }

    html += '<div class="ep-fila">' +
      campo("direccion", "Dirección", estado.datos.direccion, { placeholder: "Av. Ejemplo 123", autocomplete: "street-address", obligatorio: true }) +
      (a.mostrarReferencia
        ? campo("referencia", "Referencia", estado.datos.referencia, { placeholder: "Frente al parque, portón azul", obligatorio: true })
        : "") +
      "</div>";

    html += vistaResumen();
    html += "</div>";
    return html;
  }

  function vistaRecojo() {
    var html = '<div class="ep-bloque">';

    html += '<div class="ep-recojo-fila">' +
      '<span class="ep-recojo-icono">' + iconoDe("RECOJO") + "</span>" +
      '<label for="ep-punto">Elige la tienda de retiro</label>' +
      '<select class="ep-select' + (estado.errores.puntoRecojo ? " ep-invalido" : "") + '" id="ep-punto" data-campo="puntoRecojo">' +
      '<option value="">Elige una opción</option>';
    CFG.puntosRecojo.forEach(function (p) {
      html += '<option value="' + esc(p.id) + '"' + (p.id === estado.puntoRecojo ? " selected" : "") + ">" + esc(p.nombre) + "</option>";
    });
    html += "</select></div>";

    if (estado.errores.puntoRecojo) html += '<span class="ep-error-campo">' + esc(estado.errores.puntoRecojo) + "</span>";

    var sede = CFG.puntosRecojo.filter(function (p) { return p.id === estado.puntoRecojo; })[0];
    if (sede) {
      html += '<div class="ep-aviso ep-aviso-info"><div><b>' + esc(sede.nombre) + "</b><br>" +
        esc(sede.direccion) +
        (sede.horario ? "<br>Horario: " + esc(sede.horario) : "") +
        (sede.telefono ? "<br>Teléfono: " + esc(sede.telefono) : "") + "</div></div>";
    }

    html += vistaResumen();
    html += "</div>";
    return html;
  }

  function vistaResumen() {
    // Sin método elegido no hay envío que cobrar, y decir "GRATIS" sería
    // engañoso: aún no sabemos si llegamos a ese distrito.
    var sinMetodo = !estado.metodo;
    var total = estado.subtotal + (sinMetodo ? 0 : estado.costoEnvio);
    var html = '<div class="ep-resumen">';
    html += '<div class="ep-resumen-linea"><span>Productos (' +
      (estado.carrito ? estado.carrito.item_count : 0) + ")</span><span>" + soles(estado.subtotal) + "</span></div>";
    html += '<div class="ep-resumen-linea"><span>Envío</span><span' +
      (!sinMetodo && estado.costoEnvio === 0 ? ' class="ep-gratis"' : "") + ">" +
      (sinMetodo ? "—" : estado.costoEnvio === 0 ? "GRATIS" : soles(estado.costoEnvio)) + "</span></div>";
    html += '<div class="ep-resumen-total"><span>Total</span><span>' + soles(total) + "</span></div>";
    html += "</div>";
    return html;
  }

  /**
   * Repinta conservando el foco y la posición del cursor.
   *
   * La vista se redibuja entera con innerHTML, así que el campo donde el
   * comprador está escribiendo desaparece y se crea otro nuevo: el cursor se
   * pierde a media palabra. Se anota qué elemento tenía el foco y por dónde iba
   * el cursor, y se restaura después.
   */
  function conservandoFoco(dibujar) {
    var activo = document.activeElement;
    var id = activo && app.contains(activo) ? activo.id : "";
    var inicio = null;
    var fin = null;
    if (id && typeof activo.selectionStart === "number") {
      inicio = activo.selectionStart;
      fin = activo.selectionEnd;
    }

    dibujar();

    if (!id) return;
    var nuevo = document.getElementById(id);
    if (!nuevo) return;
    nuevo.focus();
    if (inicio !== null && nuevo.setSelectionRange) {
      try { nuevo.setSelectionRange(inicio, fin); } catch (e) { /* campo sin selección */ }
    }
  }

  /**
   * Vuelca los colores configurados en variables CSS.
   *
   * Se ponen en el propio contenedor, no en :root, para no pintar nada fuera
   * del widget: incrustado en el tema, tocar :root cambiaría colores de toda
   * la tienda.
   */
  function aplicarApariencia(a, destino) {
    if (!a || !destino) return;
    var vars = {
      "--ep-primario": a.colorPrincipal,
      "--ep-boton": a.colorBoton,
      "--ep-boton-texto": a.colorTextoBoton,
      "--ep-texto": a.colorTexto,
      "--ep-fondo": a.colorFondo,
      "--ep-borde": a.colorBorde,
      "--ep-radio": a.radio ? a.radio + "px" : null,
    };
    Object.keys(vars).forEach(function (nombre) {
      if (vars[nombre]) destino.style.setProperty(nombre, vars[nombre]);
    });
  }

  function pintar() {
    var a = CFG.apariencia;
    var html = "";

    if (a.logoUrl || a.nombreEmpresa) {
      html += '<div class="ep-cabecera">' +
        (a.logoUrl ? '<img src="' + esc(a.logoUrl) + '" alt="">' : "") +
        (a.nombreEmpresa ? '<span class="ep-marca">' + esc(a.nombreEmpresa) + "</span>" : "") +
        "</div>";
    }

    if (estado.carrito && estado.carrito.item_count === 0) {
      html += '<div class="ep-aviso ep-aviso-atencion">Tu carrito está vacío. ' +
        '<a href="/collections/all">Ver productos</a></div>';
      app.innerHTML = html;
      app.setAttribute("aria-busy", "false");
      return;
    }

    html += estado.paso === 1 ? vistaIdentificacion() : vistaEntrega();

    conservandoFoco(function () { app.innerHTML = html; });
    app.setAttribute("aria-busy", "false");
  }

  // -------------------------------------------------------------- eventos
  // Delegación: el DOM se repinta entero, así que no atamos listeners a nodos.
  function conectarEventos() {
  app.addEventListener("click", function (ev) {
    var boton = ev.target.closest("[data-accion]");
    if (boton) {
      var accion = boton.getAttribute("data-accion");
      if (accion === "geo") return usarMiUbicacion();
      if (accion === "buscar") { estado.mostrarBuscador = !estado.mostrarBuscador; return pintar(); }
      if (accion === "documento") return consultarDocumento();
      if (accion === "continuar") return continuar();
      if (accion === "paso1") { estado.paso = 1; return pintar(); }
      if (accion === "paso2") return irAPaso2();
    }

    var sugerencia = ev.target.closest(".ep-sugerencias li");
    if (sugerencia) {
      return elegirSugerencia(sugerencia.getAttribute("data-ref"), sugerencia.getAttribute("data-desc"));
    }

    var familia = ev.target.closest("[data-familia]");
    if (familia) {
      estado.familia = familia.getAttribute("data-familia");
      if (estado.familia === "RECOJO") {
        estado.metodo = "RECOJO";
        estado.costoEnvio = 0;
      } else {
        // Al volver a despacho, recuperamos la opción disponible más barata.
        var envios = estado.opciones.filter(function (o) { return o.tipo !== "RECOJO"; });
        estado.metodo = envios.length ? envios[0].tipo : "";
        estado.costoEnvio = envios.length ? envios[0].costo : 0;
      }
      delete estado.errores.metodo;
      return pintar();
    }

    var opcion = ev.target.closest("[data-metodo]");
    if (opcion) {
      var pedido = opcion.getAttribute("data-metodo");
      var elegida = estado.opciones.filter(function (o) { return o.tipo === pedido; })[0];
      if (!elegida) return; // método no disponible para este distrito
      estado.metodo = pedido;
      estado.costoEnvio = elegida ? elegida.costo : 0;
      delete estado.errores.metodo;
      return pintar();
    }
  });

  app.addEventListener("input", function (ev) {
    var el = ev.target;
    if (el.id === "ep-buscador") {
      estado.textoBusqueda = el.value;
      return buscarDireccion(el.value);
    }
    var campoNombre = el.getAttribute("data-campo");
    if (!campoNombre) return;

    if (campoNombre === "fechaNacimiento") return escribirCumple(el);

    // Las casillas guardan `checked`; el resto de campos, `value`. Mezclarlos
    // hace que una casilla desmarcada guarde la cadena "on", que es verdadera.
    if (el.type === "checkbox") {
      if (campoNombre in estado.datos) estado.datos[campoNombre] = el.checked;
    } else if (campoNombre in estado.datos) {
      estado.datos[campoNombre] = el.value;
    }

    delete estado.errores[campoNombre];
  });

  app.addEventListener("change", function (ev) {
    var el = ev.target;
    var campoNombre = el.getAttribute("data-campo");
    if (campoNombre === "dep") return cargarProvincias(el.value);
    if (campoNombre === "prov") return cargarDistritos(el.value);
    if (campoNombre === "dist") return elegirDistrito(el.value);
    if (campoNombre === "puntoRecojo") { estado.puntoRecojo = el.value; delete estado.errores.puntoRecojo; return pintar(); }
    if (campoNombre === "tipoDocumento") {
      estado.datos.tipoDocumento = el.value;
      estado.datos.numeroDocumento = "";
      estado.datos.razonSocial = "";
      estado.avisoDoc = null;
      return pintar();
    }
    if (campoNombre === "tipoComprobante") {
      estado.datos.tipoComprobante = el.value;
      // Una factura exige RUC; una boleta se emite con DNI.
      estado.datos.tipoDocumento = el.value === "FACTURA" ? "RUC" : "DNI";
      estado.datos.numeroDocumento = "";
      estado.datos.razonSocial = "";
      estado.avisoDoc = null;
      delete estado.errores.numeroDocumento;
      return pintar();
    }
    if (campoNombre === "aceptaTerminos") { estado.datos.aceptaTerminos = el.checked; delete estado.errores.aceptaTerminos; return pintar(); }
    // Estas dos no cambian nada más de la vista: actualizamos el estado sin
    // repintar, para no perder el foco ni el desplazamiento.
    if (campoNombre === "aceptaMarketingEmail") { estado.datos.aceptaMarketingEmail = el.checked; return; }
    if (campoNombre === "aceptaMarketingSms") { estado.datos.aceptaMarketingSms = el.checked; return; }
  });

  } // fin de conectarEventos

  // ---------------------------------------------------------------- arranque
  function arrancar() {
    app = document.getElementById("ep-app");
    if (!app) return; // el tema no incluye el contenedor

    var incrustada = document.getElementById("ep-config");

    var obtenerConfig = incrustada
      ? Promise.resolve(JSON.parse(incrustada.textContent))
      : fetch("/apps/envio/api/config", { headers: { Accept: "application/json" } })
          .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          });

    obtenerConfig
      .then(function (config) {
        CFG = config;
        API = CFG.base + "/api";
        estado.departamentos = CFG.departamentos || [];

        // Los colores se aplican siempre al contenedor: así funcionan igual en
        // la página propia y incrustado en el tema.
        aplicarApariencia(CFG.apariencia, app);

        conectarEventos();
        return cargarCarrito();
      })
      .then(pintar)
      .catch(function (e) {
        app.innerHTML =
          '<div class="ep-aviso ep-aviso-error">No pudimos cargar las opciones de entrega. ' +
          "Recarga la página o inténtalo en un momento.</div>";
        if (window.console) console.error("[envio-peru]", e);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arrancar);
  } else {
    arrancar();
  }
})();
