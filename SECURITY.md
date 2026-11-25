# Security policy / Política de seguridad

[English](#english) · [Español](#español)

## English

### Reporting a vulnerability
**Please do not open a public issue for security problems.**
Report them privately through GitHub: **Security → Report a vulnerability**
(<https://github.com/nunez1822/ICCWorship/security/advisories/new>).

Please include the ICCWorship version, your Windows version, and the steps to reproduce.
You can expect a first reply within 7 days. Once a fix is released, we publish a GitHub Security Advisory
and credit you, unless you prefer otherwise.

### Supported versions
Only the **latest release** gets security fixes. Churches should update when a new version is announced
(Settings → About shows your version).

ICCWorship is built on Electron, which supports only its latest three major versions. We upgrade Electron at
least every second major version so the app never runs on an unsupported Chromium.

### Threat model (what we protect against)
ICCWorship is an **offline** desktop app. It never needs the internet and sends no telemetry. Its network
surface is small, and most of it is on the church's local network:

| Surface | Who can reach it | Protection |
|---|---|---|
| Phone remote and stage display server (`http://<pc>:7272`, on by default) | Anyone on the same Wi-Fi/LAN | A PIN is required to *control* slides from a phone. PIN guessing is rate-limited and locked out. The stage display (`/stage`) is read-only and needs **no PIN**: anyone on the network can see the current and next slide, slide and item notes, and messages, so don't put private notes on items. Only the media currently on screen can be downloaded. |
| The app itself | Whoever uses the PC | Isolated renderers (context isolation), a content-security policy, and no remote content |

**Known limits.** The LAN server uses plain HTTP, not HTTPS: phones can't trust a self-signed certificate
without warnings that volunteers would have to click through. So the PIN protects against other people on the
Wi-Fi *using* the remote, but someone who can capture traffic on the network could read it. Use a church
Wi-Fi with a password, or turn the server off in **Settings** if you don't use the phone remote or stage display.

Data is stored as plain JSON in `Documents\ICCWorship`. Anyone who can log in to that Windows account can read
it, including people directories and prayer requests. Use a Windows account with a password on the church PC.

## Español

### Cómo reportar una vulnerabilidad
**Por favor no abra un "issue" público para problemas de seguridad.**
Repórtelos en privado en GitHub: **Security → Report a vulnerability**
(<https://github.com/nunez1822/ICCWorship/security/advisories/new>).

Incluya la versión de ICCWorship, su versión de Windows y los pasos para reproducirlo.
Recibirá una primera respuesta en un plazo de 7 días. Cuando la corrección se publique, publicaremos un aviso
de seguridad en GitHub y le daremos crédito, a menos que prefiera lo contrario.

### Versiones con soporte
Solo la **última versión** recibe correcciones de seguridad. Actualice cuando se anuncie una versión nueva
(Ajustes → Acerca de muestra su versión).

ICCWorship usa Electron, que solo da soporte a sus tres últimas versiones mayores. Actualizamos Electron al
menos cada dos versiones mayores para que la app nunca use un Chromium sin soporte.

### Modelo de amenazas
ICCWorship es una app de escritorio **sin conexión**. Nunca necesita internet y no envía telemetría. Su
superficie de red es pequeña, y casi toda está en la red local de la iglesia:

| Superficie | Quién la alcanza | Protección |
|---|---|---|
| Servidor del control remoto y la pantalla de escenario (`http://<pc>:7272`, activo por defecto) | Cualquiera en la misma Wi-Fi/red | Se necesita un PIN para *controlar* las diapositivas desde un teléfono. Los intentos de adivinar el PIN tienen límite y bloqueo. La pantalla de escenario (`/stage`) es de solo lectura y **no pide PIN**: cualquiera en la red puede ver la diapositiva actual y la siguiente, las notas de diapositivas y de elementos, y los mensajes, así que no ponga notas privadas en los elementos. Solo se pueden descargar los archivos que están en pantalla. |
| La app | Quien use la PC | Procesos de interfaz aislados (context isolation), política de seguridad de contenido y sin contenido remoto |

**Límites conocidos.** El servidor de la red local usa HTTP, no HTTPS: los teléfonos no confían en un
certificado autofirmado sin advertencias que los voluntarios tendrían que aceptar. El PIN impide que otras
personas en la Wi-Fi *usen* el control remoto, pero alguien que pueda capturar el tráfico de la red podría
leerlo. Use una Wi-Fi con contraseña, o apague el servidor en **Ajustes** si no usa el control remoto ni la
pantalla de escenario.

Los datos se guardan como JSON en `Documentos\ICCWorship`. Cualquiera que entre a esa cuenta de Windows puede
leerlos, incluidos el directorio de personas y las peticiones de oración. Use una cuenta de Windows con
contraseña en la computadora de la iglesia.
