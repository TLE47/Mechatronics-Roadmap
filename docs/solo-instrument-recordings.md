# Free solo-instrument recordings worth bundling

The workbench's **Solo instrument tracks** chips used to point at the drone — one held chord with an
instrument's harmonics. That is a note, not a song, which is what this page exists to fix: a shortlist
of recordings that are genuinely one instrument, genuinely good, and genuinely free to redistribute.

Every entry below is **CC0 1.0** or **public domain**; none needs attribution, and all of them may be
cut into a loop and shipped inside the app.

| instrument | track | source | licence | length |
| :--- | :--- | :--- | :--- | ---: |
| piano | *First Snow* — HoliznaCC0 | [Winter Lofi, Free Music Archive](https://freemusicarchive.org/music/holiznacc0/winter-lofi/) | CC0 1.0 | 40 s cut (bundled) |
| guitar | *Winter Blues* — HoliznaCC0 | [Winter Lofi, Free Music Archive](https://freemusicarchive.org/music/holiznacc0/winter-lofi/) | CC0 1.0 | 45 s cut (bundled) |
| guitar | *Busted Guitar (JAZZ)* — HoliznaCC0 | [Busted Guitar, Free Music Archive](https://freemusicarchive.org/music/holiznacc0/busted-guitar-jazz) | CC0 1.0 | 2:02–4:16 per track |
| guitar | *Ghost Solos* — Lucas Gonze | [Ghost Solos, Free Music Archive](https://freemusicarchive.org/music/Lucas_Gonze/Ghost_Solos) | CC0 1.0 | 1:19–10:21 per track |
| piano | Chopin, *Preludes* — Musopen | [The Complete Chopin Collection, Internet Archive](https://archive.org/details/musopen-chopin) | CC0 1.0 | 1–2 min per prelude |
| piano | Beethoven, *Moonlight Sonata* I — Musopen | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Ludwig_van_Beethoven_-_sonata_no._14_in_c_sharp_minor_%27moonlight%27,_op._27_no._2_-_i._adagio_sostenuto.ogg) | public domain (recording released by musopen.com) | 6 min |

## What is bundled today

Two of these are already in `app/src/audio/assets/music/` and are what the **Piano** and **Guitar**
chips play (`musicCatalogue.ts`, `SOLO_TRACKS`). The rest are candidates, not shipped files: the app
bundles `.m4a` loops (`scripts/build_music.mjs` renders the composed ones), and this workspace has no
audio encoder, so a candidate only lands here once someone cuts it to a 30–45 s loop and re-encodes it.

## How to add one

1. Download the track from the source above and confirm the licence line on its own page.
2. Cut a 30–45 s section that loops without a click, and encode it as AAC `.m4a`.
3. Drop it in `app/src/audio/assets/music/<id>.m4a`, add a `recorded(...)` row to `MUSIC_TAPES`, and
   point the instrument's `SoloTrack.tapeId` at it.
4. Run `npm run check:weight` — the `music` budget counts every bundled tape.

Flute and violin have no bundled recording yet: their chips still play the drone's instrument recipe,
and their hints say so rather than promising a performance.
