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

## Drive mode (hands‑free course)
A named audio curriculum: **8 units, 226 numbered lessons**, each lesson with its own title (EN/AR) and a fixed script.
Units: Exam Strategy Academy · Sound Foundations · Word Express (600 words, 10 per lesson) · Grammar Radio · Speaking Gym · Listening Lab · Templates Academy · Story Season.
Lessons play by themselves (English → Arabic → beep → you repeat), get a ✓ when finished, and the next lesson starts automatically (switchable). "Continue" resumes where you stopped; random "Quick mixes" are still available.
Giant ⏮ ⏯ ⏭ buttons, headset / steering‑wheel media keys (Media Session), screen wake‑lock + muted‑video fallback + 🌙 black‑screen mode, optional voice commands. Start it **while parked**.
Speech comes from the phone's own TTS voices — install an Arabic voice (Google Text‑to‑Speech) for the Arabic parts.

## Motion layer
`js/fx.js` + self-hosted `vendor/` (GSAP + ScrollTrigger, Lenis): smooth scrolling, page transitions, scroll reveals, and vanilla ports of React Bits effects (BlurText titles, CountUp numbers, ShinyText, SpotlightCard hover, Magnet buttons, ClickSpark, moving track stripes). Automatically off for `prefers-reduced-motion`, switchable in Settings, and never active inside Drive mode.

## Content & honesty notes
* All practice content is **original**, written to follow the syllabus of the Expert PTE materials and the strategy notes in the Drive folder (no book text is copied).
* Self‑practice percentages are guidance only; PTE's official AI scoring is different, and speaking/writing quality still needs a human teacher's ear.
* Progress is stored in this browser (`localStorage`); use *Settings → Backup* to copy/restore it.

## Layout
`index.html` · `css/style.css` · `js/*.js` (views, core, drive mode) · `data/*.js` (plan, vocabulary, phonetics, grammar, task banks, strategies) · `sw.js` · `manifest.webmanifest`
