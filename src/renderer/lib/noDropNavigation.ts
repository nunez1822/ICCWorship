/**
 * A file dropped where nothing handles it would make the browser open it in place of the page (the projector
 * showing a PDF mid-service). Drop zones (Media, Plans) handle their own drops first; anything that reaches the
 * window is cancelled here. Main's will-navigate guard is the second line of defence.
 */
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())
