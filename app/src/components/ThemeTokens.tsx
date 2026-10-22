import React, { useMemo } from 'react';
import themeCss from '../index.css?raw';
import { themeTokensFromCss, type ColourToken, type TokenRow } from '../themeTokens';
import {
  CONTRAST_LABEL,
  PAPER_LABEL,
  contrastHint,
  paperHint,
  themeLabel,
  themeShortLabel,
  type Theme,
} from '../theme';
import { ArrowLeft, BookOpen, Contrast, Moon, Sun } from 'lucide-react';

/** Each column is a palette as the stylesheet spells it; `palette` only ever reaches a data attribute. */
type Palette = 'dark' | 'light' | 'paper' | 'contrast';

interface ThemeTokensPageProps {
  /** The palette the page itself is wearing, so the live marker and the toggle cannot disagree. */
  theme: Theme;
  /** The OS palette leaving high contrast returns to. */
  fallback: Theme;
  onToggle: () => void;
  onToggleContrast: () => void;
  onTogglePaper: () => void;
}

/** The app's own base path, so the "back" link survives the Pages deployment's subdirectory. */
const HOME_HREF = import.meta.env.BASE_URL || '/';
/** The rules page is repository documentation; GitHub Pages serves the bundle, not the docs tree. */
const RULES_URL = 'https://github.com/TLE47/Mechatronics-Roadmap/blob/main/docs/THEME.md';

/** A square of the token's colour. Painted with the value from the stylesheet, not with a name. */
const Swatch: React.FC<{ token: string; palette: Palette; value: string }> = ({
  token,
  palette,
  value,
}) => (
  <span
    aria-hidden="true"
    data-testid="swatch"
    data-token={token}
    data-palette={palette}
    className="inline-block h-5 w-8 shrink-0 rounded-[var(--r-sm)] align-middle"
    style={{
      backgroundColor: value,
      // An inset ring, because the surfaces are one or two hex steps apart: without it --bg, --panel
      // and --panel-2 look like the same swatch on a card of the same colour.
      boxShadow: 'inset 0 0 0 1px var(--border-strong)',
    }}
  />
);

const ValueCell: React.FC<{ token: string; palette: Palette; value: string }> = ({
  token,
  palette,
  value,
}) => (
  <span className="flex items-center gap-2 whitespace-nowrap">
    <Swatch token={token} palette={palette} value={value} />
    <code
      data-testid="token-value"
      data-token={token}
      data-palette={palette}
      className="text-[11.5px] tnum"
      style={{ color: 'var(--muted)' }}
    >
      {value}
    </code>
  </span>
);

const ColourRow: React.FC<{ row: ColourToken }> = ({ row }) => (
  <tr data-testid="theme-token-row" data-token={row.name}>
    <td className="py-1.5 pr-4 align-middle whitespace-nowrap">
      <code className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>
        {row.name}
      </code>
    </td>
    <td className="py-1.5 pr-4 align-middle whitespace-nowrap">
      {row.utility ? (
        <code className="text-[11.5px]" style={{ color: 'var(--accent)' }}>
          {row.utility}
        </code>
      ) : (
        <span style={{ color: 'var(--dim)' }} title="No Tailwind family — use var() directly">
          —
        </span>
      )}
    </td>
    <td className="py-1.5 pr-3 align-middle">
      <ValueCell token={row.name} palette="dark" value={row.dark} />
    </td>
    <td className="py-1.5 pr-3 align-middle">
      <ValueCell token={row.name} palette="light" value={row.light} />
    </td>
    <td className="py-1.5 pr-3 align-middle">
      <ValueCell token={row.name} palette="paper" value={row.paper} />
    </td>
    <td className="py-1.5 align-middle">
      <ValueCell token={row.name} palette="contrast" value={row.contrast} />
    </td>
  </tr>
);

const ScaleRow: React.FC<{ row: TokenRow }> = ({ row }) => (
  <tr data-testid="theme-scale-row" data-token={row.name}>
    <td className="py-1.5 pr-4 align-middle whitespace-nowrap">
      <code className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>
        {row.name}
      </code>
    </td>
    <td className="py-1.5 pr-4 align-middle">
      <code className="text-[11.5px] tnum" style={{ color: 'var(--muted)' }}>
        {row.dark}
      </code>
    </td>
    <td className="py-1.5 pr-3 align-middle">
      <code className="text-[11.5px] tnum" style={{ color: row.themed ? 'var(--muted)' : 'var(--dim)' }}>
        {row.themed ? row.light : 'unchanged'}
      </code>
    </td>
    <td className="py-1.5 pr-3 align-middle">
      <code className="text-[11.5px] tnum" style={{ color: row.themedPaper ? 'var(--muted)' : 'var(--dim)' }}>
        {row.themedPaper ? row.paper : 'unchanged'}
      </code>
    </td>
    <td className="py-1.5 align-middle">
      <code
        className="text-[11.5px] tnum"
        style={{ color: row.themedContrast ? 'var(--muted)' : 'var(--dim)' }}
      >
        {row.themedContrast ? row.contrast : 'unchanged'}
      </code>
    </td>
  </tr>
);

/**
 * `?view=theme` — the palette, printed from the stylesheet that draws it.
 *
 * Every value and every utility family here is parsed out of `index.css` at build time (`?raw`), and
 * each swatch is painted with the value printed beside it, so the page cannot describe a palette the
 * app does not use. It is deliberately not a workbench tab: it is a reference for whoever is adding a
 * colour, and the learner-facing rail stays at the tabs a learner needs.
 */
export const ThemeTokens: React.FC<ThemeTokensPageProps> = ({
  theme,
  fallback,
  onToggle,
  onToggleContrast,
  onTogglePaper,
}) => {
  const table = useMemo(() => themeTokensFromCss(themeCss), []);
  const familyCount = Object.keys(table.utilities).length;

  return (
    <div className="space-y-4" data-testid="theme-tokens-page">
      <section className="surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Design system</p>
            <h1 className="mt-1 text-[length:var(--step-2)] font-bold leading-[var(--lh-tight)]">
              The palette, all four ways
            </h1>
            <p className="mt-2 max-w-[var(--measure)] text-[13.5px]" style={{ color: 'var(--body)' }}>
              Parsed from <code className="text-[12.5px]">app/src/index.css</code> when the app is
              built, so nothing on this page is a second copy of the palette. Each swatch is painted
              with the value printed beside it; the four columns are the palettes, not the page's own.
              High contrast is held to a 7:1 floor for body text, not the 4.5:1 the other three aim at.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={HOME_HREF} className="btn" data-testid="link-back-to-workbench">
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Workbench
            </a>
            <button
              onClick={onToggle}
              data-testid="btn-theme-route-toggle"
              aria-label={themeLabel(theme, fallback)}
              title={themeLabel(theme, fallback)}
              className="btn btn-primary"
            >
              {themeShortLabel(theme, fallback) === 'Light' ? (
                <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Moon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              {themeShortLabel(theme, fallback)} mode
            </button>
            <button
              onClick={onToggleContrast}
              data-testid="btn-contrast-route-toggle"
              aria-label={CONTRAST_LABEL}
              aria-pressed={theme === 'contrast'}
              title={contrastHint(theme)}
              className="btn"
              style={theme === 'contrast' ? { color: 'var(--accent)' } : undefined}
            >
              <Contrast className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Contrast
            </button>
            <button
              onClick={onTogglePaper}
              data-testid="btn-paper-route-toggle"
              aria-label={PAPER_LABEL}
              aria-pressed={theme === 'paper'}
              title={paperHint(theme)}
              className="btn"
              style={theme === 'paper' ? { color: 'var(--accent)' } : undefined}
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Paper
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: 'var(--border-soft)' }}>
          <span className="chip" data-testid="theme-active-palette" data-theme-now={theme}>
            This page: {theme}
          </span>
          <span className="chip tnum">{table.colour.length} colour tokens</span>
          <span className="chip tnum">{table.scale.length} scale values</span>
          <span className="chip tnum">{familyCount} utility families</span>
          <a
            href={RULES_URL}
            className="text-[11.5px] underline decoration-dotted"
            style={{ color: 'var(--muted)' }}
          >
            When to use which one
          </a>
        </div>
      </section>

      {table.error && (
        <p className="surface p-4 text-[13px]" style={{ color: 'var(--rose)' }} data-testid="theme-tokens-error">
          {table.error}
        </p>
      )}

      <section className="surface overflow-hidden">
        <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-[13.5px] font-bold">Colour tokens</h2>
          <p className="mt-0.5 text-[11.5px]" style={{ color: 'var(--muted)' }}>
            In source order: surfaces, lines, ink, the signal accents, then the plot face. Prefix a
            family with <code>bg-</code>, <code>text-</code> or <code>border-</code>; add
            <code> /20</code> for a wash.
          </p>
        </div>
        <div className="overflow-x-auto px-4 pb-3">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Colour tokens, with their utility family and their value in each theme
            </caption>
            <thead>
              <tr style={{ color: 'var(--dim)' }}>
                <th scope="col" className="py-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.12em]">Token</th>
                <th scope="col" className="py-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.12em]">Utility family</th>
                <th scope="col" className="py-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.12em]">Dark</th>
                <th scope="col" className="py-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.12em]">Light</th>
                <th scope="col" className="py-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.12em]">Paper</th>
                <th scope="col" className="py-2 text-[10.5px] font-semibold uppercase tracking-[0.12em]">High contrast</th>
              </tr>
            </thead>
            <tbody>
              {table.colour.map((row) => (
                <ColourRow key={row.name} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface overflow-hidden">
        <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-[13.5px] font-bold">The rest of the scale</h2>
          <p className="mt-0.5 text-[11.5px]" style={{ color: 'var(--muted)' }}>
            Radii, elevation, type steps, spacing and motion. The shadows and the focus ring are the
            only ones a palette re-points, and both light and high contrast do.
          </p>
        </div>
        <div className="overflow-x-auto px-4 pb-3">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Scale values that do not change between themes, and the few that do
            </caption>
            <thead>
              <tr style={{ color: 'var(--dim)' }}>
                <th scope="col" className="py-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.12em]">Token</th>
                <th scope="col" className="py-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.12em]">Dark</th>
                <th scope="col" className="py-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.12em]">Light</th>
                <th scope="col" className="py-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.12em]">Paper</th>
                <th scope="col" className="py-2 text-[10.5px] font-semibold uppercase tracking-[0.12em]">High contrast</th>
              </tr>
            </thead>
            <tbody>
              {table.scale.map((row) => (
                <ScaleRow key={row.name} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11.5px]" style={{ color: 'var(--dim)' }}>
        Reachable at <code>?view=theme</code>. The checks that keep the palette legible are{' '}
        <code>npm run test:theme</code> and <code>npm run test:theme:e2e</code>; the rules for picking
        a token are in <a
          href={RULES_URL}
          className="underline decoration-dotted"
          style={{ color: 'var(--muted)' }}
        >
          docs/THEME.md
        </a>
        .
      </p>
    </div>
  );
};
