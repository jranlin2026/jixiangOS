import type { PaletteOptions } from '@mui/material/styles/createPalette';

const palette: PaletteOptions = {
  primary: {
    main: '#2196F3',
    light: '#64B5F6',
    dark: '#1565C0',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#4CAF50',
    light: '#81C784',
    dark: '#388E3C',
    contrastText: '#ffffff',
  },
  error: {
    main: '#F44336',
    light: '#EF5350',
    dark: '#D32F2F',
    contrastText: '#ffffff',
  },
  warning: {
    main: '#FF9800',
    light: '#FFB74D',
    dark: '#F57C00',
    contrastText: '#ffffff',
  },
  info: {
    main: '#00BCD4',
    light: '#4DD0E1',
    dark: '#0097A7',
    contrastText: '#ffffff',
  },
  success: {
    main: '#4CAF50',
    light: '#81C784',
    dark: '#388E3C',
    contrastText: '#ffffff',
  },
  background: {
    default: '#f8f9fa',
    paper: '#ffffff',
  },
  text: {
    primary: '#1a1a2e',
    secondary: '#6b7280',
    disabled: '#9ca3af',
  },
  divider: '#e5e7eb',
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
