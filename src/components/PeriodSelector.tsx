import React, { useState, useEffect } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Paper,
  Button,
  Alert,
} from '@mui/material';

interface PeriodSelectorProps {
  onPeriodsSelected: (period1: string, period2: string) => void;
}

const PeriodSelector: React.FC<PeriodSelectorProps> = ({ onPeriodsSelected }) => {
  const [periods, setPeriods] = useState<string[]>([]);
  const [selectedPeriod1, setSelectedPeriod1] = useState<string>('');
  const [selectedPeriod2, setSelectedPeriod2] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    fetchPeriods();
  }, []);

  const fetchPeriods = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5000/api/trial-balance/periods');
      if (!response.ok) {
        throw new Error('Failed to fetch periods');
      }
      const data = await response.json();
      setPeriods(data.periods);
      
      // Auto-select first two periods if available
      if (data.periods.length >= 2) {
        setSelectedPeriod1(data.periods[0]);
        setSelectedPeriod2(data.periods[1]);
      }
    } catch (err) {
      setError('Failed to load periods from database');
      console.error('Error fetching periods:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateStatements = () => {
    if (selectedPeriod1 && selectedPeriod2) {
      onPeriodsSelected(selectedPeriod1, selectedPeriod2);
    }
  };

  if (loading) {
    return (
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography>Loading available periods...</Typography>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Paper>
    );
  }

  return (
    <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Select Periods for Financial Statements
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Choose two periods to compare in your financial statements.
      </Typography>
      
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <FormControl sx={{ minWidth: 250 }}>
          <InputLabel>Current Period</InputLabel>
          <Select
            value={selectedPeriod1}
            label="Current Period"
            onChange={(e) => setSelectedPeriod1(e.target.value)}
          >
            {periods.map((period) => (
              <MenuItem key={period} value={period}>
                {period}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 250 }}>
          <InputLabel>Previous Period</InputLabel>
          <Select
            value={selectedPeriod2}
            label="Previous Period"
            onChange={(e) => setSelectedPeriod2(e.target.value)}
          >
            {periods.map((period) => (
              <MenuItem key={period} value={period}>
                {period}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Button
        variant="contained"
        color="primary"
        onClick={handleGenerateStatements}
        disabled={!selectedPeriod1 || !selectedPeriod2}
        sx={{ minWidth: 200 }}
      >
        Generate Financial Statements
      </Button>
    </Paper>
  );
};

export default PeriodSelector; 