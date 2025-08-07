import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  AppBar,
  Toolbar,
} from '@mui/material';
import { HierarchicalItem } from './Financialstatement'; // Assuming types are in Financialstatement.tsx
import { formatCurrency } from './Financialstatement';
import _ from 'lodash';

interface CashFlowEditorProps {
  cashFlowData: HierarchicalItem[];
  onSave: (updatedData: HierarchicalItem[]) => void;
  onClose: () => void;
}

// Recalculates all subtotals and grand totals in the cash flow hierarchy
const recalculateCashFlowTotals = (items: HierarchicalItem[]): HierarchicalItem[] => {
  const totals = new Map<string, { current: number, previous: number }>();

  function processNode(node: HierarchicalItem): HierarchicalItem {
    let valueCurrent = node.valueCurrent ?? 0;
    let valuePrevious = node.valuePrevious ?? 0;
    
    const children = node.children?.map(processNode);

    if (children?.length && !node.isEditableRow) { // Don't overwrite editable rows with sums
        valueCurrent = children.reduce((sum, c) => sum + (c.valueCurrent ?? 0), 0);
        valuePrevious = children.reduce((sum, c) => sum + (c.valuePrevious ?? 0), 0);
    }

    if (node.formula) {
      const [id1, op, id2] = node.formula;
      const val1 = totals.get(id1 as string);
      const val2 = totals.get(id2 as string);
      if (val1 && val2) {
        valueCurrent = op === '+' ? val1.current + val2.current : val1.current - val2.current;
        valuePrevious = op === '+' ? val1.previous + val2.previous : val1.previous - val2.previous;
      }
    }

    if (node.id) {
      totals.set(node.id, { current: valueCurrent, previous: valuePrevious });
    }

    return { ...node, children, valueCurrent, valuePrevious };
  }

  return items.map(processNode);
};


const EditableCashFlowItem: React.FC<{
  item: HierarchicalItem;
  onValueChange: (path: string, field: 'valueCurrent' | 'valuePrevious', value: number) => void;
  path: string;
  depth: number;
}> = ({ item, onValueChange, path, depth }) => {

  const handleInputChange = (field: 'valueCurrent' | 'valuePrevious', event: React.ChangeEvent<HTMLInputElement>) => {
    const numericValue = parseFloat(event.target.value) || 0;
    onValueChange(path, field, numericValue);
  };

  const isTotal = item.isGrandTotal || item.isSubtotal;
  const hasChildren = item.children && item.children.length > 0;

  return (
    <>
      <TableRow key={item.key}>
        <TableCell style={{ paddingLeft: `${depth * 20 + 20}px`, fontWeight: isTotal ? 'bold' : 'normal' }}>
          {item.label}
        </TableCell>
        <TableCell align="right">
          {item.isEditableRow && !hasChildren ? (
            <TextField
              type="number"
              size="small"
              variant="outlined"
              value={item.valueCurrent ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('valueCurrent', e)}
              sx={{ width: '150px' }}
              inputProps={{ style: { textAlign: 'right' } }}
            />
          ) : (
            formatCurrency(item.valueCurrent)
          )}
        </TableCell>
        <TableCell align="right">
          {item.isEditableRow && !hasChildren ? (
            <TextField
              type="number"
              size="small"
              variant="outlined"
              value={item.valuePrevious ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('valuePrevious', e)}
              sx={{ width: '150px' }}
              inputProps={{ style: { textAlign: 'right' } }}
            />
          ) : (
            formatCurrency(item.valuePrevious)
          )}
        </TableCell>
      </TableRow>
      {item.children?.map((child, index) => (
        <EditableCashFlowItem
          key={child.key}
          item={child}
          path={`${path}.children[${index}]`}
          onValueChange={onValueChange}
          depth={depth + 1}
        />
      ))}
    </>
  );
};

const CashFlowEditor: React.FC<CashFlowEditorProps> = ({ cashFlowData, onSave, onClose }) => {
  const [editableData, setEditableData] = useState<HierarchicalItem[]>(() =>
    _.cloneDeep(cashFlowData)
  );

  // Only reset editableData when the component first mounts or when cashFlowData reference actually changes
  // Remove the useEffect that was causing the reset issue

  const handleValueChange = (
    path: string,
    field: 'valueCurrent' | 'valuePrevious',
    value: number
  ) => {
    setEditableData((prevData) => {
      const newData = _.cloneDeep(prevData);
      _.set(newData, `${path}.${field}`, value);
      // After changing a value, recalculate all totals
      return recalculateCashFlowTotals(newData);
    });
  };

  const handleSave = () => {
    console.log('CASH FLOW EDITOR: Saving this data:', editableData);
    onSave(editableData);
  };

  return (
    <div> 
    <Box>
      <AppBar position="sticky">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Edit Cash Flow Statement
          </Typography>
          <Button color="inherit" onClick={handleSave} variant="contained">
            Save Changes
          </Button>
          <Button color="inherit" onClick={onClose} sx={{ ml: 2 }}>
            Close
          </Button>
        </Toolbar>
      </AppBar>
      <Box sx={{ p: 3, mt: 8 }}>
        <Paper sx={{ mb: 3, p: 2 }}>
          <Typography variant="h5" gutterBottom>
            Cash Flow From Operating, Investing, and Financing Activities
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Particulars</TableCell>
                <TableCell align="right">Current Year</TableCell>
                <TableCell align="right">Previous Year</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {editableData.map((item, index) => (
                <EditableCashFlowItem
                  key={item.key}
                  item={item}
                  path={`[${index}]`}
                  onValueChange={handleValueChange}
                  depth={0}
                />
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Box>
    </Box>
    </div>
  );
};

export default CashFlowEditor;