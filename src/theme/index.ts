import { createTheme } from '@mui/material/styles';
import palette from './palette';
import typography from './typography';
import TablePaginationActions from '../shared/components/TablePaginationActions';

const theme = createTheme({
  palette,
  typography,
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          padding: '9px 16px',
          fontWeight: 800,
          letterSpacing: 0,
          boxShadow: 'none',
        },
        contained: {
          boxShadow: '0 8px 20px rgba(124, 58, 237, 0.18)',
          '&:hover': {
            boxShadow: '0 10px 24px rgba(124, 58, 237, 0.24)',
          },
        },
        outlined: {
          borderColor: '#E3E1E8',
          backgroundColor: '#FFFFFF',
          color: '#6D28D9',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 10px 40px -10px rgba(31, 41, 55, 0.08)',
          border: '1px solid rgba(31, 41, 55, 0.08)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow: 'none',
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          backgroundColor: '#FFFFFF',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.MuiTableRow-hover:hover': {
            backgroundColor: '#F7F5FF',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid #ECEEF1',
          padding: '11px 14px',
          color: '#1F2937',
        },
        head: {
          fontWeight: 900,
          color: '#5F6674',
          fontSize: '0.75rem',
          textTransform: 'none',
          letterSpacing: 0,
          backgroundColor: '#F9F9FC',
        },
      },
    },
    MuiTablePagination: {
      defaultProps: {
        ActionsComponent: TablePaginationActions,
        labelRowsPerPage: '',
        labelDisplayedRows: () => '',
        SelectProps: {
          renderValue: (value) => `${value} 条/页`,
          MenuProps: {
            disablePortal: true,
            anchorOrigin: {
              vertical: 'bottom',
              horizontal: 'right',
            },
            transformOrigin: {
              vertical: 'top',
              horizontal: 'right',
            },
            PaperProps: {
              sx: {
                width: 76,
                minWidth: '76px !important',
                maxHeight: 180,
                mt: 0.5,
                boxShadow: '0 12px 28px rgba(16, 24, 40, 0.16)',
                '& .MuiMenuItem-root': {
                  minHeight: 30,
                  px: 1.25,
                  fontSize: 12,
                  fontWeight: 700,
                },
              },
            },
          },
        },
      },
      styleOverrides: {
        root: {
          borderTop: '1px solid #EEEAF5',
          backgroundColor: '#FFFFFF',
        },
        toolbar: {
          minHeight: 48,
          padding: '8px 14px',
          gap: 8,
        },
        displayedRows: {
          display: 'none',
        },
        selectLabel: {
          display: 'none',
        },
        spacer: {
          display: 'none',
        },
        input: {
          order: 2,
          marginLeft: 0,
          marginRight: 0,
        },
        actions: {
          order: 1,
          marginLeft: 'auto',
          marginRight: 6,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 800,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 44,
        },
        indicator: {
          height: 3,
          borderRadius: 3,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 44,
          padding: '10px 16px',
          fontWeight: 800,
          letterSpacing: 0,
          color: '#667085',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          boxShadow: '0 24px 72px rgba(16, 24, 40, 0.18)',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: '#FFFFFF',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#E1E3E8',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#A78BFA',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#7C3AED',
            borderWidth: 1,
          },
          '&.Mui-focused': {
            boxShadow: '0 0 0 3px rgba(124, 58, 237, 0.10)',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 6,
          fontSize: '0.75rem',
        },
      },
    },
  },
});

export default theme;
