/**
 * A file dropped where nothing handles it would make the browser open it in place of the page (the projector
 * showing a PDF mid-service). Drop zones (Media, Plans) handle their own drops first; anything that reaches the
 * window is cancelled here — except text dropped into a text box, which is inserted as usual (lyrics dragged in
 * from Word or a browser). Main's will-navigate guard is the second line of defence.
 */
const EDITABLE = 'input, textarea, [contenteditable]:not([contenteditable="false"])'
const isTextDrop = (e: DragEvent) => e.target instanceof Element && !!e.target.closest(EDITABLE) && !Array.from(e.dataTransfer?.types || []).includes('Files')

window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => {
  if (!isTextDrop(e)) e.preventDefault()
})
