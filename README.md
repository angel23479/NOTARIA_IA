# Asistente Inteligente para la Elaboración de Documentos Notariales en el Cantón Chinchipe

Este proyecto es una plataforma web completa, funcional y moderna diseñada para asistir al personal de la Notaría del Cantón Chinchipe (Zamora Chinchipe, Ecuador) en la recopilación inteligente de información y elaboración ágil de borradores de documentos notariales.

---

## 🚀 Arquitectura y Tecnologías

El sistema está diseñado bajo el principio de **cero dependencias externas complejas (Zero-Build SPA)**. La aplicación puede abrirse directamente en el navegador para una demostración; para guardar información en una base persistente debe iniciarse con el servidor local.

- **Frontend**: HTML5, CSS3 (Efectos de vidrio, variables dinámicas de tema, diseño responsivo).
- **Controlador y Lógica**: JavaScript modular cargado de forma estructurada en el navegador.
- **Servidor y API**: Node.js con la API HTTP integrada y SQLite (`node:sqlite`); no requiere paquetes externos.
- **Base de Datos**: SQLite (`notaria.db`), con persistencia de usuarios, clientes, trámites, tipos de documentos, plantillas, documentos, auditoría, notificaciones y conversaciones de IA.
- **Servicio de IA (Inteligencia Artificial)**:
  - **Modo Gemini Real**: Consultas estructuradas JSON en tiempo real a la API oficial de Google Gemini (`gemini-1.5-flash`).
  - **Modo Demostración (Mock)**: Motor lógico basado en heurísticas locales que permite simular la interacción completa sin costo ni llaves de API.

---

## 🔒 Roles y Credenciales de Demostración

El sistema implementa control de accesos basados en roles. Utilice las siguientes credenciales para probar:

| Usuario | Contraseña | Rol Asignado | Alcance en el Sistema |
| :--- | :--- | :--- | :--- |
| **admin** | `password` | ADMINISTRADOR | Acceso completo. Configuración de plantillas y bitácora de auditoría. |
| **personal** | `password` | PERSONAL NOTARIAL | Creación de clientes, apertura de trámites y chat asistente IA. |
| **notario** | `password` | NOTARIO | Revisión, aprobación o rechazo de documentos borrador. |

*Nota: Para facilitar las pruebas de desarrollo, se incluye un selector rápido de rol de depuración (**Prueba Rol**) en la barra superior derecha de la interfaz.*

---

## 🌟 Módulos Implementados

1. **Autenticación (`/login`)**: Pantalla de login segura con control de rol y persistencia en `sessionStorage`.
2. **Dashboard**: Panel con estadísticas clave, gráficos visuales de trámites y logs de auditoría en tiempo real.
3. **Módulo de Clientes**: CRUD completo con validación matemática de Cédula de Identidad ecuatoriana e historial de trámites.
4. **Módulo de Trámites**: Gestión y filtrado operacional de trámites en sus diversos estados.
5. **Asistente IA**: Interfaz de chat conversacional progresiva que interroga al usuario sobre las variables que faltan rellenar de la plantilla seleccionada.
6. **Editor de Documentos**: Simulación de hoja A4 con marca de agua dinámica, editor editable en línea, descargas oficiales para Microsoft Word e impresión PDF optimizada.
7. **Consola Notarial**: Bandeja del Notario para aprobar actas o rechazarlas indicando comentarios de corrección obligatorios.
8. **Auditoría**: Bitácora inmutable de auditoría institucional donde se registran todas las acciones del sistema con fecha, hora, usuario e IP.
9. **Documentos**: Catálogo para crear y editar documentos notariales con variables de reemplazo automático (ej: `{{COMPARECIENTE}}`).

La validación de cédula comprueba los 10 dígitos, provincia (`01`–`24` o `30`), tercer dígito de persona natural (`0`–`5`) y el dígito verificador módulo 10. `1900123454` es un número de prueba de la suite, no debe usarse como identidad real.

---

## 🛠️ Instrucciones de Ejecución

1. Descargue o abra la carpeta del proyecto en su computadora e instale Node.js 22.13 o superior.
2. Ejecute `run_server.ps1` desde PowerShell o inicie `npm start` desde esta carpeta.
3. Abra `http://localhost:8080` e inicie sesión con cualquiera de los usuarios demo (ej. `personal` y clave `password`).
4. La primera ejecución crea `notaria.db` y carga los datos de demostración. Si el navegador ya tiene datos para el origen `http://localhost:8080`, se importan una sola vez cuando SQLite está vacía. Las siguientes altas y modificaciones quedan guardadas en SQLite.
5. `index.html` abierto directamente y otros servidores estáticos siguen usando `localStorage`; esos cambios no se sincronizan con SQLite. La base es local a este equipo, no un servidor compartido.
6. **Para Configurar la IA Real**:
   - Vaya a **Configuración** en el menú inferior izquierdo.
   - Cambie el modo a **Google Gemini API**.
   - Pegue su Gemini API Key y presione guardar.

El servidor usa módulos integrados de Node.js, así que no necesita instalar paquetes adicionales.

La base local se conserva al detener y reiniciar el servidor. No borre `notaria.db` si desea conservar los registros.

### Despliegue de demostración en Render

1. Sube el proyecto a un repositorio de GitHub sin incluir `notaria.db` ni claves privadas.
2. En Render, crea un **Blueprint** y conecta ese repositorio. Render detectará `render.yaml`, instalará el proyecto con npm y montará el disco persistente para SQLite.
3. Espera a que termine el despliegue y abre la URL que Render asigna al servicio.

El disco persistente requiere un servicio de pago en Render; no cambies el plan a uno gratuito si necesitas conservar la base de datos entre reinicios. Esta configuración es solo para una demostración: el API actual no autentica las operaciones y permite restablecer la base de datos. No publiques información personal real ni uses este sistema como portal notarial público sin implementar autenticación y controles de acceso en el servidor.

## ✉️ Avisos de aprobación por correo con EmailJS

1. Cree una cuenta en EmailJS, conecte su servicio de correo y cree una plantilla.
2. En EmailJS configure el destinatario como `{{to_email}}` y use estas variables:
   - `{{to_name}}`: nombre del funcionario que creó el trámite.
   - `{{to_email}}`: correo guardado en su ficha de usuario.
   - `{{procedure_reference}}`: número o referencia del trámite.
3. En la plantilla puede usar este asunto y contenido:

   **Asunto:** `Trámite {{procedure_reference}} aprobado`

   **Mensaje:**
   ```text
   Hola {{to_name}},

   El trámite {{procedure_reference}} ha sido aprobado por el notario.
   Ya puede ingresar al sistema y descargar el documento aprobado.

   Notaría del Cantón Chinchipe
   ```

4. Abra `email.js` y reemplace `PEGA_AQUI_TU_PUBLIC_KEY`, `PEGA_AQUI_TU_SERVICE_ID` y `PEGA_AQUI_TU_TEMPLATE_ID` con los identificadores correspondientes de EmailJS. La clave pública está diseñada para uso en el navegador; no coloque claves privadas o contraseñas en el frontend.
5. En el sistema, entre como administrador a **Usuarios**, escriba y guarde el correo de la cuenta que creó el trámite. El correo se envía cuando el notario aprueba el documento; el rechazo no envía un correo de aprobación.

El envío usa la cuenta y las restricciones de EmailJS configuradas por usted. Si EmailJS no está configurado o falla el envío, el documento permanece aprobado y la aplicación muestra un aviso para que el problema no pase inadvertido.

## Registro de solicitantes (prototipo local)

Desde la portada, seleccione **Crear cuenta de solicitante**. El formulario solicita nombres, apellidos, cédula ecuatoriana, correo y contraseña. Al registrarse, se inicia sesión con el rol `USUARIO` y se abre **Mis solicitudes**, donde solo se listan los trámites enlazados al perfil local. Los documentos aprobados asociados a la cuenta ofrecen descarga en Word y opción de imprimir o guardar como PDF con el formato final de la Notaría.

Este flujo es solo una demostración local: no verifica el correo ni permite enlazar de forma segura cuentas con clientes o expedientes que ya existían. Si la cédula ya está registrada, el prototipo rechaza la cuenta para evitar que se reclamen expedientes ajenos. El personal debe crear los trámites de demostración asociados al cliente nuevo. No publique esta versión ni ingrese datos personales o contraseñas reales; para un portal público se requiere autenticación y autorización verificadas por el servidor y despliegue HTTPS.

---

## 🧪 Suite de Pruebas Unitarias (XP)

Como parte de las directrices de la metodología Extreme Programming (XP), la aplicación incluye una suite de pruebas automatizadas e interactivas:

1. Abra el archivo `tests.html` en su navegador (o vaya a **Configuración** en la app y haga clic en **"Abrir Suite de Pruebas"**).
2. Haga clic en el botón **"Ejecutar Suite de Pruebas"**.
3. El sistema verificará de forma autónoma:
   - El algoritmo de validación de cédulas ecuatorianas.
   - El compilador de reemplazo de variables dinámicas de plantillas.
   - Las reglas y restricciones de acceso por roles.
   - La integridad de las colecciones de base de datos.
