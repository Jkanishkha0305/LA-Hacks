# DueIntelligence — LA Real Estate Due Diligence Agent

## Design Context

### Users
Real estate acquisitions associates and developers screening Los Angeles development sites. They need to convert an address into a development potential briefing in minutes instead of days. Power users who understand zoning, FAR, TOC tiers, and regulatory constraints — they want density and speed, not hand-holding.

### Brand Personality
**Bold, fast, decisive.** An authoritative tool that commands trust through data density and visual confidence. Not a friendly SaaS onboarding flow — a sharp instrument for professionals who know what they're looking at.

### Aesthetic Direction
- **Visual tone**: Data-dense yet clean. Bloomberg terminal conviction meets Linear/Vercel execution quality. High information density without visual clutter — every pixel earns its place.
- **References**: Linear (dark mode craft, animation quality, spatial hierarchy), Vercel (typography confidence, monochrome discipline), Bloomberg (density, authority, power-user respect)
- **Anti-references**: Generic SaaS dashboards with excessive whitespace, playful/rounded UI, anything that feels like a consumer app or prioritizes aesthetics over information
- **Theme**: Monochromatic OKLch system with domain-specific semantic colors (green/yellow/red for scores, purple sidebar accent). Both light and dark mode supported, dark mode is the power-user default.
- **Typography**: Inter for UI, Geist Mono for data. Monospace differentiates numeric/categorical data from prose — this is intentional and core to the identity.

### Design Principles

1. **Data density over decoration** — Maximize information per viewport. Whitespace should create hierarchy, not fill space.
2. **Confidence through precision** — Sharp type, tight spacing, exact alignment. Subtle borders (white/5%), not heavy dividers. The UI should feel engineered, not designed.
3. **Speed is a feature** — Interactions feel instant. Animations are functional (150ms), never decorative.
4. **Respect the power user** — Dense defaults, keyboard shortcuts, collapsible panels, resizable layouts. No training wheels.
5. **Map is the anchor** — The spatial view is the primary interface. Layout decisions preserve map real estate.
