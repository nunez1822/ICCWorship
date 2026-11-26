<p align="center">
  <img src="resources/icon.png" width="110" alt="ICCWorship" />
</p>

<h1 align="center">ICCWorship</h1>

<p align="center">
  <b>Software libre y gratuito de presentaciones para la iglesia en Windows — hecho en español e inglés desde el primer día.</b><br/>
  Cantos · Biblia · Videos · PowerPoint · Planificación del servicio · Control desde el teléfono · Pantalla de escenario<br/>
  <a href="README.md">🇺🇸 Read in English</a>
</p>

<p align="center">
  <a href="https://github.com/nunez1822/ICCWorship/actions/workflows/ci.yml"><img src="https://github.com/nunez1822/ICCWorship/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/nunez1822/ICCWorship"><img src="https://api.scorecard.dev/projects/github.com/nunez1822/ICCWorship/badge" alt="OpenSSF Scorecard" /></a>
</p>

<p align="center">
  <img src="docs/screenshots/projector-bilingual.png" width="720" alt="Letra bilingüe en el proyector" />
</p>

---

## ¿Por qué ICCWorship?

La mayoría de las iglesias pagan cada año por software de presentaciones (EasyWorship, ProPresenter,
Proclaim) y de planificación (Planning Center). Muchas iglesias — sobre todo congregaciones pequeñas y
bilingües — simplemente no lo pueden pagar. **ICCWorship es gratis para siempre**, funciona
**sin internet** y trata **el español y el inglés por igual**: cada canto, versículo y anuncio se puede
mostrar en un idioma o **en ambos a la vez**, cambiando en vivo con una sola tecla.

| Inspirado en | Lo que hace ICCWorship |
|---|---|
| ProPresenter | Monitores En vivo + Siguiente, capas (negro / quitar texto / logo), **pantalla de escenario** con acordes y cronómetros, **control remoto por Wi-Fi**, mensajes en pantalla (llamados de la guardería) |
| EasyWorship / Proclaim | Biblioteca de cantos con búsqueda instantánea, importación de letras, escribir una cita y proyectarla, temas y fondos en movimiento, cuentas regresivas, anuncios en bucle |
| Planning Center Services | Orden del servicio con horas, duraciones y notas, plantillas, **cronómetro por elemento**, programación de voluntarios con aviso de conflictos, programa impreso |
| OpenLP / FreeShow | Gratis y sin internet, importa cantos **OpenLyrics** y **ChordPro** |
| CCLI | Número CCLI en las diapositivas e **informe automático de uso de cantos** (CSV) |

## Funciones

**En pantalla**
- 🎵 **Cantos bilingües** – español e inglés lado a lado en el editor; en pantalla ES, EN o **ES + EN** (teclas `1` `2` `3`). Arreglos (V1 C V2 C P C), líneas por diapositiva, texto que se ajusta solo.
- 📖 **Biblia** – Reina-Valera 1909 y King James incluidas. Escriba `Juan 3:16-18`, `Jn 3.16`, `1 Cor 13`, `Salmos 23` en cualquier idioma → diapositivas bilingües en paralelo; los versículos largos se dividen solos.
- ⭐ **La Biblia de las Américas (LBLA) y otras Biblias con derechos** – vea [abajo](#biblias-con-derechos-de-autor-lbla-nvi-rvr1960).
- 🎬 **Video** – MP4 / MOV / WebM como elemento del servicio (reproducir, pausar, adelantar, volumen, repetir, pasar al siguiente, tiempo restante) **o como fondo en movimiento detrás de la letra**. No hay que instalar códecs.
- 📊 **PowerPoint y PDF** – arrastre un `.pptx`. Con PowerPoint instalado se ve *exactamente* igual; con LibreOffice se convierte; sin ninguno, se importa el texto como diapositivas editables (¡y traducibles!). Las notas del orador van a la pantalla del escenario.
- 📣 Anuncios (con avance automático), ⏱ cuenta regresiva para el inicio, 📝 notas de la prédica con **espacios en blanco que se revelan**, 🙏 diapositivas de oración.
- 🎨 Temas – fuentes, colores, sombras, posición, degradados, fondos de imagen o video; un tema verde de **tercio inferior para transmisiones** (chroma key en OBS).
- 💬 Mensajes en pantalla – un clic para “Padre/madre del niño #12, favor de pasar a la guardería” en ambos idiomas.

**Durante el servicio**
- 📺 Página En vivo: el servicio a la izquierda, las diapositivas al centro, monitores En vivo + Siguiente y botones grandes a la derecha.
- 📱 **Control desde el teléfono** – escanee el código QR, escriba el PIN y controle las diapositivas desde cualquier teléfono en el Wi-Fi de la iglesia.
- 🎤 **Pantalla de escenario** – diapositiva actual/siguiente, acordes, reloj, cronómetros, tiempo restante del video y mensajes desde la cabina (“Favor de terminar”). Ábrala en una tercera pantalla o en cualquier navegador de la red.
- ⌨️ Funciona con teclado y control de presentaciones (Espacio, flechas, RePág/AvPág, B, C, L, Esc, P).

**Planificación y personas**
- 🗓️ Servicios con hora de cada elemento, duraciones, quién dirige, notas, plantillas, duplicar el de la semana pasada.
- 👥 Directorio, equipos y puestos, programación de voluntarios con aviso de conflictos.
- 🙏 Peticiones de oración (las privadas nunca salen en pantalla).
- 📊 Registro de asistencia y ofrendas con resumen mensual; CSV de uso de cantos para CCLI.
- 🖨️ Programa bilingüe → PDF o impresora.

**Sus datos, seguros**
- Todo se guarda en `Documentos\ICCWorship` como JSON — sin nube, sin cuentas.
- Copias automáticas (al iniciar y cada hora, guarda los últimos 14 días en que se usó) + **copia a USB** (.zip) con un clic, y restauración.

## Capturas

| En vivo | Escenario | Teléfono |
|---|---|---|
| ![En vivo](docs/screenshots/live.png) | ![Escenario](docs/screenshots/stage.png) | <img src="docs/screenshots/remote.png" width="220"/> |

| Servicio | Editor de cantos | Versículos LBLA |
|---|---|---|
| ![Servicios](docs/screenshots/plans.png) | ![Cantos](docs/screenshots/songs.png) | ![LBLA](docs/screenshots/lbla.png) |

## Instalación

1. Descargue **`ICCWorship-Setup-x.y.z.exe`** (instalador) o **`ICCWorship-Portable-x.y.z.exe`** (no necesita instalación) en la página de Releases.
   La versión **portátil** guarda todo (cantos, planes, ajustes, copias, registros) en una carpeta **`ICCWorship Data`**
   junto al exe, así funciona desde una memoria USB y no deja nada en la computadora. En una memoria protegida contra
   escritura abre esos datos en solo lectura (no se guarda nada, una barra roja lo dice). ¿Ya usaba una versión
   portátil anterior, que guardaba los datos en `Documentos\ICCWorship`? Mientras no haya una carpeta
   `ICCWorship Data` junto al exe, sigue usando esos datos; para llevarlos con el exe, cree la carpeta y copie en ella
   todo lo de `Documentos\ICCWorship`. Solo puede estar abierto un ICCWorship a la vez (instalado o portátil).
2. Windows SmartScreen puede advertir porque la app todavía no tiene firma digital. Haga clic en **Más información → Ejecutar de todas formas**.
3. **Opcional: verifique su descarga.** Cada versión incluye las sumas SHA-256 (`SHA256SUMS.txt`). En PowerShell,
   `(Get-FileHash .\ICCWorship-Setup-x.y.z.exe).Hash -eq '<suma de SHA256SUMS.txt>'` debe mostrar `True`
   (`Get-FileHash` muestra la suma en mayúsculas; la comparación no distingue mayúsculas de minúsculas). Con GitHub CLI también puede confirmar que
   el archivo lo compiló el flujo de publicación de este repositorio: `gh attestation verify ICCWorship-Setup-x.y.z.exe --repo nunez1822/ICCWorship`.
4. La primera vez que use el control desde el teléfono, el Firewall de Windows pedirá permiso — elija **Permitir** en redes privadas.

## Sus datos y copias de seguridad

- Todo lo que crea ICCWorship está en **`Documentos\ICCWorship`** (Ajustes → Copia de seguridad → 📂 Abrir carpeta de datos) —
  o, en la versión portátil, en la carpeta **`ICCWorship Data`** junto a `ICCWorship-Portable-x.y.z.exe`.
- Se hace una copia automática al abrir la app y cada hora que siga abierta, si algo cambió
  (en `Documentos\ICCWorship\backups`). Se guarda la más reciente de cada uno de los últimos 14 días en que se usó
  la app, además de las 6 más recientes.
- **Cambiar de computadora:** en la PC anterior, Ajustes → Copia de seguridad → **Hacer copia ahora** a una memoria USB.
  Instale ICCWorship en la nueva PC y elija **Restaurar** con ese archivo. **Las imágenes, videos y sonidos que agregó
  (y el logo) van dentro de esa copia**, porque la biblioteca de medios guarda su propia copia de todo lo que agrega
  (en `Documentos\ICCWorship\media`), igual que las **pistas de acompañamiento**. Si juntos pasan de 4 GB, la copia lo
  avisa y los deja fuera: copie también las carpetas `media` y `tracks` a la memoria.
  (Si desactiva Ajustes → Copia de seguridad → "Guardar una copia de las imágenes, videos y sonidos…", los elementos
  enlazan al archivo original: copie esos archivos a la misma carpeta en la nueva PC.)
- Las copias automáticas dejan fuera la biblioteca de medios y las pistas (harían grande cada copia de cada hora), y
  restaurar una copia nunca borra pistas ni archivos de medios.
- No se sube nada a ningún lugar — vea [PRIVACY.md](PRIVACY.md).

## Su primer domingo (5 minutos)

1. Abra ICCWorship y escriba el nombre de su iglesia. Se crea un servicio de ejemplo con himnos de dominio público.
2. Conecte el proyector/TV. La ventana del proyector se abre en pantalla completa automáticamente (elija la pantalla en **Ajustes → Pantallas**).
3. Vaya a **Servicios** y ajuste el servicio del domingo: agregue cantos, escrituras, videos, un PowerPoint.
4. Presione **Presentar**. Doble clic en un elemento para ponerlo en pantalla y luego **Espacio** para avanzar.
5. Opcional: en **Ajustes**, escanee el código QR con su teléfono para controlar las diapositivas desde cualquier lugar.

Presione **?** en cualquier momento para ver todos los atajos de teclado.

## Biblias con derechos de autor (LBLA, NVI, RVR1960…)

Las traducciones modernas más populares tienen derechos de autor, así que su texto completo **no** puede
incluirse en una app gratuita. ICCWorship incluye dos Biblias completas de dominio público (Reina-Valera 1909
y King James) y ofrece una **versión “para pegar”** para todo lo demás:

1. **Biblia → Mis versículos → Configurar La Biblia de las Américas (LBLA)**.
2. Cada semana copie el pasaje del sitio donde lee la LBLA, péguelo, presione **Detectar versículos** → **Guardar**.
3. Los versículos se guardan solo en esa computadora y se reutilizan automáticamente cada vez que se muestra esa cita — incluso junto a la KJV.
4. La línea de créditos que exige The Lockman Foundation se agrega automáticamente, y un contador vigila el límite de **500 versículos** que Lockman permite sin permiso escrito.
5. Si su iglesia obtiene permiso escrito / un archivo digital con licencia, impórtelo en **Biblia → Versiones** y el límite desaparece.

Lo mismo funciona para NVI, RVR1960, NIV o cualquier otra versión.

## Desarrollo

Requisitos: Windows 10/11, [Node.js](https://nodejs.org) 22.22.1 o más nuevo (quédese en Node 22, vea
`.node-version`), [pnpm](https://pnpm.io) y Git. El [CLI de Vite+](https://viteplus.dev/guide/) (`vp`) puede instalar
la versión correcta de Node y pnpm.
Vea la sección **Develop** del [README en inglés](README.md#develop): `pnpm install`, `pnpm dev`,
`pnpm test`, `pnpm build:win`.

## Contribuir

Reportes de errores, traducciones, cantos de dominio público y pull requests son bienvenidos — vea
[CONTRIBUTING.md](CONTRIBUTING.md).

- Preguntas: [Discussions](https://github.com/nunez1822/ICCWorship/discussions) · Ayuda: [SUPPORT.md](SUPPORT.md)
- Problemas de seguridad: repórtelos en privado, vea [SECURITY.md](SECURITY.md)
- Esperamos que todos sigan el [Código de conducta](CODE_OF_CONDUCT.md). Novedades: [CHANGELOG.md](CHANGELOG.md)

## Licencia

[MIT](LICENSE) — libre para usar, compartir y modificar, para cualquier iglesia, para siempre.

*Soli Deo gloria.*
