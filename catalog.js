/**
 * Hijab catalog — single source of truth for style/color options and asset paths.
 * Each color entry points to a Figma-exported PNG in assets/hijabs/.
 * v1.0: Classic + Floral patterns; Black, Ivory, Blush colours.
 */

const COLOR_DEFS = [
  { id: 'black', name: 'Black', hex: '#1A1A1A', srcSuffix: 'charcoal' },
  { id: 'ivory', name: 'Ivory', hex: '#F5F0E8' },
  { id: 'blush', name: 'Blush', hex: '#C9A9A6' },
];

function colorsForStyle(styleId) {
  return COLOR_DEFS.map(({ id, name, hex, srcSuffix }) => ({
    id,
    name,
    hex,
    src: `assets/hijabs/${styleId}-${srcSuffix ?? id}.png`,
  }));
}

export const CATALOG = [
  {
    id: 'classic',
    name: 'Classic',
    colors: colorsForStyle('classic'),
  },
  {
    id: 'floral',
    name: 'Floral',
    colors: colorsForStyle('floral'),
  },
];

/** Default selection on first load */
export const DEFAULT_STYLE_ID = 'classic';
export const DEFAULT_COLOR_ID = 'black';
