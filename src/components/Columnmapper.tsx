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

type RawRow = Record<string, any>;

export type MappedRow = {
  accountName: string;
  glAccount: string;
  accountType: string;
  accountGroup: string;
  functionalArea: string;
  amountCurrent: number;
  amountPrevious: number;
  exceptionPct: number;
  exceptionAmt: number;
  longText: string;
  'Level 1 Desc': string;
  'Level 2 Desc': string;
  'Level 3 Desc': string;
  'Mapped amount Q1FY23'?: number;
};

type Props = {
  columns: string[];
  rawData: RawRow[];
  onConfirm: (mappedData: MappedRow[]) => void;
};

const ColumnMapper: React.FC<Props> = ({ columns, rawData, onConfirm }) => {
  const fields: { key: keyof MappedRow; label: string; aliases: string[] }[] = [
    { key: 'accountName', label: 'Account Name', aliases: ['Account Name', 'Short Text', 'Sample account'] },
    { key: 'glAccount', label: 'G/L Account', aliases: ['G/L Account', 'G/L Acct'] },
    { key: 'accountType', label: 'Account Type (BS/P&L)', aliases: ['P&L Statement Acct Type'] },
    { key: 'accountGroup', label: 'Account Group', aliases: ['Level 1 Desc', 'Account Group'] },
    { key: 'functionalArea', label: 'Functional Area', aliases: ['Functional Area'] },
    { key: 'amountCurrent', label: 'Amount (Current)', aliases: ['Mapped amount Q1FY23'] },
    { key: 'amountPrevious', label: 'Amount (Previous)', aliases: ['Mapped amount Q4FY22'] },
    { key: 'exceptionPct', label: 'Exception %', aliases: ['Exception Percentage 2023'] },
    { key: 'exceptionAmt', label: 'Exception Amount', aliases: ['Exception Amount 2023'] },
    { key: 'longText', label: 'Description / Long Text', aliases: ['G/L Acct Long Text', 'Description'] },
  ];

  const initialMap = fields.reduce((acc, f) => {
    const match = f.aliases.find(alias => columns.includes(alias));
    if (match) acc[f.key] = match;
    return acc;
  }, {} as Partial<Record<keyof MappedRow, string>>);

  const [map, setMap] = useState(initialMap);

  const handleConfirm = () => {
    const allMapped = fields.every((f) => typeof map[f.key] === 'string');
    if (allMapped) {
      const mappedData: MappedRow[] = rawData.map((row) => ({
        accountName: row[map.accountName!] ?? '',
        glAccount: row[map.glAccount!] ?? '',
        accountType: row[map.accountType!] ?? '',
        accountGroup: row[map.accountGroup!] ?? '',
        functionalArea: row[map.functionalArea!] ?? '',
        amountCurrent: parseFloat(row[map.amountCurrent!] as any) || 0,
        amountPrevious: parseFloat(row[map.amountPrevious!] as any) || 0,
        exceptionPct: parseFloat(row[map.exceptionPct!] as any) || 0,
        exceptionAmt: parseFloat(row[map.exceptionAmt!] as any) || 0,
        longText: row[map.longText!] ?? '',
        'Level 1 Desc': row['Level 1 Desc'] ?? '',
        'Level 2 Desc': row['Level 2 Desc'] ?? '',
        'Level 3 Desc': row['Level 3 Desc'] ?? '',
      }));
      onConfirm(mappedData);
    }
  };

  return (
    <Paper sx={{ p: 2, mt: 3 }}>
      <Typography variant="h6" gutterBottom>
        🧩 Map Your Columns for Financial Statements
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {fields.map((f) => {
          const isMissing = !map[f.key];
          return (
            <Box key={f.key} sx={{ flex: '1 1 30%', minWidth: 250 }}>
              <FormControl fullWidth error={isMissing}>
                <InputLabel sx={{ color: isMissing ? 'error.main' : undefined }}>
                  {f.label}
                </InputLabel>
                <Select
  value={map[f.key] ?? ''}
  onChange={(e) => setMap((prev) => ({ ...prev, [f.key]: e.target.value }))}
  displayEmpty
  sx={{
    mt: 1,
    '& .MuiSelect-select': {
      py: 1.2,
    },
  }}
>

                  {columns.map((col) => (
                    <MenuItem key={col} value={col}>
                      {col}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          );
        })}
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
        sx={{ mt: 3 }}
        onClick={handleConfirm}
      >
        ✅ Confirm Mapping
      </Button>
    </Paper>
  );
};

export default ColumnMapper;
