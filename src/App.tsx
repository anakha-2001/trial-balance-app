import React, { useState } from 'react';
import ExcelUpload from './components/Excelupload';
import ColumnMapper, { MappedRow } from './components/Columnmapper';
import FinancialStatements from './components/Financialstatement';
import AdjustmentJournalPage from './components/AdjustmentJournalPage';   
import {
  Typography,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Switch,
  FormControlLabel,
  ThemeProvider,
  createTheme,
  CssBaseline,
} from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';

const App: React.FC = () => {
  const [excelData, setExcelData] = useState<any[]>([]);
  const [mappedData, setMappedData] = useState<any[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [currentPage, setCurrentPage] = useState<'main' | 'adjustment'>('main');
  const [amountKeys, setAmountKeys] = useState<{ amountCurrentKey: string; amountPreviousKey: string }>({
    amountCurrentKey: '',
    amountPreviousKey: '',
  });

  const columns = excelData.length > 0 ? Object.keys(excelData[0]) : [];

  const handleReset = () => {
  window.location.reload();
};


  const handleThemeToggle = () => {
    setDarkMode((prev) => !prev);
  };

  const handleConfirm = (
  mappedData: MappedRow[],
  amountCurrentKey: string,
  amountPreviousKey: string
) => {
  setMappedData(mappedData);
  setAmountKeys({ amountCurrentKey, amountPreviousKey });
};

  const appTheme = createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: { main: darkMode ? '#90caf9' : '#1976d2' },
      secondary: { main: '#d32f2f' },
      background: {
        default: darkMode ? '#121212' : '#f0f2f5',
        paper: darkMode ? '#1e1e1e' : '#ffffff',
      },
    },
    typography: {
      fontFamily: 'Segoe UI, Roboto, sans-serif',
      h4: { fontWeight: 700 },
    },
  });

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />

      {currentPage === 'main' ? (
        <Box
          sx={{
            minHeight: '80vh',
            bgcolor: 'background.default',
            px: { xs: 2, md: 6 },
            py: 2,
            maxWidth: '1800px',
            margin: '0 auto',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              backgroundImage: 'linear-gradient(135deg,rgb(165, 195, 224) 0%,rgb(118, 174, 219) 100%)',
              color: '#fff',
              py: { xs: 5, md: 6 },
              px: { xs: 3, md: 6 },
              borderRadius: 3,
              mb: 5,
              boxShadow: 4,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            {/* Dark Mode Toggle */}
            <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={darkMode}
                    onChange={handleThemeToggle}
                    color="default"
                  />
                }
                label={darkMode ? <DarkModeIcon /> : <LightModeIcon />}
                labelPlacement="start"
                sx={{ color: 'white' }}
              />
            </Box>

            <Typography
              variant="h3"
              sx={{
                fontWeight: 700,
                letterSpacing: '0.5px',
                mb: 2,
                textShadow: '0 2px 4px rgba(0,0,0,0.3)',
              }}
            >
              Financial Statement Generator
            </Typography>
            <Typography
              variant="subtitle1"
              sx={{
                maxWidth: 600,
                color: 'rgba(255,255,255,0.85)',
                fontSize: '1.1rem',
                lineHeight: 1.6,
              }}
            >
              Upload your Trial Balance, map your columns, and instantly visualize your Income Statement, Balance Sheet & Cash Flow.
            </Typography>
          </Box>

          {/* Reset Button */}
          <Box textAlign="right" mb={2}>
            <Button
              variant="outlined"
              color="error"
              startIcon={<RestartAltIcon />}
              onClick={() => setConfirmOpen(true)}
            >
              Reset / Upload New File
            </Button>
          </Box>

          {/* Pass Adjustment Entries Button */}
          <Box textAlign="right" mb={2}>
            <Button
              variant="outlined"
              color="error"
              startIcon={<RestartAltIcon />}
              onClick={() => setCurrentPage('adjustment')}
            >
              Pass Adjustment Entries
            </Button>
          </Box>

          {/* Confirm Dialog */}
          <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
            <DialogTitle>Confirm Reset</DialogTitle>
            <DialogContent>
              Are you sure you want to reset and upload a new file?
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button color="error" onClick={handleReset}>
                Yes, Reset
              </Button>
            </DialogActions>
          </Dialog>

          {/* Upload Section */}
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <ExcelUpload onDataParsed={setExcelData} />
          </Paper>

          {/* Column Mapper */}
          {excelData.length > 0 && mappedData.length === 0 && (
            <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
              <ColumnMapper
                columns={columns}
                rawData={excelData}
                onConfirm={handleConfirm}
              />
            </Paper>
          )}

          {/* Mapping Success */}
          {mappedData.length > 0 && (
            <Paper sx={{ p: 2, mb: 3 }}>
              <Typography variant="h6" color="success.main">
                ✅ Columns Mapped! Ready for Statements
              </Typography>
            </Paper>
          )}

          {/* Financial Statements Output */}
          {mappedData.length > 0 && (
            <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
              <FinancialStatements data={mappedData} amountKeys={amountKeys} />
            </Paper>
          )}
        </Box>
      ) : (
        <AdjustmentJournalPage
          onBack={() => setCurrentPage('main')}
        />
      )}
    </ThemeProvider>
  );

};

export default App;
