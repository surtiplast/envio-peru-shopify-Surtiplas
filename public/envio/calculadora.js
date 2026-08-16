/**
 * Calculadora de envíos para el comprador.
 *
 * Elige departamento, provincia y distrito, y muestra el tarifario completo:
 * cuánto cuesta el envío según lo que gaste y a partir de qué monto sale gratis.
 * No necesita carrito, así que sirve igual en una página de "Costos de envío"
 * que debajo de la ficha de un producto.
 *
 * JavaScript sin dependencias, servido por el App Proxy para que las llamadas
 * vayan al mismo dominio de la tienda.
 */
(function () {
  "use strict";

  var API = "/apps/envio/api";
  var caja = null;
  var estado = {
    departamentos: [],
    provincias: [],
    distritos: [],
    codDep: "",
    codProv: "",
    ubigeo: "",
    tarifario: null,
    cargando: false,
    error: "",
    // Ayudas de ubicación. Se muestran solo si el comerciante las activó y hay
    // un proveedor de mapas configurado.
    conGeo: false,
    conBuscador: false,
    cargandoGeo: false,
    avisoGeo: "",
    mostrarBuscador: false,
    textoBusqueda: "",
    sugerencias: [],
    juegoIconos: "LINEA",
  };

  function esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function pedir(ruta, opciones) {
    return fetch(API + ruta, Object.assign({ headers: { "Content-Type": "application/json", Accept: "application/json" } }, opciones))
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

  function selector(id, etiqueta, opciones, valor, desactivado) {
    var html = '<div class="epc-campo"><label for="epc-' + id + '">' + esc(etiqueta) + "</label>" +
      '<select id="epc-' + id + '" data-campo="' + id + '"' + (desactivado ? " disabled" : "") + ">" +
      '<option value="">Seleccionar</option>';
    opciones.forEach(function (o) {
      html += '<option value="' + esc(o.valor) + '"' + (o.valor === valor ? " selected" : "") + ">" +
        esc(o.texto) + "</option>";
    });
    return html + "</select></div>";
  }

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
    var juego = JUEGOS_ICONOS[(estado.juegoIconos || "LINEA")] || JUEGOS_ICONOS.LINEA;
    return juego[nombre] || juego.ESTANDAR;
  }

  function tarjetaMetodo(m) {
    var html = '<div class="epc-tarjeta">';
    html += '<div><div class="epc-tarjeta-titulo"><span class="epc-icono">' + iconoDe(m.tipo) + "</span> " + esc(m.etiqueta) + "</div>";
    html += m.descripcion ? '<div class="epc-tarjeta-sub">' + esc(m.descripcion) + "</div>" : "";
    html += "</div>";

    if (!m.rangos.length) {
      return html + '<p class="epc-estado" style="margin-top:1rem">Consúltanos el precio para este distrito.</p></div>';
    }

    html += '<table class="epc-tabla"><tr><th>Si tu compra es de</th><th>El envío cuesta</th></tr>';
    m.rangos.forEach(function (r) {
      var tramo = r.hasta ? r.desde + " a " + r.hasta : r.desde + " a más";
      html += "<tr><td>" + esc(tramo) + "</td><td>" +
        (r.costo ? esc(r.costo) : '<span class="epc-gratis">GRATIS</span>') + "</td></tr>";
    });
    html += "</table>";

    if (m.umbralGratis) {
      html += '<div class="epc-promo">🎉 Envío gratis en compras desde ' + esc(m.umbralGratis) + ".</div>";
    }
    return html + "</div>";
  }

  function tarjetaRecojo(sedes) {
    var todasGratis = sedes.every(function (s) { return !s.costo; });
    // Va como una columna más, al lado de los métodos de envío.
    var html = '<div class="epc-tarjeta epc-recojo"><div class="epc-tarjeta-titulo">' +
      '<span class="epc-icono">' + iconoDe("RECOJO") + "</span> Recojo en tienda" +
      (todasGratis ? ' <span class="epc-insignia">GRATIS</span>' : "") + "</div>" +
      '<div class="epc-tarjeta-sub">Retira tu pedido sin costo de envío</div>';

    sedes.forEach(function (s) {
      html += '<div class="epc-sede"><strong>' + esc(s.nombre) + "</strong> — " + esc(s.direccion) +
        (s.horario ? "<br>" + esc(s.horario) : "") +
        (s.costo ? "<br>" + esc(s.costo) : "") + "</div>";
    });

    return html + "</div>";
  }

  /**
   * Aplica una ubicación detectada: rellena los tres selectores y cotiza.
   *
   * Si el proveedor no logró un distrito fiable no adivinamos: se avisa y el
   * comprador lo elige. Un envío mal cotizado cuesta más que un clic de más.
   */
  function aplicarUbicacion(r) {
    if (!r || !r.ubigeo || r.requiereConfirmacion) {
      estado.avisoGeo = r && r.motivo === "LIMITE"
        ? "El servicio de mapas está ocupado. Espera unos segundos o elige tu distrito en la lista."
        : "No pudimos identificar tu distrito. Selecciónalo en la lista.";
      if (r && r.ubigeo) {
        estado.codDep = r.ubigeo.codDep;
        estado.provincias = r.provincias || [];
      }
      return;
    }
    estado.avisoGeo = "";
    estado.codDep = r.ubigeo.codDep;
    estado.codProv = r.ubigeo.codProv;
    estado.ubigeo = r.ubigeo.ubigeo;
    estado.provincias = r.provincias || [];
    estado.distritos = r.distritos || [];
  }

  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      estado.avisoGeo = "Tu navegador no permite compartir la ubicación.";
      return pintar();
    }
    estado.cargandoGeo = true;
    estado.avisoGeo = "";
    pintar();

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        pedir("/geo", {
          method: "POST",
          body: JSON.stringify({ accion: "inversa", lat: pos.coords.latitude, lng: pos.coords.longitude }),
        })
          .then(aplicarUbicacion)
          .catch(function () { estado.avisoGeo = "No pudimos detectar tu distrito. Elígelo en la lista."; })
          .then(function () {
            estado.cargandoGeo = false;
            pintar();
            if (estado.ubigeo) cargarTarifario();
          });
      },
      function (err) {
        estado.cargandoGeo = false;
        estado.avisoGeo = err.code === 1
          ? "No nos diste permiso para usar tu ubicación. Elige tu distrito en la lista."
          : "No pudimos obtener tu ubicación. Elige tu distrito en la lista.";
        pintar();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  var buscarDireccion = rebotar(function (texto) {
    if (!texto || texto.length < 4) { estado.sugerencias = []; return pintar(); }
    pedir("/geo", { method: "POST", body: JSON.stringify({ accion: "autocompletar", texto: texto }) })
      .then(function (r) { estado.sugerencias = r.sugerencias || []; pintar(); })
      .catch(function () { estado.sugerencias = []; });
  }, 350);

  function elegirSugerencia(referencia) {
    estado.sugerencias = [];
    estado.cargandoGeo = true;
    pintar();
    pedir("/geo", { method: "POST", body: JSON.stringify({ accion: "detalle", referencia: referencia }) })
      .then(aplicarUbicacion)
      .catch(function () { estado.avisoGeo = "No pudimos ubicar esa dirección."; })
      .then(function () {
        estado.cargandoGeo = false;
        pintar();
        if (estado.ubigeo) cargarTarifario();
      });
  }

  function vistaAyudas() {
    if (!estado.conGeo && !estado.conBuscador) return "";

    var html = '<div class="ep-ubicacion-acciones epc-ayudas">';
    if (estado.conGeo) {
      html += '<button type="button" class="ep-btn-ubicacion" data-accion="geo">' +
        (estado.cargandoGeo ? '<span class="ep-spinner"></span>' : "📍") + " Usar mi ubicación actual</button>";
    }
    if (estado.conBuscador) {
      html += '<button type="button" class="ep-btn-ubicacion" data-accion="buscar">🔎 Buscar dirección</button>';
    }
    html += "</div>";

    if (estado.avisoGeo) {
      html += '<div class="ep-aviso ep-aviso-atencion epc-aviso">' + esc(estado.avisoGeo) + "</div>";
    }

    if (estado.mostrarBuscador && estado.conBuscador) {
      html += '<div class="epc-campo epc-buscador"><label for="epc-buscador">Busca tu dirección</label>' +
        '<input id="epc-buscador" type="text" autocomplete="off" placeholder="Ingresa tu dirección" value="' +
        esc(estado.textoBusqueda) + '">';
      if (estado.sugerencias.length) {
        html += '<ul class="ep-sugerencias">';
        estado.sugerencias.forEach(function (sg) {
          html += '<li data-ref="' + esc(sg.referencia) + '">' +
            '<div class="ep-sugerencia-principal">' + esc(sg.principal || sg.descripcion) + "</div>" +
            (sg.secundario ? '<div class="ep-sugerencia-secundaria">' + esc(sg.secundario) + "</div>" : "") +
            "</li>";
        });
        html += "</ul>";
      }
      html += "</div>";
    }

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
    var id = activo && caja.contains(activo) ? activo.id : "";
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
    var html = '<div class="epc-caja">';

    html += '<div class="epc-selectores">' +
      selector("dep", "Departamento", estado.departamentos.map(function (d) {
        return { valor: d.codigo, texto: d.nombre };
      }), estado.codDep, false) +
      selector("prov", "Provincia", estado.provincias.map(function (p) {
        return { valor: p.codigo, texto: p.nombre };
      }), estado.codProv, !estado.codDep) +
      selector("dist", "Distrito", estado.distritos.map(function (d) {
        return { valor: d.ubigeo, texto: d.distrito };
      }), estado.ubigeo, !estado.codProv) +
      "</div>";

    html += vistaAyudas();

    if (estado.cargando) {
      html += '<p class="epc-estado"><span class="ep-spinner"></span> Consultando…</p>';
    } else if (estado.error) {
      html += '<div class="ep-aviso ep-aviso-error">' + esc(estado.error) + "</div>";
    } else if (estado.tarifario) {
      var t = estado.tarifario;
      var hayEnvio = t.disponible && t.metodos.length > 0;

      html += '<h3 class="epc-titulo">Envíos a ' + esc(t.distrito.nombre) + "</h3>";

      /**
       * Sin reparto se avisa SIEMPRE, aunque haya recojo.
       *
       * Antes el aviso solo salía si tampoco había sede, así que el comprador
       * de una zona sin cobertura veía la tarjeta de recojo y ninguna
       * explicación de por qué no aparecía el envío a domicilio.
       */
      if (!hayEnvio) {
        var c = t.contacto || {};
        html += '<div class="ep-aviso ep-aviso-atencion ep-sin-cobertura">' +
          "<b>Aún no llegamos a " + esc(t.distrito.nombre) + "</b>" +
          "<span>Escríbenos y vemos si podemos coordinarlo.</span>";
        if (c.whatsapp || c.correoUrl) {
          html += '<span class="ep-contacto">';
          if (c.whatsapp) html += '<a href="' + esc(c.whatsapp) + '" target="_blank" rel="noopener">WhatsApp</a>';
          if (c.correoUrl) html += '<a href="' + esc(c.correoUrl) + '">' + esc(c.correo) + "</a>";
          html += "</span>";
        }
        html += "</div>";
      }

      // Los métodos van en columnas: en pantalla ancha, estándar y express
      // uno al lado del otro, y así la tabla no se estira de lado a lado.
      html += '<div class="epc-metodos">';
      t.metodos.forEach(function (m) { html += tarjetaMetodo(m); });
      // El recojo se ofrece aunque el distrito no tenga reparto: que no
      // lleguemos hasta allí no impide que el comprador venga a la tienda.
      if (t.recojo.length) html += tarjetaRecojo(t.recojo);
      html += "</div>";
    } else {
      html += '<p class="epc-estado">Elige tu distrito para ver el costo del envío.</p>';
    }

    var completo = html + "</div>";
    conservandoFoco(function () { caja.innerHTML = completo; });
  }

  function cargarTarifario() {
    if (!estado.ubigeo) { estado.tarifario = null; return pintar(); }
    estado.cargando = true;
    estado.error = "";
    pintar();

    pedir("/tarifario?ubigeo=" + encodeURIComponent(estado.ubigeo))
      .then(function (r) { estado.tarifario = r; })
      .catch(function () { estado.error = "No pudimos consultar las tarifas. Inténtalo de nuevo."; })
      .then(function () { estado.cargando = false; pintar(); });
  }

  function conectar() {
    caja.addEventListener("click", function (ev) {
      var boton = ev.target.closest("[data-accion]");
      if (boton) {
        var accion = boton.getAttribute("data-accion");
        if (accion === "geo") return usarMiUbicacion();
        if (accion === "buscar") {
          estado.mostrarBuscador = !estado.mostrarBuscador;
          return pintar();
        }
      }

      var sugerencia = ev.target.closest(".ep-sugerencias li");
      if (sugerencia) return elegirSugerencia(sugerencia.getAttribute("data-ref"));
    });

    caja.addEventListener("input", function (ev) {
      if (ev.target.id !== "epc-buscador") return;
      estado.textoBusqueda = ev.target.value;
      buscarDireccion(ev.target.value);
    });

    caja.addEventListener("change", function (ev) {
      var campo = ev.target.getAttribute("data-campo");
      if (!campo) return;

      if (campo === "dep") {
        estado.codDep = ev.target.value;
        estado.codProv = "";
        estado.ubigeo = "";
        estado.provincias = [];
        estado.distritos = [];
        estado.tarifario = null;
        pintar();
        if (estado.codDep) {
          pedir("/ubigeo?dep=" + encodeURIComponent(estado.codDep)).then(function (r) {
            estado.provincias = r.provincias || [];
            pintar();
          });
        }
        return;
      }

      if (campo === "prov") {
        estado.codProv = ev.target.value;
        estado.ubigeo = "";
        estado.distritos = [];
        estado.tarifario = null;
        pintar();
        if (estado.codProv) {
          pedir("/ubigeo?prov=" + encodeURIComponent(estado.codProv)).then(function (r) {
            estado.distritos = r.distritos || [];
            pintar();
          });
        }
        return;
      }

      if (campo === "dist") {
        estado.ubigeo = ev.target.value;
        cargarTarifario();
      }
    });
  }

  function arrancar() {
    caja = document.getElementById("ep-calculadora");
    if (!caja) return; // el tema no incluye el contenedor

    conectar();

    /**
     * La configuración dice si el comerciante activó las ayudas de ubicación y
     * si hay un proveedor de mapas. Si falla, la calculadora sigue funcionando
     * con los tres desplegables: es lo esencial y no debe depender de esto.
     */
    pedir("/config")
      .then(function (c) {
        var a = (c && c.apariencia) || {};
        estado.conGeo = Boolean(a.mostrarGeolocalizacion);
        estado.conBuscador = Boolean(a.mostrarBuscadorDireccion);
        estado.juegoIconos = a.juegoIconos || "LINEA";
        // La calculadora ignoraba por completo la personalización: se veía con
        // los colores por defecto aunque el comerciante los hubiera cambiado.
        aplicarApariencia(a, caja);
        pintar();
      })
      .catch(function () { /* sin ayudas, pero la calculadora funciona */ });

    pedir("/ubigeo")
      .then(function (r) {
        estado.departamentos = r.departamentos || [];
        pintar();
      })
      .catch(function () {
        caja.innerHTML = '<div class="ep-aviso ep-aviso-error">No pudimos cargar la calculadora.</div>';
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arrancar);
  } else {
    arrancar();
  }
})();
