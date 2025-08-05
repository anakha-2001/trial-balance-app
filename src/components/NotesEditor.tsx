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

// Recalculate totals for hierarchical items
const recalculateTotals = (items: HierarchicalItem[]): HierarchicalItem[] => {
  return items.map((item) => {
    let currentItem = { ...item };

    if (currentItem.children && currentItem.children.length > 0) {
      const updatedChildren = recalculateTotals(currentItem.children);
      currentItem.children = updatedChildren;

      if (currentItem.isGrandTotal) {
        currentItem = {
          ...currentItem,
          valueCurrent: currentItem.valueCurrent ?? 0,
          valuePrevious: currentItem.valuePrevious ?? 0,
        };
      }
    }

    return currentItem;
  });
};

const EditableNoteItem: React.FC<{
  item: HierarchicalItem;
  onValueChange: (path: string, field: 'valueCurrent' | 'valuePrevious', value: number) => void;
  path: string;
}> = ({ item, onValueChange, path }) => {
  const handleInputChange = (field: 'valueCurrent' | 'valuePrevious', event: React.ChangeEvent<HTMLInputElement>) => {
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
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('valueCurrent', e)}
              sx={{ width: '150px' }}
            />
          ) : (
            formatCurrency(item.valueCurrent)
          )}
        </TableCell>
        <TableCell align="right">
          {item.isEditableRow && !item.isSubtotal && !item.isGrandTotal ? (
            <TextField
              type="number"
              size="small"
              variant="outlined"
              value={item.valuePrevious ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('valuePrevious', e)}
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

const RenderMuiNoteTable = ({ data }: { data: TableContent }) => (
  <Table size="small" sx={{ mt: 2, mb: 2 }}>
    <TableHead>
      <TableRow>
        {data.headers.map((header, index) => (
          <TableCell key={index} align={index === 0 ? 'left' : 'right'} sx={{ fontWeight: 'bold' }}>
            {header}
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
    <TableBody>
      {data.rows.map((row, rowIndex) => (
        <TableRow key={rowIndex}>
          {row.map((cell, cellIndex) => (
            <TableCell key={cellIndex} align={cellIndex === 0 ? 'left' : 'right'}>
              {cell}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

const NotesEditor: React.FC<NotesEditorProps> = ({ financialVariable,amountKeys,notes, onSave, onClose }) => {
  const [editableNotes, setEditableNotes] = useState<FinancialNote[]>(() => _.cloneDeep(notes));
   const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  useEffect(() => {
   console.log('📒 Notes passed to NotesEditor:', notes);
  }, [notes]);
  useEffect(() => {
    setEditableNotes(_.cloneDeep(notes));
    
    const noteId = localStorage.getItem('selectedNoteId');
    setSelectedNoteId(noteId); // ← store for filtering
    if (noteId) {
      // Scroll to it after rendering
      setTimeout(() => {
        const el = document.querySelector(`[data-note-id="${noteId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
          el.classList.add('highlight');
        }
      }, 300);
    }
  }, [notes]);

const handleValueChange = (
  noteNumber: number,
  path: string,
  field: 'valueCurrent' | 'valuePrevious',
  value: number
) => {
  setEditableNotes((prevNotes) => {
    const newNotes = _.cloneDeep(prevNotes);
    const noteToUpdateIndex = newNotes.findIndex(n => n.noteNumber === noteNumber);
    if (noteToUpdateIndex === -1) return newNotes;

    const noteToUpdate = newNotes[noteToUpdateIndex];
    _.set(noteToUpdate.content, `${path}.${field}`, value);

    // Recalculate totals
    const hierarchicalContent = noteToUpdate.content.filter(
      (c: HierarchicalItem | TableContent | string): c is HierarchicalItem =>
        typeof c !== 'string' && 'key' in c
    );
    const recalculatedContent = recalculateTotals(hierarchicalContent);

    noteToUpdate.totalCurrent = _.sumBy(
      recalculatedContent.filter(i => i.isSubtotal || !i.children),
      i => Number(i.valueCurrent ?? 0)
    );
    noteToUpdate.totalPrevious = _.sumBy(
      recalculatedContent.filter(i => i.isSubtotal || !i.children),
      i => Number(i.valuePrevious ?? 0)
    );

    let reconIdx = 0;
    noteToUpdate.content = noteToUpdate.content.map(c =>
      typeof c !== 'string' && 'key' in c ? recalculatedContent[reconIdx++] : c
    );

    return newNotes;
  });
};


  const handleSave = () => {
    const filteredNotes = editableNotes.map((note) => {
      const filteredContent = note.content.map((item: HierarchicalItem | TableContent | string) => {
        if (typeof item !== 'string' && 'key' in item) {
          const filterItem = (hierarchicalItem: HierarchicalItem): HierarchicalItem => {
            const newItem = { ...hierarchicalItem };
            if (!newItem.isEditableRow || newItem.isSubtotal || newItem.isGrandTotal) {
              newItem.valueCurrent = null;
              newItem.valuePrevious = null;
            }
            if (newItem.children) {
              newItem.children = newItem.children.map(filterItem);
            }
            return newItem;
          };
          return filterItem(item);
        }
        return item;
      });

      return {
        ...note,
        content: filteredContent,
        totalCurrent: 0,
        totalPrevious: 0,
      };
    });

    console.log('filteredNotes', filteredNotes);
    onSave(filteredNotes);
  };

  return (
    <div>

    
    <Box sx={{ p: 3 }}>
      <AppBar position="sticky">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Edit Financial Notes
          </Typography>
          <Button color="inherit" onClick={handleSave} variant="contained">
            Save Changes
          </Button>
          <Button color="inherit" onClick={onClose} sx={{ ml: 2 }}>
            Close
          </Button>
        </Toolbar>
      </AppBar>
      <Box sx={{ mt: 8 }}> {/* Offset for AppBar */}
        {editableNotes .filter(note => !selectedNoteId || String(note.noteNumber) === selectedNoteId) .map((note, noteIndex) => (
          <Paper key={note.noteNumber} sx={{ mb: 3, p: 2 }} data-note-id={note.noteNumber}>
            <Typography variant="h5" gutterBottom>
              Note {note.noteNumber}: {note.title}
            </Typography>
            {note.subtitle && (
              <Typography variant="subtitle1" color="text.secondary" gutterBottom>
                {note.subtitle}
              </Typography>
            )}
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Particulars</TableCell>
                  <TableCell align="right">Current Year</TableCell>
                  <TableCell align="right">Previous Year</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {note.content.map((item: HierarchicalItem | TableContent | string, itemIndex) => {
                  if (typeof item === 'string') {
                    return (
                      <TableRow key={`string-${itemIndex}`}>
                        <TableCell colSpan={3}>
                          <Typography variant="caption" color="text.secondary">
                            {item}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  } else if ('type' in item && item.type === 'table') {
                    return (
                      <TableRow key={`table-${itemIndex}`}>
                        <TableCell colSpan={3} sx={{ p: 0 }}>
                          <RenderMuiNoteTable data={item as TableContent} />
                        </TableCell>
                      </TableRow>
                    );
                  }
                   else if ('key' in item) {
  // ⬅️ Check if it's a narrative row
  if ((item as any).isNarrative && (item as any).isEditableText) {
    return (
      <TableRow key={item.key}>
        <TableCell colSpan={3} sx={{ padding: 2 }}>
    <Box
      sx={{
        backgroundColor: '#f9f9f9',
        padding: 2,
        borderRadius: 2,
        boxShadow: 1,
        border: '1px solid #ddd',
      }}
    >
      <Typography
        variant="subtitle1"
        sx={{ fontWeight: 600, marginBottom: 1 }}
      >
        {(item as any).label}
      </Typography>

      <TextField
        fullWidth
        multiline
        minRows={6}
        value={(item as any).narrativeText || ''}
        onChange={(e) => {
          const newText = e.target.value;
          setEditableNotes((prev) => {
            const updated = _.cloneDeep(prev);
            const targetNote = updated[noteIndex];
            const targetItem = targetNote.content[itemIndex];
            if (typeof targetItem === 'object' && 'key' in targetItem) {
              (targetItem as any).narrativeText = newText;
            }
            return updated;
          });
        }}
        sx={{
          '& .MuiInputBase-root': {
            fontSize: '0.95rem',
            lineHeight: 1.6,
          },
        }}
      />
    </Box>
  </TableCell>
</TableRow>
    );
  }

                    return (
                      <EditableNoteItem
                        key={item.key}
                        item={item}
                        path={`${itemIndex}`}
                        onValueChange={(path, field, value) => handleValueChange(note.noteNumber, path, field, value)}
                      />
                    );
                  }
                  return null;
                })}
              </TableBody>
            </Table>
            {note.footer && (
              <Typography variant="caption" sx={{ mt: 2, display: 'block' }}>
                {note.footer}
              </Typography>
            )}
          </Paper>
        ))}
      </Box>
    </Box>
    </div>
  );
};

export default NotesEditor;