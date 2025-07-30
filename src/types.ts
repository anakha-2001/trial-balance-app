// Represents a single row the user has added to the UI
export interface JournalRow {
  id: string; // Unique ID for React key
  selectedGlAccount: string | null;
  transactionType: 'Debit' | 'Credit';
  // The amounts keyed by the period name, e.g., { "January": 100, "February": 250 }
  amounts: Record<string, number | string>; 
}