import { createTheme } from '@mui/material/styles';
import palette from './palette';
import typography from './typography';
import TablePaginationActions from '../shared/components/TablePaginationActions';

const theme = createTheme({
  palette,
  typography,
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 14px',
          fontWeight: 800,
          letterSpacing: 0,
          boxShadow: 'none',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        outlined: {
          borderColor: '#B9C7D8',
          backgroundColor: '#FFFFFF',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: 'none',
          border: '1px solid #DDE4EC',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
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
          borderRadius: 8,
          backgroundColor: '#FFFFFF',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.MuiTableRow-hover:hover': {
            backgroundColor: '#F7FAFF',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid #E7EDF4',
          padding: '11px 14px',
          color: '#101828',
        },
        head: {
          fontWeight: 900,
          color: '#526173',
          fontSize: '0.75rem',
          textTransform: 'none',
          letterSpacing: 0,
          backgroundColor: '#F3F7FB',
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
          borderTop: '1px solid #EEF2F6',
          backgroundColor: '#FBFCFE',
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
          borderRadius: 8,
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
          borderRadius: 8,
          backgroundColor: '#FFFFFF',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#C9D3DF',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#8FA2B7',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#1E6BFF',
            borderWidth: 1,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
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
