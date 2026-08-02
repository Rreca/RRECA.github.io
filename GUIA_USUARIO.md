# 📱 Nudos — Guía de Usuario

Una app para desbloquear tus tareas pendientes con micro-acciones de 5 minutos.

---

## 🎯 Concepto principal

Nudos convierte tus pendientes en "nudos" que desatás con pasos pequeños. La regla es simple: **1 cosa por día, 5 minutos, sin pensar**. Eso mantiene tu racha y genera momentum.

---

## 📋 Estados de un nudo

| Estado | Significado |
|--------|-------------|
| 🔒 **BLOQUEADO** | Depende de algo externo (respuesta, turno, etc.) |
| 🔓 **DESBLOQUEABLE** | Listo para arrancar (máximo 3 a la vez) |
| 🚀 **EN PROGRESO** | Lo estás haciendo ahora (solo 1 a la vez) |
| ✅ **HECHO** | Completado (se borra automáticamente a los 7 días) |
| 💤 **ALGÚN DÍA** | Diferido, no es para hoy |
| 📦 **ARCHIVADO** | Fuera del sistema (por split, merge, o manual) |

---

## 🏠 Pantalla "Hoy"

Tu vista principal del día. Muestra:

- **En progreso** — el nudo que estás trabajando
- **Desbloqueables** — tus opciones para arrancar (ordenadas por fricción/impacto)
- **Hechos** — lo que completaste esta semana (por día)
- **Backlog** — tus nudos en espera (Algún día + Bloqueados)

Podés cambiar entre **Vista lista** y **Vista secuencia** (cadenas).

---

## ⏱ Timer de foco

Al tocar "⏱ 5 min" en un nudo se abre la pantalla de **FOCO**:

- Cuenta regresiva visual (verde → naranja → rojo)
- Tocá el timer para cambiar duración (1, 2, 3, 5, 10, 15, 20, 25, 30 min)
- Al terminar: vibración + sonido
- Opciones: **Repetir**, **Pausar**, **Terminé**

El timer sigue corriendo aunque cierres la app (notificación persistente).

---

## 📲 Widget de Android

Widget para la pantalla de inicio que muestra:

- **Fecha actual** en español (Sábado, 1 de agosto)
- **Nudo actual** (título + próximo paso)
- **Botón play** → arranca el timer con vibración y sonido (sin abrir la app)
- **Progreso del día** (X/Y + barra)
- **Siguiente desbloqueable**

Al tocar la notificación del timer → abre la app en pantalla de Foco.

---

## 👆 Gestos (Swipe)

En nudos DESBLOQUEABLES y EN PROGRESO:

- **Deslizar a la derecha** → marcar como HECHO ✅
- **Deslizar a la izquierda** → mover a ALGÚN DÍA 💤

---

## 📝 Notas (mini-log)

Cada nudo tiene un campo expandible de notas:

- Tocá "📝 X notas" para expandir
- Escribí un avance y presioná Enter o "+"
- Podés borrar notas individuales con "✕"

Sirve para anotar progreso: "Hoy hice X", "Falta Y".

---

## 🔄 Recurrencia (Hábitos)

Convertí un nudo en hábito:

- En el detalle del nudo → Recurrencia → **Diario** o **Semanal**
- Cuando lo completás, reaparece automáticamente como DESBLOQUEABLE al día siguiente (o en 7 días)

Para desactivar:
- Swipe izquierdo (→ ALGÚN DÍA) desactiva la recurrencia automáticamente
- O cambiá a "Sin recurrencia" en el detalle

---

## 🔗 Cadenas

Secuencias ordenadas de nudos (como pasos de un proyecto):

- Creá una cadena al capturar un nudo (botón + → "Crear nueva cadena")
- Los nudos se muestran en orden: paso 1, 2, 3...
- Podés reordenar, mover entre cadenas, o quitar de una cadena
- Máximo 50 nudos por cadena

---

## 🏠🚶💼 Contextos

Cada nudo tiene un contexto (dónde lo hacés):

- 🏠 **Casa** — tareas domésticas
- 🚶 **Calle** — mandados, compras, trámites
- 💼 **Trabajo** — reuniones, deploys, tareas laborales
- 🌐 **General** — en cualquier lado

Filtrá por contexto en la barra superior. Auto-detección por palabras clave del título.

---

## 🎯 Meta diaria y Racha

- **Meta mínima**: cuántos nudos completar por día (default: 1, máx: 20)
- **Racha**: días consecutivos cumpliendo la meta
- Configurá en la pantalla de Análisis

---

## 🔔 Notificaciones

4 tipos (configurables):

| Tipo | Cuándo |
|------|--------|
| **Recordatorio matutino** | A la hora que elijas (6-12h). Tiene botón "⏱ Arrancar 5 min" |
| **Protección de racha** | Por la noche (18-23h) si no cumpliste la meta |
| **Celebración** | Cuando cumplís la meta del día |
| **Inactividad** | Si no abrís la app en 2+ días |

Máximo 2 notificaciones por día. Configurá horarios en Análisis → Notificaciones.

---

## 🧩 Dividir nudos

Si un nudo es muy grande:

- Tocá "🧩 Dividir" → creá 1 o 2 micro-pasos
- El nudo original se archiva
- Los nuevos nudos nacen como DESBLOQUEABLES (o ALGÚN DÍA si no hay cupo)

---

## ➕ Capturar un nudo nuevo

Botón "+" central. Campos:

- **Título** — qué tenés que hacer
- **Contexto** — dónde (auto o manual)
- **Motivo del bloqueo** — por qué no lo hacés
- **Próximo paso** — la acción más chica posible
- **Minutos estimados** — máx 5 para desbloqueables
- **Fricción / Impacto** — de 1 a 5 cada uno
- **Cadena** — opcional, asignar a una secuencia

**Regla**: no podés capturar si ya tenés 1 EN PROGRESO o 3 DESBLOQUEABLES.

---

## 📊 Pantalla "Análisis"

- Conteo por estado (tocá para navegar)
- Meta + racha
- Gráfico de momentum (últimos 7 días)
- Archivados (con hijos de splits)
- Notificaciones (configurar + probar)
- Datos (exportar/importar JSON, sync con GitHub Gist)
- Reset total (zona peligrosa)

---

## ☁️ Sync con GitHub Gist

Guardá tus datos en la nube:

1. Creá un Gist en GitHub
2. Generá un token con scope "gist"
3. Configurá en Análisis → Datos → ☁️ Gist config
4. Usá ⬆️ Guardar / ⬇️ Cargar

Protección de conflictos: no pisa datos más nuevos del remoto.

---

## 🏷️ Puntuación automática

Cada nudo tiene un score: **Impacto - Fricción**

- Score ≥ 3 → badge **"HACÉLO YA"** 🔥
- Score ≤ -2 → badge **"DIVIDIR"** (es muy pesado, mejor partirlo)

---

## ⚡ Tips

- **Regla 0,01%**: la meta mínima no se discute. Aunque sea una pavada.
- **5 minutos**: no pienses, no optimices. Solo hacé el paso hasta que termine el tiempo.
- **Sistema lleno**: si tus 3 desbloqueables llevan 24h+ sin tocarse, la app te obliga a mover uno antes de capturar algo nuevo.
