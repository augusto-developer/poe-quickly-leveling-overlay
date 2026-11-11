# Text reading model (optional)

The overlay reads text on the screen with Tesseract. Its English model, `eng.traineddata`
(about 5 MB), is downloaded once on the first run and kept in `%APPDATA%\poe-gem-overlay`.

To make the program work with no internet at all, put `eng.traineddata` in this folder.
When the file is here, the overlay copies it to its data folder on start and nothing is downloaded. If you have already run the
overlay from source, the file is in the project folder: move it here.
