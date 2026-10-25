# DESIGN.md — AURA-OS Design System & Visual Tokens

## Aesthetic World & Tone
- **World:** Mission-Grade Aerospace Medical Telemetry Console (Operate Mode).
- **Tone:** Authoritative, calm, scientifically rigorous, high-contrast, zero-gimmick.
- **Principles:**
  - High legibility under high-stress, low-light spacecraft cabin environments.
  - No decorative AI tropes (no zero-offset colored glow halos, no thick side-tab borders, no cards inside cards, no decorative pulsing dots).
  - Strict typographic hierarchy with tabular figures for real-time streaming biometrics.

## Color Tokens & Contrast (WCAG AA Strict Compliance)
| Token | Hex / HSL | Usage | Contrast vs #090d16 |
|---|---|---|---|
| `--color-bg-base` | `#090d16` | Main viewport canvas | Base |
| `--color-surface-1` | `#111827` | Primary card & panel surfaces | 1.1:1 |
| `--color-surface-2` | `#182234` | Nested grouped sections / tables | 1.3:1 |
| `--color-surface-hover`| `#1e2b42` | Interactive button & row hover | 1.5:1 |
| `--color-border-subtle`| `rgba(255, 255, 255, 0.09)` | Subtle dividing lines | N/A |
| `--color-border-focus` | `#38bdf8` | Keyboard focus ring & active outline | 6.5:1 |
| `--color-text-primary` | `#f8fafc` | Headings, vital values, active labels | 15.2:1 |
| `--color-text-secondary`| `#cbd5e1` | Descriptions, unit labels, table headers | 9.8:1 |
| `--color-text-muted` | `#94a3b8` | Timestamps, metadata, inactive items | 5.4:1 (Exceeds 4.5:1 floor) |
| `--color-cyan` | `#0284c7` / `#38bdf8` | Spacecraft telemetry & navigation | 7.1:1 |
| `--color-emerald` | `#059669` / `#34d399` | Nominal physiological status | 6.8:1 |
| `--color-amber` | `#d97706` / `#fbbf24` | Moderate risk & physiological stress | 6.2:1 |
| `--color-crimson` | `#dc2626` / `#f87171` | Acute clinical alert & radiation storm | 5.8:1 |

## Typography Ramp
- Scale step ratio: ~1.28×
- **Display / H1:** 28px (1.75rem), weight 700, line-height 1.2, `text-wrap: balance`
- **Section / H2:** 22px (1.375rem), weight 600, line-height 1.25, `text-wrap: balance`
- **Sub-section / H3:** 17px (1.0625rem), weight 600, line-height 1.3
- **Body Regular:** 14px (0.875rem), weight 400, line-height 1.5
- **Meta / Caption (Floor):** 12px (0.75rem), weight 500, line-height 1.4 (Strict quality floor: NO UI text below 12px)
- **Telemetry Numerals:** `font-family: 'JetBrains Mono', monospace; font-feature-settings: 'tnum' 1;`

## Elevation & Depth (Natural Physics)
- Directional elevation shadow: `box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.07);`
- Top rim illumination: `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);`
- Focus ring: `outline: 2px solid #38bdf8; outline-offset: 2px;`

## Anti-Pattern Bans Enforced
1. NO colored blur halos or zero-offset box-shadows.
2. NO thick 3px/2px left borders on cards.
3. NO cards nested inside parent cards; use semantic table or border-delimited row layouts.
4. NO text under 11px.
5. NO gray text on colored backgrounds; text on warning/alert badges must be black or high-contrast white.
6. NO skipped heading levels (Strict H1 -> H2 -> H3 hierarchy).
7. NO decorative pulsing dots simulating fake activity.
