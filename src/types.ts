// New type for the data fetched from the backend
export interface GLAccountInfo {
  glAccount: string;
  glName: string;
}

export interface JournalRow {
  id: string; 
  selectedGlAccount: string | null;
  transactionType: 'Debit' | 'Credit';
  amounts: Record<string, number | string>; 
}