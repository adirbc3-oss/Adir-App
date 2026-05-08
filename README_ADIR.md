# 🚀 ADIR Web (React/Node.js Parallel Version)

Esta es la versión moderna y acelerada de tu sistema de gestión de licitaciones, construida en **React + Vite**. Funciona de forma totalmente paralela a la versión de Python, compartiendo la misma base de datos en Google Sheets.

## ✨ Mejoras Clave
- **Interfaz Fluida**: Sin recargas de página "en blanco". Estética Glassmorphism premium.
- **Procesado Local**: Los archivos BC3 se leen instantáneamente en tu navegador, sin subirlos a un servidor intermedio.
- **IA en el Navegador**: La auto-asignación usa `Transformers.js`. La primera vez descargará el modelo (~45MB) y luego funcionará para siempre desde tu memoria RAM, a velocidad de vértigo.

## 🛠️ Cómo Lanzar esta App
Como es una aplicación de Node.js, sigue estos pasos:

1. Abre un **nuevo terminal** en la carpeta `App_React`.
2. Escribe el comando:
   ```bash
   npm run dev
   ```
3. Verás un enlace parecido a `http://localhost:5173`. Haz clic (Ctrl+Click) para abrirlo en tu navegador.

## 📁 Estructura
- `/src/pages`: Pantallas de la aplicación.
- `/src/utils`: El "cerebro" (Parser BC3 e IA local).
- `/src/config.js`: Contiene tu `API_URL` de Google Sheets.

¡Disfruta de la nueva experiencia! 🥂
