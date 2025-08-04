import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { JournalRow, GLAccountInfo } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Button, Autocomplete, TextField } from '@mui/material';

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
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Adjustment Journal Entries</h1>
      <Button variant="outlined" onClick={onBack} style={{ marginBottom: '15px' }}>← Back</Button>

      {!showEntryControls && (
        <Button variant="contained" onClick={() => setShowEntryControls(true)}>Add Journal Entry</Button>
      )}

      {showEntryControls && (
        <div style={{ margin: '20px 0', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Button variant="contained" size="small" onClick={handleAddRow}>Add General Ledger</Button>

          <Autocomplete
            value={null}
            onChange={(event, newValue) => {
              if (newValue) {
                handleAddPeriod(newValue);
              }
            }}
            options={allPeriods.filter(p => !selectedPeriods.includes(p))}
            getOptionLabel={(option) => option}
            renderInput={(params) => <TextField {...params} label="Add Period" size="small" />}
            sx={{ width: 200 }}
          />
        </div>
      )}

      {rows.length > 0 && (
        <>
          <table style={{ borderSpacing: '0 10px', borderCollapse: 'separate' }}>
            <thead>
              <tr>
                <th style={{ width: '350px', textAlign: 'left' }}>General Ledger Account</th>
                <th style={{ width: '170px', textAlign: 'left' }}>Type</th>
                {selectedPeriods.map(period => (
                  <th key={period} style={{ width: '170px', textAlign: 'left' }}>{period}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td>
                    <Autocomplete
                      value={allGlAccounts.find(acc => acc.glAccount === row.selectedGlAccount) || null}
                      onChange={(event, newValue) => {
                        handleRowChange(row.id, { selectedGlAccount: newValue?.glAccount || null });
                      }}
                      options={allGlAccounts}
                      getOptionLabel={(option) => `${option.glAccount} - ${option.glName}`}
                      isOptionEqualToValue={(option, value) => option.glAccount === value.glAccount}
                      renderInput={(params) => <TextField {...params} label="Search GL Account" size="small" />}
                      sx={{ width: 320 }}
                    />
                  </td>
                  <td>
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
                  </td>
                  {selectedPeriods.map(period => (
                    <td key={period}>
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
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '20px' }}>
            <Button variant="contained" onClick={handlePostEntries} disabled={isPosting}>
              {isPosting ? 'Posting...' : 'Post Entries'}
            </Button>
            <Button variant="outlined" onClick={() => setShowEntriesDialog(true)} style={{ marginLeft: '10px' }}>
              View Entries
            </Button>
            {error && <span style={{ color: 'red', marginLeft: '10px' }}>{error}</span>}
          </div>
        </>
      )}

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
    </div>
  );
};

export default AdjustmentJournalPage;
