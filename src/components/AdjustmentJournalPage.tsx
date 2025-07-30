import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { JournalRow } from '../types';
import { v4 as uuidv4 } from 'uuid'; 
import { Button } from '@mui/material';

// The base URL for your backend API
const API_URL = 'http://localhost:5000/api/journal';

interface AdjustmentJournalPageProps {
  onBack: () => void; // ✅ Added prop
}

const AdjustmentJournalPage: React.FC<AdjustmentJournalPageProps> = ({ onBack }) => {
  const [showEntryControls, setShowEntryControls] = useState(false);
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [allGlAccounts, setAllGlAccounts] = useState<string[]>([]);
  const [allPeriods, setAllPeriods] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch metadata (GL accounts & periods)
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        setIsLoading(true);
        const response = await axios.get(`${API_URL}/metadata`);
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
    fetchMetadata();
  }, []);

  const handleAddRow = () => {
    const newRow: JournalRow = {
      id: uuidv4(),
      selectedGlAccount: null,
      transactionType: 'Debit',
      amounts: {},
    };
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

  const handleAmountChange = async (rowId: string, period: string, value: string) => {
    const rowIndex = rows.findIndex(r => r.id === rowId);
    if (rowIndex === -1) return;

    const row = rows[rowIndex];
    const newAmount = value === '' ? '' : parseFloat(value);
    const updatedAmounts = { ...row.amounts, [period]: newAmount };
    handleRowChange(rowId, { amounts: updatedAmounts });

    if (row.selectedGlAccount && typeof newAmount === 'number') {
      try {
        await axios.post(`${API_URL}/update`, {
          glAccount: row.selectedGlAccount,
          period,
          value: newAmount,
        });
      } catch (err) {
        console.error("Failed to update entry:", err);
      }
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Adjustment Journal Entries</h1>

      {/* ✅ Back Button */}
      <Button variant="outlined" onClick={onBack} style={{ marginBottom: '15px' }}>
        ← Back
      </Button>

      {!showEntryControls && (
        <button onClick={() => setShowEntryControls(true)}>Add Journal Entry</button>
      )}

      {showEntryControls && (
        <div style={{ margin: '20px 0', display: 'flex', gap: '10px' }}>
          <button onClick={handleAddRow}>Add General Ledger</button>
          <select 
            onChange={(e) => handleAddPeriod(e.target.value)}
            value=""
          >
            <option value="" disabled>Add Period...</option>
            {allPeriods
              .filter(p => !selectedPeriods.includes(p))
              .map(period => <option key={period} value={period}>{period}</option>)
            }
          </select>
        </div>
      )}

      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>General Ledger Account</th>
              <th>Type</th>
              {selectedPeriods.map(period => (
                <th key={period}>{period}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <select
                    value={row.selectedGlAccount || ''}
                    onChange={(e) => handleRowChange(row.id, { selectedGlAccount: e.target.value })}
                  >
                    <option value="" disabled>Select GL Account</option>
                    {allGlAccounts.map(acc => <option key={acc} value={acc}>{acc}</option>)}
                  </select>
                </td>
                <td>
                  <select
                    value={row.transactionType}
                    onChange={(e) => handleRowChange(row.id, { transactionType: e.target.value as 'Debit' | 'Credit' })}
                  >
                    <option value="Debit">Debit</option>
                    <option value="Credit">Credit</option>
                  </select>
                </td>
                {selectedPeriods.map(period => (
                  <td key={period}>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={row.amounts[period] || ''}
                      onChange={(e) => handleAmountChange(row.id, period, e.target.value)}
                      disabled={!row.selectedGlAccount}
                      style={{ width: '100px', textAlign: 'right' }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AdjustmentJournalPage;
