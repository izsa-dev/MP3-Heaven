# Guía del repositorio MP3-Heaven

## Resumen ejecutivo

Este repositorio es un monorepo de TypeScript con varios paquetes organizados por responsabilidad. La idea principal es combinar:

- un frontend en React + Vite para buscar videos de YouTube y descargar audio en formato MP3,
- una API en Express para exponer endpoints de búsqueda y descarga,
- un conjunto de librerías compartidas para contratos API, validación y acceso a base de datos,
- una capa Python con `yt-dlp` para interactuar con YouTube y generar audio localmente.

En otras palabras, el repo está pensado para funcionar como un mini sistema de "YouTube -> MP3" con frontend reutilizable, API backend y piezas de infraestructura compartidas.

---

## Topología general

El proyecto usa `pnpm` workspaces y está dividido en dos grandes grupos:

- `artifacts/`: apps ejecutables reales
- `lib/`: librerías compartidas entre apps

Además, la raíz contiene tooling general (`package.json`, `pnpm-workspace.yaml`, `tsconfig.*`, `pyproject.toml`).

---

## Estructura principal

### Raíz

- `package.json`
  - Configura el workspace y los scripts globales.
  - `build`: ejecuta typecheck + build de todos los paquetes.
  - `typecheck`: valida TypeScript en las librerías y apps.
  - Tiene una protección anti-supply-chain: exige `pnpm` y aplica `minimumReleaseAge` en `pnpm-workspace.yaml`.

- `pnpm-workspace.yaml`
  - Define los paquetes del monorepo.
  - Incluye `artifacts/*`, `lib/*`, `lib/integrations/*` y `scripts`.
  - Tiene catalog de dependencias centralizadas y overrides para compatibilidad del entorno.

- `tsconfig.json`
  - Configura referencias de TypeScript para paquetes compartidos.

- `pyproject.toml`
  - Define un proyecto Python con `yt-dlp[default]`.
  - La API usa `python3 -m yt_dlp`, así que esta dependencia es clave para la parte de descarga.

- `main.py`
  - Actualmente es un placeholder simple; no parece ser el punto de entrada real del producto.

- `replit.md`
  - Documento de configuración de entorno y seguridad para Replit.
  - Contiene reglas sobre `minimumReleaseAge` para evitar paquetes inseguros.

---

### Carpeta `artifacts`

#### `artifacts/api-server`

Es el backend HTTP.

- `package.json`
  - `dev`: compila y levanta el servidor.
  - `build`: usa `esbuild` para generar el bundle.
  - `start`: corre la build generada.

- `src/index.ts`
  - Arranca el servidor.
  - Requiere la variable `PORT` para escuchar en un puerto concreto.

- `src/app.ts`
  - Construye la app Express.
  - Configura `cors`, `express.json()`, `pino-http` y el router principal en `/api`.

- `src/routes/`
  - `index.ts`: centraliza routers.
  - `health.ts`: expone `GET /healthz`.
  - `youtube.ts`: contiene la lógica principal de búsqueda/descarga de YouTube.

Reglas importantes del backend:

- Valida búsquedas cuyas entradas vienen como query params usando Zod.
- Rechaza búsquedas demasiado cortas.
- Usa `yt-dlp` via `spawn("python3", ["-m", "yt_dlp", ...])`.
- Hay límites de timeout y tamaño en respuestas para evitar abuso o respuestas gigantes.
- Acepta hosts de YouTube (`youtube.com`, `youtu.be`, etc.) y extrae IDs válidos.

#### `artifacts/audio-mp3`

Es la app frontend principal.

- `package.json`
  - `dev`: inicia Vite.
  - `build`: compila la app React.
  - `serve`: preview del build.

- `src/App.tsx`
  - Es el núcleo de la UI.
  - Maneja:
    - búsqueda de videos,
    - cola de descargas,
    - descarga de audio desde YouTube,
    - almacenamiento local de la biblioteca,
    - estado de derechos / confirmación del usuario.
  - Usa `@workspace/api-client-react` para consumir la API.

- `src/components/YouTubeExplorer.tsx`
  - Busca videos por texto o por URL.
  - Llama a los hooks generados por la API.
  - Presenta resultados y permite seleccionar un video.

- `src/lib/audio-library.ts`
  - Biblioteca local del navegador para guardar y leer pistas descargadas.
  - Guarda metadata del audio y el `Blob` descargado.

- `src/components/ui/`
  - Hay un conjunto amplio de componentes de UI basados en shadcn/radix.
  - Esto sugiere un diseño visual bastante avanzado y reutilizable.

#### `artifacts/mockup-sandbox`

Es una app auxiliar de prototipos / mockups visuales. Muy útil para maquetar o probar ideas de pantalla sin mezclar con la app principal.

---

### Carpeta `lib`

#### `lib/api-spec`

Es la fuente de verdad de la API.

- `openapi.yaml`: especificación OpenAPI del contrato.
- `orval.config.ts`: configuración para generar clients desde OpenAPI.
- `package.json`: script `codegen` para regenerar hooks y tipos.

#### `lib/api-zod`

Contiene los schemas Zod y tipos generados a partir de la API.

- `src/index.ts` re-exporta `./generated/api` y `./generated/types`.
- Se usa en el backend para validar request/response.

#### `lib/api-client-react`

- `src/index.ts` exporta hooks y utilidades para React.
- Provee consumo typed de la API en frontend.
- Está diseñado para que la app `audio-mp3` use hooks generados, no fetch manual.

#### `lib/db`

- `src/index.ts`: inicializa `drizzle` con PostgreSQL y `DATABASE_URL`.
- `src/schema/index.ts`: es un placeholder scaffold para modelos de esquema.
- El repo tiene preparado Drizzle + PostgreSQL, aunque por ahora no hay tablas reales definidas.

---

## Flujo funcional principal

1. El usuario escribe una búsqueda o pega un link de YouTube en la app frontend.
2. La UI llama a la API del backend (`/youtube/search` o metadata del video).
3. El backend usa `yt-dlp` para consultar o procesar el media de YouTube.
4. El usuario confirma que está descargando un archivo de audio de YouTube.
5. La app hace una petición del archivo MP3 y lo descarga al navegador.
6. La pista se guarda localmente en la biblioteca del navegador (`localStorage` + `IndexedDB`-like pattern según la librería implementada).

El flujo actual muestra una app de descarga local con un backend ligero y una UI orientada a experiencia de usuario en front-end.

---

## Dependencias clave

- `Express 5` para backend HTTP
- `Vite` + `React` para frontend
- `TanStack Query` para fetching del cliente
- `Zod` para validación de inputs/schemas
- `Drizzle ORM` + PostgreSQL para acceso a base de datos
- `yt-dlp` para extracción y procesamiento de streams desde YouTube
- `esbuild` para compilación del backend
- `Orval` para generación automática desde OpenAPI

---

## Comandos útiles

Desde la raíz:

- `pnpm run typecheck`
- `pnpm run build`

Backend:

- `pnpm --filter @workspace/api-server run dev`

Frontend:

- `pnpm --filter @workspace/audio-mp3 run dev`

Generación de contratos API:

- `pnpm --filter @workspace/api-spec run codegen`

Base de datos:

- `pnpm --filter @workspace/db run push`

---

## Observaciones importantes / gotchas

- El proyecto está en una fase de scaffold / estructura base. Hay varios archivos placeholder.
- `lib/db/src/schema/index.ts` está vacío; no hay modelos reales todavía.
- `main.py` no parece ser el punto de entrada funcional del producto.
- El backend pide `PORT` en entorno, y la DB requiere `DATABASE_URL`.
- La descarga real de video/audio depende de `python3 -m yt_dlp`; si ese comando no está disponible, la funcionalidad de YouTube falla.
- `pnpm-workspace.yaml` tiene una política estricta de seguridad para dependencias de npm (`minimumReleaseAge`).

---

## Conclusión

El repositorio tiene una arquitectura muy clara de monorepo con división por capas:

- Frontend: app de usuario
- Backend: API Express y orquestación de descarga
- Shared libs: contratos, tipos, validación y DB
- Infra: entorno Node + Python + pnpm workspaces

La pieza central del producto es la funcionalidad de buscar videos de YouTube y convertirlos a MP3, usando `yt-dlp` como motor real de extracción de media.

---

## Puntos para recordar al volver al repo

- La app principal es `artifacts/audio-mp3`.
- La API principal es `artifacts/api-server`.
- El contrato API reside en `lib/api-spec/openapi.yaml`.
- Los schemas y hooks consumidos por React vienen desde `lib/api-zod` y `lib/api-client-react`.
- La base de datos está preparada con Drizzle, pero aún no tiene esquema concreto.
- El backend de YouTube vive en `artifacts/api-server/src/routes/youtube.ts`.
