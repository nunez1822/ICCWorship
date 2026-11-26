# Privacy / Privacidad

[English](#english) · [Español](#español)

## English

ICCWorship is built for churches, and churches hold sensitive information: names, phone numbers, prayer
requests. Our promise is simple: **your data stays on your computer.**

- **No account, no cloud, no telemetry.** ICCWorship does not collect usage statistics or crash reports, and it
  does not "phone home".
- **Where your data lives:** `Documents\ICCWorship` on the PC, as plain JSON files, plus automatic backups in
  `Documents\ICCWorship\backups`. If Windows backs up your Documents folder to OneDrive, those files are synced
  by Windows like any other document. ICCWorship itself never uploads them.
- **Logs** (for troubleshooting) are kept on the PC in `%APPDATA%\ICCWorship\logs`. They record what the app did
  and any errors — never song lyrics, people, prayer requests or your PIN; your Windows user name is replaced by
  `%USERPROFILE%`. If the app crashes, Windows crash files ("minidumps") are kept in `%APPDATA%\ICCWorship\Crashpad`.
- **Bug reports:** nothing is sent automatically. **Help → Export diagnostics** makes a .zip you can attach
  yourself: logs, PC and app details, settings without the PIN, and how many songs/plans you have (not their
  contents). Crash dumps are only added if you tick the box — they can contain text that was on screen. Remember
  that issues and their attachments on GitHub are public.

### What uses the network
| Feature | What it does | Default |
|---|---|---|
| Phone remote and stage display | Runs a small web server on the church's local network (port 7272) so phones and tablets can connect. Nothing leaves your network. | On (turn it off in **Settings**) |
| Update check | Asks GitHub at most once a day (never during a service) whether a newer ICCWorship exists. GitHub sees your IP address, as with any website; nothing else is sent. Nothing is downloaded or installed. | **Off** (turn it on in **Settings → About**) |

## Español

ICCWorship está hecho para iglesias, y las iglesias guardan información delicada: nombres, teléfonos,
peticiones de oración. Nuestra promesa es sencilla: **sus datos se quedan en su computadora.**

- **Sin cuentas, sin nube, sin telemetría.** ICCWorship no recopila estadísticas de uso ni informes de errores,
  y no se comunica con ningún servidor.
- **Dónde están sus datos:** en `Documentos\ICCWorship` en la PC, como archivos JSON, más copias automáticas en
  `Documentos\ICCWorship\backups`. Si Windows respalda su carpeta Documentos en OneDrive, Windows sincroniza esos
  archivos como cualquier otro documento. ICCWorship nunca los sube.
- **Los registros (logs)** para resolver problemas se guardan en la PC, en `%APPDATA%\ICCWorship\logs`. Anotan lo que
  hizo la app y los errores — nunca letras de cantos, personas, peticiones de oración ni su PIN; su nombre de usuario
  de Windows se reemplaza por `%USERPROFILE%`. Si la app falla, Windows guarda archivos de fallo ("minidumps") en
  `%APPDATA%\ICCWorship\Crashpad`.
- **Reportes de errores:** no se envía nada automáticamente. **Ayuda → Exportar diagnóstico** crea un .zip que usted
  puede adjuntar: registros, datos de la PC y de la app, ajustes sin el PIN y cuántos cantos/servicios tiene (no su
  contenido). Los volcados de fallos solo se incluyen si marca la casilla — pueden contener texto que estaba en
  pantalla. Recuerde que los reportes en GitHub y sus archivos adjuntos son públicos.

### Qué usa la red
| Función | Qué hace | Por defecto |
|---|---|---|
| Control remoto y pantalla de escenario | Un pequeño servidor web en la red local de la iglesia (puerto 7272) para que teléfonos y tabletas se conecten. Nada sale de su red. | Activado (se apaga en **Ajustes**) |
| Buscar actualizaciones | Pregunta a GitHub como máximo una vez al día (nunca durante un servicio) si hay una versión nueva. GitHub ve su dirección IP, como cualquier sitio web; no se envía nada más. No se descarga ni se instala nada. | **Desactivado** (se activa en **Ajustes → Acerca de**) |
