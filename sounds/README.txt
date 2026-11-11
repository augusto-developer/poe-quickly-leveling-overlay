Mercenary alert sounds
======================

One sound file per verdict. The file name (without the extension) decides when
it plays. Accepted formats: .mp3, .wav and .ogg.

  great     GREAT
  good      GOOD
  check     GOOD, BUT CHECK THE SUPPORTS
  ok        OK
  partial   the type is in the list, but the skills do not match
  unlisted  the type is not in the list
  none      the mercenary window was not found

Example: great.mp3, good.wav, unlisted.mp3

Where to put your own sounds
----------------------------
In the "sounds" folder of the overlay's data folder:

  %APPDATA%\poe-gem-overlay\sounds

(paste that line in the address bar of Windows Explorer; create the "sounds"
folder if it is not there). A file there wins over the one with the same name
that ships with the program, which lives in this folder.

What happens when a file is missing
-----------------------------------
  - check and ok use the good sound, if it exists.
  - partial uses the unlisted sound, if it exists.
  - With no files at all: a positive verdict plays 1 Windows beep,
    partial and unlisted play 2 beeps, and "none" stays silent.

A sound of its own for one rule: in mercs.json, add this field to the rule
  "sound": "file-name.mp3"
and put the file in the sounds folder. It replaces the verdict sound.

Volume: in config.json, "soundVolume" goes from 0 to 1 (default 0.8), and
"soundVolumes" sets one file apart, for example { "great": 0.5 }.

Files are read at alert time, so you can swap a sound without restarting
the program.
