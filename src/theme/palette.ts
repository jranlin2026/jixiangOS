import type { PaletteOptions } from '@mui/material/styles/createPalette';

const palette: PaletteOptions = {
  primary: {
    main: '#1E6BFF',
    light: '#5B91FF',
    dark: '#124BB8',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#16845B',
    light: '#4FB487',
    dark: '#0D5F41',
    contrastText: '#ffffff',
  },
  error: {
    main: '#C4322B',
    light: '#E66962',
    dark: '#8F211C',
    contrastText: '#ffffff',
  },
  warning: {
    main: '#B46A08',
    light: '#DEA13F',
    dark: '#7F4903',
    contrastText: '#ffffff',
  },
  info: {
    main: '#087C8C',
    light: '#3FB1BF',
    dark: '#045765',
    contrastText: '#ffffff',
  },
  success: {
    main: '#16845B',
    light: '#4FB487',
    dark: '#0D5F41',
    contrastText: '#ffffff',
  },
  background: {
    default: '#F6F8FB',
    paper: '#ffffff',
  },
  text: {
    primary: '#101828',
    secondary: '#667085',
    disabled: '#98A2B3',
  },
  divider: '#DDE4EC',
};

/** 产品等级颜色映射 */
export const PRODUCT_LEVEL_COLORS: Record<string, string> = {
  '899': '#2196F3',
  '代理': '#4CAF50',
  '贴牌': '#9C27B0',
  '合伙人': '#FF9800',
};

/** 产品等级颜色（含背景浅色） */
export const PRODUCT_LEVEL_STYLES: Record<string, { main: string; light: string; contrastText: string }> = {
  '899': { main: '#2196F3', light: '#E3F2FD', contrastText: '#2196F3' },
  '代理': { main: '#4CAF50', light: '#E8F5E9', contrastText: '#4CAF50' },
  '贴牌': { main: '#9C27B0', light: '#F3E5F5', contrastText: '#9C27B0' },
  '合伙人': { main: '#FF9800', light: '#FFF3E0', contrastText: '#FF9800' },
};

export default palette;
