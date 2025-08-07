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
    Card,
    CardContent,
    Divider,
  } from '@mui/material';
  import RestartAltIcon from '@mui/icons-material/RestartAlt';
  import LightModeIcon from '@mui/icons-material/LightMode';
  import DarkModeIcon from '@mui/icons-material/DarkMode';
  import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
  import UploadFileIcon from '@mui/icons-material/UploadFile';
  import SettingsIcon from '@mui/icons-material/Settings';
  import CheckCircleIcon from '@mui/icons-material/CheckCircle';

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
    const [useDatabase, setUseDatabase] = useState(false);

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
        primary: { main: darkMode ? '#90caf9' : '#1976d2' ,
                  contrastText: darkMode ? '#121212' : '#ffffff'
                 },
        secondary: { main: '#d32f2f',
                     contrastText: darkMode ? '#121212' : '#ffffff'
        },
        background: {
          default: darkMode ? '#121212' : '#f0f2f5',
          paper: darkMode ? '#1e1e1e' : '#ffffff',
        },
      },
      typography: {
        fontFamily: 'Segoe UI, Roboto, sans-serif',
        h4: { fontWeight: 700 },
      },
      components: {
        MuiPaper: {
          styleOverrides: {
            root: {
              borderRadius: '12px',
            },
          },
        },
        MuiButton: {
          styleOverrides: {
            root: {
              borderRadius: '8px',
              textTransform: 'none',
            },
          },
        },
      },
    });

    return (
      <ThemeProvider theme={appTheme}>
        <CssBaseline />
        {currentPage === 'main' ? (
          <Box
            sx={{
              minHeight: '100vh',
              bgcolor: 'background.default',
              px: { xs: 2, md: 6 },
              py: 4,
              maxWidth: '1800px',
              margin: '0 auto',
            }}
          >
            {/* Header */}
            <Box
              sx={{
                backgroundImage: 'linear-gradient(135deg,rgba(69, 75, 248, 1) 0%,rgba(38, 5, 167, 1) 100%)',
                color: '#fff',
                py: { xs: 5, md: 8 },
                px: { xs: 3, md: 6 },
                borderRadius: 3,
                mb: 5,
                boxShadow: 6,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              {/* Header Controls */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 16,
                  left: 16,
                  right: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                {/* Left Logo */}
                <img
                  src="/asset/ajalabs.png"
                  alt="Left Logo"
                  style={{ height: 30, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
                />

                {/* Right Logo with Toggle */}
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <img
                    src="/asset/Yokogawa-Logo W.png"
                    alt="Right Logo"
                    style={{ height: 40, marginRight: 16, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
                  />
                  {/* <FormControlLabel
                    control={
                      <Switch
                        checked={darkMode}
                        onChange={handleThemeToggle}
                        color="default"
                      />
                    }
                    label={darkMode ? <DarkModeIcon sx={{ color: '#fff' }} /> : <LightModeIcon sx={{ color: '#fff' }} />}
                    labelPlacement="start"
                    sx={{ color: '#fff' }}
                  /> */}
                </Box>
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

            {/* Action Buttons Section */}
  {/* Action Buttons Section - Combined all 3 in one horizontal row */}
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 2,
      mb: 3,
      flexWrap: 'wrap', // optional for responsiveness
    }}
  >
      <Button
      variant="outlined"
      color="primary"
      onClick={() => setUseDatabase(!useDatabase)}
      startIcon={<SettingsIcon />}
    >
      {useDatabase ? 'Switch to Excel Mode' : 'Switch to Database Mode'}
    </Button>

    <Button
      variant="contained"
      color="primary"
      endIcon={<ArrowForwardIosIcon />}
      onClick={() => setCurrentPage('adjustment')}
    >
      Pass Adjustment Entries
    </Button>

    <Button
      variant="outlined"
      color="error"
      startIcon={<RestartAltIcon />}
      onClick={() => setConfirmOpen(true)}
    >
      Reset / Upload New File
    </Button>

  </Box>


              {/* Confirm Dialog */}
              <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
                <DialogTitle>Confirm Reset</DialogTitle>
                <DialogContent>
                  <Typography>Are you sure you want to reset and upload a new file? This action cannot be undone.</Typography>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
                  <Button color="error" onClick={handleReset}>
                    Yes, Reset
                  </Button>
                </DialogActions>
              </Dialog>

              {/* Upload Section - Only show in Excel mode */}
              {!useDatabase && (
                <Card sx={{ mb: 4, borderTop: '4px solid #3f51b5', // Matching the financial statements border
    transition: 'box-shadow 0.3s ease-in-out',
    '&:hover': {
      boxShadow: '0px 6px 6px -3px rgba(0,0,0,0.2), 0px 10px 14px 1px rgba(0,0,0,0.14), 0px 4px 18px 3px rgba(0,0,0,0.12)'
    }}}>
                  <CardContent>
                    <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                      <UploadFileIcon sx={{ mr: 1 }} />
                      Upload Trial Balance
                    </Typography>
                    <Divider sx={{ my: 2 }} />
                    <ExcelUpload onDataParsed={setExcelData} />
                  </CardContent>
                </Card>
              )}


              {/* Column Mapper - Only show in Excel mode */}
              {!useDatabase && excelData.length > 0 && mappedData.length === 0 && (
                <Paper elevation={3} sx={{ p: 4 }}>
                  <Typography variant="h6" gutterBottom>
                    Map Columns
                  </Typography>
                  <ColumnMapper
                    columns={columns}
                    rawData={excelData}
                    onConfirm={handleConfirm}
                  />
                </Paper>
              )}

              {/* Mapping Success - Only show in Excel mode */}
              {!useDatabase && mappedData.length > 0 && (
                <Paper elevation={3} sx={{ mb: 4,
      p: 2,
      backgroundColor: '#e8f5e9', // light green background for success
      borderRadius: 1,
      display: 'flex',
      alignItems: 'center',
      gap: 1 }}><CheckCircleIcon color="success" />
                  <Typography variant="h6" color="success.main">
                    Columns Mapped! Ready for Statements
                  </Typography>
                </Paper>
              )}

              {/* Financial Statements Output */}
              {(useDatabase || mappedData.length > 0) && (
                <Paper elevation={4} sx={{ p: 4, mb: 4, borderTop: '4px solid #3f51b5',transition: 'box-shadow 0.3s ease-in-out','&:hover': {
        boxShadow: '0px 6px 6px -3px rgba(0,0,0,0.2), 0px 10px 14px 1px rgba(0,0,0,0.14), 0px 4px 18px 3px rgba(0,0,0,0.12)'
      }}}>
                  <FinancialStatements
                    data={mappedData}
                    amountKeys={amountKeys}
                    useDatabase={useDatabase}
                  />
                </Paper>
              )}
            </Box>
        ) : (
          <AdjustmentJournalPage onBack={() => setCurrentPage('main')} />
        )}
      </ThemeProvider>
    );
  };
  export default App;