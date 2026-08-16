# Poner en marcha la base de datos (Neon)

Guía para tener PostgreSQL funcionando en unos minutos, sin instalar nada en
Windows. La misma base sirve para desarrollo y, más adelante, para producción.

---

## 1. Crear el proyecto en Neon

1. Entra a <https://neon.com> y crea una cuenta (se puede con GitHub).
2. **Create project**:
   - **Name:** `envio-peru`
   - **Postgres version:** la que venga por defecto
   - **Region:** elige la más cercana a Perú. Suele ser
     *AWS South America (São Paulo)* o *AWS US East (Ohio)*. Menos distancia =
     menos latencia en el callback de tarifas, que va contrarreloj.
3. Al terminar te muestra la cadena de conexión. **Guárdala**: la necesitas
   ahora mismo.

## 2. Copiar las DOS cadenas de conexión

Esto es lo que más se atasca. Neon te da dos:

| Cadena | Host | Para qué |
|---|---|---|
| **Pooled** | `...-pooler.region.aws.neon.tech` | La aplicación |
| **Direct** | `...region.aws.neon.tech` (sin `-pooler`) | Las migraciones de Prisma |

En el panel de Neon, en *Connection string*, hay un desplegable o una casilla
**«Connection pooling»** que alterna entre ambas. Necesitas copiar las dos.

**Por qué dos:** el pooler reutiliza conexiones y es lo que quieres para una app
web con muchas peticiones cortas. Pero las migraciones abren transacciones
largas, y un pooler en modo *transaction* las corta por la mitad. Si usas la
pooled para migrar, `prisma migrate` falla con errores confusos.

## 3. Ponerlas en tu `.env`

Abre `.env` (en la raíz del proyecto) y rellena:

```env
DATABASE_URL=postgresql://usuario:clave@ep-algo-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require
DIRECT_URL=postgresql://usuario:clave@ep-algo.sa-east-1.aws.neon.tech/neondb?sslmode=require
```

Fíjate en el `-pooler` de la primera y su ausencia en la segunda.
Deja el `?sslmode=require`: Neon lo exige.

> El archivo `.env` está en `.gitignore`. No se sube nunca. Si alguna vez
> aparece en un `git status`, párate: algo se rompió en la configuración.

## 4. Crear las tablas y cargar el catálogo

```powershell
npx prisma migrate dev --name inicial
```

Crea las 16 tablas y guarda la migración en `prisma/migrations/`, que **sí** se
versiona: es el historial de cómo evolucionó tu base de datos.

```powershell
npm run db:seed
```

Carga el catálogo geográfico del INEI: 25 departamentos, 196 provincias y 1.874
distritos. Tarda unos segundos. Debe terminar con:

```
Listo: 25 departamentos, 196 provincias, 1874 distritos.
```

## 5. Comprobar que está todo

```powershell
npx prisma studio
```

Abre un navegador con tus tablas. Entra en `Distrito` y busca `150120`: debe
salir Magdalena del Mar, Lima, Lima. Ciérralo con Ctrl+C.

---

## Límites del plan gratuito

Según la documentación de Neon a agosto de 2026:

- **0,5 GB** de almacenamiento por proyecto
- **100 horas de cómputo** al mes
- Hasta 100 proyectos y 10 ramas por proyecto
- Escalado automático hasta 2 CU

De sobra para desarrollo: el catálogo completo más las tarifas de varias tiendas
ocupan unas pocas decenas de MB.

## Un aviso para producción

Neon **apaga el cómputo tras 5 minutos de inactividad**. Eso está muy bien para
no gastar horas mientras desarrollas, pero tiene una consecuencia real:

> La primera petición después de un rato dormido tarda más en responder
> (arranque en frío).

El **callback del CarrierService va contrarreloj**: si Shopify no recibe las
tarifas rápido, las descarta y muestra las tarifas manuales de la tienda. Un
arranque en frío justo cuando un cliente llega al checkout puede costarte
mostrar el envío equivocado.

Antes de abrir la app a comerciantes reales, o pasas a un plan de Neon que
mantenga el cómputo despierto, o usas un Postgres siempre activo. Para
desarrollo y pruebas, el plan gratuito es perfecto.

---

## Si algo falla

**`Can't reach database server`**
Revisa que la cadena lleve `?sslmode=require` y que copiaste la contraseña
completa. Neon la muestra una sola vez; si la perdiste, genera otra desde el
panel.

**`prepared statement "s0" already exists`**
Estás usando la cadena *pooled* para migrar. Comprueba que `DIRECT_URL` apunta
al host **sin** `-pooler`.

**`Environment variable not found: DIRECT_URL`**
Falta la variable en `.env`. Si tu Postgres no tiene pooler, pon en `DIRECT_URL`
el mismo valor que en `DATABASE_URL`.

**El seed dice que ya existen los registros**
No pasa nada: usa `skipDuplicates`, así que puedes ejecutarlo las veces que
quieras sin duplicar el catálogo.
