import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { JournalRow, GLAccountInfo } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Button, Autocomplete, TextField, Box, CardContent, Card, Typography, Stack, TableContainer, Table, TableBody, TableRow, TableCell, TableHead, Paper } from '@mui/material';

const API_URL = 'http://localhost:5000/api/journal';

interface AdjustmentJournalPageProps {
  onBack: () => void;
}

const AdjustmentJournalPage: React.FC<AdjustmentJournalPageProps> = ({ onBack }) => {
  const [showEntryControls, setShowEntryControls] = useState(false);
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [allGlAccounts, setAllGlAccounts] = useState<GLAccountInfo[]>([]);
  const [allPeriods, setAllPeriods] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autocompleteKey, setAutocompleteKey] = useState(0);

  const [showEntriesDialog, setShowEntriesDialog] = useState(false);
  const [entryPeriods, setEntryPeriods] = useState<string[]>([]);
  const [selectedEntryPeriod, setSelectedEntryPeriod] = useState<string | null>(null);
  const [entryList, setEntryList] = useState<any[]>([]);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        setIsLoading(true);
        const response = await axios.get<{ glAccounts: GLAccountInfo[]; periods: string[] }>(`${API_URL}/metadata`);
        setAllGlAccounts(response.data.glAccounts || []);
        setAllPeriods(response.data.periods || []);
        setError(null);
      } catch (err) {
        setError('Failed to fetch data from the server.');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    const fetchEntryPeriods = async () => {
      const res = await axios.get(`${API_URL}/entries`);
      setEntryPeriods(res.data.periods || []);
    };

    fetchMetadata();
    fetchEntryPeriods();
  }, []);

  const handleAddRow = () => {
    const newRow: JournalRow = { id: uuidv4(), selectedGlAccount: null, transactionType: 'Debit', amounts: {} };
    setRows([...rows, newRow]);
  };

  const handleAddPeriod = (period: string) => {
    if (period && !selectedPeriods.includes(period)) {
      setSelectedPeriods([...selectedPeriods, period]);
    }
  };

  const handleRowChange = (id: string, updatedValues: Partial<JournalRow>) => {
    setRows(rows.map(row => (row.id === id ? { ...row, ...updatedValues } : row)));
  };

  const handleAmountChange = (rowId: string, period: string, value: string) => {
    const newAmount = value === '' ? '' : parseFloat(value);
    setRows(rows.map(row => (row.id === rowId ? { ...row, amounts: { ...row.amounts, [period]: newAmount } } : row)));
  };

  const handlePostEntries = async () => {
    setIsPosting(true);
    setError(null);
    const payload = [];
    for (const row of rows) {
      if (!row.selectedGlAccount) continue;
      for (const period of selectedPeriods) {
        const amount = row.amounts[period];
        if (typeof amount === 'number' && !isNaN(amount)) {
          const value = row.transactionType === 'Credit' ? -Math.abs(amount) : Math.abs(amount);
          payload.push({ glAccount: row.selectedGlAccount, period, value });
        }
      }
    }
    if (payload.length === 0) {
      setError('No valid entries to post.');
      setIsPosting(false);
      return;
    }
    try {
      await axios.post(`${API_URL}/batch-update`, payload);
      alert('Journal entries posted successfully!');
      onBack();
    } catch (err) {
      setError('Failed to post entries. Please try again.');
      console.error(err);
    } finally {
      setIsPosting(false);
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (error && !isPosting) return <div style={{ color: 'red' }}>{error}</div>;

  const typeOptions: Array<'Debit' | 'Credit'> = ['Debit', 'Credit'];

  return (
    <Box p={3}>
      <Card elevation={3}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h5" fontWeight="bold">Adjustment Journal Entries</Typography>
            <Button variant="outlined" onClick={onBack}>← Back</Button>
          </Stack>

          {!showEntryControls && (
            <Button variant="contained" onClick={() => setShowEntryControls(true)}>Add Journal Entry</Button>
          )}

          {showEntryControls && (
            <Stack direction="row" spacing={2} alignItems="center" my={2}>
              <Button variant="contained" size="small" onClick={handleAddRow}>
                Add General Ledger
              </Button>
              <Autocomplete
  key={autocompleteKey} // 🔁 Force rerender
  value={null}
  onChange={(event, newValue) => {
    if (newValue) {
      handleAddPeriod(newValue);
      setAutocompleteKey(prev => prev + 1); // ✅ Force reset input after selection
    }
  }}
  options={allPeriods.filter(p => !selectedPeriods.includes(p))}
  getOptionLabel={(option) => option}
  renderInput={(params) => <TextField {...params} label="Add Period" size="small" />}
  sx={{ width: 200 }}
/>
            </Stack>
          )}

          {rows.length > 0 && (
            <>
              <TableContainer component={Paper} sx={{ boxShadow: 2, borderRadius: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', width: '350px' }}>General Ledger Account</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', width: '170px' }}>Type</TableCell>
                      {selectedPeriods.map(period => (
                        <TableCell key={period} sx={{ fontWeight: 'bold', width: '170px' }}>{period}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map(row => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Autocomplete
                            value={allGlAccounts.find(acc => acc.glAccount === row.selectedGlAccount) || null}
                            onChange={(event, newValue) => {
                              handleRowChange(row.id, { selectedGlAccount: newValue?.glAccount || null });
                            }}
                            options={allGlAccounts}
                            getOptionLabel={(option) => `${option.glAccount} - ${option.glName}`}
                            isOptionEqualToValue={(option, value) => option.glAccount === value.glAccount}
                            renderInput={(params) => <TextField {...params} label="GL Account" size="small" />}
                            sx={{ width: 320 }}
                          />
                        </TableCell>
                        <TableCell>
                          <Autocomplete
                            value={row.transactionType}
                            onChange={(event, newValue) => {
                              if (newValue) {
                                handleRowChange(row.id, { transactionType: newValue });
                              }
                            }}
                            options={typeOptions}
                            disableClearable
                            renderInput={(params) => <TextField {...params} label="Type" size="small" />}
                            sx={{ width: 150 }}
                          />
                        </TableCell>
                        {selectedPeriods.map(period => (
                          <TableCell key={period}>
                            <TextField
                              type="number"
                              size="small"
                              placeholder="0.00"
                              value={row.amounts[period] || ''}
                              onChange={e => handleAmountChange(row.id, period, e.target.value)}
                              disabled={!row.selectedGlAccount}
                              sx={{ width: 150 }}
                              inputProps={{ style: { textAlign: 'right' } }}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Stack direction="row" spacing={2} mt={3} alignItems="center">
                <Button variant="contained" onClick={handlePostEntries} disabled={isPosting}>
                  {isPosting ? 'Posting...' : 'Post Entries'}
                </Button>
                <Button variant="outlined" onClick={() => setShowEntriesDialog(true)} style={{ marginLeft: '10px' }}>
                  View Entries
                </Button>
                {error && <Typography color="error">{error}</Typography>}
              </Stack>
            </>
          )}
        </CardContent>
      </Card>
      {showEntriesDialog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', width: '600px' }}>
            <h2>View Posted Entries</h2>

            <Autocomplete
              value={selectedEntryPeriod}
              onChange={async (event, newValue) => {
                setSelectedEntryPeriod(newValue);
                if (newValue) {
                  const res = await axios.get(`${API_URL}/entries?period=${newValue}`);
                  setEntryList(res.data.entries || []);
                }
              }}
              options={entryPeriods}
              renderInput={(params) => <TextField {...params} label="Select Period" size="small" />}
              sx={{ marginBottom: '15px' }}
            />

            {entryList.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                <thead>
                  <tr>
                    <th>Hash</th>
                    <th>GL Account</th>
                    <th>GL Name</th>
                    <th>Period</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {entryList.map((entry, idx) => (
                    <tr key={idx}>
                      <td>{entry.hash_val}</td>
                      <td>{entry.glAccount}</td>
                      <td>{entry.glName}</td>
                      <td>{entry.period}</td>
                      <td style={{ textAlign: 'right' }}>{entry.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ marginTop: '15px', textAlign: 'right' }}>
              <Button variant="outlined" onClick={() => setShowEntriesDialog(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </Box>
  );

  
};

export default AdjustmentJournalPage;
