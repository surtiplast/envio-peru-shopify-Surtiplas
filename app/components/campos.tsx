import { normalizarColor } from "../lib/color";
/**
 * Envoltorios de formulario para Polaris.
 *
 * Los componentes de Polaris son CONTROLADOS: no aceptan `defaultValue` ni
 * `defaultChecked`, y su `Button` no reenvía `name`/`value` al `<button>`.
 * Escribir las pantallas como formularios HTML clásicos no funciona.
 *
 * Estos envoltorios mantienen el estado internamente y siguen exponiendo el
 * atributo `name` en el input real, de modo que el `<Form>` de Remix recoge
 * los valores igual que en un formulario normal.
 */
import { useRef, useState } from "react";
import { Button, Checkbox, Select, TextField } from "@shopify/polaris";
import type { ButtonProps, SelectProps } from "@shopify/polaris";

interface CampoTextoProps {
  label: string;
  name: string;
  valorInicial?: string | null;
  type?: "text" | "email" | "number" | "tel" | "url" | "password";
  step?: number;
  multiline?: number;
  placeholder?: string;
  helpText?: string;
  labelHidden?: boolean;
  disabled?: boolean;
  prefix?: string;
  requiredIndicator?: boolean;
  onValor?: (valor: string) => void;
}

export function CampoTexto({ valorInicial, onValor, ...props }: CampoTextoProps) {
  const [valor, setValor] = useState(valorInicial ?? "");
  return (
    <TextField
      {...props}
      autoComplete="off"
      value={valor}
      onChange={(v) => {
        setValor(v);
        onValor?.(v);
      }}
    />
  );
}

interface CampoSelectProps {
  label: string;
  name: string;
  // El mismo tipo que acepta Polaris: admite opciones sueltas y agrupadas.
  options: SelectProps["options"];
  valorInicial?: string | null;
  helpText?: string;
  disabled?: boolean;
  labelHidden?: boolean;
  placeholder?: string;
  onValor?: (valor: string) => void;
}

export function CampoSelect({ valorInicial, onValor, ...props }: CampoSelectProps) {
  const [valor, setValor] = useState(valorInicial ?? "");
  return (
    <Select
      {...props}
      value={valor}
      onChange={(v) => {
        setValor(v);
        onValor?.(v);
      }}
    />
  );
}

interface CampoCheckProps {
  label: string;
  name: string;
  marcadoInicial?: boolean;
  helpText?: string;
  disabled?: boolean;
  onValor?: (valor: boolean) => void;
}

/**
 * Casilla que SIEMPRE envía su valor.
 *
 * Un `<input type="checkbox">` desmarcado no se envía: el navegador lo omite.
 * Así, el servidor no puede distinguir «el usuario lo desmarcó» de «ese campo
 * no venía en el formulario», y acaba guardando todo como falso.
 *
 * La solución es un campo oculto que viaja siempre con "on" u "off". La casilla
 * de Polaris queda solo como interfaz: el dato lo lleva el oculto.
 */
export function CampoCheck({ marcadoInicial, onValor, name, ...props }: CampoCheckProps) {
  const [marcado, setMarcado] = useState(Boolean(marcadoInicial));
  return (
    <>
      <input type="hidden" name={name} value={marcado ? "on" : "off"} />
      <Checkbox
        {...props}
        checked={marcado}
        onChange={(v) => {
          setMarcado(v);
          onValor?.(v);
        }}
      />
    </>
  );
}

/**
 * Variante para descargas de archivo.
 *
 * Aquí NO se puede usar `useSubmit`: el navegador tiene que hacer el envío
 * nativo para procesar la cabecera Content-Disposition y abrir el diálogo de
 * guardado. Escribimos el valor en un input oculto y dejamos que el formulario
 * se envíe solo.
 */
export function BotonDescarga({
  campo,
  valor,
  children,
  ...props
}: Omit<ButtonProps, "onClick" | "children"> & {
  campo: string;
  valor: string;
  children: string | string[];
}) {
  const contenedor = useRef<HTMLDivElement>(null);

  return (
    <div ref={contenedor} style={{ display: "contents" }}>
      <Button
        {...props}
        submit
        onClick={() => {
          const formulario = contenedor.current?.closest("form");
          const oculto = formulario?.querySelector<HTMLInputElement>(
            `input[type="hidden"][name="${campo}"]`,
          );
          if (oculto) oculto.value = valor;
        }}
      >
        {children}
      </Button>
    </div>
  );
}

interface CampoColorProps {
  label: string;
  name: string;
  valorInicial?: string | null;
  helpText?: string;
  onValor?: (valor: string) => void;
}


/**
 * Selector de color: muestra una muestra que abre el selector del sistema y un
 * campo de texto para pegar un hexadecimal. Los dos se mantienen sincronizados.
 */
export { normalizarColor };

export function CampoColor({ label, name, valorInicial, helpText, onValor }: CampoColorProps) {
  const [valor, setValor] = useState(valorInicial ?? "#000000");
  const normalizado = normalizarColor(valor);

  const cambiar = (nuevo: string) => {
    setValor(nuevo);
    onValor?.(nuevo);
  };

  return (
    <div>
      <input type="hidden" name={name} value={normalizado} />
      <TextField
        label={label}
        helpText={helpText}
        autoComplete="off"
        value={valor}
        onChange={cambiar}
        // Al salir del campo lo dejamos ya normalizado, para que el comerciante
        // vea exactamente lo que se va a guardar.
        onBlur={() => setValor(normalizado)}
        prefix={
          <label
            style={{
              display: "inline-block",
              width: 22,
              height: 22,
              borderRadius: 5,
              border: "1px solid rgba(0,0,0,.2)",
              background: normalizado,
              cursor: "pointer",
              overflow: "hidden",
            }}
            title="Elegir color"
          >
            <input
              type="color"
              value={normalizado}
              onChange={(e) => cambiar(e.target.value.toUpperCase())}
              style={{ opacity: 0, width: "100%", height: "100%", cursor: "pointer", border: 0, padding: 0 }}
            />
          </label>
        }
      />
    </div>
  );
}
