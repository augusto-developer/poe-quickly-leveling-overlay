'use strict';
// A picture of the primary screen, as raw BGRA pixels. This is how the program "sees" the game.
const { desktopCapturer, screen } = require('electron');

async function capture() {
  const display = screen.getPrimaryDisplay();
  const width = Math.round(display.size.width * display.scaleFactor);
  const height = Math.round(display.size.height * display.scaleFactor);
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
  const source = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  const size = source.thumbnail.getSize();
  return { buf: source.thumbnail.toBitmap(), w: size.width, h: size.height };
}

module.exports = { capture };
