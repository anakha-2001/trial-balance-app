import React, { useState } from 'react';
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

// The raw data from the uploaded file can have any keys.
type RawRow = Record<string, any>;

// The final, clean data structure expected by the financial statements component.
export type MappedRow = {
  createdby: string;
  glAccount: string;
  accountType: string;
  'Level 1 Desc': string;
  'Level 2 Desc': string;
  functionalArea: string;
  amountCurrent: number;
  amountPrevious: number;
};

type Props = {
  columns: string[];
  rawData: RawRow[];
  onConfirm: (mappedData: MappedRow[]) => void;
};

const ColumnMapper: React.FC<Props> = ({ columns, rawData, onConfirm }) => {
  // --- UPDATED: Fields are now configured with aliases from your specific file ---
  const fields: { key: keyof MappedRow; label: string; aliases: string[] }[] = [
    { key: 'glAccount', label: 'G/L Account', aliases: ['Account Code', 'G/L Account', 'G/L Acct'] },
    { key: 'createdby', label: 'GL Description', aliases: ['Name', 'Created by'] },
    { key: 'Level 1 Desc', label: 'Level 1 Description', aliases: ['Level 1 grouping', 'Level 1 Desc'] },
    { key: 'Level 2 Desc', label: 'Level 2 Description', aliases: ['Level 2 grouping', 'Level 2 Desc'] },
    { key: 'accountType', label: 'Account Type', aliases: ['Nature', 'P&L Statement Acct Type'] },
    { key: 'functionalArea', label: 'Target Grouping', aliases: ['Target Grouping', 'Functional Area'] },
    { key: 'amountCurrent',  label: 'Amount (Current Period)', aliases: ['Amount'],},
    { key: 'amountPrevious', label: 'Amount (Previous Period)',  aliases: ['Amount'],},
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

  const handleConfirm = () => {
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


    const mappedData: MappedRow[] = rawData.map((row) => {
      const getValue = (key: keyof MappedRow, defaultValue: any = '') => {
        const mappedColumn = map[key];
        return mappedColumn ? row[mappedColumn] ?? defaultValue : defaultValue;
      };

      return {
        createdby: getValue('createdby'),
        glAccount: getValue('glAccount'),
        accountType: getValue('accountType'),
        'Level 1 Desc': getValue('Level 1 Desc'),
        'Level 2 Desc': getValue('Level 2 Desc'),
        functionalArea: getValue('functionalArea'),
        amountCurrent: cleanAmount(getValue('amountCurrent', 0)),
        amountPrevious: cleanAmount(getValue('amountPrevious', 0)),
      };
    });
    onConfirm(mappedData);
  };

  return (
    <Paper sx={{ p: 3, mt: 3, maxWidth: 1500, mx: 'auto' }}>
      <Typography variant="h6" gutterBottom>
        🧩 Map Your Columns
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        We've tried to guess your columns. Please review and correct any mismatches.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 2 }}>
        {fields.map((field) => (
          <FormControl key={field.key} fullWidth variant="outlined">
            <InputLabel>{field.label}</InputLabel>
            <Select
              value={map[field.key] ?? ''}
              onChange={(e) => setMap((prev) => ({ ...prev, [field.key]: e.target.value }))}
              label={field.label}
            >
              <MenuItem value=""><em>None (Skip this field)</em></MenuItem>
              {columns.map((col) => (
                <MenuItem key={col} value={col}>
                  {col}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ))}
      </Box>

      <Typography variant="body2" sx={{ mt: 3 }}>
        Preview:
      </Typography>
      <table style={{ width: '100%', marginTop: 8 }} border={1}>
        <thead>
          <tr>{fields.map((f) => <th key={f.key}>{f.label}</th>)}</tr>
        </thead>
        <tbody>
          {rawData.slice(0, 5).map((row, i) => (
            <tr key={i}>
              {fields.map((f) => (
                <td key={`${i}-${f.key}`}>
                  {row[map[f.key]!] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>


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