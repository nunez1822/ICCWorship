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
| Phone remote and stage display server (`http://<pc>:7272`, on by default) | Anyone on the same Wi-Fi/LAN | A 6-digit PIN is required for the phone remote **and** the stage display. PIN guessing is rate-limited and locked out. Only this computer's own addresses and names are answered, and browsers must come from its own pages, which blocks DNS rebinding and other websites. Phones receive only what their pages show: never file paths. Only slide images currently on screen can be downloaded, through opaque links. Malformed requests are refused without affecting the app. |
| The app itself | Whoever uses the PC | Sandboxed, isolated renderers. A strict content-security policy, no remote content, and no navigation away from the app's pages. Main accepts calls only from the app's own pages, and validates every id, path and setting. Hardened Electron fuses: no "run as Node", no inspector, and asar integrity is checked. |

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
| Servidor del control remoto y la pantalla de escenario (`http://<pc>:7272`, activo por defecto) | Cualquiera en la misma Wi-Fi/red | Se necesita un PIN de 6 dígitos para el control remoto **y** la pantalla de escenario. Los intentos de adivinar el PIN tienen límite y bloqueo. Solo responde a las direcciones y nombres de esta computadora, y los navegadores deben venir de sus propias páginas, lo que bloquea "DNS rebinding" y otros sitios web. Los teléfonos reciben solo lo que muestran sus páginas: nunca rutas de archivos. Solo se pueden descargar las imágenes de las diapositivas que están en pantalla, mediante enlaces opacos. Las peticiones malformadas se rechazan sin afectar la app. |
| La app | Quien use la PC | Procesos de interfaz aislados (sandbox). Política de seguridad de contenido estricta, sin contenido remoto y sin navegar fuera de las páginas de la app. El proceso principal solo acepta llamadas de las páginas de la app y valida cada id, ruta y ajuste. "Fuses" de Electron reforzados: sin "ejecutar como Node", sin inspector, y se verifica la integridad del asar. |

**Límites conocidos.** El servidor de la red local usa HTTP, no HTTPS: los teléfonos no confían en un
certificado autofirmado sin advertencias que los voluntarios tendrían que aceptar. El PIN impide que otras
personas en la Wi-Fi *usen* el control remoto, pero alguien que pueda capturar el tráfico de la red podría
leerlo. Use una Wi-Fi con contraseña, o apague el servidor en **Ajustes** si no usa el control remoto ni la
pantalla de escenario.

Los datos se guardan como JSON en `Documentos\ICCWorship`. Cualquiera que entre a esa cuenta de Windows puede
leerlos, incluidos el directorio de personas y las peticiones de oración. Use una cuenta de Windows con
contraseña en la computadora de la iglesia.
