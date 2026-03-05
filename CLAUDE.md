# Komugi – AI-Tutor Desktop App

Read @AGENTS.md for architecture patterns, dev practices, and template-level rules.

## Projekt-Ueberblick

Komugi ist eine macOS Desktop-App (Tauri v2). Ein kontextbewusster AI-Tutor.
Es gibt keinen leeren Chat. Komugi existiert nur MIT visuellem Kontext.

**Core-Flow:** User macht Screenshot → Mini-Chat oeffnet sich → User stellt Frage → Komugi erklaert.

Ohne Screenshot keine Conversation. Komugi gibt die Loesung UND erklaert sie in voller Tiefe — was, warum, und welches Vorwissen noetig ist um es zu verstehen.

## Design-Philosophie

- **Tool, kein Entertainer.** Denke Raycast, nicht Clippy.
- **Jeder Klick muss einen Grund haben.** Kein UI-Element das nur "nett" ist.
- **AI-Output ist strukturiert, tiefgehend, direkt zum Punkt.** Loesung geben + in voller Tiefe erklaeren. Kein Filler, aber auch nichts weglassen.
- **Jede Nachricht ist kopierbar.** Der Output soll direkt verwendbar sein.

## Tech Stack

| Layer            | Technologie                                                          |
| ---------------- | -------------------------------------------------------------------- |
| Desktop          | Tauri 2.0 (Rust + WebView)                                           |
| Frontend         | React 19, TypeScript, Tailwind CSS v4, Zustand v5, TanStack Query v5 |
| UI               | shadcn/ui v4, Lucide React                                           |
| AI Vision + Text | Google Gemini 3.1 Pro + Flash Lite (BYOK, Model Routing)             |
| Lokale DB        | SQLite (Tauri Plugin) fuer Lern-History                              |
| Quality          | ESLint, Prettier, ast-grep, knip, jscpd, clippy                      |

**Open Source, Bring Your Own Key (BYOK). Kein Backend, kein Auth, kein Payment – alles laeuft lokal.**

## Architektur

- Open Source Projekt – User bringen ihren eigenen Gemini API Key mit (BYOK)
- API Key wird im macOS Keychain gespeichert (nie in `.env`, Frontend-State oder localStorage)
- API Key wird als HTTP Header (`x-goog-api-key`) gesendet, nie als URL Query Parameter
- Model Routing: Pro fuer erste Nachricht/neue Screenshots, Flash Lite fuer Follow-ups
- AI-Calls gehen direkt vom Client an die Gemini API (nur lokale Nutzung)
- Kein leerer Chat-Zustand. Screenshot ist Pflicht fuer jede neue Conversation.
- Mini-Chat erscheint erst NACH dem Screenshot.
- Multi-Window: Hauptfenster + Mini-Chat als separates Floating Window (Quick Pane Pattern)

### Feature-Architektur

```
src/features/
  screenshot/        # Screenshot-Capture (Fenster + Bereich)
    components/
    stores/
    hooks/
  chat/              # Mini-Chat (Floating Window)
    components/
    stores/
    hooks/
  ai/                # Gemini API Integration
    api/
    hooks/
    config/
  settings/          # Schwierigkeitsstufen, Preferences
    stores/
  history/           # Lern-History (SQLite)
    components/
    stores/

src-tauri/src/commands/
  screenshot.rs      # Screenshot-Capture via xcap
  history.rs         # SQLite CRUD fuer Sessions + Messages
  quick_pane.rs      # Window Lifecycle
  preferences.rs     # Settings Persistence
  keychain.rs        # API Key Storage (macOS Keychain)
  url_fetch.rs       # URL Content Fetching (SSRF-protected)
  recovery.rs        # Emergency Data Recovery
  notifications.rs   # Native macOS Notifications
```

### Datenfluss

```
⌥⌥ (Hotkey)
  → Rust: Screenshot-Capture
    → Base64 an Frontend (Zustand Store)
      → Mini-Chat oeffnet sich (Quick Pane)
        → User tippt Frage
          → Gemini API (Screenshot + Frage)
            → Streaming Response → Chat-Anzeige
              → Session in SQLite gespeichert
```

## Konventionen

- Kommentare deutsch okay, Code und Variable Names immer Englisch
- Feature-basierte Ordnerstruktur unter `src/features/{feature-name}/`
- Rust Commands in `src-tauri/src/commands/`
- Alle Tauri Commands type-safe via tauri-specta
- Zustand Stores: Selector-Syntax, kein Destructuring (ast-grep enforced)

## Build & Run

```bash
npm run dev          # Startet Tauri + Vite Dev Server
npm run build        # Production Build
npm run check:all    # TypeScript + ESLint + Prettier + ast-grep + clippy + Tests
```

## Local Status

@CLAUDE.local.md

---

# NASA: Mission-Critical Code Assessment

> "There is no problem so bad you can't make it worse." — Chris Hadfield, NASA Astronaut

Jede Zeile Code in Production ist ein potentieller Failure Point. Wir behandeln
unsere Codebase mit der gleichen Rigorositaet die NASA auf Flight Software anwendet.

**NASA ist NICHT langsam oder buerokratisch. NASA ist deterministisch** — systematisch
Unsicherheit eliminieren bis jedes Verhalten beruecksichtigt ist.

## Wann anwenden

**Immer:**

- Vor Deploy kritischer Features (AI Interactions, Screenshot-Capture, Data Pipelines)
- Vor groesseren Refactors die mehrere Systeme beruehren
- Nach Incident Response (Post-Mortem Hardening)
- Pre-Launch Readiness Check
- Wenn das Bauchgefuehl sagt "das fuehlt sich riskant an"

**Nicht noetig bei:**

- Einfache UI-Tweaks ohne Daten/API-Implikationen
- Nur-Dokumentation-Aenderungen
- Dev-Dependencies hinzufuegen
- CSS-Klassen umbenennen

## Die 5 Assessment-Dimensionen

Jede Dimension bekommt einen Severity Grade: `NOMINAL` | `CAUTION` | `WARNING` | `CRITICAL` | `ABORT`

```
┌─────────────────────────────────────────────┐
│                                             │
│   1. RISK ASSESSMENT                        │
│      Failure Modes, Edge Cases,             │
│      Error Propagation, Data Integrity      │
│                                             │
│   2. BUSINESS RISK                          │
│      User Trust, Legal Liability,           │
│      Competitive Exposure, Abuse Vectors    │
│                                             │
│   3. IT RISK                                │
│      Database Efficiency, Query Perf,       │
│      IT Security, Infrastructure Health     │
│                                             │
│   4. SCALABILITY                            │
│      Load Patterns, Growth Ceilings,        │
│      Resource Exhaustion, Bottlenecks       │
│                                             │
│   5. ARCHITECTURE                           │
│      Clean Code, Separation of Concerns,    │
│      Dependency Health, Production          │
│      Readiness, NASA Clean Code Rules       │
│                                             │
└─────────────────────────────────────────────┘
```

## Grading Scale

| Grade    | Bedeutung                                                | Aktion                            |
| -------- | -------------------------------------------------------- | --------------------------------- |
| NOMINAL  | Keine Issues. Systeme operieren innerhalb der Parameter. | Weiter mit Zuversicht.            |
| CAUTION  | Kleinere Issues. Kein sofortiges Risiko.                 | Tracken und Fixes planen.         |
| WARNING  | Signifikante Issues. Risiko der Degradation.             | Fix vor naechstem Deploy.         |
| CRITICAL | Ernste Issues. Aktives Risiko fuer User/Daten.           | Stopp und sofort fixen.           |
| ABORT    | Showstopper. Deploy wuerde Schaden verursachen.          | Unter keinen Umstaenden deployen. |

## NASA's Power of Ten (Adaptiert fuer TypeScript)

Diese 10 Regeln gelten fuer JEDEN Code in diesem Projekt:

### 1. Simple Control Flow

- Kein goto, kein labeled break/continue
- Keine Rekursion ohne beweisbare Terminierungsgrenze
- Maximale Nesting-Tiefe: 2 Levels
- Early Returns statt verschachtelte Conditionals
- Keine verschachtelten Ternaries

### 2. Feste Obergrenzen fuer Loops

- Jeder `while`-Loop hat einen Maximum-Iterations-Guard
- Jede rekursive Funktion hat ein Tiefenlimit
- `.map()`, `.filter()`, `.reduce()` bevorzugt gegenueber manuellen Loops

### 3. Keine dynamische Speicherallokation in Hot Paths

- Kein `new` in Hot Paths (vorallokieren wo moeglich)
- Stream Processing fuer grosse Datasets (nicht buffer-then-process)
- Keine Memory Leaks durch Closures die grosse Objekte halten

### 4. Funktionen passen auf einen Screen (~60 Zeilen max)

- Keine Funktion ueberschreitet 60 Zeilen
- Jede Funktion macht genau eine Sache
- Funktionsname beschreibt was sie tut (kein `handleStuff`, `processData`)
- Max 4 Parameter (Options Object darueber)

### 5. Assertions fuer Invarianten

- Kritische Annahmen haben Runtime-Assertions
- Type Narrowing nutzt Runtime-Checks, nicht Type Assertions
- "Unmoeglich" States werfen mit beschreibenden Messages
- Enum Exhaustiveness wird geprueft (never Pattern)

### 6. Minimaler Variablen-Scope

- Variablen am Punkt der ersten Nutzung deklariert
- Kein module-level mutable State
- Kein `let` wo `const` reicht
- Keine Variablen-Wiederverwendung

### 7. Alle Return Values gecheckt

- Kein ignoriertes Promise (jeder async Call awaited oder explizit behandelt)
- Keine ignorierten Funktions-Return-Values
- Error Results gecheckt bevor weitergemacht wird (Result Pattern)
- Keine fire-and-forget Side Effects in Request Handlers

### 8. Minimale Preprocessor-Nutzung

- Keine Barrel Files die Imports verschleiern
- Import Paths sind explizit
- Keine zirkulaeren Dependencies
- Kein `eval()`, `new Function()`, oder string-basierte Code-Execution

### 9. Reference Safety

- Keine Mutation von Funktions-Parametern
- Kein shared mutable State zwischen Modulen
- Immutable Data Structures only (`readonly`, `as const`, spread)
- React State Updates nutzen immutable Patterns

### 10. Compile with All Warnings

- TypeScript strict mode: `strict: true`
- Keine `any` Types (Zero Tolerance)
- Keine `@ts-ignore` oder `@ts-expect-error` ohne verlinkten Issue
- Keine ESLint disable Comments ohne Begruendung
- Keine unterdrueckten Warnings im Build Output

## Assessment-Ausfuehrung

### Phase 0: Scope Definition

- Ziel identifizieren: spezifische Files, Feature Area, oder Full System
- Wenn kein Argument: zuletzt geaenderte Files bewerten (git diff)

### Phase 1: Reconnaissance (Parallele Agents)

**Agent 1 — Code Cartographer:**

- Alle Files im Scope mappen
- Datenfluss tracen: Input → Processing → Storage → Output
- Trust Boundaries identifizieren (User Input, API Responses, DB Queries, LLM Outputs)

**Agent 2 — Security Scanner:**

- Auth/Authz auf jedem Endpoint pruefen
- Input Validation an Trust Boundaries verifizieren
- Injection Vectors checken (XSS, Prompt Injection)
- Secrets Management und Environment Variable Handling pruefen

**Agent 3 — Type & Contract Analyzer:**

- TypeScript Strict Mode Compliance verifizieren
- `any` Types, unsafe Assertions, fehlende Error Handling finden
- Schema Coverage an Trust Boundaries validieren

### Phase 2: Assessment (Sequentiell, pro Dimension)

Fuer jede der 5 Dimensionen die detaillierte Checkliste in `docs/nasa-report/resources/` nutzen.

### Phase 3: Deterministisches Bug Finding

Power of Ten Regeln anwenden. Fuer jede Verletzung dokumentieren:

- File und Zeilennummer
- Die Verletzung
- Warum es gefaehrlich ist (konkretes Failure Szenario)
- Der Fix
- Blast Radius wenn ungefixed

### Phase 4: Counterfactual Analysis

Fuer JEDES Finding dokumentieren:

- Wahrscheinlichkeit dass das Issue in Production auftritt
- Impact bei Auftreten (Datenverlust, UX Degradation)
- Erwartete Time-to-Discovery ohne dieses Assessment
- Kosten des Fixens jetzt vs. nach Auftreten

### Phase 5: Report Generation

Report unter `docs/nasa-report/NASA-REPORT-{date}-{scope}.md` generieren.
Siehe `docs/nasa-report/resources/report-template.md` fuer das vollstaendige Template.

## Komugi-spezifische Risikobereiche

Folgende Bereiche erfordern besondere Aufmerksamkeit:

### Screenshot-Capture

- macOS Screen Recording Permission Handling
- Base64-Encoding grosser Screenshots (Memory)
- xcap Library Thread Safety

### Gemini API Integration

- API Key Exposure schuetzen (Keychain + HTTP Header, nie URL Query Param)
- Prompt Injection via Screenshot-Content
- Streaming Response Error Handling
- Timeout Handling bei langsamen Responses

### Multi-Window Communication

- Event Race Conditions zwischen Fenstern
- Theme Sync Consistency
- Window Lifecycle (Show/Hide vs. Create/Destroy)

### SQLite History

- Data Integrity bei App-Crash waehrend Write
- Unbounded Storage Growth (alte Sessions)
- Volltextsuche Performance bei vielen Sessions
