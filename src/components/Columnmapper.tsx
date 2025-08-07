import React, { useEffect, useState } from 'react';
import {
  Box,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Typography,
  Paper,
  Button,
} from '@mui/material';
import TextField from '@mui/material/TextField';
// import axios from 'axios';

const UserForm = () => {
  const [columns, setColumns] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const [mappedData, setMappedData] = useState<any[]>([]);

}

// The raw data from the uploaded file can have any keys.
type RawRow = Record<string, any>;

// The final, clean data structure expected by the financial statements component.
export type MappedRow = {
  glName: string;
  glAccount: string;
  accountType: string;
  'Level 1 Desc': string;
  'Level 2 Desc': string;
  functionalArea: string;
  amountCurrent: number;
  amountPrevious: number;
};
export type FinancialRow = {
  key: string;
  amountCurrent: number;
  amountPrevious: number;
};
export type TextRow = {
  key: string;
  amountCurrent: string;
};

type FinancialMapConfig = {
  key: 'key';
  amountCurrent: 'currentAmount';
  amountPrevious: 'previousAmount';
};

type TextVarConfig = {
  key: 'Keys';
  amountCurrent: 'currentAmount';
};

type Props = {
  columns: string[];
  rawData: RawRow[];
  onConfirm: (mappedData: MappedRow[],amountCurrentKey: string, amountPreviousKey: string) => void;
};

const periodTypes = ['Financial Year Ended (FYE)', 'Quarter Ended (QE)', 'Year to Date (YTD)', 'Calendar Year Ended (CYE)'] as const;

type AmountMeta = {
  periodType: string;
  date: string;
};

const initialAmountMeta: Record<'amountCurrent' | 'amountPrevious', AmountMeta> = {
  amountCurrent: { periodType: '', date: '' },
  amountPrevious: { periodType: '', date: '' },
};

const ColumnMapper: React.FC<Props> = ({ columns, rawData, onConfirm }) => {
  // --- UPDATED: Fields are now configured with aliases from your specific file ---
  const fields: { key: keyof MappedRow; label: string; aliases: string[] }[] = [
    { key: 'glAccount', label: 'G/L Account', aliases: ['Account Code', 'G/L Account', 'G/L Acct'] },
    { key: 'glName', label: 'GL Description', aliases: ['Name', 'Created by'] },
    { key: 'Level 1 Desc', label: 'Level 1 Description', aliases: ['Level 1 grouping', 'Level 1 Desc'] },
    { key: 'Level 2 Desc', label: 'Level 2 Description', aliases: ['Level 2 grouping', 'Level 2 Desc'] },
    { key: 'accountType', label: 'Account Type', aliases: ['Nature', 'P&L Statement Acct Type'] },
    { key: 'functionalArea', label: 'Target Grouping', aliases: ['Target Grouping', 'Functional Area'] },
    { key: 'amountCurrent',  label: 'Amount (Current Period)', aliases: ['Amount'],},
    { key: 'amountPrevious', label: 'Amount (Comparitive Period)',  aliases: ['Amount'],},
    // { key: 'Level 3 Desc', label: 'Level 3 Description', aliases: ['Level 3 Desc'] },
    // { key: 'longText', label: 'Description / Long Text', aliases: ['G/L Acct Long Text', 'Description'] },
    // { key: 'exceptionPct', label: 'Exception %', aliases: ['Exception Percentage 2023'] },
    // { key: 'exceptionAmt', label: 'Exception Amount', aliases: ['Exception Amount 2023'] },
  ];

  // Attempt to auto-map columns based on aliases, ignoring case and whitespace.
  const getInitialMap = () => {
    const autoMap: Partial<Record<keyof MappedRow, string>> = {};
    fields.forEach(field => {
      // Find an alias that matches a column from the file
      const foundAlias = field.aliases.find(alias =>
        columns.some(c => c.trim().toLowerCase() === alias.trim().toLowerCase())
      );
      if (foundAlias) {
        // Get the actual column name from the file (preserving its original case)
        const matchingColumn = columns.find(c => c.trim().toLowerCase() === foundAlias.trim().toLowerCase());
        if (matchingColumn) {
          autoMap[field.key] = matchingColumn;
        }
      }
    });
    return autoMap;
  };

  const [map, setMap] = useState<Partial<Record<keyof MappedRow, string>>>(getInitialMap);
  const [amountMeta, setAmountMeta] = useState(initialAmountMeta);

  const [financialVar, setFinancialVar] = useState<any[]>([]);
  const [textVar, setTextVar] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const FetchFVs = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/financial_variables');
        const data = await response.json();
        setFinancialVar(data);
        const response1 = await fetch('http://localhost:5000/api/text_keys');
        const data1 = await response1.json();
        setTextVar(data1);
      } catch (error) {
        console.error('Error fetching journal entry:', error);
      } finally {
        setLoading(false);
      }
    };

    FetchFVs();
  }, []);
  console.log('loaded Financial Var Data', financialVar)
  console.log('loaded textVar Data', textVar)
  const financialMap: FinancialMapConfig = {
    key: 'key',
    amountCurrent: 'currentAmount',
    amountPrevious: 'previousAmount',
  };
  const textMap: TextVarConfig={
    key: 'Keys',
    amountCurrent: 'currentAmount',
  }

  const handleConfirm = async () => {
    const requiredFields: (keyof MappedRow)[] = ['Level 1 Desc', 'Level 2 Desc', 'amountCurrent'];
    const allRequiredMapped = requiredFields.every(field => !!map[field]);

    if (!allRequiredMapped) {
      alert('Please ensure you have mapped Level 1, Level 2, and Amount columns.');
      return;
    }
    
    // Helper to safely parse amounts, removing commas and symbols
    const cleanAmount = (value: any): number => {
        if (typeof value !== 'string') return Number(value) || 0;
        // Removes all non-numeric characters except for a decimal point and a leading minus sign
        const cleaned = value.replace(/[^0-9.-]/g, '');
        return parseFloat(cleaned) || 0;
    };

    const amountCurrentKey = `${amountMeta.amountCurrent.periodType} ${amountMeta.amountCurrent.date}`;
    const amountPreviousKey = `${amountMeta.amountPrevious.periodType} ${amountMeta.amountPrevious.date}`;
    
    const mappedData: any[] = rawData.map((row) => {
      const getValue = (key: keyof MappedRow, defaultValue: any = '') => {
        const mappedColumn = map[key];
        return mappedColumn ? row[mappedColumn] ?? defaultValue : defaultValue;
      };

      return {
        glName: getValue('glName'),
        glAccount: getValue('glAccount'),
        accountType: getValue('accountType'),
        'Level 1 Desc': getValue('Level 1 Desc'),
        'Level 2 Desc': getValue('Level 2 Desc'),
        functionalArea: getValue('functionalArea'),
        [amountCurrentKey]: cleanAmount(getValue('amountCurrent', 0)),
        [amountPreviousKey]: cleanAmount(getValue('amountPrevious', 0)),
      };
    });

    const financialVar1: FinancialRow[] = financialVar.map((row) => {
      const getValue = (key: keyof FinancialRow, defaultValue: string | number = '') => {
        const mappedColumn = financialMap[key];
        return mappedColumn ? row[mappedColumn] ?? defaultValue : defaultValue;
      };

      const getAmount = (key: keyof FinancialRow, dynamicKey: string) => {
        // Check if dynamic key exists in row
        if (dynamicKey in row && row[dynamicKey] != null) return cleanAmount(row[dynamicKey]);
        // Fallback to mapped column (e.g., currentAmount, previousAmount)
        return cleanAmount(getValue(key, 0));
      };

      return {
        key: getValue('key', '') as string,
        [amountCurrentKey]: getAmount('amountCurrent', amountCurrentKey),
        [amountPreviousKey]: getAmount('amountPrevious', amountPreviousKey),
      } as FinancialRow; // Type assertion for dynamic keys
    });

    const textVar1: TextRow[] = textVar.map((row) => {
      const getMappedValue = (mappedColumn: string | undefined): string => {
        if (mappedColumn && row.hasOwnProperty(mappedColumn)) {
          const value = row[mappedColumn];
          return value !== null && value !== undefined && value !== '0'
            ? value.toString()
            : '';
        }
        return '';
      };

      const getAmountValue = (amountKey: string): string | null => {
        if (row.hasOwnProperty(amountKey) && row[amountKey] != null) {
          return cleanAmount(row[amountKey]).toString();
        }
        return null;
      };

      const keyColumn = textMap['key']; // e.g., 'Keys'
      const keyValue = getMappedValue(keyColumn);

      const amountValue = getAmountValue(amountCurrentKey); // e.g., 'FY 2023-24'

      return {
        key: keyValue,
        [amountCurrentKey]: amountValue,
      } as TextRow;
    });

    console.log("textVar1",textVar1)
    console.log('updated Financial Var Data', financialVar1)
    console.log("FInal Mapped Data", mappedData);
    onConfirm(mappedData, amountCurrentKey, amountPreviousKey);
    try {
      await fetch('http://localhost:5000/api/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mappedData }),
      });
      await fetch('http://localhost:5000/api/financialvar-updated', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({financialVar1}),
      });

      
      alert('Data successfully sent to the server!');
    } catch (error) {
      console.error('Error sending data to the server:', error);
      alert('Failed to send data to the server. Please check the console for details.');
    }

  };

  return (
    <Paper sx={{ p: 3, mt: 3, maxWidth: 1500, mx: 'auto' }}>
      {/* ...existing code... */}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 2 }}>
        {fields
          .filter(
            (field) => field.key !== 'amountCurrent' && field.key !== 'amountPrevious'
          )
          .map((field) => (
            <FormControl key={field.key} fullWidth variant="outlined">
              <InputLabel>{field.label}</InputLabel>
              <Select
                value={map[field.key] ?? ''}
                onChange={(e) => setMap((prev) => ({ ...prev, [field.key]: e.target.value }))}
                label={field.label}
              >
                <MenuItem value="">
                  <em>None (Skip this field)</em>
                </MenuItem>
                {columns.map((col) => (
                  <MenuItem key={col} value={col}>
                    {col}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ))}
      </Box>

      {/* Amount Current Period */}
      <Box sx={{ display: 'flex', gap: 2, mt: 2, alignItems: 'flex-start' }}>
        <FormControl variant="outlined" sx={{ minWidth: 260, flex: 1 }}>
          <InputLabel>Amount (Current Period)</InputLabel>
          <Select
            value={map['amountCurrent'] ?? ''}
            onChange={(e) => setMap((prev) => ({ ...prev, amountCurrent: e.target.value }))}
            label="Amount (Current Period)"
          >
            <MenuItem value="">
              <em>None (Skip this field)</em>
            </MenuItem>
            {columns.map((col) => (
              <MenuItem key={col} value={col}>
                {col}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl variant="outlined" sx={{ minWidth: 260, flex: 1 }}>
          <InputLabel shrink>Type</InputLabel>
          <Select
            value={amountMeta.amountCurrent.periodType}
            label="Type"
            onChange={(e) =>
              setAmountMeta((prev) => ({
                ...prev,
                amountCurrent: { ...prev.amountCurrent, periodType: e.target.value },
              }))
            }
            displayEmpty
          >
            {periodTypes.map((type) => (
              <MenuItem key={type} value={type}>
                {type}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Date"
          type="date"
          sx={{ minWidth: 260, flex: 1 }}
          value={amountMeta.amountCurrent.date}
          onChange={(e) =>
            setAmountMeta((prev) => ({
              ...prev,
              amountCurrent: { ...prev.amountCurrent, date: e.target.value },
            }))
          }
          InputLabelProps={{ shrink: true }}
        />
      </Box>

      {/* Amount Previous Period */}
      <Box sx={{ display: 'flex', gap: 2, mt: 2, alignItems: 'flex-start' }}>
        <FormControl variant="outlined" sx={{ minWidth: 260, flex: 1 }}>
          <InputLabel>Amount (Previous Period)</InputLabel>
          <Select
            value={map['amountPrevious'] ?? ''}
            onChange={(e) => setMap((prev) => ({ ...prev, amountPrevious: e.target.value }))}
            label="Amount (Previous Period)"
          >
            <MenuItem value="">
              <em>None (Skip this field)</em>
            </MenuItem>
            {columns.map((col) => (
              <MenuItem key={col} value={col}>
                {col}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl variant="outlined" sx={{ minWidth: 260, flex: 1 }}>
          <InputLabel shrink>Type</InputLabel>
          <Select
            value={amountMeta.amountPrevious.periodType}
            label="Type"
            onChange={(e) =>
              setAmountMeta((prev) => ({
                ...prev,
                amountPrevious: { ...prev.amountPrevious, periodType: e.target.value },
              }))
            }
            displayEmpty
          >
            {periodTypes.map((type) => (
              <MenuItem key={type} value={type}>
                {type}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Date"
          type="date"
          sx={{ minWidth: 260, flex: 1 }}
          value={amountMeta.amountPrevious.date}
          onChange={(e) =>
            setAmountMeta((prev) => ({
              ...prev,
              amountPrevious: { ...prev.amountPrevious, date: e.target.value },
            }))
          }
          InputLabelProps={{ shrink: true }}
        />
      </Box>
      <Button
        variant="contained"
        color="primary"
        size="large"
        sx={{ mt: 3, display: 'block', mx: 'auto' }}
        onClick={handleConfirm}
      >
        ✅ Confirm Mapping & Generate Statements
      </Button>
    </Paper>
  );
};

export default ColumnMapper;