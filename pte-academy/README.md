# PTE-79 Express 🚆 — personal PTE Academic study site

A static (no build, no backend) study academy for a 6‑month PTE Academic plan, bilingual **English / Arabic**, styled with the SAR palette
(SAR Blue `#00778B`, Black `#3D3935`, slate, sky, mid blue, cool gray, red, yellow) and the diagonal "track" motif.

Open `index.html` (or serve the folder: `npx serve pte-academy`). It is also an installable PWA that works offline.
On GitHub Pages it is published at `/pte-academy/` by `.github/workflows/pages.yml`.

## What is inside

| Section | What you get |
| --- | --- |
| **Plan / Today** | 26 stations (weeks) in 4 phases, a daily mission list, a "tired day" 10‑minute mode, milestones & 3 checkpoint mocks |
| **Story** | "PTE‑79 Express": one episode + riddle per station (EN/AR, with audio) |
| **Vocabulary** | 600 academic words (Arabic meaning, example, word family), Leitner spaced repetition, 5 word games |
| **Phonetics** | 12 vowels, 8 diphthongs, 24 consonants, 17 Arabic‑speaker traps, minimal‑pair game, word/sentence stress, sense groups, linking, intonation |
| **Grammar** | 16 units explained in Arabic, traps, 160 exercises with explanations |
| **Speaking** | Read Aloud, Repeat Sentence, Describe Image (generated SVG charts), Re‑tell Lecture, Answer Short Question — with recorder, optional speech‑recognition check and self‑rubric |
| **Listening** | Dictation, Summarize Spoken Text, Highlight Summary, Missing Word, MCQ, Fill blanks (audio by device TTS) |
| **Writing / Reading** | Summarize Written Text, Essay (instant checks), R&W/Reading fill‑blanks, Re‑order, MCQ |
| **Strategies** | Task‑by‑task method, templates, scoring facts, exam‑day checklist, common mistakes, glossary |
| **Mock tests** | Mini (~25 min) and full (~2 h) guided mocks with a weak‑spot report |
| **Drive mode** | Hands‑free audio lessons (see below) |
| **Progress** | XP, ranks, streak, badges, skill averages, mistakes log, JSON backup |

## Drive mode (hands‑free journey)
One clear path: **4 phases → 26 units (one per station) → 9 lessons per unit = 234 audio lessons (~13 h)**. Every unit has the same lessons in the same order:
📖 Episode · 🧠 Words A · 🧠 Words B · 🔊 Sound Lab · 📘 Grammar · 🎤 Speaking Gym · 🎧 Listening Lab · 🧭 Exam Strategy · 🏁 Unit Review.
All 600 words, 16 grammar units, the phonetics course, the task banks and the strategy guide are spread across the units. The journey page shows "You are here" and this week's unit; the unit page shows its 9 lessons with ✓ and "Lesson k of 9".
Lessons play by themselves (English → Arabic → beep → you repeat), roll on to the next lesson and the next unit automatically (switchable), and Today's missions link to this week's unit. Quick random mixes remain under a collapsible section.
Giant ⏮ ⏯ ⏭ buttons, headset / steering‑wheel media keys, screen wake‑lock + muted‑video fallback + 🌙 black screen, optional voice commands. Start it **while parked**. Speech uses the phone's TTS voices — install an Arabic voice (Google Text‑to‑Speech).

## Word helper
Select (long-press / double-click) any English or Arabic word or sentence anywhere: a bottom sheet offers 🔊 Listen / 🐢 Slow, 🌐 Translate (course words offline; other text via MyMemory, optional), 📖 Meaning (dictionaryapi.dev) and ➕ My words (joins spaced repetition). Switch off or auto-translate in Settings.

## Motion layer
`js/fx.js` + self-hosted `vendor/` (GSAP + ScrollTrigger, Lenis): smooth scrolling, page transitions, scroll reveals, and vanilla ports of React Bits effects (BlurText titles, CountUp numbers, ShinyText, SpotlightCard hover, Magnet buttons, ClickSpark, moving track stripes). Automatically off for `prefers-reduced-motion`, switchable in Settings, and never active inside Drive mode.

## Content & honesty notes
* All practice content is **original**, written to follow the syllabus of the Expert PTE materials and the strategy notes in the Drive folder (no book text is copied).
* Self‑practice percentages are guidance only; PTE's official AI scoring is different, and speaking/writing quality still needs a human teacher's ear.
* Progress is stored in this browser (`localStorage`); use *Settings → Backup* to copy/restore it.

## Layout
`index.html` · `css/style.css` · `js/*.js` (views, core, drive mode) · `data/*.js` (plan, vocabulary, phonetics, grammar, task banks, strategies) · `sw.js` · `manifest.webmanifest`
