/* Hand-drawn SVG glyphs for the Old Case Key (no font dependencies). */
window.GR_SYMBOLS = (function () {
  const paths = {
    eye: '<path d="M4 20 Q20 5 36 20 Q20 35 4 20 Z"/><circle cx="20" cy="20" r="4.5"/>',
    triangle: '<path d="M20 5 L35 33 H5 Z"/>',
    hexagon: '<path d="M20 4 L34 12 V28 L20 36 L6 28 V12 Z"/>',
    crescent: '<path d="M27 6 A15 15 0 1 0 27 34 A11.5 11.5 0 1 1 27 6 Z"/>',
    diamond: '<path d="M20 4 L36 20 L20 36 L4 20 Z"/><path d="M20 12 L28 20 L20 28 L12 20 Z"/>',
    star: '<path d="M20 4 L24.5 15.5 L36 15.5 L26.5 23 L30 35 L20 27.5 L10 35 L13.5 23 L4 15.5 L15.5 15.5 Z"/>',
    cross: '<path d="M15 5 H25 V15 H35 V25 H25 V35 H15 V25 H5 V15 H15 Z"/>',
    hourglass: '<path d="M8 5 H32 L8 35 H32 Z"/>',
    target: '<circle cx="20" cy="20" r="15"/><circle cx="20" cy="20" r="8"/><circle cx="20" cy="20" r="1.8" fill="currentColor"/>',
    boxx: '<rect x="6" y="6" width="28" height="28"/><path d="M6 6 L34 34 M34 6 L6 34"/>'
  };
  function svg(name, cls) {
    return (
      '<svg class="glyph ' + (cls || "") + '" viewBox="0 0 40 40" fill="none" stroke="currentColor" ' +
      'stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" aria-label="' + name + ' symbol">' +
      paths[name] + "</svg>"
    );
  }
  return { names: Object.keys(paths), svg };
})();
