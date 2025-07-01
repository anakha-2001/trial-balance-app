import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import Button from '@mui/material/Button';
import UploadIcon from '@mui/icons-material/Upload';

type Props = {
  onDataParsed: (data: any[]) => void;
};

const ExcelUpload: React.FC<Props> = ({ onDataParsed }) => {
  const [fileUploaded, setFileUploaded] = useState(false);

  const handleFileUpload: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      onDataParsed(jsonData);
      setFileUploaded(true); // ✅ Stop animation
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <input
        type="file"
        accept=".xlsx, .xls"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
        id="file-input"
      />
      <label htmlFor="file-input">
        <Button
          variant="contained"
          component="span"
          startIcon={<UploadIcon />}
          sx={{
            animation: !fileUploaded ? 'pulse 2s infinite' : 'none',
            transition: 'transform 0.3s ease',
            '&:hover': {
              transform: 'scale(1.05)',
              boxShadow: 4,
            },
            '@keyframes pulse': {
              '0%': { boxShadow: '0 0 0 0 rgba(25, 118, 210, 0.7)' },
              '70%': { boxShadow: '0 0 0 10px rgba(25, 118, 210, 0)' },
              '100%': { boxShadow: '0 0 0 0 rgba(25, 118, 210, 0)' },
            },
          }}
        >
          Upload Excel File
        </Button>
      </label>
    </div>
  );
};

export default ExcelUpload;
