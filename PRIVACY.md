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
- **Bug reports:** nothing is sent automatically. If you report a problem on GitHub, remember that issues and
  their attachments are public, so leave out names, phone numbers and prayer requests.

### What uses the network
| Feature | What it does | Default |
|---|---|---|
| Phone remote and stage display | Runs a small web server on the church's local network (port 7272) so phones and tablets can connect. Nothing leaves your network. | On (turn it off in **Settings**) |

## Español

ICCWorship está hecho para iglesias, y las iglesias guardan información delicada: nombres, teléfonos,
peticiones de oración. Nuestra promesa es sencilla: **sus datos se quedan en su computadora.**

- **Sin cuentas, sin nube, sin telemetría.** ICCWorship no recopila estadísticas de uso ni informes de errores,
  y no se comunica con ningún servidor.
- **Dónde están sus datos:** en `Documentos\ICCWorship` en la PC, como archivos JSON, más copias automáticas en
  `Documentos\ICCWorship\backups`. Si Windows respalda su carpeta Documentos en OneDrive, Windows sincroniza esos
  archivos como cualquier otro documento. ICCWorship nunca los sube.
- **Reportes de errores:** no se envía nada automáticamente. Si reporta un problema en GitHub, recuerde que los
  reportes y sus archivos adjuntos son públicos: no incluya nombres, teléfonos ni peticiones de oración.

### Qué usa la red
| Función | Qué hace | Por defecto |
|---|---|---|
| Control remoto y pantalla de escenario | Un pequeño servidor web en la red local de la iglesia (puerto 7272) para que teléfonos y tabletas se conecten. Nada sale de su red. | Activado (se apaga en **Ajustes**) |
