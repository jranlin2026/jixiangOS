import type { TypographyOptions } from '@mui/material/styles/createTypography';

const typography: TypographyOptions = {
  fontFamily: '"Inter", "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 14,
  h1: {
    fontSize: '2rem',
    fontWeight: 900,
    lineHeight: 1.2,
    letterSpacing: 0,
  },
  h2: {
    fontSize: '1.5rem',
    fontWeight: 900,
    lineHeight: 1.4,
    letterSpacing: 0,
  },
  h3: {
    fontSize: '1.25rem',
    fontWeight: 800,
    lineHeight: 1.4,
  },
  h4: {
    fontSize: '1.125rem',
    fontWeight: 800,
    lineHeight: 1.5,
  },
  h5: {
    fontSize: '1rem',
    fontWeight: 800,
    lineHeight: 1.5,
  },
  h6: {
    fontSize: '0.875rem',
    fontWeight: 800,
    lineHeight: 1.5,
  },
  subtitle1: {
    fontSize: '1rem',
    fontWeight: 800,
    lineHeight: 1.5,
  },
  subtitle2: {
    fontSize: '0.875rem',
    fontWeight: 700,
    lineHeight: 1.5,
  },
  body1: {
    fontSize: '0.875rem',
    fontWeight: 400,
    lineHeight: 1.6,
  },
  body2: {
    fontSize: '0.75rem',
    fontWeight: 400,
    lineHeight: 1.5,
  },
  button: {
    textTransform: 'none',
    fontWeight: 800,
  },
  caption: {
    fontSize: '0.75rem',
    fontWeight: 400,
    lineHeight: 1.5,
  },
  overline: {
    fontSize: '0.625rem',
    fontWeight: 800,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
};

export default typography;
