export const tokens = {
  colors: {
    background: '#F2F2F7',
    card: '#FFFFFF',
    text: '#000000',
    primary: '#007AFF',
    success: '#34C759',
    danger: '#FF3B30',
    warning: '#FF9500',
    secondary: '#8E8E93',
    separator: '#E5E5E7', // Hairline color
    fill: '#F5F5F7',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
  borderRadius: {
    control: '10px',
    row: '12px',
    card: '16px',
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    apple: '0 4px 24px rgba(0,0,0,0.04)',
  },
  effects: {
    blur: '25px',
    saturate: '180%',
    hairline: '0.5px',
  },
} as const;

export type ThemeTokens = typeof tokens;
