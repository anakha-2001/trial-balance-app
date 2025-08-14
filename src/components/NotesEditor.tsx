import React, { useState, useEffect, Fragment } from 'react';
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
import { FinancialNote, FinancialVarRow, HierarchicalItem, TableContent } from './Financialstatement';
import { formatCurrency } from './Financialstatement';
import _ from 'lodash';

const API_URL = 'http://localhost:5000/api/journal';

interface NotesEditorProps {
   notes: FinancialNote[];
  financialVariable: FinancialVarRow[];
  amountKeys: { amountCurrentKey: string; amountPreviousKey: string }
  onSave: (updatedNotes: FinancialNote[]) => void;
  onClose: () => void;

}

// ========================================================================
// START: SIMPLIFIED LOGIC FOR NOTE 9 (AND ITS HELPERS)
// ========================================================================

// HELPER to get the value for display (e.g., "45,000" or "(42,000)")
const parseDisplayValue = (cellValue: string, isPrevious: boolean): string => {
  if (!cellValue) return isPrevious ? '( )' : '';
  const parts = cellValue.split('\n');
  if (isPrevious) {
    return parts.length > 1 ? parts[1] : `(${parts[0]})`;
  }
  return parts[0];
};

// HELPER to get the raw number for the input field (e.g., "42000" or "-42000")
const parseNumberForEditing = (cellValue: string, isPrevious: boolean): string => {
  if (!cellValue) return ''; // Return empty string for blank fields
  const parts = cellValue.split('\n');
  const value = isPrevious ? (parts[1] || '') : (parts[0] || '');
  // Only remove parentheses and commas, leave the minus sign.
  return value.replace(/[(),]/g, '');
};

// The smart table component that handles the mixed layout of Note 9
const Note9EditableTable: React.FC<{
  data: TableContent;
  onCellChange: (rowIndex: number, colIndex: number, isPrevious: boolean, value: string) => void;
}> = ({ data, onCellChange }) => {
  const isRowEditable = (label: string): boolean => !label.toLowerCase().includes('total');
  const isFinalTotalRow = (label: string): boolean => label.toLowerCase().includes('total trade receivables as on');

  return (
    <Box sx={{ mb: 2, border: '1px solid', borderColor: 'divider', overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: 650, borderCollapse: 'collapse' }}>
        <TableHead>
          <TableRow sx={{ backgroundColor: 'action.hover' }}>
            {data.headers.map((header, index) => (
              <TableCell key={index} align={index === 0 ? 'left' : 'center'} sx={{ fontWeight: 'bold', border: '1px solid #ddd', whiteSpace: 'pre-wrap' }}>
                {header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.rows.map((row, rowIndex) => {
            if (isFinalTotalRow(row[0])) {
              return (
                <TableRow key={rowIndex}>
                  <TableCell sx={{ border: '1px solid #ddd', fontWeight: 'bold' }}>{row[0]}</TableCell>
                  <TableCell colSpan={6} sx={{ border: '1px solid #ddd' }} /> 
                  <TableCell align="right" sx={{ border: '1px solid #ddd', fontWeight: 'bold' }}>{row[row.length - 1]}</TableCell>
                </TableRow>
              );
            }

            return (
              <Fragment key={rowIndex}>
                <TableRow>
                  <TableCell rowSpan={2} sx={{ verticalAlign: 'middle', borderBottom: '1px solid #ccc', borderRight: '1px solid #ddd' }}>
                    <Typography variant="body2">{row[0]}</Typography>
                  </TableCell>
                  {row.slice(1).map((cell, colIndex) => (
                    <TableCell key={`${rowIndex}-${colIndex}-current`} align='right' sx={{ p: 0.5, border: '1px solid #ddd', borderBottom: 'none' }}>
                      {isRowEditable(row[0]) ? (
                        <TextField fullWidth size="small" variant="outlined" value={parseNumberForEditing(cell, false)} onChange={(e) => onCellChange(rowIndex, colIndex + 1, false, e.target.value)} inputProps={{ style: { textAlign: 'right' } }}/>
                      ) : ( <Typography variant="body2" align="right" sx={{ px:1 }}>{parseDisplayValue(cell, false)}</Typography> )}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  {row.slice(1).map((cell, colIndex) => (
                    <TableCell key={`${rowIndex}-${colIndex}-prev`} align='right' sx={{ p: 0.5, border: '1px solid #ddd' }}>
                      {isRowEditable(row[0]) ? (
                        <TextField fullWidth size="small" variant="outlined" value={parseNumberForEditing(cell, true)} onChange={(e) => onCellChange(rowIndex, colIndex + 1, true, e.target.value)} inputProps={{ style: { textAlign: 'right' } }}/>
                      ) : ( <Typography variant="body2" align="right" sx={{ px:1 }}>{parseDisplayValue(cell, true)}</Typography> )}
                    </TableCell>
                  ))}
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
};
// ========================================================================
// END
// ========================================================================

const EditableNoteItem: React.FC<{
  item: HierarchicalItem;
  onValueChange: (path: string, field: 'valueCurrent' | 'valuePrevious', value: number) => void;
  path: string;
}> = ({ item, onValueChange, path }) => {
  const handleInputChange = (field: 'valueCurrent' | 'valuePrevious', event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const numericValue = parseFloat(event.target.value) || 0;
    onValueChange(path, field, numericValue);
  };

  return (
    <>
      <TableRow key={item.key}>
        <TableCell style={{ paddingLeft: `${item.children ? 20 : 40}px`, fontWeight: item.isSubtotal || item.isGrandTotal ? 'bold' : 'normal' }}>
          {item.label}
        </TableCell>
        <TableCell align="right">
          {item.isEditableRow && !item.isSubtotal && !item.isGrandTotal ? (
            <TextField 
            type="number" 
            size="small"
             variant="outlined"
              value={item.valueCurrent ?? ''} 
              onChange={e => handleInputChange('valueCurrent', e)} 
              sx={{ width: '150px' }}
              />
          ) : ( 
            formatCurrency(item.valueCurrent)
             )}
        </TableCell>
        <TableCell align="right">
          {item.isEditableRow && !item.isSubtotal && !item.isGrandTotal ? (
            <TextField type="number" 
            size="small"
             variant="outlined"
              value={item.valuePrevious ?? ''}
               onChange={e => handleInputChange('valuePrevious', e)}
                sx={{ width: '150px' }}
                />
          ) : ( 
            formatCurrency(item.valuePrevious) 
            )}
        </TableCell>
      </TableRow>
      {item.children?.map((child, index) => (
        <EditableNoteItem 
        key={child.key} 
        item={child} 
        path={`${path}.children[${index}]`} 
        onValueChange={onValueChange}
        />
      ))}
    </>
  );
};

const RenderMuiNoteTable: React.FC<{
  data: TableContent;
  onTableChange?: (noteIndex: number, itemIndex: number, rowIndex: number, colIndex: number, value: string) => void;
  noteIndex?: number;
  itemIndex?: number;
}> = ({ data, onTableChange, noteIndex, itemIndex }) => (
    <Box sx={{ mb: 2, border: '1px solid', borderColor: 'divider', overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: 650 }}>
        <TableHead>
          <TableRow sx={{ backgroundColor: 'action.selected' }}>
            {data.headers.map((header, index) => (
              <TableCell
               key={index} 
               align={index === 0 ? 'left' : 'right'} 
               sx={{ 
                fontWeight: 'bold', 
                borderRight: '1px solid',
                 borderColor: 'divider' }}>
                {header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.rows.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {row.map((cell, colIndex) => (
                <TableCell 
                key={colIndex} 
                align={colIndex === 0 ? 'left' : 'right'} 
                sx={{ 
                  backgroundColor: 'white',
                   borderRight: '1px solid', 
                   borderColor: 'divider'
                    }}>
                  {data.isEditable && onTableChange && noteIndex !== undefined && itemIndex !== undefined && colIndex !== 0 ? (
                    <TextField 
                    variant="outlined" 
                    size="small" 
                    type="text" 
                    value={cell} 
                    sx={{ width: '100%' }} 
                    onChange={(e) => 
                      onTableChange(noteIndex, itemIndex, rowIndex, colIndex, e.target.value)
                    } />
                  ) : ( cell )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
);

const NotesEditor: React.FC<NotesEditorProps> = ({ notes, onSave, onClose }) => {
  const [editableNotes, setEditableNotes] = useState<FinancialNote[]>(() => _.cloneDeep(notes));
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  useEffect(() => {
    setEditableNotes(_.cloneDeep(notes));
    const noteId = localStorage.getItem('selectedNoteId');
    setSelectedNoteId(noteId);
    if (noteId) {
      setTimeout(() => {
        const el = document.querySelector(`[data-note-id="${noteId}"]`);
        if (el) { el.scrollIntoView({ behavior: 'smooth' }); }
      }, 300);
    }
  }, [notes]);
  
  const handleValueChange = (noteNumber: number, path: string, field: 'valueCurrent' | 'valuePrevious', value: number) => {
    setEditableNotes((prevNotes) => {
      const newNotes = _.cloneDeep(prevNotes);
      const noteToUpdate = newNotes.find(n => n.noteNumber === noteNumber);
      if (!noteToUpdate) return newNotes;
      _.set(noteToUpdate.content, `${path}.${field}`, value);
      return newNotes;
    });
  };
  
  const handleSave = () => { onSave(editableNotes); };

  const handleTableChange = (noteIndex: number, itemIndex: number, rowIndex: number, colIndex: number, value: string) => {
    setEditableNotes((prevNotes) => {
      const updatedNotes = _.cloneDeep(prevNotes);
      const table = updatedNotes[noteIndex].content[itemIndex] as TableContent;
      if (table?.rows?.[rowIndex]) {
        table.rows[rowIndex][colIndex] = value;
      }
      return updatedNotes;
    });
  };

  const handleTableChangeTwoLine = (
    noteIndex: number, itemIndex: number, rowIndex: number, colIndex: number, isPrevious: boolean, value: string
  ) => {
    setEditableNotes((prevNotes) => {
      const updatedNotes = _.cloneDeep(prevNotes);
      const note = updatedNotes[noteIndex];
      let table = note.content[itemIndex] as TableContent;

      if (table?.rows?.[rowIndex]?.[colIndex] !== undefined) {
        const currentCell = table.rows[rowIndex][colIndex] || '';
        const parts = String(currentCell).split('\n');
        
        const currentValue = isPrevious ? (parts[0] || '') : value;
        const previousValue = isPrevious ? value : (parseNumberForEditing(currentCell, true) || '');
        
        table.rows[rowIndex][colIndex] = `${currentValue}\n(${previousValue})`;
      }
      return updatedNotes;
    });
  };
  
  return (
    <Box sx={{ p: 5, backgroundColor: 'grey.100', minHeight: '100vh' }}>
      <AppBar position="sticky" sx={{ background: 'linear-gradient(135deg, rgba(69, 75, 248, 1) 0%, rgba(38, 5, 167, 1) 100%)' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Edit Financial Notes</Typography>
          <Button color="info" onClick={handleSave} variant="contained">Save Changes</Button>
          <Button color="inherit" onClick={onClose} sx={{ ml: 2 }}>Close</Button>
        </Toolbar>
      </AppBar>
      <Box sx={{ mt: 3, maxWidth: '100%', mx: 'auto' }}>
         {editableNotes.filter(note => !selectedNoteId || String(note.noteNumber) === selectedNoteId).map((note) => {
            const originalNoteIndex = editableNotes.findIndex(n => n.noteNumber === note.noteNumber);
            return (
                <Paper key={note.noteNumber} sx={{ mb: 3, p: 2 }} data-note-id={note.noteNumber}>
                    <Typography variant="h5" gutterBottom>Note {note.noteNumber}: {note.title}</Typography>
                    {note.subtitle && <Typography variant="subtitle1" color="text.secondary" gutterBottom>{note.subtitle}</Typography>}
                    <Table size="small">
                        <TableHead>
                           <TableRow>
                                <TableCell>Particulars</TableCell>
                                <TableCell align="right">Current Year</TableCell>
                                <TableCell align="right">Previous Year</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {note.content.map((item, itemIndex) => {
                                if (typeof item === 'string') {
                                    return ( <TableRow key={`string-${itemIndex}`}><TableCell colSpan={3}><Typography variant="caption" color="text.secondary">{item}</Typography></TableCell></TableRow> );
                                } else if ('type' in item && item.type === 'table') {
                                    const tableItem = item as TableContent;
                                    return (
                                        <TableRow key={`table-${itemIndex}`}>
                                            <TableCell colSpan={3} sx={{ p: 0 }}>
                                                {tableItem.isEditable && note.noteNumber === 9 ? (
                                                    <Note9EditableTable data={tableItem} onCellChange={(rowIndex, colIndex, isPrevious, value) => handleTableChangeTwoLine(originalNoteIndex, itemIndex, rowIndex, colIndex, isPrevious, value)} />
                                                ) : tableItem.isEditable ? (
                                                    <RenderMuiNoteTable data={tableItem} noteIndex={originalNoteIndex} itemIndex={itemIndex} onTableChange={handleTableChange} />
                                                ) : (
                                                    <RenderMuiNoteTable data={tableItem} />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                } else if ('key' in item) {
                                  const hierarchicalItem = item as HierarchicalItem;
                                  if (hierarchicalItem.isNarrative && hierarchicalItem.isEditableText) {
                                    return (
                                      <TableRow key={hierarchicalItem.key}>
                                          <TableCell colSpan={3} sx={{ padding: 2 }}>
                                              <Box sx={{ backgroundColor: '#f9f9f9', padding: 2, borderRadius: 2, boxShadow: 1, border: '1px solid #ddd' }}>
                                                  <Typography variant="subtitle1" sx={{ fontWeight: 600, marginBottom: 1 }}>{hierarchicalItem.label}</Typography>
                                                  <TextField
                                                      fullWidth multiline minRows={6}
                                                      value={hierarchicalItem.narrativeText || ''}
                                                      onChange={(e) => {
                                                        const newText = e.target.value;
                                                        setEditableNotes((prev) => {
                                                          const updated = _.cloneDeep(prev);
                                                          const targetItem = updated[originalNoteIndex].content[itemIndex] as HierarchicalItem;
                                                          if (targetItem) {
                                                              targetItem.narrativeText = newText;
                                                          }
                                                          return updated;
                                                        });
                                                      }}
                                                      sx={{ '& .MuiInputBase-root': { fontSize: '0.95rem', lineHeight: 1.6 } }}
                                                  />
                                              </Box>
                                          </TableCell>
                                      </TableRow>
                                    );
                                  }
                                  return (
                                      <EditableNoteItem key={hierarchicalItem.key} item={hierarchicalItem} path={`${itemIndex}`} onValueChange={(path, field, value) => handleValueChange(note.noteNumber, path, field, value)} />
                                  );
                                }
                                return null;
                            })}
                        </TableBody>
                    </Table>
                    {note.footer && <Typography variant="caption" sx={{ mt: 2, display: 'block' }}>{note.footer}</Typography>}
                </Paper>
            );
         })}
      </Box>
    </Box>
  );
};

export default NotesEditor;