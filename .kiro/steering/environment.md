# Entorno de desarrollo

## Node.js
- Se usa **nvm** para gestionar versiones de Node
- Node **22** está instalado y disponible vía nvm
- Para correr comandos de Capacitor usar `npx cap` directamente (Node 22 es compatible con Capacitor v6+)

## Capacitor
- Proyecto configurado con Capacitor v5 (instalado localmente)
- Plataforma Android ya agregada (`android/` en la raíz del proyecto)
- Flujo de build: `ng build` → `npx cap sync android`
- Si npx toma una versión antigua de Node, usar el binario local: `node node_modules/@capacitor/cli/bin/capacitor`
