import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableRow,
  TableCell,
  TableBody,
  Button
} from '@mui/material';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MappedRow } from './Columnmapper';
import ExcelJS from 'exceljs';

type Props = {
  data: MappedRow[];
};

const categorizeStatementType = (desc: string): string => {
  const lower = desc.toLowerCase();
  if (['asset', 'liability', 'equity', 'capital', 'loan'].some(k => lower.includes(k))) {
    return 'Balance Sheet';
  } else {
    return 'Income Statement';
  }
};

const FinancialStatements: React.FC<Props> = ({ data }) => {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const enrichedData = data.map((row) => ({
    ...row,
    statementType: categorizeStatementType(row['Level 1 Desc'] || '')
  }));

  const getKey = (level: number, parts: string[]) => parts.slice(0, level).join(' > ');

  const toggleRow = (key: string) => {
    const newSet = new Set(expandedKeys);
    newSet.has(key) ? newSet.delete(key) : newSet.add(key);
    setExpandedKeys(newSet);
  };

  const renderRows = (
    level: number,
    parent: string[] = [],
    statementFilter?: string
  ) => {
    const levelKey = `Level ${level} Desc` as keyof MappedRow;
    const nextLevelKey = `Level ${level + 1} Desc` as keyof MappedRow;

    const filtered = enrichedData.filter(row =>
      row.statementType === statementFilter &&
      parent.every((val, idx) => (row as any)[`Level ${idx + 1} Desc`] === val)
    );

    const uniqueDescs = Array.from(new Set(filtered.map(row => row[levelKey])));

    return uniqueDescs.map((desc) => {
      const descStr = String(desc ?? '');
      const key = `${statementFilter} > ${getKey(level, [...parent, descStr])}`;
      const isExpanded = expandedKeys.has(key);
      const hasChildren = enrichedData.some(row =>
        row.statementType === statementFilter &&
        parent.every((val, idx) => (row as any)[`Level ${idx + 1} Desc`] === val) &&
        row[levelKey] === desc &&
        row[nextLevelKey]
      );

      const total = filtered
        .filter(row => row[levelKey] === desc)
        .reduce((acc, row) => acc + (row.amountCurrent || 0), 0);

      return (
        <React.Fragment key={key}>
          <TableRow
            hover
            onClick={() => hasChildren && toggleRow(key)}
            sx={{
              cursor: hasChildren ? 'pointer' : 'default',
              backgroundColor: level === 1 ? '#f0f0f0' : undefined
            }}
          >
            <TableCell sx={{ pl: level * 2 }}>
              {hasChildren ? (isExpanded ? '▼' : '▶') : '•'} {descStr}
            </TableCell>
            <TableCell align="right">{total.toFixed(2)}</TableCell>
          </TableRow>
          {isExpanded && hasChildren && renderRows(level + 1, [...parent, descStr], statementFilter)}
        </React.Fragment>
      );
    });
  };

  const renderCalculatedCashFlow = () => {
    const netProfit = enrichedData
      .filter(row => row.statementType === 'Income Statement')
      .reduce((acc, row) => acc + (row.amountCurrent || 0), 0);

    const getAdj = (term: string) =>
      data
        .filter(row => (row['Level 2 Desc'] || '').toLowerCase().includes(term))
        .reduce((acc, row) => acc + (row.amountCurrent || 0), 0);

    const depreciation = getAdj('depreciation');
    const inventory = getAdj('inventory');
    const receivables = getAdj('receivable');
    const payables = getAdj('payable');

    const investing = data
      .filter(row =>
        ['fixed asset', 'plant', 'equipment', 'investment'].some(k =>
          (row['Level 2 Desc'] || '').toLowerCase().includes(k)
        )
      )
      .reduce((acc, row) => acc + (row.amountCurrent || 0), 0);

    const financing = data
      .filter(row =>
        ['loan', 'capital', 'equity', 'dividend', 'debenture'].some(k =>
          (row['Level 2 Desc'] || '').toLowerCase().includes(k)
        )
      )
      .reduce((acc, row) => acc + (row.amountCurrent || 0), 0);

    const netOperating =
      netProfit + depreciation + payables + receivables + inventory;

    const netCashFlow = netOperating + investing + financing;

    return [
      { label: 'Net Profit before tax', value: netProfit },
      { label: 'Add: Depreciation', value: depreciation },
      { label: 'Change in Payables', value: payables },
      { label: 'Change in Receivables', value: receivables },
      { label: 'Change in Inventory', value: inventory },
      { label: 'Net Cash from Operating Activities', value: netOperating },
      { label: 'Net Cash from Investing Activities', value: investing },
      { label: 'Net Cash from Financing Activities', value: financing },
      { label: 'Net Increase/Decrease in Cash', value: netCashFlow },
    ];
  };

const generateExcel = async () => {
  const workbook = new ExcelJS.Workbook();

  const addStyledSheet = (title: string, rows: MappedRow[]) => {
    const sheet = workbook.addWorksheet(title);

  const boldStyle = {
    bold: true,
    size: 12,
  };

  const styleCell = (cell: ExcelJS.Cell, options: { bold?: boolean, indent?: number } = {}) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
    cell.alignment = {
      horizontal: typeof cell.value === 'number' ? 'right' : 'left',
      indent: options.indent || 0,
    };
    if (options.bold) cell.font = boldStyle;
    if (typeof cell.value === 'number') cell.numFmt = '#,##0.00';
  };

  const grouped = new Map<string, Map<string, Map<string, number>>>();

  rows.forEach(row => {
    const l1 = row['Level 1 Desc'] || 'Uncategorized';
    const l2 = row['Level 2 Desc'] || 'Unlabeled';
    const l3 = row['Level 3 Desc'] || 'Unnamed';
    const amt = row.amountCurrent || 0;

    if (!grouped.has(l1)) grouped.set(l1, new Map());
    const l2Map = grouped.get(l1)!;

    if (!l2Map.has(l2)) l2Map.set(l2, new Map());
    const l3Map = l2Map.get(l2)!;

    l3Map.set(l3, (l3Map.get(l3) || 0) + amt);
  });

  let currentRow = 1;

  grouped.forEach((l2Map, l1) => {
    const groupRow = sheet.addRow([l1]);
    styleCell(groupRow.getCell(1), { bold: true });

    l2Map.forEach((l3Map, l2) => {
      let subtotal = 0;

      l3Map.forEach((amt, l3) => {
        const row = sheet.addRow([l3, amt]);
        styleCell(row.getCell(1), { indent: 1 });
        styleCell(row.getCell(2));
        subtotal += amt;
      });

      const subTotalRow = sheet.addRow([`Total ${l2}`, subtotal]);
      styleCell(subTotalRow.getCell(1), { indent: 1, bold: true });
      styleCell(subTotalRow.getCell(2), { bold: true });
    });

    const total = Array.from(l2Map.values()).flatMap(m => Array.from(m.values())).reduce((a, b) => a + b, 0);
    const totalRow = sheet.addRow([`Total ${l1}`, total]);
    styleCell(totalRow.getCell(1), { bold: true });
    styleCell(totalRow.getCell(2), { bold: true });

    sheet.addRow([]);
  });

  sheet.columns = [
    { width: 50 },
    { width: 20 },
  ];
};

  const addCashFlowSheet = () => {
    const sheet = workbook.addWorksheet('Cash Flow Statement');
    let rowIdx = 1;

    const styleCell = (cell: ExcelJS.Cell, isBold: boolean = false) => {
      cell.font = isBold ? { bold: true } : {};
      cell.alignment = { horizontal: typeof cell.value === 'number' ? 'right' : 'left' };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
      if (typeof cell.value === 'number') {
        cell.numFmt = '₹ #,##0.00';
      }
    };

    renderCalculatedCashFlow().forEach(item => {
      const row = sheet.addRow([item.label, item.value]);
      styleCell(row.getCell(1));
      styleCell(row.getCell(2));
      rowIdx++;
    });

    sheet.columns = [
      { width: 50 },
      { width: 20 },
    ];
  };

  const balanceSheetData = enrichedData.filter(r => r.statementType === 'Balance Sheet');
  const incomeStatementData = enrichedData.filter(r => r.statementType === 'Income Statement');

  addStyledSheet('Balance Sheet', balanceSheetData);
  addStyledSheet('Income Statement', incomeStatementData);
  addCashFlowSheet();

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, 'Financials_3Sheets.xlsx');
};


const generatePDF = () => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const marginX = 14;
  const formatINR = (amount: number): string => {
    const parts = amount.toFixed(3).split(".");
    let intPart = parts[0];
    const decPart = parts[1];
    let lastThree = intPart.slice(-3);
    const other = intPart.slice(0, -3);
    if (other !== "") lastThree = "," + lastThree;
    const formatted = other.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
    return `${formatted}.${decPart}`;
  };

  // Group: statementType > Level 1 > Level 2 > Level 3
  const grouped = new Map<
    string,
    Map<string, Map<string, Map<string, number>>>
  >();

  enrichedData.forEach((row) => {
    const st = row.statementType;
    const l1 = row['Level 1 Desc'] || 'Uncategorized';
    const l2 = row['Level 2 Desc'] || 'Unlabeled';
    const l3 = row['Level 3 Desc'] || 'Unnamed';
    const amt = row.amountCurrent || 0;

    if (!grouped.has(st)) grouped.set(st, new Map());
    const level1Map = grouped.get(st)!;

    if (!level1Map.has(l1)) level1Map.set(l1, new Map());
    const level2Map = level1Map.get(l1)!;

    if (!level2Map.has(l2)) level2Map.set(l2, new Map());
    const level3Map = level2Map.get(l2)!;

    level3Map.set(l3, (level3Map.get(l3) || 0) + amt);
  });

  let first = true;

  grouped.forEach((level1Map, statementType) => {
    if (!first) doc.addPage(); // Add page break after first sheet
    first = false;

    const rows: any[] = [];

    // Sheet Name Header
    rows.push([
      {
        content: statementType,
        colSpan: 2,
        styles: {
          fillColor: [0, 0, 0],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'left',
        },
      },
    ]);

    level1Map.forEach((level2Map, level1) => {
      rows.push([{ content: `  ${level1}`, colSpan: 2, styles: { fontStyle: 'bold' } }]);
      level2Map.forEach((level3Map, level2) => {
        rows.push([{ content: `    ${level2}`, colSpan: 2 }]);
        level3Map.forEach((amount, level3) => {
          rows.push([
            `      ${level3}`,
            formatINR(amount),
          ]);
        });

        // Subtotal for Level 2
        const totalL2 = Array.from(level3Map.values()).reduce((a, b) => a + b, 0);
        rows.push([
          { content: `    Total: ${level2}`, styles: { fontStyle: 'bold' } },
          formatINR(totalL2),
        ]);
      });

      // Subtotal for Level 1
      const totalL1 = Array.from(level2Map.values())
        .flatMap(m => Array.from(m.values()))
        .reduce((a, b) => a + b, 0);

      rows.push([
        { content: `  Total: ${level1}`, styles: { fontStyle: 'bold' } },
        formatINR(totalL1),
      ]);
    });

    autoTable(doc, {
      startY: 20,
      body: rows,
      styles: {
        font: 'helvetica',
        fontSize: 10,
        overflow: 'linebreak',
        cellPadding: 2,
      },
      head: [], // ❌ no "Description / Amount"
      columnStyles: {
        0: { halign: 'left', cellWidth: 130 },
        1: { halign: 'right', cellWidth: 50 },
      },
      theme: 'grid',
      margin: { left: marginX, right: marginX },
    });
  });

  
  
  doc.save('Financial_Statement_Report.pdf');
};






  return (
    <Box>
      <Typography variant="h6" sx={{ mt: 2 }}>
        Financial Statement
      </Typography>

      <Paper sx={{ my: 2, p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Balance Sheet</Typography>
        <Table size="small">
          <TableBody>{renderRows(1, [], 'Balance Sheet')}</TableBody>
        </Table>
      </Paper>

      <Paper sx={{ my: 2, p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Income Statement</Typography>
        <Table size="small">
          <TableBody>{renderRows(1, [], 'Income Statement')}</TableBody>
        </Table>
      </Paper>

      <Paper sx={{ my: 2, p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Cash Flow Statement</Typography>
        <Table size="small">
          <TableBody>
            {renderCalculatedCashFlow().map((row, i) => (
              <TableRow key={i}>
                <TableCell sx={{ pl: 2 }}>• {row.label}</TableCell>
                <TableCell align="right">{row.value.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
        <Button variant="contained" onClick={generateExcel}>Export to Excel</Button>
        <Button variant="outlined" onClick={generatePDF}>Export to PDF</Button>
      </Box>
    </Box>
  );
};

export default FinancialStatements;