import type {
  SlideBackground,
  SlideBackgroundOverlay,
  SlideBackgroundScrimDirection
} from './types.js';

const CSS_COLOR_FUNCTION_RE = /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i;
const CSS_VAR_RE = /^var\(--[\w-]+(?:,\s*.+)?\)$/i;
const CSS_HEX_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CSS_COLOR_IDENT_RE = /^[a-z][\w-]*$/i;
const BACKGROUND_KEYS = new Set(['image', 'color', 'fit', 'position', 'repeat', 'overlay']);
const SCRIM_DIRECTIONS = new Set<SlideBackgroundScrimDirection>(['full', 'left', 'right', 'top', 'bottom']);

export function normalizeSlideBackground(metadata: Record<string, unknown>, sourcePath: string): SlideBackground | undefined {
  const legacyFit = metadata.backgroundFit === undefined ? undefined : stringValue(metadata.backgroundFit, 'backgroundFit', sourcePath);
  if (metadata.background === undefined) return undefined;
  const background = normalizeBackgroundValue(metadata.background, sourcePath);
  if (legacyFit && background.image && background.fit === undefined) {
    background.fit = legacyFit;
  }
  return background;
}

export function backgroundImage(background: SlideBackground | undefined): string | undefined {
  return background?.image;
}

function normalizeBackgroundValue(value: unknown, sourcePath: string): SlideBackground {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) throw backgroundError(sourcePath, 'background string cannot be empty.');
    return isCssColor(trimmed) ? { color: trimmed } : { image: trimmed };
  }
  if (!isRecord(value)) {
    throw backgroundError(sourcePath, 'background must be an asset path, CSS colour, or YAML mapping.');
  }

  const unknownKeys = Object.keys(value).filter((key) => !BACKGROUND_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw backgroundError(sourcePath, `unknown background keys: ${unknownKeys.join(', ')}.`);
  }

  const background: SlideBackground = {};
  if (value.image !== undefined) background.image = stringValue(value.image, 'background.image', sourcePath);
  if (value.color !== undefined) background.color = stringValue(value.color, 'background.color', sourcePath);
  if (value.fit !== undefined) background.fit = stringValue(value.fit, 'background.fit', sourcePath);
  if (value.position !== undefined) background.position = stringValue(value.position, 'background.position', sourcePath);
  if (value.repeat !== undefined) background.repeat = stringValue(value.repeat, 'background.repeat', sourcePath);
  if (value.overlay !== undefined) background.overlay = normalizeOverlay(value.overlay, sourcePath);

  if (!background.image && !background.color) {
    throw backgroundError(sourcePath, 'background must define image, color, or both.');
  }
  if ((background.fit || background.position || background.repeat || background.overlay) && !background.image) {
    throw backgroundError(sourcePath, 'background fit, position, repeat, and overlay require background.image.');
  }
  return background;
}

function normalizeOverlay(value: unknown, sourcePath: string): SlideBackgroundOverlay | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'none') return undefined;
    return { css: trimmed };
  }
  if (!isRecord(value)) {
    throw backgroundError(sourcePath, 'background.overlay must be "none", a CSS string, or YAML mapping.');
  }
  if (value.css !== undefined) {
    const css = stringValue(value.css, 'background.overlay.css', sourcePath);
    if (!css.trim()) throw backgroundError(sourcePath, 'background.overlay.css cannot be empty.');
    return { css };
  }
  if (value.type !== 'scrim') {
    throw backgroundError(sourcePath, 'background.overlay.type must be "scrim" when css is not provided.');
  }
  const direction = value.direction === undefined
    ? undefined
    : stringValue(value.direction, 'background.overlay.direction', sourcePath) as SlideBackgroundScrimDirection;
  if (direction !== undefined && !SCRIM_DIRECTIONS.has(direction)) {
    throw backgroundError(sourcePath, `background.overlay.direction must be one of: ${[...SCRIM_DIRECTIONS].join(', ')}.`);
  }
  const strength = value.strength === undefined ? undefined : Number(value.strength);
  if (strength !== undefined && (!Number.isFinite(strength) || strength < 0 || strength > 1)) {
    throw backgroundError(sourcePath, 'background.overlay.strength must be a number between 0 and 1.');
  }
  return {
    type: 'scrim',
    ...(direction ? { direction } : {}),
    ...(strength !== undefined ? { strength } : {})
  };
}

function stringValue(value: unknown, key: string, sourcePath: string): string {
  if (typeof value !== 'string') {
    throw backgroundError(sourcePath, `${key} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw backgroundError(sourcePath, `${key} cannot be empty.`);
  }
  return trimmed;
}

function isCssColor(value: string): boolean {
  return CSS_HEX_COLOR_RE.test(value)
    || CSS_COLOR_FUNCTION_RE.test(value)
    || CSS_VAR_RE.test(value)
    || CSS_COLOR_IDENT_RE.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function backgroundError(sourcePath: string, message: string): Error {
  return new Error(`Invalid slide background in ${sourcePath}: ${message}`);
}
