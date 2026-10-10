# Danimart

Tablero del proyecto: metas con fecha, tareas, ideas, diario y accesos.

Sitio estático, sin backend. Cada visita lee y escribe en vivo las pestañas `bitacora_*` de una planilla de Google con el login del propio usuario (Google Identity Services). Este repositorio no contiene datos: solo quien tiene acceso a la planilla ve algo.

## Datos

| Pestaña | Columnas |
|---|---|
| `bitacora_estado` | `clave`, `valor` (objetivo, etapa, inicio, actualizado, resumen) |
| `bitacora_metas` | `id`, `orden`, `titulo`, `detalle`, `objetivo`, `lograda` |
| `bitacora_tareas` | `id`, `titulo`, `detalle`, `quien`, `estado`, `creada`, `vence`, `hecha`, `meta` |
| `bitacora_ideas` | `id`, `titulo`, `detalle`, `area`, `estado`, `creada` |
| `bitacora_registro` | `id`, `fecha`, `tipo`, `titulo`, `texto` |
| `bitacora_apoyo` | `id`, `orden`, `titulo`, `nota`, `url` |

Fechas como texto `AAAA-MM-DD`. Estados de tarea: `pendiente`, `hecha`, `descartada`. Estados de idea: `abierta`, `pasada`, `descartada`. Las filas no se borran: se marcan.

Para actualizar el tablero basta con editar esas pestañas, a mano o con cualquier herramienta que escriba en Google Sheets.

## Publicar

Al cambiar CSS o JS, subir el `?v=` de `index.html` para que el celular no muestre la versión guardada.
