# FinPredict PyME

Sistema web para análisis y predicciones financieras de pequeñas empresas.

**Stack:** Node.js + Express · PostgreSQL en Neon · Chart.js · despliegue en Render · IA opcional (API de Claude).

## Funcionalidades

- **Inicio de sesión** con dos roles: usuario (empresa) y administrador. Sesión con cookie `httpOnly` (JWT), contraseñas con bcrypt, límite de intentos de login.
- **Administrador:** crea usuarios y contraseñas, restablece contraseñas, activa/desactiva y elimina cuentas.
- **Cuestionario financiero** (perfil, ventas de hasta 24 meses, costos, liquidez, deuda, planes).
- **Carga de estados financieros** (Excel, CSV, PDF con texto, TXT): se detectan automáticamente ingresos, costos, utilidades, activos, pasivos, capital, etc.
- **Análisis numérico:** razones financieras (márgenes, razón circulante, prueba ácida, cobertura de deuda, punto de equilibrio, ciclo de efectivo, ROE/ROA), regresión lineal para proyectar ventas y caja a 6 meses en 3 escenarios, puntaje de salud 0–100 y alertas.
- **Análisis con IA (opcional):** si defines `ANTHROPIC_API_KEY`, se genera un diagnóstico y recomendaciones en lenguaje claro. Sin la clave, todo funciona con el análisis numérico.

## Ejecución local

```bash
npm install
cp .env.example .env     # edita DATABASE_URL, JWT_SECRET y ADMIN_PASSWORD
npm start                # http://localhost:3000
```

Las tablas se crean automáticamente al arrancar y el administrador inicial se crea con `ADMIN_USER` / `ADMIN_PASSWORD`.

## Neon (base de datos)

1. Crea un proyecto en https://neon.tech.
2. Copia la *connection string* (incluye `sslmode=require`) y úsala como `DATABASE_URL`.

## Despliegue en Render

1. Sube esta carpeta a un repositorio de GitHub.
2. En Render: **New → Blueprint** y selecciona el repositorio (usa `render.yaml`), o **New → Web Service** con build `npm install` y start `npm start`.
3. Configura las variables de entorno: `DATABASE_URL`, `ADMIN_PASSWORD` (y opcionalmente `ANTHROPIC_API_KEY`). `JWT_SECRET` se genera solo con el blueprint.
4. Entra a la URL de Render con el usuario `admin` y cambia la contraseña inicial.

> En el plan gratuito de Render el servicio se suspende por inactividad y tarda unos segundos en despertar. Los archivos subidos **no** se guardan en disco: solo se almacenan las cifras extraídas y un extracto de texto en Neon.

## Estructura

```
server.js            API Express y rutas
src/db.js            Conexión a Neon, esquema y administrador inicial
src/auth.js          Sesiones JWT y control de roles
src/questions.js     Definición del cuestionario
src/parser.js        Lectura de Excel/CSV/PDF/TXT y detección de cifras
src/analysis.js      Razones, proyección, puntaje y alertas
src/ai.js            Narrativa con IA (opcional)
public/              Interfaz (login, usuario, administrador)
```

## Notas y límites

- Los PDF escaneados (imágenes) no se pueden leer; usa Excel/CSV o PDF con texto.
- La detección de cifras se basa en etiquetas en español/inglés (p. ej. "Ventas netas", "Utilidad neta", "Total activo"). Toma la primera columna numérica como periodo más reciente.
- Las proyecciones son orientativas y no sustituyen asesoría contable o financiera.
