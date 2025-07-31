import React, { useState, useMemo, Fragment, useEffect, Children } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
  Dialog,
  DialogContent,
  DialogActions,
  DialogTitle,      
  DialogContentText
} from '@mui/material';
import { saveAs } from 'file-saver';
import ExcelJS, { Worksheet, Border, Fill } from 'exceljs';
import { PDFViewer, Page, Text, View, Document, StyleSheet, PDFDownloadLink, Link } from '@react-pdf/renderer';
import NotesEditor from './NotesEditor';
import { createPortal } from 'react-dom';
import { on } from 'events';

// --- 1. TYPE DEFINITIONS (FIXED) ---

/** A row from the raw, mapped CSV/Excel data. */
interface MappedRow {
  [key: string]: string | number | undefined;
  'Level 1 Desc'?: string;
  'Level 2 Desc'?: string;
  amountCurrent?: number;
  amountPrevious?: number;
}
// Represents a table within a policy note.
export interface TableContent {
  type: 'table';
  headers: string[];
  rows: string[][];
}
// Represents a single accounting policy, which can contain text and tables.
interface AccountingPolicy {
  title: string;
  text: (string | TableContent)[];
}
// Represents the raw structure of an item in the templates.
interface TemplateItem {
  key: string;
  label: string;
  note?: string | number;
  isGrandTotal?: boolean;
  isSubtotal?: boolean;
  children?: TemplateItem[];
  keywords?: string[];
  formula?: (string | number)[];
  id?: string;
}
// Represents the final, processed item with calculated values.
export interface HierarchicalItem extends TemplateItem {
  valueCurrent: number | null;
  valuePrevious: number | null;
  isEditableRow?: boolean;
  footer?: string;
  children?: HierarchicalItem[];
}
export interface FinancialNote {
    noteNumber: number;
    title: string;
    subtitle?: string;
    content: (HierarchicalItem | TableContent | string )[]; 
    footer?: string;
    totalCurrent: number | null;
    totalPrevious: number | null;
    nonCurrentTotal?: { current: number; previous: number };
    currentTotal?: { current: number; previous: number };
    cceTotal?: { current: number; previous: number };
    otherBankBalancesTotal?: { current: number; previous: number };
}
// The final, consolidated data object.
interface FinancialData {
  balanceSheet: HierarchicalItem[];
  incomeStatement: HierarchicalItem[];
  cashFlow: HierarchicalItem[];
  notes: FinancialNote[];
  accountingPolicies: AccountingPolicy[];
}
// --- 2. STYLING & FORMATTING HELPERS ---
export const formatCurrency = (amount: number | null) => {
  if (amount === null || typeof amount === 'undefined' || isNaN(amount)) {
    return '';
  }
  const value = amount;
  if (value < 0) {
    return `(${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value))})`;
  }
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
};
const PDF_STYLES = StyleSheet.create({
  page: { padding: 30, fontSize: 9, fontFamily: 'Helvetica' },
  title: { fontSize: 16, textAlign: 'center', marginBottom: 20, fontFamily: 'Helvetica-Bold' },
  section: { marginBottom: 15 },
  sectionHeader: { fontSize: 12, fontFamily: 'Helvetica-Bold', backgroundColor: '#f0f0f0', padding: 5, textTransform: 'uppercase', marginBottom: 5 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#333', backgroundColor: '#f0f0f0', padding: 4, fontFamily: 'Helvetica-Bold' },
  colParticulars: { width: '55%', textAlign: 'left' },
  colNote: { width: '10%', textAlign: 'center' },
  colAmount: { width: '17.5%', textAlign: 'right' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0', paddingVertical: 4, paddingHorizontal: 2, alignItems: 'center' },
  rowText: { fontFamily: 'Helvetica' },
  rowTextBold: { fontFamily: 'Helvetica-Bold' },
  grandTotalRow: { flexDirection: 'row', borderTopWidth: 2, borderBottomWidth: 2, borderColor: '#333', paddingVertical: 4, paddingHorizontal: 2, marginTop: 5, backgroundColor: '#f0f0f0' },
  subTotalRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#ccc', paddingVertical: 4, paddingHorizontal: 2, marginTop: 2 },
  topLevelRow: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#ccc', paddingVertical: 4, paddingHorizontal: 2 },
  policyBlock: { marginBottom: 12 },
  policyTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginBottom: 4 },
  policyText: { fontFamily: 'Helvetica', lineHeight: 1, textAlign: 'justify', marginBottom: 2 },
  policyTable: { display: 'flex', flexDirection: 'column', width: '100%', borderStyle: 'solid', borderWidth: 1, borderColor: '#bfbfbf', marginBottom: 8 },
  policyTableRow: { flexDirection: 'row' },
  policyTableCell: { flex: 1, padding: 4, borderStyle: 'solid', borderWidth: 0.5, borderColor: '#bfbfbf' },
  policyTableHeaderCell: { flex: 1, padding: 4, fontFamily: 'Helvetica-Bold', backgroundColor: '#f0f0f0', borderStyle: 'solid', borderWidth: 0.5, borderColor: '#bfbfbf' },
  notePageHeader: { fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 5 },
  noteTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  noteSubtitle: { fontSize: 9, fontFamily: 'Helvetica-Oblique', marginBottom: 10 },
  noteFooter: { fontSize: 9, marginTop: 15, fontFamily: 'Helvetica' },
  noteRow: { flexDirection: 'row', paddingVertical: 2, paddingHorizontal: 2, alignItems: 'center' },
  noteColParticulars: { width: '40%', textAlign: 'left' }, // Adjusted width
  noteColAmount: { width: '30%', textAlign: 'right' },    // Adjusted width
  noteSubTotalRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#333', paddingVertical: 2, paddingHorizontal: 2, marginTop: 2, marginBottom: 5 },
  noteGrandTotalRow: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 2, borderStyle: 'solid', borderColor: '#333', paddingVertical: 3, paddingHorizontal: 2, marginTop: 5 },
  noteParagraph: {fontSize: 9,fontFamily: 'Helvetica',textAlign: 'justify',marginBottom: 8,lineHeight: 1.3},
});
// --- 3. STATEMENT STRUCTURE TEMPLATES (FIXED) ---
const BALANCE_SHEET_STRUCTURE: TemplateItem[] = [
  { key: 'bs-assets', label: 'ASSETS', isGrandTotal: true, children: [
    { key: 'bs-assets-nc', label: 'Non-current assets', isSubtotal: true, children: [
        { key: 'bs-assets-nc-ppe', label: 'Property, plant and equipment', note: 3},
        { key: 'bs-assets-nc-rou', label: 'Right of use asset', note: 4,},
        { key: 'bs-assets-nc-cwip', label: 'Capital work-in-progress', note:3},
        { key: 'bs-assets-nc-intangible', label: 'Other Intangible assets', note: 4,},
        { key: 'bs-assets-nc-otherintangible', label: 'Intangible assets under development',note:4,},

        { key: 'bs-assets-nc-fin', label: 'Financial Assets', isSubtotal: true, children: [
          { key: 'bs-assets-nc-fin-loan', label: 'Loans', note:5},
          { key: 'bs-assets-nc-fin-other', label: 'Other financial assets', note: 6},
        ]},
        { key: 'bs-assets-nc-dta', label: 'Deferred tax assets (net)', note: 34, keywords: ['deferred tax assets (net)'] },
        { key: 'bs-assets-nc-fin-income', label: 'Income Tax asset(net)', note: 7},
        { key: 'bs-assets-nc-other', label: 'Other non-current assets', note: 10},
      ]},
    { key: 'bs-assets-c', label: 'Current assets', isSubtotal: true, children: [
        { key: 'bs-assets-c-inv', label: 'Inventories', note: 8},
        { key: 'bs-assets-c-fin', label: 'Financial Assets', isSubtotal: true, children: [
           { key: 'bs-assets-c-fin-tr', label: 'Trade receivables', note: 9 },
           { key: 'bs-assets-c-fin-cce', label: 'Cash and cash equivalents',note:11},
           { key: 'bs-assets-c-fin-bank', label: ' Bank balances other than above',note:11},
           { key: 'bs-assets-c-fin-loans', label: 'Loans', note: 5 },
           { key: 'bs-assets-c-fin-other', label: 'Other financial assets', note: 6},
        ]},
       { key: 'bs-assets-c-other', label: 'Other current assets', note: 10},
      ]},
  ]},
  { key: 'bs-eq-liab', label: 'EQUITY AND LIABILITIES', isGrandTotal: true, formula: ['eq', '+', 'liab-nc','+','liab-c'],children: [
    { key: 'bs-eq', label: 'Equity', isSubtotal: true, children: [
        { key: 'bs-eq-captial', label: 'Equity share capital', note: 12, keywords: ['equity'] },
        { key: 'bs-eq-other', label: 'Other equity', note: 13},
      ]},
    { key: 'bs-liab-nc', label: 'Non-current liabilities', isSubtotal: true, children: [
        { key: 'bs-liab-nc-fin', label: 'Financial Liabilities', isSubtotal: true, children: [
          { key: 'bs-liab-nc-fin-borrow', label: 'Lease Liabilities', note: 29 },
        ]},
        { key: 'bs-liab-nc-prov', label: 'Provisions', note: 17}]},
    { key: 'bs-liab-c', label: 'Current liabilities', isSubtotal: true, children: [
        { key: 'bs-liab-c-fin', label: 'Financial Liabilities', isSubtotal: true, children: [
          { key: 'bs-liab-c-fin-liability', label: 'Lease Liabilities', note: 29,},
          { key: 'bs-liab-c-fin-tp', label: 'Trade payables',isSubtotal: true, children: [
            { key: 'bs-liab-c-fin-enterprises', label: ' Total outstanding dues of micro enterprises and small enterprises', note: 14},
            { key: 'bs-liab-c-fin-creators', label: ' Total outstanding dues of creditors other than micro enterprises and small enterprises', note: 14},
            { key: 'bs-liab-c-fin-enterprises-other', label: 'Other Financial liabilities', note: 15},
        ]},

        ]},
        { key: 'bs-liab-c-other', label: 'Other current liabilities', note: 16},
        { key: 'bs-liab-c-prov', label: 'Provisions', note: 17},
        { key: 'bs-liab-c-tax', label: 'Income tax liabilities (net)', note:7},
      ]},
  ]}
];
const INCOME_STATEMENT_STRUCTURE: TemplateItem[] = [
  { key: 'is-income', label: 'INCOME', id: 'totalIncome', isSubtotal: true, children: [
      { key: 'is-rev-ops', label: 'Revenue from operations', note: 18 },
      { key: 'is-other-inc', label: 'Other income', note: 19 },
    ]
  },
  { key: 'is-expenses', label: 'EXPENSES', id: 'totalExpenses', isSubtotal: true, children: [
      { key: 'is-exp-mat', label: 'Cost of materials consumed', note: 20 },
      { key: 'is-exp-pur', label: 'Purchase of traded goods', note: 20 },
      { key: 'is-exp-inv', label: 'Changes in inventories of work-in-progress and stock-in-trade',  note: 20 },
      { key: 'is-exp-emp', label: 'Employee benefits expense', note: 21 },
      { key: 'is-exp-fin', label: 'Finance cost', note: 22 },
      { key: 'is-exp-dep', label: 'Depreciation and amortisation expense',  note: 23 },
      { key: 'is-exp-oth', label: 'Other expenses', note: 24 },
    ]
  },
  { key: 'is-pbeit', label: 'PROFIT BEFORE EXCEPTIONAL ITEM & TAXES', id: 'pbeit', isSubtotal: true, formula: ['totalIncome', '-', 'totalExpenses'] },
  { key: 'is-except', label: 'Exceptional Income', id: 'exceptional', keywords: ['Other income','Exceptional Income'], note: 44 },
  { key: 'is-pbt', label: 'PROFIT BEFORE TAX', id: 'pbt', isSubtotal: true, formula: ['pbeit', '+', 'exceptional'] },
  { key: 'is-tax', label: 'TAX EXPENSE:', id: 'totalTax', isSubtotal: true, children: [
      { key: 'is-tax-curr', label: 'Current tax', note: 34 },
      { key: 'is-tax-def', label: 'Deferred tax', note: 34 },
    ]
  },
  { key: 'is-pat', label: 'PROFIT FOR THE YEAR', id: 'pat', isGrandTotal: true, formula: ['pbt', '-', 'totalTax'] },
{
    key: 'is-oci', label: 'Other comprehensive income', isSubtotal: true,children: [
      {key: 'is-oci-profitorloss',label: 'i) Items that will not be reclassified to profit or loss:'},
      {key: 'is-oci-remesure',label: '   - Remeasurement on the defined benefit liabilities',note: 28,},
      {key: 'is-oci-tax',label: 'ii) Income tax relating to items not to be reclassified to profit or loss',note: 34,},
      {key: 'is-oci-total',label: 'Other comprehensive income for the year',isSubtotal: true,},
    ],
  },
  {
    key: 'is-total-comprehensive',label: 'Total comprehensive income for the year',id: 'totalComprehensive',isGrandTotal: true,formula: ['pat', '+', 'is-oci-total'],
  },
{
    key: 'is-eps', label: 'Earnings per equity share', isSubtotal: true,children: [
      {
        key: 'is-eps-value',label: '- Basic and diluted (in Rs.)',note:32
     },                                                                               
   ],
  },
];
const CASH_FLOW_STRUCTURE: TemplateItem[] = [
    { key: 'cf-op', label: 'A. Cash flow from operating activities', isSubtotal: true,children:[
    { key: 'cf-op-pro', label: 'Profit for the year', id:'pro',isSubtotal: true}, // This will be populated from income statement PAT
    { key: 'cf-op-sub', label: 'Adjustments for:',id:'sub', 
      children: [
        { key: 'cf-op-sub-tax', label: 'Tax Expense',note:34,id:'tax' },
        { key: 'cf-op-sub-dep', label: 'Depreciation and amortisation', note:23 ,id:'dep'},
        { key: 'cf-op-sub-prov', label: 'Provision/ Liabilities no longer required written back',note:44 ,id:'prov' },
        { key: 'cf-op-sub-interest', label: 'Interest Income from bank deposits and financial assets',note:19 ,id:'in'},
        { key: 'cf-op-sub-interest-2', label: 'Interest Expense on lease liabilities',note:22,id:'in2' },
        { key: 'cf-op-sub-prov-2', label: 'Provision for doubtful trade receivables/(provision written back) (net)',note:24,id:'prov2' },
        { key: 'cf-op-sub-loss', label: 'Loss on fixed assets sold / scrapped / written off ',note:24,id:'loss' },
        { key: 'cf-op-sub-prov-3', label: 'Provision for expected loss on construction contracts ',note:24,id:'prov3' },
        { key: 'cf-op-sub-prov-4', label: 'Provision for expected loss on onerous contracts ',note:24,id:'prov4' },
        { key: 'cf-op-sub-loss-1', label: 'Net unrealised exchange (gain)/loss ',id:'loss2'},
        ]},

        { key: 'cf-op-profit', label: 'Operating profit before working capital changes',isSubtotal:true,id:'profit'},
        { key: 'cf-op-mov', label: 'Movements in working capital', isSubtotal:true,children: [
            { key: 'cf-op-mov-inv', label: 'Decrease/(Increase) in inventories',id:'inv',  },
            { key: 'cf-op-mov-rec', label: '(Increase)/decrease in trade receivables',id:'rec',  },
            { key: 'cf-op-mov-short', label: 'Decrease/(Increase) in short-term loans',id:'short',  },
            { key: 'cf-op-mov-nonfinancial', label: 'Decrease/(Increase) in non-current other financial assets',id:'nonfinancial'  },
            { key: 'cf-op-mov-nonasset', label: 'Decrease/(Increase) in other non-current assets',id:'nonasset' },
            { key: 'cf-op-mov-long', label: 'Decrease/(Increase) in long-term loans', id:'long'},
            { key: 'cf-op-mov-financial', label: 'Decrease/(Increase) in current other financial assets', id:'financial' },
            { key: 'cf-op-mov-current', label: 'Decrease/(Increase) in other current assets', id:'current' },
            { key: 'cf-op-mov-pay', label: 'Increase/(decrease) in trade payables',id:'pay'  },
            { key: 'cf-op-mov-currentlib', label: 'Increase/(Decrease) in other current liabilities',id:'currentlib'  },
            { key: 'cf-op-mov-otherlib', label: 'Increase/(Decrease) in other Current financial liabilities',id:'otherlib'  },
            { key: 'cf-op-mov-long-prov', label: 'Increase/(Decrease) in Long-term provisions', id:'prov' },
            { key: 'cf-op-mov-short-prov', label: 'Increase/(Decrease) in short-term provisions',id:'prov2'  },
        ]},
        { key: 'cf-op-cgo', label: 'Cash generated from operations', isSubtotal: true,id:'cgo', },
        { key: 'cf-op-direct-tax', label: 'Direct taxes paid (net of refunds)',id:'tax'  },
        { key: 'cf-op-total', label: 'Net cash generated from operations (A)',isSubtotal:true,formula :['cgo','+','tax'] ,id:'totalA'},
        ]},
    { key: 'cf-inv', label: 'B. Cash flow from investing activities',  isSubtotal: true, children: [
        { key: 'cf-inv-capex', label: 'Purchase of property, plant and equipment, including CWIP and capital advances ',id:'capex', children:[
          { key: 'cf-inv-capex-ppe', label: 'Proceeds from sale of property, plant and equipment', id:'ppe'},
          { key: 'cf-inv-capex-cce', label: 'Other bank balances not considered as cash and cash equivalents',id:'cce'  },
          { key: 'cf-inv-capex-interest', label: 'Interest received',id:'inter'  },
        ]},
    { key: 'cf-op-cgo-total', label: 'Net cash (used in) from investing activities (B)', isSubtotal:true,id:'totalB'},
    ]},
    { key: 'cf-fin', label: 'C. Cash flow from financing activities',  isSubtotal: true, children: [
        { key: 'cf-fin-lib', label: 'Payment Towards Lease Liabilities ',id:'lib'  },
        { key: 'cf-fin-dividend', label: 'Payment of Dividend',id:'div'  },
        { key: 'cf-fin-total', label: 'Net cash used in financing activities (C)', isSubtotal:true,formula:['lib','+','div'] ,id:'totalC'},
    ]},
    
    { key: 'cf-foreign', label: 'Effect of exchange differences on restatement of foreign currency cash and cash equivalents', isSubtotal: true },
    { key: 'cf-net-total', label: 'Net increase in cash and cash equivalents (A+B+C)',isSubtotal:true,children:[
      { key: 'cf-net-total-prev', label: 'Cash and cash equivalents at the beginning of the year', },
    ]},
    { key: 'cf-cce-prev', label: 'Cash and cash equivalents at the end of the year (Refer note 11)',isSubtotal:true },
    { key: 'cf-cce', label: 'Components of cash and cash equivalents',isSubtotal:true,children:[
      { key: 'cf-cce-cih', label: 'Cash in hand', id:'cih'},
      { key: 'cf-cce-bank', label: 'Balances with banks',  },
      { key: 'cf-cce-current', label: '  (i) In current accounts', id:'cce' },
      { key: 'cf-cce-eefc', label: '  (ii) In EEFC accounts', id:'cce-eefc' },
      { key: 'cf-cce-fixed', label: '  (iii) Fixed deposits with maturity less than 3 months', id:'fixed' },
      { key: 'cf-cce-total', label: 'Total cash and cash equivalents',isSubtotal:true,formula:['cih','+','cce','+','cce-eefc','+','fixed']  },
    ]},
    
];
const ACCOUNTING_POLICIES_CONTENT: AccountingPolicy[] = [
    {
      title: '1. General Information',
      text: [
        'The Company is engaged in the manufacturing of industrial automation systems and trading of related products and customer services activities in India. It also provides certain technical services overseas.'
      ]
    },
    {
      title: '2. Summary of material accounting policies',
      text: [
        'a) Statement of compliance',
        'These financial statements have been prepared in accordance with Indian Accounting Standards ("Ind AS") notified under the Companies (Indian Accounting Standards) Rules, 2015 and relevant amendment rules issued thereafter.',
        'Accounting policies have been consistently applied except where a newly issued accounting standard is initially adopted or a revision to an existing accounting standard requires a change in the accounting policy hitherto in use.',
        'b) Basis of accounting and presentation',
        'The financial statements have been prepared on the historical cost basis except for certain financial instruments that are measured at fair values at the end of each reporting period, as explained in the accounting policies below.',
        'Historical cost is generally based on the fair value of the consideration given in exchange for services.',
        'Fair value is the price that would be received to sell an asset or paid to transfer a liability in an orderly transaction between market participants at the measurement date, regardless of whether that price is directly observable or estimated using another valuation technique. In estimating the fair value of an asset or a liability, the Company takes into account the characteristics of the asset or liability if market participants would take those characteristics into account when pricing the asset or liability at the measurement date. Fair value for measurement and/or disclosure purposes in these standalone financial statements is determined on such a basis, except for measurements that have some similarities to fair value but are not fair valued, such as value in use quantification as per Ind AS 36.',
        'In addition, for financial reporting purposes, fair value measurements are categorised into Level 1, 2, or 3 based on the degree to which the inputs to the fair value measurements are observable and the significance of the inputs to the fair value measurement in its entirety, which are described as follows:',
        'Level 1 inputs are quoted prices (unadjusted) in active markets for identical assets or liabilities that the entity can access at the measurement date;',
        'Level 2 inputs are inputs, other than quoted prices included within Level 1, that are observable for the asset or liability, either directly or indirectly; and',
        'Level 3 inputs are unobservable inputs for the asset or liability.',
        'c) Use of estimates and judgements',
        'The following are significant management judgements and estimates in applying the accounting policies of the Company that have the most significant effect on the amounts recognized in the financial statements or that have a significant risk of causing a material adjustment to the carrying amounts of assets and liabilities within the next financial year.',
        'The preparation of the financial statements in conformity with the recognition and measurement principals of Ind AS requires the Management to make estimates and assumptions considered in the reported amounts of assets and liabilities and disclosure relating to contingent liabilities as at the date of financial statements and the reported amounts of income and expenditure during the reported year. The Management believes that the estimates used in preparation of the financial statements are prudent and reasonable. Future results could differ due to these estimates and the differences between the actual results and the estimates are recognised in the periods in which the results are known / materialise.',
        'Useful lives of property, plant and equipment',
        'The Company reviews the useful life of property, plant and equipment at the end of each reporting period. This reassessment may result in change in depreciation expense in future periods.',
        'Provision for income tax and valuation of deferred tax assets',
        "The Company's major tax jurisdiction is India. Significant judgement is involved in determining the provision for income taxes, including the amount expected to be paid or recovered in connection with uncertain tax positions.",
        'The extent to which deferred tax assets can be recognised is based on an assessment of the probability that future taxable income will be available against which the deductible temporary differences and tax loss carry forward can be utilised.',
        'Recoverability of advances / receivables',
        'At each balance sheet date, based on historical default rates observed over expected life, the management assesses the expected credit loss on outstanding receivables and advances.',
        'Employee Benefits',
        "The present value of the defined benefit obligations depends on a number of factors that are determined on an actuarial basis using a number of assumptions. The assumptions used in determining the net cost/(income) for pensions include the discount rate.",
        'Any changes in these assumptions will impact the carrying amount of pension obligations. The Company determines the appropriate discount rate at the end of each year. This is the interest rate that should be used to determine the present value of estimated future cash outflows expected to be required to settle the pension obligations. In determining the appropriate discount rate, ahe Company considers the interest rates of Government securities that are denominated in the currency in which the benefits will be paid and that have terms to maturity approximating the terms of the related pension obligation. Other key assumptions for pension obligations are based in part on current market conditions.',
        'Also refer Revenue Recognition (Note 2(i))',
        'd) Current versus non-current classification',
        'The Company presents assets and liabilities in the balance sheet based on current/ non-current classification.',
        'An asset is treated as current when it is:',
        '- Expected to be realized or intended to be sold or consumed in normal operating cycle;',
        '- Held primarily for the purpose of trading;',
        '- Expected to be realized within twelve months after the reporting period, or',
        '- Cash or cash equivalent unless restricted from being exchanged or used to settle a liability for at least twelve months after the reporting period',
        'All other assets are classified as non-current.',
        'A liability is current when:',
        '- It is expected to be settled in normal operating cycle;',
        '- It is held primarily for the purpose of trading;',
        '- It is due to be settled within twelve months after the reporting period, or',
        '- There is no unconditional right to defer the settlement of the liability for at least twelve months after the reporting period.',
        'All other liabilities are classified as non-current.',
        'The operating cycle is the time between the acquisition of assets for processing and their realization in cash and cash equivalents. The Company has evaluated and considered its operating cycle as 12 months.',
        'Deferred tax assets/ liabilities are classified as non-current assets/ liabilities.',
        'e) Property, plant and equipment',
        'Property, plant and equipment are stated at cost, less accumulated depreciation and impairment, if any. Costs directly attributable to acquisition are capitalised until the property, plant and equipment are ready for use, as intended by management.',
        'Advances paid towards the acquisition of property, plant and equipment outstanding at each balance sheet date is classified as capital advances under other non-current assets and the cost of assets not put to use before such date are disclosed under ‘Capital work-in-progress’. Subsequent expenditures relating to property, plant and equipment is capitalised only when it is probable that future economic benefits associated with these will flow to the company and the cost of the item can be measured reliably.',
        'The cost and related accumulated depreciation are eliminated from the financial statements upon sale or retirement of the asset and the resultant gains or losses are recognised in the Statement of Profit and Loss. Assets to be disposed off are reported at the lower of the carrying value or the fair value less cost to sell.',
        'The Company depreciates property, plant and equipment over their estimated useful lives using the straight-line method. The estimated useful lives of assets are as follows:',
        {
            type: 'table',
            headers: ['', 'Useful lives (in years)'],
            rows: [
                ['Building', '30 to 60'],
                ['Vehicles*', '6'],
                ['Plant and Machinery*', '5 to 15'],
                ["Furniture and fixtures and office equipment's*", '2 to 10'],
            ]
        },
        'Leasehold improvements are amortised over the duration of the lease',
        'Assets costing less than ₹ 10,000 each are fully depreciated in the year of capitalisation',
        '* Based on an internal assessment, the management believes that the useful lives as given above represents the period over which management expects to use the assets. Hence, the useful lives for these assets is different from the useful lives as prescribed under Part C of Schedule II of the Companies Act, 2013.',
        'Properties in the course of construction for production, supply or administrative purposes are carried at cost, less any recognised impairment loss. Cost includes professional fees and, for qualifying assets, borrowing costs capitalised in accordance with the accounting policy. Such properties are classified to the appropriate categories of property, plant and equipment when completed and ready for intended use. Depreciation of these assets, on the same basis as other property assets, commences when the assets are ready for their intended use.',
        'The Company has evaluated the applicability of component accounting as prescribed under Ind AS 16 and Schedule II of the Companies Act, 2013, the management has not identified any significant component having different useful lives. Schedule II requires the Company to identify and depreciate significant components with different useful lives separately.',
        'Depreciation methods, useful lives and residual values are reviewed periodically and updated as required, including at each financial year end.',
        'Land is measured at cost. As no finite useful life for land can be determined, related carrying amounts are not depreciated.',
        'f) Intangible assets',
        'Intangible assets are recorded at the consideration paid for the acquisition of such assets and are carried at cost less accumulated amortisation and impairment. Advances paid towards the acquisition of intangible assets outstanding at each Balance Sheet date are disclosed as other non-current assets and the cost of intangible assets not ready for their intended use before such date are disclosed as intangible assets under development.',
        'Intangible assets are amortised over their estimated useful life as follows:',
        {
            type: 'table',
            headers: ['Asset Category', 'Useful lives (in years)'],
            rows: [
                ['Computer Software', '3'],
            ]
        },
        'Gains or losses arising from derecognition of an intangible asset are measured as the difference between the net disposal proceeds and the carrying amount of the asset and are recognised in the Statement of Profit and Loss when the asset is derecognised.',
        'The residual values, useful lives and methods of amortization of intangible assets are reviewed at each financial year end and adjusted prospectively, if appropriate.',
        'g) Impairment of property, plant and equipment and intangible assets',
        'At each reporting date, the Company assesses whether there is any indication that an asset may be impaired, based on internal or external factors. If any such indication exists, the Company estimates the recoverable amount of the asset or the cash generating unit. If such recoverable amount of the asset or cash generating unit to which the asset belongs is less than its carrying amount, the carrying amount is reduced to its recoverable amount. The reduction is treated as an impairment loss and is recognised in the Statement of Profit and Loss. If, at the reporting date there is an indication that a previously assessed impairment loss no longer exists, the recoverable amount is reassessed and the asset is reflected at the recoverable amount. Impairment losses previously recognised are accordingly reversed in the Statement of Profit and Loss.',
        'h) Inventories',
        'Inventories are valued at the lower of cost on weighted average basis and the net realisable value after providing for obsolescence and other losses, where considered necessary. Cost includes all charges in bringing the goods to the point of sale, including octroi and other levies, transit insurance and receiving charges. Work-in-progress and finished goods include appropriate proportion of overheads.',
        'i) Revenue recognition',
        'The Company applies Ind AS 115 “Revenue from Contracts with Customers”.',
        'The Company recognises revenue from contracts with customers when it satisfies a performance obligation by transferring promised goods or services to a customer. The revenue is recognised to the extent of transaction price allocated to the performance obligation satisfied. Performance obligation is satisfied over time when the transfer of control of asset (good or service) to a customer is done over time and in other cases, performance obligation is satisfied at a point in time. For performance obligation satisfied over time, the revenue recognition is done by measuring the progress towards complete satisfaction of performance obligation. The progress is measured in terms of a proportion of actual cost incurred to-date, to the total estimated cost attributable to the performance obligation.',
        'Transaction price is the amount of consideration to which the Company expects to be entitled in exchange for transferring good or service to a customer excluding amounts collected on behalf of a third party. Variable consideration is estimated using the expected value method or most likely amount as appropriate in a given circumstance. Payment terms agreed with a customer are as per business practice and there is no financing component involved in the transaction price. Incremental costs of obtaining a contract, if any, and costs incurred to fulfil a contract are amortised over the period of execution of the contract in proportion to the progress measured in terms of a proportion of actual cost incurred to-date, to the total estimated cost attributable to the performance obligation.',
        'Significant judgments are used in:',
        '1. Determining the revenue to be recognised in case of performance obligation satisfied over a period of time; revenue recognition is done by measuring the progress towards complete satisfaction of performance obligation. The progress is measured in terms of a proportion of actual cost incurred to-date, to the total estimated cost attributable to the performance obligation. Judgement is involved in determining the total estimated cost.',
        '2. Determining the expected losses, which are recognised in the period in which such losses become probable based on the expected total contract cost as at the reporting date.',
        '(i) Revenue from operations',
        'Revenue presented is exclusive of goods and service tax (GST). Revenue also includes adjustments made towards liquidated damages and variation wherever applicable. Escalation and other claims, which are not ascertainable/ acknowledged by customers are not taken into account.',
        'A . Revenue from sale of goods is recognised as follows:',
        'Revenue from sale of manufactured and traded goods is recognised when the control of the same is transferred to the customer and it is probable that the Company will collect the consideration to which it is entitled for the exchanged goods.',
        'B. Revenue from construction/project related activity is recognised as follows:',
        '1. Fixed price contracts: Contract revenue is recognised over time to the extent of performance obligation satisfied and control is transferred to the customer. Contract revenue is recognised at allocable transaction price which represents the cost of work performed on the contract plus proportionate margin, using the percentage of completion method. Percentage of completion is the proportion of cost of work performed to-date, to the total estimated contract costs.',
        'Impairment loss (termed as provision for construction contracts in the financial statements) is recognized in profit or loss to the extent the carrying amount of the contract asset exceeds the remaining amount of consideration that the company expects to receive towards remaining performance obligations (after deducting the costs that relate directly to fulfil such remaining performance obligations).',
        'For contracts where the aggregate of contract cost incurred to date plus recognised profits (or minus recognised losses as the case may be) exceeds the progress billing, the surplus is shown as contract asset and termed as “Unbilled Receivable”. For contracts where progress billing exceeds the aggregate of contract costs incurred to-date plus recognised profits (or minus recognised losses, as the case may be), the surplus is shown as contract liability and termed as"" Unearned revenue"". Amounts received before the related work is performed are disclosed in the Balance Sheet as contract liability and termed as “Advances from customer”. The amounts billed on customer for work performed and are unconditionally due for payment i.e. only passage of time is required before payment falls due, are disclosed in the Balance Sheet as trade receivables.',
        'Revenue from services',
        'Revenue from rendering of services is recognised over time as and when the customer receives the benefit of the company’s performance and the Company has an enforceable right to payment for services transferred. Unbilled revenue represents value of services performed in accordance with the contract terms but not billed.',
        'Interest income:',
        'Interest income is reported on an accrual basis using the effective interest method and is included under the head “other income” in the Statement of Profit and Loss.',
        'j) Employee benefits',
        'Expenses and liabilities in respect of employee benefits are recorded in accordance with Ind AS 19, Employee Benefits.',
        'Defined contribution plan',
        "The Company's contribution to provident fund, and employee state insurance scheme contributions are considered as defined contribution plans and are charged as an expense based on the amount of contribution required to be made and when services are rendered by the employees.",
        'Overseas social security',
        'The Company contributes to social security charges of countries to which the Company deputes its employees on employment or has permanent employees. The plans are defined contribution plan and contributions paid or payable is recognised as an expense in these periods in which the employee renders services in those respective countries.',
        'Defined benefit plan',
        'Gratuity',
        'The liability or asset recognised in the balance sheet in respect of defined benefit gratuity plans is the present value of the defined benefit obligation at the end of the reporting period less the fair value of plan assets (if any). The cost of providing benefits under the defined benefit plan is determined using the projected unit credit method.',
        'The present value of the defined benefit obligation denominated in ₹ is and determined by discounting the estimated future cash outflows by reference to market yields at the end of the reporting period on government bonds that have terms approximating to the terms of the related obligation.',
        "Service cost on the Company's defined benefit plan is included in employee benefits expense. Employee contributions, all of which are independent of the number of years of service, are treated as a reduction of service cost.",
        'Gains and losses through re-measurements of the defined benefit plans are recognized in other comprehensive income, which are not reclassified to profit or loss in a subsequent period. Further, as required under Ind AS compliant Schedule III, the Company transfers those amounts recognized in other comprehensive income to retained earnings in the statement of changes in equity and in the balance sheet.',
        'Short-term employee benefits',
        'The undiscounted amount of short-term employee benefits expected to be paid in exchange for the services rendered by employees are recognised during the year when the employees render the service. These benefits include performance incentive and compensated absences which are expected to occur within twelve months after the end of the period in which the employee renders the related service. The cost of such compensated absences is accounted as under :',
        '(a) in case of accumulated compensated absences, when employees render the services that increase their entitlement of future compensated absences; and',
        '(b) in case of non-accumulating compensated absences, when the absences occur.',
        'Long-term employee benefits',
        'Compensated absences which are not expected to occur within twelve months after the end of the period in which the employee renders the related service are recognised as a liability at the present value of the defined benefit obligation as at the Balance Sheet date less the fair value of the plan assets out of which the obligations are expected to be settled. Long Service Awards are recognised as a liability at the present value of the defined benefit obligation as at the Balance Sheet date.',
        'k) Leases',
        'I. Company as lessee',
        "The Company's lease asset classes primarily consist of leases for buildings. The Company, at the inception of a contract, assesses whether the contract is a lease or not lease. A contract is, or contains, a lease if the contract conveys the right to control the use of an identified asset for a time in exchange for a consideration. This policy has been applied to contracts existing and entered into on or after April 1, 2019.",
        'The Company recognises a right-of-use asset and a lease liability at the lease commencement date. The right-of-use asset is initially measured at cost, which comprises the initial amount of the lease liability adjusted for any lease payments made at or before the commencement date, plus any initial direct costs incurred and an estimate of costs to dismantle and remove the underlying asset or to restore the underlying asset or the site on which it is located, less any lease incentives received.',
        'The right-of-use asset is subsequently depreciated using the straight-line method from the commencement date to the end of the lease term.',
        "The lease liability is initially measured at the present value of the lease payments that are not paid at the commencement date, discounted using the  Company's incremental borrowing rate. It is remeasured when there is a change in future lease payments arising from a change in an index or rate, if there is a change in the Company's estimate of the amount expected to be payable under a residual value guarantee, or if the Company changes its assessment of whether it will exercise a purchase, extension or termination option. When the lease liability is remeasured in this way, a corresponding adjustment is made to the carrying amount of the right-of-use asset, or is recorded in profit or loss if the carrying amount of the right-of-use asset has been reduced to zero.",
        'The Company has elected not to recognise right-of-use assets and lease liabilities for short-term leases that have a lease term of 12 months or less . The Company recognises the lease payments associated with these leases as an expense over the lease term.',
        'II. Company as lessor',
        'The Company entered into leasing arrangements as a lessor for certain equipment to its customer. Leases for which the Company is a lessor are classified as finance or operating leases. Whenever the terms of the lease transfer substantially all the risks and rewards of ownership to the lessee, the contract is classified as a finance lease. All other leases are classified as operating leases.',
        'Rental income from operating leases is recognised on a straight-line basis over the term of the relevant lease. Initial direct costs incurred in negotiating and arranging an operating lease are added to the carrying amount of the leased asset and recognised on a straight-line basis over the lease term.',
        "Amounts due from lessees under finance leases are recognised as receivables at the amount of the Company's net investment in the leases. Finance lease income is allocated to accounting periods so as to reflect a constant periodic rate of return on the Company's net investment outstanding in respect of the leases.",
        'Subsequent to initial recognition, the Company regularly reviews the estimated unguaranteed residual value and applies the impairment requirements of Ind AS 109, recognising an allowance for expected credit losses on the lease receivables.',
        'Finance lease income is calculated with reference to the gross carrying amount of the lease receivables, except for credit-impaired financial assets for which interest income is calculated with reference to their amortised cost (i.e. after a deduction of the loss allowance).',
        'l) Foreign currency transactions',
        'Functional and presentation currency',
        'The functional currency of the Company is the Indian Rupee. These financial statements are presented in Indian Rupees (₹)',
        'Transactions and balances',
        '- Foreign currency transactions are translated into the functional currency using the exchange rates at the dates of the transactions. Foreign exchange gains and losses resulting from the settlement of such transactions and from the translation of monetary assets and liabilities denominated in foreign currencies at year end exchange rates are generally recognised in Statement of Profit or Loss. They are deferred in equity if they relate to qualifying cash flow hedges and qualifying net investment hedges or are attributable to part of the net investment in a foreign operation. A monetary item for which settlement is neither planned nor likely to occur in the foreseeable future is considered as a part of the entity’s net investment in that foreign operation.',
        '- Foreign exchange differences regarded as an adjustment to borrowing costs are presented in the Statement of Profit and Loss, within finance costs. All other foreign exchange gains and losses are presented in the Statement of Profit and Loss on a net basis within other gains/(losses).',
        '- Non-monetary items that are measured at fair value in a foreign currency are translated using the exchange rates at the date when the fair value was determined. Translation differences on assets and liabilities carried at fair value are reported as part of the fair value gain or loss.',
        'm) Borrowing costs',
        'Borrowing costs directly attributable to the acquisition, construction or production of an asset that necessarily takes a substantial period of time to get ready for its intended use or sale are capitalised as part of the cost of the asset. All other borrowing costs are expensed in the period in which they occur. Borrowing costs consist of interest and other costs that an entity incurs in connection with the borrowing of funds. Borrowing cost also includes exchange differences to the extent regarded as an adjustment to the borrowing costs.',
        'n) Income taxes',
        'Income tax expense comprises current and deferred income tax. Current and deferred tax is recognised in the Statement of Profit and Loss, except to the extent that it relates to items recognised in other comprehensive income or directly in equity. In this case, the tax is also recognised in other comprehensive income or directly in equity, respectively.',
        'Current income tax for current and prior periods is recognised at the amount expected to be paid to or recovered from the tax authorities, using the tax rates and tax laws that have been enacted or substantively enacted by the Balance Sheet date.',
        'Deferred tax is recognized on temporary differences at the balance sheet date between the tax bases of assets and liabilities and their carrying amounts for financial reporting purposes, except when the deferred income tax arises from the initial recognition of goodwill or an asset or liability in a transaction that is not a business combination and affects neither accounting nor taxable profit or loss at the time of the transaction.',
        'Deferred income tax assets are recognized for all deductible temporary differences, carry forward of unused tax credits and unused tax losses, to the extent that it is probable that taxable profit will be available against which the deductible temporary differences, and the carry forward of unused tax credits and unused tax losses can be utilized.',
        'The carrying amount of deferred tax assets is reviewed at each reporting date and reduced to the extent that it is no longer probable that sufficient taxable profit will be available to allow all or part of the deferred tax asset to be utilised. Unrecognised deferred tax assets are re-assessed at each reporting date and are recognised to the extent that it has become probable that future taxable profits will allow the deferred tax asset to be recovered.',
        'Deferred tax relating to items is recognised outside profit or loss (either in other comprehensive income or in equity). Deferred tax items are recognised in correlation to the underlying transaction either in other comprehensive income or directly in equity.',
        'Deferred income tax assets and liabilities are measured using tax rates and tax laws that have been enacted or substantively enacted by the Balance Sheet date and are expected to apply to taxable income in the years in which those temporary differences are expected to be recovered or settled. The effect of changes in tax rates on deferred income tax assets and liabilities is recognised as income or expense in the period that includes the enactment or the substantive enactment date. A deferred income tax asset is recognised to the extent that it is probable that future taxable profit will be available against which the deductible temporary differences and tax losses can be utilised. The Company offsets current tax assets and current tax liabilities, where it has a legally enforceable right to setoff the recognised amounts and where it intends either to settle on a net basis, or to realise the asset and settle the liability simultaneously.',
        'MAT payable for a year is charged to the statement of profit and loss as current tax. The Company recognizes MAT credit available as an asset only to the extent that there is convincing evidence that the Company will pay normal income tax during the specified period, i.e., the period for which MAT credit is allowed to be carried forward. In the year in which the Company recognizes MAT credit as an asset in accordance with the Guidance Note on Accounting for Credit Available in respect of Minimum Alternative Tax under the Income-tax Act, 1961, the said asset is created by way of credit to the statement of profit and loss and shown as ‘MAT Credit Entitlement’ under Deferred Tax. The Company reviews the same at each reporting date and writes down the asset to the extent the Company does not have convincing evidence that it will pay normal tax during the specified period.',
        'o) Provisions and contingencies',
        'Provisions',
        'A provision is recognised if, as a result of a past event, the Company has a present legal or constructive obligation that is reasonably estimable, and it is probable that an outflow of economic benefits will be required to settle the obligation. If the effect of the time value of money is material, provisions are determined by discounting the expected future cash flows at a pre-tax rate that reflects current market assessments of the time value of money and the risks specific to the liability. The increase in the provision due to the passage of time is recognised as interest expense.',
        'Contingent liabilities',
        'A contingent liability is a possible obligation that arises from past events whose existence will be confirmed by the occurrence or non-occurrence of one or more uncertain future events not wholly within the control of the Company or a present obligation that is not recognised because it is not probable that an outflow of resources will be required to settle the obligation or it cannot be measured with sufficient reliability. The Company does not recognise a contingent liability but discloses its existence in the financial statements.',
        'Contingent assets',
        'Contingent assets are neither recognised nor disclosed. However, when realisation of income is virtually certain, related asset is recognised.',
        'Onerous contracts',
        'Present obligations arising under onerous contracts are recognised and measured as provisions. An onerous contract is considered to exist where the Company has a contract under which the unavoidable costs of meeting the obligations under the contract exceed the economic benefits expected to be received from the contract.',
        'Provision for Product Support',
        'The estimated liability for product warranties is recorded when products are sold. These estimates are established using historical information on the nature, frequency and average cost of warranty claims and management estimates regarding possible future incidence based on corrective actions on product failures. The timing of outflows will vary as and when warranty claim will arise.  Generally, warranty ranges from 12 to 36 months.',
        'As per the terms of the contracts, the Company provides post-contract services / warranty support to some of its customers. The Company accounts for the post-contract support / provision for warranty on the basis of the information available with the management duly taking into account the current and past technical estimates.',
        'p) Financial instruments',
        'Financial assets and financial liabilities are recognised when the Company becomes a party to the contractual provisions of the instruments. Financial assets and financial liabilities are initially measured at fair value. Transaction costs that are directly attributable to the acquisition or issue of financial assets and financial liabilities (other than financial assets and financial liabilities at fair value through profit or loss) are added to or deducted from the fair value of the financial assets or financial liabilities, as appropriate, on initial recognition. Transaction costs directly attributable to the acquisition of financial assets or financial liabilities at fair value through profit or loss are recognised immediately in Statement of Profit and Loss.',
        'All recognised financial assets are subsequently measured in their entirety at either amortised cost or fair value, depending on the classification of the financial assets.',
        'a) Financial assets',
        'Cash and Cash equivalents',
        'Cash comprises cash on hand and demand deposits with banks. Cash equivalents are short-term balances (with an original maturity of three months or less from the date of acquisition), highly liquid investments that are readily convertible into known amounts of cash and which are subject to insignificant risk of changes in value. ',
        'Financial assets at amortised cost',
        'Financial assets are subsequently measured at amortised cost if these financial assets are held within a business model whose objective is to hold these assets in order to collect contractual cash flows and contractual terms of financial asset give rise on specified dates to cash flows that are solely payments of principal and interest on the principal amount outstanding.',
        'Financial Assets at fair value through other comprehensive Income (FVTOCI)',
        'Financial assets are measured at fair value through other comprehensive income if these financial assets are held within business model whose objective is achieved by both collecting contractual cash flows on specified dates that are solely payments of principal and interest on the principal amount outstanding and selling financial assets.',
        'Financial assets at fair value through profit or loss (FVTPL)',
        'Financial assets are measured at fair value through profit or loss unless it measured at amortised cost or fair value through other comprehensive income on initial recognition. The transaction cost directly attributable to the acquisition of financial assets and liabilities at fair value through profit or loss are immediately recognised in the Statement of Profit and Loss.',
        'Impairment and derecognition of financial assets:',
        'The Company derecognises a financial asset when the contractual rights to the cash flows from the asset expire, or when it transfers the financial asset and substantially all the risks and rewards of the ownership of the asset to another party. On derecognition of a financial asset in its entirety, the difference between the asset carrying amount and the sum of the consideration received and receivable is recognised in profit or loss.',
        'The Company applies expected credit loss model for recognising impairment loss on financial assets measured at amortised cost, trade receivables, other contractual rights to receive cash or other financial asset. The Company is identifying the specific amounts of financial assets which has become bad during the year and providing the credit loss.',
        'b) Financial liabilities and Equity:',
        'Financial liabilities at amortised cost',
        'Financial liabilities are measured at amortised cost using effective interest method. For trade and other payables maturing within one year from the Balance Sheet date, the carrying amounts approximate fair value due to the short maturity of these instruments.',
        'Equity Instrument:',
        'An equity instrument is a contract that evidences residual interest in the assets of the company after deducting all of its liabilities. Equity instruments recognised by the Company are recognised at the proceeds received net off direct issue cost.',
        'Derecognition of financial liabilities',
        "The Company derecognises financial liabilities when, and only when, the Company's obligations are discharged, cancelled or have expired. The difference between the carrying amount of the financial liability derecognised and the consideration paid and payable is recognised in profit or loss.",
        'Accounting Policy on Foreign Exchange Management',
        'The Company manages its exposure to foreign exchange rate risks through natural hedging and would enter into derivative contracts including foreign exchange forward contracts, if considered necessary. Derivatives are initially recognized at fair value on the date a derivative contract is entered into and are subsequently re-measured to their fair value at the end of each reporting period. The resulting gain or loss is recognized in the profit or loss.',
        'Offsetting of financial instruments',
        'Financial assets and financial liabilities are offset and the net amount is reported in the Balance Sheet if there is a currently enforceable legal right to offset the recognised amounts and there is an intention to settle on a net basis, to realise the assets and settle the liabilities simultaneously.',
        'q) Impairment of financial assets',
        'In accordance with Ind AS 109 Financial Instruments, the Company applies expected credit loss (ECL) model for measurement and recognition of impairment loss for financial assets.',
        'ECL is the difference between all contractual cash flows that are due to the Company in accordance with the contract and all the cash flows that the entity expects to receive (i.e., all cash shortfalls), discounted at the original EIR. When estimating the cash flows, an entity is required to consider:',
        '- All contractual terms of the financial instrument over the expected life of the financial instrument. However, in rare cases when the expected life of the financial instrument cannot be estimated reliably, then the entity is required to use the remaining contractual term of the financial instrument.',
        '- Cash flows from the sale of collateral held or other credit enhancements that are integral to the contractual terms.',
        'Trade receivables',
        'The Company applies approach permitted by Ind AS 109 Financial Instruments, which requires expected lifetime losses to be recognised from initial recognition of receivables.',
        'Other financial assets',
        'For recognition of impairment loss on other financial assets and risk exposure, the Company determines whether there has been a significant increase in the credit risk since initial recognition and if credit risk has increased significantly, impairment loss is provided.',
        'r) Fair value measurement',
        'Fair value is the price that would be received to sell an asset or paid to transfer a liability in an orderly transaction between market participants at the measurement date. The fair value measurement is based on the presumption that the transaction to sell the asset or transfer the liability takes place either:',
        '- In the principal market for the asset or liability, or',
        '- In the absence of a principal market, in the most advantageous market for the asset or liability',
        'The principal or the most advantageous market must be accessible by the Company.',
        'The fair value of an asset or a liability is measured using the assumptions that market participants would use when pricing the asset or liability, assuming that market participants act in their economic best interest.',
        'A fair value measurement of a non-financial asset takes into account a market participant’s ability to generate economic benefits by using the asset in its highest and best use or by selling it to another market participant that would use the asset in its highest and best use.',
        'The Company uses valuation techniques that are appropriate in the circumstances and for which sufficient data are available to measure fair value, maximising the use of relevant observable inputs and minimising the use of unobservable inputs.',
        'All assets and liabilities for which fair value is measured or disclosed in the financial statements are categorised within the fair value hierarchy, described as follows, based on the lowest level input that is significant to the fair value measurement as a whole:',
        'Level 1 - Quoted (unadjusted) market prices in active markets for identical assets or liabilities.',
        'Level 2 - Valuation techniques for which the lowest level input that is significant to the fair value measurement is directly or indirectly observable.',
        'Level 3 - Valuation techniques for which the lowest level input that is significant to the fair value measurement is unobservable.',
        's) Cash and cash equivalents',
        'Cash and cash equivalents for the purpose of presentation in the statement of cash flows comprises of cash at bank and in hand, bank overdraft and short term highly liquid investments/ bank deposits with an original maturity of three months or less that are readily convertible to known amounts of cash and are subject to an insignificant risk of changes in value.',
        't) Segment Reporting',
        'Operating segments are reported in a manner consistent with the internal reporting provided to the Chief Operating Decision Maker. The Company is engaged in the manufacturing of industrial automation system which broadly forms part of one product group and hence constitute a single business segment.',
        'u) Exceptional Items',
        'Exceptional items are disclosed separately in the financial statements where it is necessary to do so to provide further understanding of the financial performance of the Company. These are material items of income or expense that have to be shown separately due to their nature or incidence.',
        'v) Events after the reporting period.',
        'Adjusting events are events that provide further evidence of conditions that existed at the end of the reporting period. The financial statements are adjusted for such events before authorisation for issue.',
        'Non-adjusting events are events that are indicative of conditions that arose after the end of the reporting period. Non-adjusting events after the reporting date are not accounted, but disclosed.',
        'w) Earnings/ (Loss) per Share (EPS)',
        'Basic EPS are calculated by dividing the net profit or loss for the period attributable to equity shareholders by the weighted average number of equity shares outstanding during the period. Partly paid equity shares are treated as a fraction of an equity share to the extent that they are entitled to participate in dividends relative to a fully paid equity share during the reporting period. The weighted average number of equity shares outstanding during the period is adjusted for events such as bonus issue, bonus element in a rights issue to existing shareholders, share split and reverse share split (consolidation of shares)  that have changed the number of equity shares outstanding, without a corresponding change in resources.',
        'Diluted EPS amounts are calculated by dividing the profit attributable to equity holders of the Company (after adjusting for interest on the convertible preference shares, if any) by the weighted average number of equity shares outstanding during the year plus the weighted average number of equity shares that would be issued on conversion of all the dilutive potential equity shares into equity shares. Dilutive potential equity shares are deemed converted as of the beginning of the period, unless issued at a later date. Dilutive potential equity shares are determined independently for each period presented.',
        'x) Cash flow statement',
        'Cash flows are reported using the indirect method, whereby profit / (loss) before extraordinary items and tax is adjusted for the effects of transactions of non-cash nature and any deferrals or accruals of past or future cash receipts or payments. The cash flows from operating, investing and financing activities of the Company are segregated based on the available information.'
      ]
    },
];
// --- 4. CORE DATA PROCESSING HOOK (FIXED) ---
const useFinancialData = (rawData: MappedRow[], editedNotes: FinancialNote[] | null): FinancialData => {
  return useMemo(() => {
    const enrichedData = rawData.map(row => ({ ...row, amountCurrent: row.amountCurrent || 0, amountPrevious: row.amountPrevious || 0 }));

const getAmount = (
  year: 'amountCurrent' | 'amountPrevious',
  level1Keywords?: string[],   // Allow undefined safely
  level2Keywords?: string[]
): number => {
  if (!Array.isArray(level1Keywords) || level1Keywords.length === 0) {
    return 0;  // Nothing to match => safe early return
  }

  return enrichedData.reduce((sum, row) => {
    const level1Desc = (row['Level 1 Desc'] || '').toLowerCase();
    const level2Desc = (row['Level 2 Desc'] || '').toLowerCase();

    const level1Match = level1Keywords.some(kw => level1Desc.includes(kw));
    if (!level1Match) {
      return sum;
    }

    const level2Match = !level2Keywords || (level2Keywords.length > 0 && level2Keywords.some(kw => level2Desc.includes(kw)));

    if (level2Match) {
      return sum + (row[year] ?? 0);
    }

    return sum;
  }, 0);
  
};


const getValueForKey = (
  noteKey: number,
  itemKey: string
): { valueCurrent: number | null; valuePrevious: number | null } => {
  const editedNote = editedNotes?.find((n) => n.noteNumber === noteKey);
  if (!editedNote) return { valueCurrent: null, valuePrevious: null };

  const findItem = (items: (HierarchicalItem | TableContent | string)[]): { valueCurrent: number | null; valuePrevious: number | null } => {
    for (const item of items) {
      if (typeof item !== 'string' && 'key' in item && item.key === itemKey) {
        return {
          valueCurrent: item.valueCurrent != null ? Number(item.valueCurrent) : null,
          valuePrevious: item.valuePrevious != null ? Number(item.valuePrevious) : null,
        };
      }
      if (typeof item !== 'string' && 'children' in item && item.children) {
        const childValue = findItem(item.children);
        if (childValue.valueCurrent !== null || childValue.valuePrevious !== null) {
          return childValue;
        }
      }
    }
    return { valueCurrent: null, valuePrevious: null };
  };

  return findItem(editedNote.content);
};


  const totals = new Map<string, { current: number, previous: number }>();

const calculateNote3 = (): FinancialNote => {
  const calculateRowTotal = (row: string[]): string => {
  const sum = row
    .slice(0, 7)
    .reduce((acc, val) => acc + (parseFloat(val.replace(/,/g, '')) || 0), 0);
  return sum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const parseNum = (val: string): number => parseFloat(val.replace(/,/g, '')) || 0;
const calculateBalance = (rows: string[][]): string[] => {
  const result: number[] = [];

  for (let i = 0; i < 7; i++) {
    const colSum = rows.reduce((sum, row) => sum + parseNum(row[i]), 0);
    result.push(colSum);
  }

  const total = result.reduce((sum, val) => sum + val, 0);
  return [...result.map(val =>
    val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  ), total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })];
};
const calculateDifference = (row1: string[], row2: string[]): string[] => {
  const diff: number[] = [];

  for (let i = 0; i < 8; i++) {
    const val1 = parseNum(row1[i]);
    const val2 = parseNum(row2[i]);
    diff.push(val1 - val2);
  }

  return diff.map(val =>
    val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
};



const Freehold = ['142.27', '2,411.58', '2,766.65', '282.41', '131.19', '1,901.19', '535.75'];
Freehold.push(calculateRowTotal(Freehold));
const add = ['', '', '269.96', '114.29', '81.47', '101.44', '130.08'];
add.push(calculateRowTotal(add));
const disposals = ['', '-17.29', '', '-61.63', '-86.25', '', ''];
disposals.push(calculateRowTotal(disposals));
const adj = ['', '', '', '', '155.74', '', ''];
adj.push(calculateRowTotal(adj));
const balance = calculateBalance([Freehold, add, disposals, adj]);

const add1 = ['', '2,185.22', '1,241.99', '249.57', '1.97', '1,383.28', '610.70'];
add1.push(calculateRowTotal(add1));
const disposals1 = ['', '-58.47', '-190.66', '', '-80.54', '-305.60', ''];
disposals1.push(calculateRowTotal(disposals1));
const adj1 = ['', '', '', '', '', '', ''];
adj1.push(calculateRowTotal(adj1));
const balance1 = calculateBalance([balance,add1, disposals1, adj1]);

const april =['','658.92','1350.77','221.08','56.78','1718.58','388.02'];
april.push(calculateRowTotal(april));
const expense =['','108.18','200.23','25.25','18.58','211.74','46.24'];
expense.push(calculateRowTotal(expense));
const assets =['','-4.90','','-61.63','-76.64','',''];
assets.push(calculateRowTotal(assets));
const adj2 =['','','','','155.74','',''];
adj2.push(calculateRowTotal(adj2));
const balance2 = calculateBalance([april,expense, assets, adj2]);

const expense1 =['','148.46','259.62','68.93','18.00','255.27','87.66'];
expense1.push(calculateRowTotal(expense1));
const assets1 =['','-33.41','-167.12','','-58.65','-305.60',''];
assets1.push(calculateRowTotal(assets1));
const adj3 =['','','','','','',''];
adj3.push(calculateRowTotal(adj3));
const balance3 = calculateBalance([balance2,expense1, assets1, adj3]);
const balance4 = calculateDifference(balance, balance2);
const balance5 = calculateDifference(balance1, balance3);


const cwipInProgressAdd: string[] = ['436.98', '', '', ''];
cwipInProgressAdd.push(calculateRowTotal(cwipInProgressAdd));
const cwipInProgressDeduct: string[] = ['-1,650.86', '-324.43', '-1,200.96', '-132.83'];
cwipInProgressDeduct.push(calculateRowTotal(cwipInProgressDeduct));

const cwipInCompletedAdd: string[] =['436.98','','','']
cwipInCompletedAdd.push(calculateRowTotal(cwipInCompletedAdd));
const cwipInCompletedDeduct: string[] =['-3309.08','','','']
cwipInCompletedDeduct.push(calculateRowTotal(cwipInCompletedDeduct));

  return {
    noteNumber: 3,
    title: 'Property, plant and equipment (PPE)',
    totalCurrent: 0, // Replace with calculated value if available
    totalPrevious: 0,
    footer:'Note : Figures in brackets relate to previous year.',
    content: [
      {
        type: 'table',
        headers: [
          '',
          'Freehold land (Refer Note b)',
          'Buildings (Refer Note b)',
          'Plant and equipment',
          'Furniture and fixtures',
          'Vehicles',
          'Office equipment',
          'Leasehold improvements',
          'Total'
        ],
        rows: [
          ['Gross carrying amount'],
          ['Balance as at 1 April 2022', ...Freehold],
          ['Additions', ...add],
          ['Disposals', ...disposals],
          ['Adjustments', ...adj],
          ['Balance as at 31 March 2023', ...balance],
          ['Additions', ...add1],
          ['Disposals', ...disposals1],
          ['Adjustments', ...adj1],
          ['Balance as at 31 March 2024', ...balance1],
          ['Accumulated depreciation'] ,
          ['Balance as at 1 April 2022',...april],
          ['Depreciation expense',...expense],
          ['Eliminated on disposal of assets',...assets],
          ['Adjustments', ...adj2],
          ['Balance as at 31 March 2023', ...balance2],
          ['Depreciation expense',...expense1],
          ['Eliminated on disposal of assets',...assets1],
          ['Adjustments', ...adj3],
          ['Balance as at 31 March 2024', ...balance3],
          ['Net carrying amount'],
          ['As at 31 March 2023',...balance4],
          ['As at 31 March 2024',...balance5],

        ]
      },
     {
        key: 'note3-Contractual',
        label: 'Contractual obligations',
        valueCurrent: null,
        valuePrevious: null,
        isSubtotal: true,
      },
      'a) Unless otherwise stated all the assets are owned by the Company and none of the assets have been given on operating lease by the Company.',
      'b) Charge as on 31 March 2023 ₹1,774.36 lakhs towards Freehold land and buildings has been released during the year. ',
      {
        key: 'note3-Capital',
        label: 'Capital Work-in-Progress',
        valueCurrent: null,
        valuePrevious: null,
        isSubtotal: true,
      },
      'The capital work-in-progress ageing schedule for the year ended 31 March 2024 is as follows:', 
      {
        type: 'table',
        headers: [
          '\nCWIP',
          'Amount in capital work-in-progress for a period of\nLess than 1 year',
          'Amount in capital work-in-progress for a period of\n1-2 years',
          'Amount in capital work-in-progress for a period of\n2-3 years',
          'Amount in capital work-in-progress for a period of\nMore than 3 years',
          '\nTotal',
        ],
        rows: [
          ['Projects in progress',...cwipInProgressAdd],
          ['',...cwipInProgressDeduct],
          ['Total as on 31 March 2024',...cwipInProgressAdd],
          ['Total as on 31 March 2023',...cwipInProgressDeduct],
        ]
      },
      'There is no such case, wherein Capital-work-in progress, whose completion is overdue or has exceeded its cost compared to its original plan.',
  
      'The capital work-in-progress completion schedule for the year ended 31 March 2024 is as follows:',
      {
        type: 'table',
        headers: [
          '\nCWIP',
          'To be completed in\nLess than 1 year',
          'To be completed in\n1-2 years',
          'To be completed in\n2-3 years',
          'To be completed in\nMore than 3 years',
          '\nTotal',
        ],
        rows: [
          ['Projects in progress',...cwipInCompletedAdd],
          ['',...cwipInCompletedDeduct],
          ['Total as on 31 March 2024',...cwipInCompletedAdd],
          ['Total as on 31 March 2023',...cwipInCompletedDeduct],
        ]
      },  
    ]
  };
};
const calculateNote4 = (): FinancialNote => {
  const calculateRowTotal = (row: string[]): string => {
  const sum = row
    .slice(0, 4)
    .reduce((acc, val) => acc + (parseFloat(val.replace(/,/g, '')) || 0), 0);
  return sum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const parseNum = (val: string | undefined): number => {
  if (!val) return 0;
  return parseFloat(val.replace(/[(),]/g, '')) || 0;
};

const calculateBalance = (rows: string[][]): string[] => {
  const result: number[] = [];
  for (let i = 0; i < 3; i++) {
    const colSum = rows.reduce((sum, row) => sum + parseNum(row[i]), 0);
    result.push(colSum);
  }
  return result.map(val =>
    val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
};

const calculateDifference = (row1: string[], row2: string[]): string[] => {
  const result: number[] = [];
  for (let i = 0; i < 3; i++) {
    const val1 = parseNum(row1[i]);
    const val2 = parseNum(row2[i]);
    result.push(val1 - val2);
  }
  return result.map(val =>
    val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
};

const calculateBalance2 = (rows: string[][]): string[] => {
  const result: number[] = [];
  for (let i = 0; i < 1; i++) {
    const colSum = rows.reduce((sum, row) => sum + parseNum(row[i]), 0);
    result.push(colSum);
  }
  return result.map(val =>
    val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
};

const calculateDifference2 = (row1: string[], row2: string[]): string[] => {
  const result: number[] = [];
  for (let i = 0; i < 1; i++) {
    const val1 = parseNum(row1[i]);
    const val2 = parseNum(row2[i]);
    result.push(val1 - val2);
  }
  return result.map(val =>
    val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
};


const april = ['3173.29','37.33'];
april.push(calculateRowTotal(april));
const add = ['871.32',''];
add.push(calculateRowTotal(add));
const adj = ['',''];
adj.push(calculateRowTotal(adj));
const balance = calculateBalance([april,add,adj]);

const add1 = ['2266.37',''];
add1.push(calculateRowTotal(add1));
const del =['-267.12',''];
del.push(calculateRowTotal(del));
const balance1 = calculateBalance([balance,add1,del]);

const april1 = ['1984.42','37.33'];
april1.push(calculateRowTotal(april1));
const amort = ['479.54',''];
amort.push(calculateRowTotal(amort));
const elm = ['',''];
elm.push(calculateRowTotal(elm));
const balance2 = calculateBalance([april1,amort,elm]);

const amort1 = ['805.15',''];
amort1.push(calculateRowTotal(amort1));
const balance3 = calculateBalance([balance2,amort1,del]);
const balance4 = calculateDifference(balance, balance2);
const balance5 = ['3041.87',''];
balance5.push(calculateRowTotal(balance5));

const inapril = ['188.46'];
const inadd = ['349.81'];
const indis = [''];
const inbalance = calculateBalance2([inapril,inadd,indis]);

const inadd1 = ['697.01'];
const indis1 = [''];
const inbalance1 = calculateBalance2([inbalance,inadd1,indis1]);

const inapril1 = ['163.04'];
const inamort = ['40.89'];
const inelm = [''];
const inbalance2 = calculateBalance2([inapril1,inamort,inelm]);

const inamort1 = ['377.48'];
const inelm1 = [''];
const inbalance3 = calculateBalance2([inbalance2,inamort1,inelm1]);
const inbalance4 = calculateDifference2(inbalance, inbalance2);
const inbalance5 = calculateDifference2(inbalance1, inbalance3);

const inTAS1: string[] = ['', '', '', ''];
inTAS1.push(calculateRowTotal(inTAS1));
const inTAS2: string[] = ['-350.95', '', '', ''];
inTAS2.push(calculateRowTotal(inTAS2));

const inCOMTAS1: string[] = ['', '', '', ''];
inCOMTAS1.push(calculateRowTotal(inCOMTAS1));
const inCOMTAS2: string[] = ['-350.95', '', '', ''];
inCOMTAS2.push(calculateRowTotal(inCOMTAS2));

  return {
    noteNumber: 4,
    title: 'Note 4a Right of Use (ROU) Assets',
    totalCurrent: 0,
    totalPrevious: 0,
    footer: 'Note: Figures in brackets relate to previous year.',
    content: [
      {
        type: 'table',
        headers: [
          '',
          'Buildings',
          'Vehicles',
          'Total',
        ],
        rows: [
          ['Gross carrying value'],
          ['Balance as at 1 April 2022', ...april],
          ['Additions', ...add],
          ['Disposals/Adjustments', ...adj],
          ['Balance as at 31 March 2023', ...balance],
          ['Balance as at 1 April 2023', ...balance],
          ['Additions', ...add1],
          ['Deletions', ...del],
          ['Balance as at 31 March 2024', ...balance1],
          ['Accumulated Depreciation'],
          ['Balance as at 1 April 2022', ...april1],
          ['Amortisation', ...amort],
          ['Eliminated on disposal of assets', ...elm],
          ['Balance as at 31 March 2023', ...balance2],
          ['Balance as at 1 April 2023', ...balance2],
          ['Amortisation', ...amort1],
          ['Deletions', ...del],
          ['Balance as at 31 March 2024', ...balance3],
          ['Net carrying value'],
          ['As at 31 March 2023', ...balance4],
          ['As at 31 March 2024', ...balance5],
        ]
      },
      {
        key: 'note4-intangiable',
        label: 'Note 4b Other Intangible assets',
        valueCurrent: null,
        valuePrevious: null,
        isSubtotal: true,
      },
      {
        type: 'table',
        headers: [
          '',
          'Computer Software'
        ],
        rows: [
          ['Gross carrying value'],

          ['Balance as at 1 April 2022',...inapril],
          ['Additions', ...inadd],
          ['Disposal', ...indis],
          ['Balance as at 31 March 2023', ...inbalance],

          ['Balance as at 1 April 2023', ...inbalance],
          ['Additions', ...inadd1],
          ['Disposal', ...indis1],
          ['Balance as at 31 March 2024', ...inbalance1],

          ['Accumulated amortisation'],

          ['Balance as at 1 April 2022', ...inapril1],
          ['Amortisation charge for the year', ...inamort],
          ['Eliminated on disposal of assets', ...inelm],
          ['Balance as at 31 March 2023', ...inbalance2],

          ['Balance as at 1 April 2023', ...inbalance2],

          ['Amortisation charge for the year', ...inamort1],
          ['Eliminated on disposal of assets', ...inelm1],
          ['Balance as at 31 March 2024', ...inbalance3],

          ['Net carrying value'],
          ['As at 31 March 2023', ...inbalance4],
          ['As at 31 March 2024', ...inbalance5],
        ]
      }, 
      {
        key: 'note4-intangiable-devlopment',
        label: 'Note 4c Intangibles under Development',
        valueCurrent: null,
        valuePrevious: null,
        isSubtotal: true,
      },
      'The intangibles under development ageing schedule for the year ended 31 March 2024 is as follows :',
      {
        type: 'table',
        headers: [
          '\nIntangibles under development',
          'Amount in  Intangibles under Development for a period of\nLess than 1 year',
          'Amount in  Intangibles under Development for a period of\n1-2 years',
          'Amount in  Intangibles under Development for a period of\n2-3 years',
          'Amount in  Intangibles under Development for a period of\nMore than 3 years',
          '\nTotal',
        ],
        rows: [
          ['TAS Software Application Development (Intangible under development)',...inTAS1],
          ['',...inTAS2],
          ['Total as on 31 March 2024',...inTAS1],
          ['Total as on 31 March 2023',...inTAS2],
        ]
      },
      'There is no such case, wherein Intangibles Under Development , whose completion is overdue or has exceeded its cost compared to its original plan .',
      'The intangibles under development completion schedule for the year ended 31 March 2024 is as follows :',
      {
        type: 'table',
        headers: [
          '\nIntangibles under development',
          'To be completed in\nLess than 1 year',
          'To be completed in\n1-2 years',
          'To be completed in\n2-3 years',
          'To be completed in\nMore than 3 years',
          '\nTotal',
        ],
        rows: [
          ['TAS Software Application Development (Intangible under development)',...inCOMTAS1],
          ['',...inCOMTAS2],
          ['Total as on 31 March 2024',...inCOMTAS1],
          ['Total as on 31 March 2023',...inCOMTAS2],
        ]
      },
    ]
  };
};
const calculateNote5 = (): FinancialNote => {
  const note5_1 = getValueForKey(5, 'note5-nc-emp');
  const note5_2 = getValueForKey(5, 'note5-c-emp');
  const nonCurrentTotal = { current: note5_1.valueCurrent??0, previous: note5_1.valuePrevious??0 };
  const currentTotal = { current:note5_2.valueCurrent??0, previous:note5_2.valuePrevious??0 };

  return {
    noteNumber: 5,
    title: 'Financial assets',
    totalCurrent: null,
    totalPrevious: null,
    content: [
      {
        key: 'note5-loans',
        label: 'Loans',
        isSubtotal: true,
        valueCurrent:   null,
        valuePrevious:  null,
      },
      {
        key: 'note5-noncurrent',
        label: 'Non-current',
        isSubtotal: true,
        valueCurrent:   null,
        valuePrevious:  null,
        children: [
          {
            key: 'note5-nc-emp-unsecured',
            label: 'Unsecured, considered good',
            valueCurrent: null,
            valuePrevious: null,
          },
          {
            key: 'note5-nc-emp',
            label: '  - Loans to employees',
            valueCurrent: nonCurrentTotal.current,
            valuePrevious: nonCurrentTotal.previous,isEditableRow: true 
          },
          {
            key: 'note5-nc-emp-total',
            label: '',
            valueCurrent: nonCurrentTotal.current,
            valuePrevious: nonCurrentTotal.previous,
            isGrandTotal:true,
          },
        ],
      },
      {
        key: 'note5-current',
        label: 'Current',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'note5-c-emp-unsecured',
            label: 'Unsecured, considered good',
            valueCurrent: null,
            valuePrevious: null,
          },
          {
            key: 'note5-c-emp',
            label: '  - Loans to employees',
            valueCurrent: currentTotal.current,
            valuePrevious: currentTotal.previous,isEditableRow: true 
          },
          {
            key: 'note5-c-emp-total',
            label: '',
            valueCurrent: currentTotal.current,
            valuePrevious: currentTotal.previous,
            isGrandTotal:true,
          },
        ],
      },
    ],
  };
};
const calculateNote6 = (): FinancialNote => {
  const leasesNC = {
    current: getAmount('amountCurrent', ['other non current financial assets '], ['net investment in lease- non current']),
    previous: getAmount('amountPrevious', ['other non current financial assets '], ['net investment in lease- non current']),
  };
  const securityDeposits = {
    current: getAmount('amountCurrent', ['other non current financial assets '], ['security deposits']),
    previous: getAmount('amountPrevious', ['other non current financial assets '], ['security deposits'])
  };
  const earnestNC = {
    current: getAmount('amountCurrent', ['other non current financial assets '], ['earnest money deposits with customers']),
    previous: getAmount('amountPrevious', ['other non current financial assets '], ['earnest money deposits with customers'])
  };
  const otherReceivable = {
    current: getAmount('amountCurrent', ['other current financial assets'], ['other recoverable from customers']),
    previous: getAmount('amountPrevious', ['other current financial assets'], ['other recoverable from customers'])
  };

  const leasesC = {
    current: getAmount('amountCurrent', ['other current financial assets'], ['net investment in lease- current']),
    previous: getAmount('amountPrevious', ['other current financial assets'], ['net investment in lease- current'])
  };
  const earnestC = {
    current: getAmount('amountCurrent', ['other current financial assets'], ['earnest money deposits with customers']),
    previous: getAmount('amountPrevious', ['other current financial assets'], ['earnest money deposits with customers'])
  };
  const unbilled = {
    current: getAmount('amountCurrent', ['other current financial assets'], ['unbilled receivable']),
    previous: getAmount('amountPrevious', ['other current financial assets'], ['unbilled receivable'])
  };
  const interest = {
    current: getAmount('amountCurrent', ['other current financial assets'], ['interest accrued but not due']),
    previous: getAmount('amountPrevious', ['other current financial assets'], ['interest accrued but not due'])
  };
  const employeeBenefit = {
    current: getAmount('amountCurrent', ['other current financial assets'], ['others : provision for compensated absences']),
    previous: getAmount('amountPrevious', ['other current financial assets'], ['others : provision for compensated absences'])
  };

  const nonCurrentTotal = {
    current: leasesNC.current+ securityDeposits.current + earnestNC.current + otherReceivable.current,
    previous:leasesNC.previous+ securityDeposits.previous + earnestNC.previous + otherReceivable.previous
  };
  const currentTotal = {
    current: leasesC.current + earnestC.current + unbilled.current + interest.current + employeeBenefit.current,
    previous: leasesC.previous + earnestC.previous + unbilled.previous + interest.previous + employeeBenefit.previous
  };

  return {
    noteNumber: 6,
    title: 'Other financial assets',
    totalCurrent: null,
    totalPrevious: null,
    content: [
      {
        key: 'note6-noncurrent',
        label: 'Non-current',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'note6-nc-secured',
            label: '(secured, considered good)',
            valueCurrent: null,
            valuePrevious: null,
          },
          { key: 'note6-nc-lease', label: '(a) Net investment in leases', valueCurrent: leasesNC.current, valuePrevious: leasesNC.previous },
          {
            key: 'note6-nc-secured-2',
            label: '(secured, considered good)',
            valueCurrent: null,
            valuePrevious: null,
          },
          { key: 'note6-nc-sec', label: '(a) Security deposits', valueCurrent: securityDeposits.current, valuePrevious: securityDeposits.previous },
          { key: 'note6-nc-earnest', label: '(b) Earnest money deposits', valueCurrent: earnestNC.current, valuePrevious:earnestNC.previous},
          { key: 'note6-nc-other', label: '(c) Other receivable', valueCurrent: otherReceivable.current, valuePrevious: otherReceivable.previous },
          {
            key: 'note6-nc-total',
            label: '',
            valueCurrent: nonCurrentTotal.current,
            valuePrevious: nonCurrentTotal.previous,
            isGrandTotal:true
          },
        ],
      },
      {
        key: 'note6-current',
        label: 'Current',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'note6-c-secured',
            label: '(secured, considered good)',
            valueCurrent: null,
            valuePrevious: null,
          },
          { key: 'note6-c-lease', label: '(a) Net investment in leases', valueCurrent: leasesC.current, valuePrevious:leasesC.previous  },
          {
            key: 'note6-c-secured-1',
            label: '(Unsecured, considered good)',
            valueCurrent: null,
            valuePrevious: null,
          },
          { key: 'note6-c-earnest', label: '(a) Earnest money deposits', valueCurrent: earnestC.current, valuePrevious:earnestC.previous  },
          { key: 'note6-c-unbilled', label: '(b) Unbilled receivables', valueCurrent: unbilled.current, valuePrevious:unbilled.previous  },
          { key: 'note6-c-interest', label: '(c) Interest accrued', valueCurrent: interest.current, valuePrevious:interest.previous  },
          { key: 'note6-c-benefit', label: '(d) Employee compensated absences', valueCurrent: employeeBenefit.current, valuePrevious:employeeBenefit.previous},
          {
            key: 'note6-c-total',
            label: '',
            valueCurrent: currentTotal.current,
            valuePrevious: currentTotal.previous,
            isGrandTotal:true
          },
        ],
      },
    ],
  };
};
const calculateNote7 = (): FinancialNote => {
  const note7_1 = getValueForKey(7, 'note7-under-protest');
  const note7_2 = getValueForKey(7, 'note7a-adv-tds');
  const note7_3 = getValueForKey(7, 'note7a-provision');
  const note7_4 = getValueForKey(7, 'note7-adv-tax');
  const note7_5 = getValueForKey(7, 'note7-provision');



  const taxPaidUnderProtest = { current:note7_1.valueCurrent?? 0, previous:note7_1.valuePrevious?? 0 };
  const advanceTaxAndTDSLiab = { current:note7_2.valueCurrent?? 0, previous:note7_2.valuePrevious?? 0 };
  const provisionForTaxLiab = { current:note7_3.valueCurrent?? 0, previous:note7_3.valuePrevious?? 0 };
  const advanceTaxAndTDS = { current:note7_4.valueCurrent?? 0, previous:note7_4.valuePrevious?? 0 };
  const provisionForTaxAsset = { current:note7_5.valueCurrent?? 0, previous:note7_5.valuePrevious?? 0 };



  
  const netTaxAsset = {
    current: advanceTaxAndTDS.current - provisionForTaxAsset.current,
    previous: advanceTaxAndTDS.previous - provisionForTaxAsset.previous,
  };
  const netTaxLiability = {
    current: provisionForTaxLiab.current - advanceTaxAndTDSLiab.current,
    previous: provisionForTaxLiab.previous - advanceTaxAndTDSLiab.previous,
  };

  // --- Return a single FinancialNote object ---
  return {
    noteNumber: 7,
    title: 'Income Tax',
    totalCurrent: null,
    totalPrevious: null,
    content: [
      // Section 7: Income Tax Asset (Net)
      {
        key: 'note7-asset-section',
        label: '7. Income Tax Asset (Net)',
        isSubtotal: true, // Acts as a header for this section
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'note7-main',
            label: 'Advance income tax (net of provisions) (refer Note (i) below)',
            valueCurrent: netTaxAsset.current - taxPaidUnderProtest.current,
            valuePrevious: netTaxAsset.previous - taxPaidUnderProtest.previous,
            children: [
              {
                key: 'note7-under-protest',
                label: 'Income tax paid under protest',
                valueCurrent: taxPaidUnderProtest.current,
                valuePrevious: taxPaidUnderProtest.previous,
                isEditableRow: true
              },
              {
            key: 'note7-under-protest-total',
            label: '',
            valueCurrent: (netTaxAsset.current - taxPaidUnderProtest.current)+taxPaidUnderProtest.current,
            valuePrevious: (netTaxAsset.previous - taxPaidUnderProtest.previous)+taxPaidUnderProtest.previous,
            isGrandTotal:true
          },
            ],
          },
          {
            key: 'note7-breakup',
            label: 'Note (i)',
            valueCurrent: null,
            valuePrevious: null,
            children: [
              {
                key: 'note7-adv-tax',
                label: 'Advance tax and TDS',
                valueCurrent: advanceTaxAndTDS.current,
                valuePrevious: advanceTaxAndTDS.previous,
                isEditableRow: true
              },
              {
                key: 'note7-provision',
                label: 'Less: Provision for tax',
                valueCurrent: provisionForTaxAsset.current,
                valuePrevious: provisionForTaxAsset.previous,
                isEditableRow: true
              },
              {
            key: 'note7-breakup-total',
            label: '',
            valueCurrent: netTaxAsset.current,
            valuePrevious: netTaxAsset.previous,
            isGrandTotal:true
          },
            ],
          },
        ],
      },
      // Section 7a: Income Tax Liabilities (Net) - now part of the same content array
      {
        key: 'note7-liability-section',
        label: '7a. Income Tax Liabilities (Net)',
        isSubtotal: true, // Acts as a header for this section
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'note7a-main',
            label: 'Income tax provision (net of advance tax) (refer Note (ii) below)',
            valueCurrent: netTaxLiability.current,
            valuePrevious: netTaxLiability.previous,
          },
          {
            key: 'note7-liability-section-total',
            label: '',
            valueCurrent: netTaxLiability.current,
            valuePrevious: netTaxLiability.previous,
            isGrandTotal:true
          },
          {
            key: 'note7a-breakup',
            label: 'Note (ii)',
            isSubtotal: true,
            valueCurrent: null,
            valuePrevious: null,
            children: [
              {
                key: 'note7a-provision',
                label: 'Provision for tax',
                valueCurrent: provisionForTaxLiab.current,
                valuePrevious: provisionForTaxLiab.previous,
                isEditableRow: true
              },
              {
                key: 'note7a-adv-tds',
                label: 'Less: Advance tax and TDS',
                valueCurrent: advanceTaxAndTDSLiab.current,
                valuePrevious: advanceTaxAndTDSLiab.previous,
                isEditableRow: true
              },
              {
            key: 'note7a-breakup-total',
            label: '',
            valueCurrent: netTaxLiability.current,
            valuePrevious: netTaxLiability.previous,
            isGrandTotal:true
          },
            ],
          },
        ],
      },
    ],
  };
};
const calculateNote8 = (): FinancialNote => {
        const goodsInTransitRaw = {
            current: getAmount('amountCurrent', ['inventories'], ['goods-in-transit- raw materials']),
            previous: getAmount('amountPrevious', ['inventories'], ['goods-in-transit- raw materials'])
        };
        const goodsInTransitStock = {
            current: getAmount('amountCurrent', ['inventories'], ['goods-in-transit- (acquired for trading)']),
            previous: getAmount('amountPrevious', ['inventories'], ['goods-in-transit- (acquired for trading)'])
        };
        const allRawMaterials = {
            current: getAmount('amountCurrent', ['inventories'], ['raw material']),
            previous: getAmount('amountPrevious', ['inventories'], ['raw material'])
        };
        const allStockInTrade = {
            current: getAmount('amountCurrent', ['inventories'], ['stock-in-trade']),
            previous: getAmount('amountPrevious', ['inventories'], ['stock-in-trade'])
        };
        const rawMaterials = {
            current: allRawMaterials.current - goodsInTransitRaw.current,
            previous: allRawMaterials.previous - goodsInTransitRaw.previous,
        };
        const stockInTrade = {
            current: allStockInTrade.current - goodsInTransitStock.current,
            previous: allStockInTrade.previous - goodsInTransitStock.previous,
        };
        const workInProgress = {
            current: getAmount('amountCurrent', ['inventories'], ['work-in-progress']),
            previous: getAmount('amountPrevious', ['inventories'], ['work-in-progress'])
        };
        const rawMaterialsSubTotal = { current: rawMaterials.current + goodsInTransitRaw.current, previous: rawMaterials.previous + goodsInTransitRaw.previous };
        const stockInTradeSubTotal = { current: stockInTrade.current + goodsInTransitStock.current, previous: stockInTrade.previous + goodsInTransitStock.previous };
        const grandTotal = { current: rawMaterialsSubTotal.current + workInProgress.current + stockInTradeSubTotal.current+goodsInTransitStock.current, previous: rawMaterialsSubTotal.previous + workInProgress.previous + stockInTradeSubTotal.previous+goodsInTransitStock.previous };

        return {
            noteNumber: 8,
            title: 'Inventories',
            subtitle: '(At lower of cost and net realisable value)',
            totalCurrent: grandTotal.current,
            totalPrevious: grandTotal.previous,
            footer: 'As at March 31, 2024 ₹ 389.16 lakhs (as at March 31, 2023: ₹ 379.17 lakhs) was charged to statement of profit and loss for slow moving and obsolete inventories.',
            content: [
                { key: 'note8-raw-mat-group', label: '(a) Raw materials', valueCurrent: rawMaterialsSubTotal.current, valuePrevious: rawMaterialsSubTotal.previous, isSubtotal: true, children: [
                    { key: 'note8-raw-mat', label: 'Raw materials', valueCurrent: rawMaterials.current, valuePrevious: rawMaterials.previous },
                    { key: 'note8-git-raw', label: 'Goods-in-transit', valueCurrent: goodsInTransitRaw.current, valuePrevious: goodsInTransitRaw.previous },
                ]},
                { key: 'note8-wip', label: '(b) Work-in-progress', valueCurrent: workInProgress.current, valuePrevious: workInProgress.previous },
                { key: 'note8-stock-group', label: '(c) Stock-in-trade (acquired for trading)', valueCurrent: stockInTradeSubTotal.current, valuePrevious: stockInTradeSubTotal.previous, isSubtotal: true, children: [
                    // { key: 'note8-stock', label: 'Stock-in-trade', valueCurrent: stockInTrade.current, valuePrevious: stockInTrade.previous },
                    { key: 'note8-git-stock', label: 'Goods-in-transit', valueCurrent: goodsInTransitStock.current, valuePrevious: goodsInTransitStock.previous },
                ]},
                { key: 'note8-total', label: 'Total', valueCurrent: grandTotal.current, valuePrevious: grandTotal.previous, isGrandTotal: true },
            ]
        };
    };
const calculateNote9 = (): FinancialNote => {
  const tradeReceivables = getAmount('amountCurrent', ['trade receivables'], ['trade receivables']);
  const tradeReceivablesPrev = getAmount('amountPrevious', ['trade receivables'], ['trade receivables']);

  const doubtfulDebts = getAmount('amountCurrent', ['trade receivables'], ['allowances for doubtful debts']);
  const doubtfulDebtsPrev = getAmount('amountPrevious', ['trade receivables'], ['allowances for doubtful debts']);

  const consideredGoodCurrent = tradeReceivables - (-doubtfulDebts);
  const consideredGoodPrevious = tradeReceivablesPrev - (-doubtfulDebtsPrev);

  const creditImpairedCurrent = -doubtfulDebts;
  const creditImpairedPrevious = -doubtfulDebtsPrev;

  const subtotalCurrent = consideredGoodCurrent + creditImpairedCurrent;
  const subtotalPrevious = consideredGoodPrevious + creditImpairedPrevious;

  const allowanceCurrent = -doubtfulDebts;
  const allowancePrevious = -doubtfulDebtsPrev;

  const totalCurrent = subtotalCurrent - allowanceCurrent;
  const totalPrevious = subtotalPrevious - allowancePrevious;

  return {
    noteNumber: 9,
    title: 'Trade receivables (unsecured)',
    totalCurrent: null,
    totalPrevious: null,
    footer:'Note: Figures in brackets relate to previous year.',
    content: [
      {
        key: 'note9-good',
        label: 'Trade Receivables - Considered good',
        valueCurrent: consideredGoodCurrent,
        valuePrevious: consideredGoodPrevious,
      },
      {
        key: 'note9-impaired',
        label: 'Trade Receivables - Credit impaired',
        valueCurrent: creditImpairedCurrent,
        valuePrevious: creditImpairedPrevious,
      },
      {
        key: 'note9-subtotal',
        label: '',
        isSubtotal: true,
        valueCurrent: subtotalCurrent,
        valuePrevious: subtotalPrevious,
      },
      {
        key: 'note9-allowance',
        label: 'Less: Allowances for credit impairment',
        valueCurrent: allowanceCurrent,
        valuePrevious: allowancePrevious,
      },
      {
        key: 'note9-total',
        label: 'Total',
        isGrandTotal: true,
        valueCurrent: totalCurrent,
        valuePrevious: totalPrevious,
      },
      'Expected credit loss',
      'The Company uses a provision matrix to determine impairment loss on portfolio of its trade receivable.The provision matrix is based on its historically observed default rates over the expected life of the trade receivables and is adjusted for forward-looking estimates. At regular intervals, the historically observed default rates are updated and changes in forward-looking estimates are analysed.',
      'The trade receivables ageing schedule for the year ended as on 31 March 2024 is as follows :',
      {
        type: 'table',
        headers: [
          'PARTICULARS',
          'Not due',
          'Less than 6 months',
          '6 months - 1 year',
          '1-2 years',
          '2-3 years',
          'More than 3 years',
          'Total'
        ],
        rows: [
          [
            'Undisputed Trade receivables - considered good',
            '43,560.08\n(41,064.34)',
            '9,832.94\n(8,481.43)',
            '1,197.72\n(431.30)',
            '533.18\n(875.74)',
            '130.36\n(310.62)',
            '7.61\n(-)',
            '55,861.89\n(51,164.06)'
          ],
          [
            'Undisputed Trade receivables – credit impaired',
            '750.43\n(935.40)',
            '851.15\n(216.61)',
            '705.71\n(73.62)',
            '563.71\n(528.75)',
            '878.80\n(802.86)',
            '2,838.28\n(1,735.37)',
            '6,587.08\n(4,292.61)'
          ],
          [
            'Disputed Trade Receivables – considered good',
            '-',
            '-',
            '-',
            '-',
            '-',
            '-',
            '-'
          ],
          [
            'Disputed Trade Receivables – significant increase in credit risk',
            '-',
            '-',
            '-',
            '-',
            '-',
            '-',
            '-'
          ],
          [
            'Disputed Trade Receivables – credit impaired',
            '-',
            '191.37\n(-)',
            '66.61\n(-)',
            '18.74\n(-)',
            '35.15\n(165.30)',
            '150.60\n(150.60)',
            '462.47\n(315.90)'
          ],
          [
            '',
            '44,700.51\n(41999.74)',
            '10,875.82\n(8698.05)',
            '1,970.04\n(505.55)',
            '1,115.63\n(1404.49)',
            '1,044.31\n(1278.77)',
            '2,996.49\n(1885.97)',
            '62,702.80\n(55772.57)'
          ],
          [
            'Less: Allowance for credit loss',
            '',
            '',
            '',
            '',
            '',
            '',
            '7050.91\n(4608.51)'
          ],
          [
            'Total Trade Receivables as on 31 March 2024',
            '',
            '',
            '',
            '',
            '',
            '',
            '55651.89'
          ],
          [
            'Total Trade Receivables as on 31 March 2023',
            '',
            '',
            '',
            '',
            '',
            '',
            '(51164.06)'
          ]
        ]
      }
    ]
  };
};
const calculateNote10 = (): FinancialNote => {
  // Non-current
  const nonCurrentGovt = {
    current: getAmount('amountCurrent', ['other non current assets'], ['balances with government authorities']),
    previous: getAmount('amountPrevious', ['other non current assets'], ['balances with government authorities']),
  };

  const nonCurrentPrepaid = {
    current: getAmount('amountCurrent', ['other non current assets'], ['prepaid expenses']),
    previous: getAmount('amountPrevious', ['other non current assets'], ['prepaid expenses']),
  };

  // Current
  const currentGovt = {
    current: getAmount('amountCurrent', ['other current assets'], ['balances with government authorities']),
    previous: getAmount('amountPrevious', ['other current assets'], ['balances with government authorities']),
  };

  const currentPrepaid = {
    current: getAmount('amountCurrent', ['other current assets'], ['prepaid expenses']),
    previous: getAmount('amountPrevious', ['other current assets'], ['prepaid expenses']),
  };

  const advToEmployees = {
    current: getAmount('amountCurrent', ['other current assets'], ['advances to employees']),
    previous: getAmount('amountPrevious', ['other current assets'], ['advances to employees']),
  };

  const advToRelated = {
    current: getAmount('amountCurrent', ['other current assets'], ['advance to creditors-rp']),
    previous: getAmount('amountPrevious', ['other current assets'], ['advance to creditors-rp']),
  };

  const advToOtherTotal = {
  current:
    getAmount('amountCurrent', ['other current assets'], ['advance to creditors']),
  previous:
    getAmount('amountPrevious', ['other current assets'], ['advance to creditors']) 
};

  const currentTotal =
    currentGovt.current +
    currentPrepaid.current +
    advToEmployees.current-6.39-3.79 +
    advToRelated.current+
    advToOtherTotal.current+23.03+0.07;

  const previousCurrentTotal =
    currentGovt.previous +
    currentPrepaid.previous +
    advToEmployees.previous-6.36-2.73 +
    advToRelated.previous+
    advToOtherTotal.previous+151.42;

  return {
    noteNumber: 10,
    title: 'Other assets',
    totalCurrent: null,
    totalPrevious: null,
    content: [
      {
        key: 'note10-noncurrent',
        label: 'Non-current', 
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'Non-current-unsecured',
            label: 'Unsecured, considered good',
            valueCurrent: null,
            valuePrevious: null,
          },
          { key: 'note10-nc-govt', label: '(a) Balances with government authorities', valueCurrent: nonCurrentGovt.current, valuePrevious: nonCurrentGovt.previous },
          { key: 'note10-nc-prepaid', label: '(b) Prepaid expenses', valueCurrent: nonCurrentPrepaid.current, valuePrevious: nonCurrentPrepaid.previous },
           {
            key: 'Non-current-total',
            label: 'Total',
            valueCurrent: nonCurrentGovt.current+nonCurrentPrepaid.current,
            valuePrevious: nonCurrentGovt.previous+nonCurrentPrepaid.previous,
            isGrandTotal:true,
          },
        ],
      },
      {
        key: 'note10-current',
        label: 'Current',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'note10-current-unsecured',
            label: 'Unsecured, considered good',
            valueCurrent: null,
            valuePrevious: null,
          },
          { key: 'note10-c-govt', label: '(a) Balances with Government authorities', valueCurrent: currentGovt.current, valuePrevious: currentGovt.previous },
          { key: 'note10-c-prepaid', label: '(b) Prepaid expenses', valueCurrent: currentPrepaid.current+0.07, valuePrevious: currentPrepaid.previous },
          { key: 'note10-c-emp', label: '(c) Advances to employees', valueCurrent: advToEmployees.current-6.39-3.79, valuePrevious: advToEmployees.previous-6.36-2.73 },
          {
            key: 'note10-c-cred',
            label: '(d) Advance to creditors',
            valueCurrent: null,
            valuePrevious: null,
            children: [
              { key: 'note10-c-cred-unrel', label: '(i) Advances paid to other parties', valueCurrent: advToOtherTotal.current+23.03, valuePrevious: advToOtherTotal.previous+151.42 },
              { key: 'note10-c-cred-rel', label: '(ii) Advances paid to related parties (Refer note 31)', valueCurrent: advToRelated.current, valuePrevious: advToRelated.previous },
            ],
          },
        ],
      },
      {
        key: 'note10-total',
        label: 'Total',
        isGrandTotal: true,
        valueCurrent: currentGovt.current+currentPrepaid.current+0.07+advToEmployees.current-6.39-3.79+advToOtherTotal.current+23.03+advToRelated.current,
        valuePrevious: currentGovt.previous+currentPrepaid.previous+advToEmployees.previous-6.36-2.73+advToOtherTotal.previous+151.42+advToRelated.previous,
      },
    ],
  };
};
const calculateNote11 = (): FinancialNote => {
        // [NEW] Logic for Note 10: Cash and cash equivalents
        const cashOnHand = { current: getAmount('amountCurrent', ['cash and cash equivalents'], ['cash on hand']), previous: getAmount('amountPrevious', ['cash and cash equivalents'], ['cash on hand']) };
        const currentAccounts ={ current: getAmount('amountCurrent', ['cash and cash equivalents'], ['in current accounts']), previous: getAmount('amountPrevious', ['cash and cash equivalents'], ['in current accounts']) };
        const eefcAccounts = { current: getAmount('amountCurrent', ['cash and cash equivalents'], ['in eefc accounts']), previous: getAmount('amountPrevious', ['cash and cash equivalents'], ['in eefc accounts']) };
        const deposits3Months = { current: getAmount('amountCurrent', ['cash and cash equivalents'], ['fixed deposits with maturity less than 3 months']), previous: getAmount('amountPrevious', ['cash and cash equivalents'], ['fixed deposits with maturity less than 3 months']) };
        const unpaid = { current: getAmount('amountCurrent', ['cash and cash equivalents'], ['unpaid dividend account']), previous: getAmount('amountPrevious', ['cash and cash equivalents'], ['unpaid dividend account']) };
        const capital = { current: getAmount('amountCurrent', ['cash and cash equivalents'], ['capital reduction ']), previous: getAmount('amountPrevious', ['cash and cash equivalents'], ['capital reduction ']) };
        const deposit = { current: getAmount('amountCurrent', ['cash and cash equivalents'], ['fixed deposits with maturity greater than 3 months']), previous: getAmount('amountPrevious', ['cash and cash equivalents'], ['fixed deposits with maturity greater than 3 months']) };

        const others = { current: getAmount('amountCurrent', ['cash and cash equivalents'], ['balances with banks']), previous: getAmount('amountPrevious', ['cash and cash equivalents'], ['balances with banks']) };

        const other = { current: unpaid.current + capital.current + deposit.current, previous: unpaid.previous + capital.previous + deposit.previous };
        const earmarked = { current: unpaid.current + capital.current, previous: unpaid.previous + capital.previous};
        const bank = { current:currentAccounts.current+eefcAccounts.current+deposits3Months.current, previous:currentAccounts.previous+eefcAccounts.previous+deposits3Months.previous };

        return {
            noteNumber: 11,
            title: 'Cash and cash equivalents',
            totalCurrent: null,
            totalPrevious: null,
            content: [
                { key: 'note10-coh', label: '(a) Cash on hand', valueCurrent: cashOnHand.current, valuePrevious: cashOnHand.previous },
                { key: 'note10-bwb-group', label: '(b) Balances with banks', valueCurrent: null, valuePrevious: null, children: [
                    { key: 'note10-bwb-ca', label: '(i) In current accounts', valueCurrent: currentAccounts.current, valuePrevious: currentAccounts.previous },
                    { key: 'note10-bwb-eefc', label: '(ii) In EEFC accounts', valueCurrent: eefcAccounts.current, valuePrevious: eefcAccounts.previous },
                    { key: 'note10-bwb-dep', label: '(iii) In deposit accounts (original maturity of 3 months or less)', valueCurrent: deposits3Months.current, valuePrevious: deposits3Months.previous },
                    {
            key: 'note11-total',
            label: '',
            valueCurrent: cashOnHand.current + bank.current,
            valuePrevious: cashOnHand.previous + bank.previous,
            isGrandTotal:true,
          },
                ]},
                { key: 'note10-bwb-group-other', label: 'Other Bank Balances', valueCurrent: null, valuePrevious: null, isSubtotal: true, children: [
                  { key: 'note10-bwb', label: '(a) In earmarked Accounts', valueCurrent: null, valuePrevious:null, children: [
                    { key: 'note10-bwb-unpaid', label: '  - Unpaid dividend account(Refer note 12 (f))', valueCurrent: unpaid.current, valuePrevious: unpaid.previous },
                    { key: 'note10-bwb-capital', label: '   - Capital Reduction', valueCurrent: capital.current, valuePrevious: capital.previous },
                    ],
                   },
                   { key: 'note10-bwb-deposit', label: '(b) In deposit accounts (original maturity of more than 3 months but less than 12 months)', valueCurrent: deposit.current, valuePrevious: deposit.previous },
                   {
            key: 'note10-bwb-group-other-total',
            label: '',
            valueCurrent: other.current,
            valuePrevious: other.previous,
            isGrandTotal:true,
          },
                ]},
            ]
        };
};
const calculateNote12 = (): FinancialNote => {
  // Authorised share data
  const authorisedEquityNumber = 9500000;
  const authorisedEquityAmount = 950.00;

  const unclassifiedNumber = 500000;
  const unclassifiedAmount = 50.00;

  const totalAuthorisedNumber = authorisedEquityNumber + unclassifiedNumber;
  const totalAuthorisedAmount = authorisedEquityAmount + unclassifiedAmount;

  // Issued and Subscribed share data (same in both years)
  const issuedNumber = 8505469;
  const issuedAmount = 850.55;

  const issuedAndSubscribedNumber = '85,05,469';
  const issuedAndSubscribedAmount = '850.55';

  const percent = '100.00%';

  return {
    noteNumber: 12,
    title: 'Equity Share Capital',
    totalCurrent: issuedAmount,
    totalPrevious: issuedAmount,
    content: [
      {
            key: 'note12-equity',
            label: 'Authorised',
            valueCurrent: null,
            valuePrevious: null,
            isSubtotal:true,
      },
      {
        type: 'table',
        headers: [
          '',
          'As at 31 March 2024\nNumber',
          '\nAmount',
          'As at 31 March 2023\nNumber',
          '\nAmount'
        ],
        rows: [
          [
            'Authorised',
            totalAuthorisedNumber.toLocaleString('en-IN'),
            totalAuthorisedAmount.toFixed(2),
            totalAuthorisedNumber.toLocaleString('en-IN'),
            totalAuthorisedAmount.toFixed(2)
          ],
          [
            'Equity shares of ₹ 10 each',
            authorisedEquityNumber.toLocaleString('en-IN'),
            authorisedEquityAmount  .toFixed(2),
            authorisedEquityNumber.toLocaleString('en-IN'),
            authorisedEquityAmount.toFixed(2)
          ],
          [
            'Unclassified shares of ₹ 10 each',
            unclassifiedNumber.toLocaleString('en-IN'),
            unclassifiedAmount.toFixed(2),
            unclassifiedNumber.toLocaleString('en-IN'),
            unclassifiedAmount.toFixed(2)
          ],
          [
            'Issued Share Capital\nEquity shares of ₹ 10 each',
            issuedNumber.toLocaleString('en-IN'),
            issuedAmount.toFixed(2),
            issuedNumber.toLocaleString('en-IN'),
            issuedAmount.toFixed(2)
          ],
          [
            'Subscribed and fully paid up\nEquity shares of ₹ 10 each',
            issuedNumber.toLocaleString('en-IN'),
            issuedAmount.toFixed(2),
            issuedNumber.toLocaleString('en-IN'),
            issuedAmount.toFixed(2)
          ],
          [
            '',
            issuedNumber.toLocaleString('en-IN'),
            issuedAmount.toFixed(2),
            issuedNumber.toLocaleString('en-IN'),
            issuedAmount.toFixed(2)
          ]
        ]
      },
      "Refer note (a) to (d) below",
      "(a) Reconciliation of the number of shares and amount outstanding at the beginning and at the end of the reporting period:",
      // Second table for the reconciliation details
      {
        type: 'table',
        headers: [
          '',
          'As at 31 March 2024\nNumber',
          '\nAmount',
          'As at 31 March 2023\nNumber',
          '\nAmount'
        ],
        rows: [
          ['Equity shares of ₹ 10 each par value'],
          ['Balances as at the beginning of the year', issuedAndSubscribedNumber, issuedAndSubscribedAmount, issuedAndSubscribedNumber, issuedAndSubscribedAmount],
          ['Balance at the end of the year', issuedAndSubscribedNumber, issuedAndSubscribedAmount, issuedAndSubscribedNumber, issuedAndSubscribedAmount]
        ]
      },
      '(b) Terms and rights attached to equity shares',
      `The Company has only one class of equity shares having a par value of ₹ 10 per share. Each equity share is entitled to one vote per share. The dividend, if any, proposed by the Board of Directors is subject to the approval of the shareholders in the ensuing Annual General Meeting and shall be payable in Indian rupees. In the event of liquidation of the company, the shareholders will be entitled to receive remaining assets of the company, after distribution of all preferential amounts.The distribution will be in proportion to the number of equity shares held by the shareholders.
        There have been no issues with respect to unclassified shares.`,


      '(c) Details of shares held by the holding company',
      {
        type: 'table',
        headers: [
          '',
          'As at 31 March 2024\nNumber',
          '\nAmount',
          'As at 31 March 2023\nNumber',
          '\nAmount'
        ],
        rows: [
          ['Holding Company:'],
          ['Yokogawa Electric Corporation', issuedAndSubscribedNumber, issuedAndSubscribedAmount, issuedAndSubscribedNumber, issuedAndSubscribedAmount]
        ]
      },
      '(d) Details of shares held by each shareholder holding more than 5% shares:',
      {
        type: 'table',
        headers: [
          '',
          'As at 31 March 2024\nNumber',
          '\nPercentage',
          'As at 31 March 2023\nNumber',
          '\nPercentage'
        ],
        rows: [
          ['Equity shares of ₹ 10 each, par value'],
          ['Yokogawa Electric Corporation and its nominees', issuedAndSubscribedNumber, percent, issuedAndSubscribedNumber, percent]
        ]
      },
      '(e) In the period of five years immediately preceding the Balance Sheet date, the Company has not issued any bonus shares or has bought back any shares.',



      `(f) Capital Reduction : 
      The Company considered the Reduction of Share Capital on selective basis by reducing the capital to the extent of the holding by the shareholders other than the promoter shareholders. Before the capital reduction, 97.21% of the share capital was held by M/s. Yokogawa Electric Corporation and the balance 2.79% by public. It was therefore proposed to reduce and hence cancel the portion of the shares held by the public by 2.79% (244,531 number of shares). The Board of Directors during the 147th Meeting held on 13th November 2017 and the shareholders during the Extra Ordinary General Meeting held on 11th January 2018 have considered and approved the proposal of selective capital reduction.
      The Company had accordingly filed petition with the Hon'ble Tribunal (National Company Law Tribunal-Bengaluru Bench) to reduce the issued, subscribed and paid up share capital of the company consisting of 244,531 equity shares of INR 10/- each fully paid up (INR 2,445,310/-), held by shareholders belonging to non-promoter group and cancel along with the securities premium/free reserves of the Company. The reduction and cancellation is effected by returning the paid-up equity share capital along with the securities premium lying to the credit of the securities premium account and free reserves to the shareholders belonging to non-promoter group ( “Public Shareholders”) in cash at the rate of INR 923.20/- which includes the paid up share capital and the premium amount thereon.
      The National Company Law Tribunal vide its order dated  9th May, 2019 confirmed the petition for the reduction of the share capital of the Company. The company pursuant to the order of the Hon'ble Tribunal discharged the dues to the shareholders whose shares were reduced by depositing the fund with an Escrow Account opened for the purpose and paying the shareholders out of this account by Bank Transfer or Draft or other mode as indicated by the respective shareholder with the Company. For the year ended 31st March 2024 the capital reduction liability payable to shareholders has been discharged to the extent of Rs. 92,320/-.`,
      `(g) Promoter's Shareholding as on 31 March 2024 :`,
     {
        type: 'table',
        headers: [
          'SL.No',
          'Promoter Name',
          'No. of shares held',
          '% of total shares',
          '% change during the year'
        ],
        rows: [
          ['1','Yokogawa Electric Corporation, Japan','8505469','100%','No change during the year'],
        ]
      },
      {
        key: 'note12-h-title',
        label: `(h) Promoter's Shareholding as on 31st March 2023 :`,
        valueCurrent: null,
        valuePrevious: null,
        isSubtotal:true,
      }, 
      {
        type: 'table',
        headers: [
          'SL.No',
          'Promoter Name',
          'No. of shares held',
          '% of total shares',
          '% change during the year'
        ],
        rows: [
          ['1','Yokogawa Electric Corporation, Japan','8505469','100%','No change during the year'],
        ]
      },
    ]
  };
};
const calculateNote13 = (): FinancialNote => {
  const retainedOpening = {
    current: 31939.72,
    previous: 24481.71,
  };

  const transferredProfit = {
    current: 22560.10,
    previous: 7458.01,
  };

  const dividendsPaid = {
    current: 3729.65,
    previous: 0,
  };

  const retainedClosing = {
    current: Number((retainedOpening.current + transferredProfit.current - dividendsPaid.current).toFixed(2)),
    previous: Number((retainedOpening.previous + transferredProfit.previous - dividendsPaid.previous).toFixed(2)),
  };

  const oci = {
    current: 479.79,
    previous: 577.54,
  };

  const generalReserve = {
    current: 11911.35,
    previous: 11911.35,
  };

  const total = {
    current: retainedClosing.current + oci.current + generalReserve.current-0.01,
    previous: retainedClosing.previous + oci.previous + generalReserve.previous-0.01,
  };

  return {
    noteNumber: 13,
    title: 'Other Equity',
    totalCurrent: null,
    totalPrevious: null,
    content: [
      {
        key: 'note13-retained',
        label: 'a) Retained Earnings*',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          { key: 'note13-opening', label: 'Balance at the beginning of the year', valueCurrent: retainedOpening.current, valuePrevious: retainedOpening.previous },
          { key: 'note13-profit', label: 'Add: Transferred from surplus in statement of profit and loss', valueCurrent: transferredProfit.current, valuePrevious: transferredProfit.previous },
          { key: 'note13-dividends', label: 'Less: Dividends Paid', valueCurrent: -dividendsPaid.current, valuePrevious: 0 },
          { key: 'note13-closing', label: 'Balance at the end of year', valueCurrent: retainedClosing.current, valuePrevious: retainedClosing.previous },
        ]
      },
      {
        key: 'note13-oci',
        label: 'b) Other Comprehensive Income#',
        valueCurrent: oci.current,
        valuePrevious: oci.previous,
      },
      {
        key: 'note13-reserve',
        label: 'c) General reserve ^',
        valueCurrent: generalReserve.current,
        valuePrevious: generalReserve.previous,
      },
      {
        key: 'note13-total',
        label: '',
        isGrandTotal: true,
        valueCurrent: total.current,
        valuePrevious: total.previous,
      },
    ],
    footer: `* Retained earning comprises of the amounts that can be distributed as dividends to its equity shareholders.\n` +
            `# Actuarial gain or losses on gratuity are recognised in other comprehensive income.\n` +
            `^ This represents appropriation of profit by the company.`,
  };
};
const calculateNote14 = (): FinancialNote => {
  // MSME and Non-MSME dues
  const msme = {
    current: getAmount('amountCurrent', ['trade payables'], ['total outstanding dues of micro enterprises and small enterprises']),
    previous: getAmount('amountPrevious', ['trade payables'], ['total outstanding dues of micro enterprises and small enterprises']),
  };

  const nonMsme = {
    current: getAmount('amountCurrent', ['trade payables'], ['dues to related parties', 'total outstanding dues of creditors other than micro enterprises and small enterprises', 'creditors other than micro']),
    previous: getAmount('amountPrevious', ['trade payables'], ['dues to related parties', 'total outstanding dues of creditors other than micro enterprises and small enterprises', 'creditors other than micro']),
  };

  const grandTotal = {
    current: msme.current + nonMsme.current,
    previous: msme.previous + nonMsme.previous,
  };

  const calculateRowTotal = (row: string[]): string => {
  const sum = row
    .slice(0, 4)
    .reduce((acc, val) => acc + (parseFloat(val.replace(/,/g, '')) || 0), 0);
  return sum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseNum = (val: string): number => parseFloat(val.replace(/,/g, '')) || 0;
const calculateBalance = (rows: string[][]): string[] => {
  const result: number[] = [];

  for (let i = 0; i < 4; i++) {
    const colSum = rows.reduce((sum, row) => sum + parseNum(row[i]), 0);
    result.push(colSum);
  }

  const total = result.reduce((sum, val) => sum + val, 0);
  return [...result.map(val =>
    val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  ), total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })];
};

const MSME1 = ['3408.58', '', '', ''];
MSME1.push(calculateRowTotal(MSME1));
const MSME2 = ['-1976.63', '', '', ''];
MSME2.push(calculateRowTotal(MSME2));
const others1 = ['39536.96', '446.84', '430.49', '6721.71'];
others1.push(calculateRowTotal(others1));
const others2 = ['-37872.22', '-8770.21', '-6455.81', '-347.78'];
others2.push(calculateRowTotal(others2));
const balance2024 = calculateBalance([MSME1,others1]);
const balance2023 = calculateBalance([MSME2,others2]);

  return {
    noteNumber: 14,
    title: 'Trade payables',
    totalCurrent: null,
    totalPrevious: null,
    footer:'Note : Figures in brackets relates to previous year.',
    content: [
      'Trade Payables:',
      {
        key: 'note14-msme-group',
        label: '(i) Total outstanding dues of micro enterprises and small enterprises (MSME)',
        valueCurrent: msme.current,
        valuePrevious: msme.previous,
      },
      {
        key: 'note14-nonmsme-group',
        label: '(ii) Total outstanding dues of creditors other than micro enterprises and small enterprises',
        isSubtotal: true,
        valueCurrent: nonMsme.current,
        valuePrevious: nonMsme.previous,
      },
      {
        key: 'note14-total',
        label: '',
        isGrandTotal: true,
        valueCurrent: grandTotal.current,
        valuePrevious: grandTotal.previous,
      },
      '(Refer notes below)',
      'Note',
      'a) Dues to related parties (Refer note 31b) in trade payable {other than MSME} Rs. 26,398.24 Lakhs [31 March 2023: 35,845.48 Lakhs].',
      'b) Trade payables include foreign currency payables amounting to Rs.2,307.03 lakhs which are outstanding for a period greater than 6 months. The Company has informed about their status to the authorised dealer. The Company will obtain and ensure the requisite approvals wherever required before settling the overdue balances payable.',

      'The trade payables ageing schedule for the years ended as on 31 March is as follows :',
           {
        type: 'table',
        headers: [
          '\nParticulars',
          'Outstanding for following periods from due date\nLess than 1 year',
          'Outstanding for following periods from due date\n1-2 years',
          'Outstanding for following periods from due date\n2-3 years',
          'Outstanding for following periods from due date\nMore than 3 years',
          '\nTotal',
        ],
        rows: [
          ['(i) MSME ',...MSME1],
          ['',...MSME2],
          ['(ii) Others ',...others1],
          ['',...others2],
          ['Total Trade Payables as on 31st March 2024',...balance2024],
          ['Total Trade Payables as on 31st March 2023',...balance2023],
        ]
      },
    ],
  };
};
const calculateNote15 = (): FinancialNote => {
  const leaseLiabilitiesNonCurrent = {
    current: getAmount('amountCurrent', ['other non current financial liabilities'], ['long term  lease obligation']),
    previous: getAmount('amountPrevious', ['other non current financial liabilities'], ['long term  lease obligation']),
  };

  const unpaidDividends = {
    current: getAmount('amountCurrent', ['other current financial liabilities'], ['unpaid dividends']),
    previous: getAmount('amountPrevious', ['other current financial liabilities'], ['unpaid dividends']),
  };

  const capitalReduction = {
    current: getAmount('amountCurrent', ['other current financial liabilities'], ['amount payable on capital reduction']),
    previous: getAmount('amountPrevious', ['other current financial liabilities'], ['amount payable on capital reduction']),
  };

  const leaseLiabilitiesCurrent = {
    current: getAmount('amountCurrent', ['other current financial liabilities'], ['short term lease obligations']),
    previous: getAmount('amountPrevious', ['other current financial liabilities'], ['short term lease obligation']),
  };

  const payableToEmployees = {
    current: getAmount('amountCurrent', ['other current financial liabilities'], ['payable to employees']),
    previous: getAmount('amountPrevious', ['other current financial liabilities'], ['payable to employees']),
  };

  const leasePortion = {
    current: leaseLiabilitiesCurrent.current,
    previous: leaseLiabilitiesCurrent.previous,
  };

  const otherCurrentPortion = {
    current: unpaidDividends.current + capitalReduction.current + payableToEmployees.current+leaseLiabilitiesCurrent.current,
    previous: unpaidDividends.previous + capitalReduction.previous + payableToEmployees.previous+leaseLiabilitiesCurrent.previous,
  };

  const totalCurrent = {
    current: leasePortion.current + otherCurrentPortion.current,
    previous: leasePortion.previous + otherCurrentPortion.previous,
  };

  return {
    noteNumber: 15,
    title: 'Other financial liabilities',
    totalCurrent: null,
    totalPrevious: null,
    content: [
      {
        key: 'note15-noncurrent',
        label: 'Non-current',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'note15-nc-lease',
            label: '(a) Lease liabilities',
            valueCurrent: leaseLiabilitiesNonCurrent.current,
            valuePrevious: leaseLiabilitiesNonCurrent.previous,
          },
           {
            key: 'note15-nc-lease-total',
            label: '',
            valueCurrent: leaseLiabilitiesNonCurrent.current,
            valuePrevious: leaseLiabilitiesNonCurrent.previous,
            isGrandTotal:true,
          },
        ],
      },
      {
        key: 'note15-current',
        label: 'Current',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          { key: 'note15-c-unpaid', label: '(a) Unpaid dividends', valueCurrent: unpaidDividends.current, valuePrevious: unpaidDividends.previous },
          { key: 'note15-c-capred', label: '(b) Amount payable on capital reduction (Refer note 12 (f))', valueCurrent: capitalReduction.current, valuePrevious: capitalReduction.previous },
          { key: 'note15-c-lease', label: '(c) Lease liabilities', valueCurrent: leaseLiabilitiesCurrent.current, valuePrevious: leaseLiabilitiesCurrent.previous },
          { key: 'note15-c-emp', label: '(d) Payable to employees', valueCurrent: payableToEmployees.current, valuePrevious: payableToEmployees.previous },
          {
            key: 'note15-current-total',
            label: '',
            valueCurrent: otherCurrentPortion.current,
            valuePrevious: otherCurrentPortion.previous,
            isGrandTotal:true,
          },
        ],
      },
      'Note: Of the above, amount disclosed under:',
      {
        key: 'note15-footer-lease',
        label: 'Current portion of lease liabilities',
        valueCurrent: leaseLiabilitiesCurrent.current,
        valuePrevious: leaseLiabilitiesCurrent.previous,
      },
      {
        key: 'note15-footer-other',
        label: 'Other current financial liabilities',
        valueCurrent: otherCurrentPortion.current-leaseLiabilitiesCurrent.current,
        valuePrevious: otherCurrentPortion.previous-leaseLiabilitiesCurrent.previous,
      },
      {
        key: 'note15-total',
        label: 'Total',
        isGrandTotal: true,
        valueCurrent: leaseLiabilitiesCurrent.current+otherCurrentPortion.current-leaseLiabilitiesCurrent.current ,
        valuePrevious: leaseLiabilitiesCurrent.previous+otherCurrentPortion.previous-leaseLiabilitiesCurrent.previous,
      },
    ],
  };
};
const calculateNote16 = (): FinancialNote => {
  const unearnedRevenue = {
    current: getAmount('amountCurrent', ['other current liabilities'], ['income received in advance (unearned revenue)']),
    previous: getAmount('amountPrevious', ['other current liabilities'], ['income received in advance (unearned revenue)']),
  };

  const statutoryDues = {
    current: getAmount('amountCurrent', ['other current liabilities'], ['statutory dues ( including pf, esi, gst (net),withholding taxes, etc.)']),
    previous: getAmount('amountPrevious', ['other current liabilities'], ['statutory dues ( including pf, esi, gst (net),withholding taxes, etc.)']),
  };

  const advancesFromCustomers = {
    current: getAmount('amountCurrent', ['other current liabilities'], ['advances from customers']),
    previous: getAmount('amountPrevious', ['other current liabilities'], ['advances from customers']),
  };

  const otherPayablesTotal = {
    current: statutoryDues.current + advancesFromCustomers.current,
    previous: statutoryDues.previous + advancesFromCustomers.previous,
  };

  const totalCurrent = {
    current: unearnedRevenue.current + otherPayablesTotal.current,
    previous: unearnedRevenue.previous + otherPayablesTotal.previous,
  };

  return {
    noteNumber: 16,
    title: 'Other liabilities',
    totalCurrent: null,
    totalPrevious: null,
    content: [
      {
        key: 'note16-current',
        label: 'Current',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'note16-unearned',
            label: '(a) Unearned revenue',
            valueCurrent: unearnedRevenue.current,
            valuePrevious: unearnedRevenue.previous,
          },
          {
            key: 'note16-other-payables',
            label: '(b) Other payables',
            valueCurrent: null,
            valuePrevious: null,
            children: [
              {
                key: 'note16-statutory',
                label: '(i) Statutory dues (Including PF, ESI, GST (Net), withholding taxes, etc.)',
                valueCurrent: statutoryDues.current,
                valuePrevious: statutoryDues.previous,
              },
              {
                key: 'note16-adv-cust',
                label: '(ii) Advances from customers',
                valueCurrent: advancesFromCustomers.current,
                valuePrevious: advancesFromCustomers.previous,
              },
            ],
          },
        ],
      },
      {
        key: 'note16-total',
        label: 'Total',
        isGrandTotal: true,
        valueCurrent: totalCurrent.current,
        valuePrevious: totalCurrent.previous,
      },
    ],
  };
};
const calculateNote17 = (): FinancialNote => {
  const gratuity = {
    current: getAmount('amountCurrent', ['provisions- non current'], ['provision for gratuity']),
    previous: getAmount('amountPrevious', ['provisions- non current'], ['provision for gratuity']),
  };

  const constructionContracts = {
    current: getAmount('amountCurrent', ['provisions- current'], ['provision for construction contracts']),
    previous: getAmount('amountPrevious', ['provisions- current'], ['provision for construction contracts']),
  };

  const productSupport = {
    current: getAmount('amountCurrent', ['provisions- current'], ['provision for product support  (warranty)']),
    previous: getAmount('amountPrevious', ['provisions- current'], ['provision for product support  (warranty)']),
  };

  const onerousContracts = {
    current: getAmount('amountCurrent', ['provisions- current'], ['provision for estimated losses on onerous contracts']),
    previous: getAmount('amountPrevious', ['provisions- current'], ['provision for estimated losses on onerous contracts']),
  };

  const serviceTax = {
    current: getAmount('amountCurrent', ['provisions- current'], ['provision for service tax']),
    previous: getAmount('amountPrevious', ['provisions- current'], ['provision for service tax']),
  };

  const nonCurrentTotal = {
    current: gratuity.current,
    previous: gratuity.previous,
  };

  const currentTotal = {
    current: constructionContracts.current + productSupport.current + onerousContracts.current + serviceTax.current,
    previous: constructionContracts.previous + productSupport.previous + onerousContracts.previous + serviceTax.previous,
  };

  return {
    noteNumber: 17,
    title: 'Provisions',
    totalCurrent: null,
    totalPrevious: null,
    content: [
      {
        key: 'note17-noncurrent',
        label: 'Non-current',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'note17-gratuity',
            label: '(a) Provision for employee benefits:',
            valueCurrent: null,
            valuePrevious: null,
            children: [
              {
                key: 'note17-gratuity-net',
                label: '  (i) Provision for gratuity (net) (Refer Note No. 28)',
                valueCurrent: gratuity.current,
                valuePrevious: gratuity.previous,
              },
              {
            key: 'note17-gratuity-total',
            label: '',
            valueCurrent: gratuity.current,
            valuePrevious: gratuity.previous,
            isGrandTotal:true,
          },
            ],
          },
        ],
      },
      {
        key: 'note17-current',
        label: 'Current',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'note17-provisions-others',
            label: '(b) Provision - others: (Refer Note No. 33)',
            isSubtotal: true,
            valueCurrent: null,
            valuePrevious: null,
            children: [
              {
                key: 'note17-const',
                label: '  (i) Provision for construction contracts',
                valueCurrent: constructionContracts.current,
                valuePrevious: constructionContracts.previous,
              },
              {
                key: 'note17-warranty',
                label: '  (ii) Provision for product support (Warranty)',
                valueCurrent: productSupport.current,
                valuePrevious: productSupport.previous,
              },
              {
                key: 'note17-onerous',
                label: '  (iii) Provision for estimated losses on onerous contracts',
                valueCurrent: onerousContracts.current,
                valuePrevious: onerousContracts.previous,
              },
              {
                key: 'note17-service-tax',
                label: '  (iv) Provision for Service Tax',
                valueCurrent: serviceTax.current,
                valuePrevious: serviceTax.previous,
              },
            ],
          },
        ],
      },
      {
        key: 'note17-total',
        label: 'Total',
        isGrandTotal: true,
        valueCurrent: currentTotal.current,
        valuePrevious: currentTotal.previous,
      },
    ],
  };
};
const calculateNote18 = (): FinancialNote => {
  // Section A.1 - Type of goods or services
  
const instrumentation = {
  current: Number((99583.91383 + (1888837885 / 1e5)).toFixed(2)), // 1e5 = 100000
  previous: Number((67930.9524654).toFixed(2)),
};


  const spares = {
    current: Number((10855.38225).toFixed(2)),
    previous: Number((7644.11264).toFixed(2)),
  };
 const constructionContracts = {
  current: instrumentation.current + spares.current,
  previous:instrumentation.previous + spares.previous
 }

  const tradedGoods = {
    current: 58074.91,
    previous: Number((35641.39455).toFixed(2)),
  };
  const saleOfProducts = {
    current: tradedGoods.current+constructionContracts.current,
    previous: tradedGoods.previous+constructionContracts.previous,
  };
  const amcTraining = {
  current: Number((687043206/1e5).toFixed(2)), // 1e5 = 10^5
  previous: Number((25309.67739).toFixed(2)),
  };

const itSupport = {
  current: Number(((1006370313 / 1e5) + 0.42).toFixed(2)), // 1e5 = 10^5
  previous: Number((5466.9400646).toFixed(2)),
};

  const saleOfServices = {
    current: amcTraining.current+itSupport.current,
    previous:amcTraining.previous+itSupport.previous ,
  };
  const scrapSales = {
    current: Math.abs(getAmount('amountCurrent', ['other operating revenue '], ['sale of scrap'])),
    previous: Math.abs(getAmount('amountPrevious', ['other operating revenue '], ['sale of scrap'])),
  };

  const pointInTime = {
    current: Number((scrapSales.current+92351.5).toFixed(2)),
    previous: Number((63719.72007).toFixed(2)),
  };

  const overTime = {
    current: 111985.2,
    previous: Number((78289.42704).toFixed(2)),
  };

  const outsideIndia = {
    current: 42873.18,
    previous: Number((32508.8549).toFixed(2)),
  };

  const total = {
    current: saleOfProducts.current + saleOfServices.current + scrapSales.current,
    previous: saleOfProducts.previous + saleOfServices.previous + scrapSales.previous,
  };

  const india = {
    current: Number((total.current - 42873.18).toFixed(2)),
    previous: Number((109500.29221).toFixed(2)),
  };

    const contractBalances = {
    tradeReceivables: {
    current: Math.abs(getAmount('amountCurrent', ['trade receivables'], ['trade receivables','allowances for doubtful debts'])),
    previous: Math.abs(getAmount('amountPrevious', ['trade receivables'], ['trade receivables','allowances for doubtful debts'])),
    },
    contractAssets: {
    current: Math.abs(getAmount('amountCurrent', ['other current financial assets'], ['unbilled receivable'])),
    previous: Math.abs(getAmount('amountPrevious', ['other current financial assets'], ['unbilled receivable'])),
    },
    contractLiabilities: {
    current: Math.abs(getAmount('amountCurrent', ['other current liabilities'], ['income received in advance (unearned revenue)'])+ getAmount('amountCurrent', ['other current liabilities'], ['advances from customers'])+getAmount('amountCurrent', ['provisions- current'], ['provision for product support  (warranty)'])),
    previous: Math.abs(getAmount('amountPrevious', ['other current liabilities'], ['income received in advance (unearned revenue)'])+ getAmount('amountPrevious', ['other current liabilities'], ['advances from customers'])+getAmount('amountPrevious', ['provisions- current'], ['provision for product support  (warranty)'])),
    }
  };

  // 18.2 Performance Obligations
  const remainingPerformanceObligations = {
    withinOneYear: {
      current: 97323.14,
      previous: Number((82011.2819964).toFixed(2)),
    },
    moreThanOneYear: {
      current: 51225.86,
      previous: Number((37225.1121871005).toFixed(2)),
    },
  };

  return {
    noteNumber: 18,
    title: 'Revenue from Operations',
    subtitle: 'Disaggregated revenue information',
    totalCurrent: null,
    totalPrevious: null,
    content: [
      'Set out below is the disaggregation of the Company’s revenue from contracts with customers',
      {
        key: 'note18-disaggregate',
        label: 'Type of goods or services',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          { key: 'note18-sale-prod', label: '(a) Sale of Products (Refer Note (i) below)', valueCurrent: saleOfProducts.current, valuePrevious: saleOfProducts.previous },
          { key: 'note18-sale-serv', label: '(b) Sale of Services (Refer Note (ii) below)', valueCurrent: saleOfServices.current, valuePrevious: saleOfServices.previous },
          { key: 'note18-other-prod-serv', label: '', isSubtotal:true,valueCurrent: saleOfProducts.current+saleOfServices.current, valuePrevious: saleOfProducts.previous+saleOfServices.previous },
          { key: 'note18-other-rev', label: '(c) Other operating revenues (Refer Note (iii) below)', valueCurrent: scrapSales.current, valuePrevious: scrapSales.previous },
          { key: 'note18-other-rev-total', label: '', isSubtotal:true,valueCurrent: scrapSales.current, valuePrevious: scrapSales.previous },
          { key: 'note18-other-rev-total-final', label: 'Total Net Revenue', isSubtotal:true,valueCurrent: total.current, valuePrevious: total.previous },
        ]
      },
      {
        key: 'note18-sale-products-group',
        label: `Note(i)    Sale of products comprises:
                            Revenue from construction contracts`,
        valueCurrent: null,
        valuePrevious: null,
        children: [
        
              { key: 'note18-process', label: 'Process control instrumentation systems', valueCurrent: instrumentation.current, valuePrevious: instrumentation.previous },
              { key: 'note18-spares', label: 'Spares and others', valueCurrent: spares.current, valuePrevious: spares.previous },
              {
            key: 'note18-sale-products-group-total',
            label: 'Total - Revenue from construction contracts & others',
            valueCurrent: constructionContracts.current,
            valuePrevious: constructionContracts.previous,
            isGrandTotal:true,
          },
          ]
        },
          {
            key: 'note18-traded-goods',
            label: 'Sale of traded goods',
            valueCurrent: null,
            valuePrevious: null,
            children: [
              { key: 'note18-products', label: 'Products and Accessories', valueCurrent: tradedGoods.current, valuePrevious: tradedGoods.previous },
              {
            key: 'note18-traded-goods-total',
            label: 'Total - Sale of traded goods',
            valueCurrent: tradedGoods.current,
            valuePrevious: tradedGoods.previous,
            isGrandTotal:true,
          },
            ],
          },
           {
            key: 'note18-products-total',
            label: 'Total - Sale of products',
            valueCurrent: saleOfProducts.current,
            valuePrevious: saleOfProducts.previous,
            isGrandTotal:true,
          },
      {
        key: 'note18-sale-services',
        label: 'Note (ii) Sale of services comprises:',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          { key: 'note18-amc', label: 'AMC, Training, etc.', valueCurrent: amcTraining.current, valuePrevious: amcTraining.previous },
          { key: 'note18-it', label: 'IT support services', valueCurrent: itSupport.current, valuePrevious: itSupport.previous },
           {
            key: 'note18-sale-services-total',
            label: 'Total - Sale of services',
            valueCurrent: saleOfServices.current,
            valuePrevious: saleOfServices.previous,
            isGrandTotal:true,
          },
        ]
      },
      {
        key: 'note18-other-op',
        label: 'Note (iii) Other operating revenue comprises:',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          { key: 'note18-scrap', label: 'Sale of scrap', valueCurrent: scrapSales.current, valuePrevious: scrapSales.previous },
           {
            key: 'note18-other-op-total',
            label: 'Total - Other operating revenue',
            valueCurrent: scrapSales.current,
            valuePrevious: scrapSales.previous,
            isGrandTotal:true,
          },
        ]
      },
      {
        key: 'note18-timing',
        label: 'Timing of revenue recognition',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          { key: 'note18-time-point', label: 'Goods transferred at a point in time', valueCurrent: pointInTime.current, valuePrevious: pointInTime.previous },
          { key: 'note18-time-over', label: 'Services transferred over time', valueCurrent: overTime.current, valuePrevious: overTime.previous },
           {
            key: 'note18-timing-total',
            label: 'Total revenue from contracts with customers',
            valueCurrent: pointInTime.current+pointInTime.previous ,
            valuePrevious: pointInTime.previous+overTime.current,
            isGrandTotal:true,
          },
        ]
      },
      {
        key: 'note18-geo',
        label: '',
        valueCurrent: null,
        valuePrevious: null,
        children: [
          { key: 'note18-india', label: 'India', valueCurrent: india.current, valuePrevious: india.previous },
          { key: 'note18-out-india', label: 'Outside India', valueCurrent: outsideIndia.current, valuePrevious: outsideIndia.previous },
          {
            key: 'note18-geo-total',
            label: 'Total revenue from contracts with customers',
            valueCurrent: india.current+outsideIndia.current,
            valuePrevious: india.previous +outsideIndia.previous,
            isGrandTotal:true,
          },
        ]
      },
      `The Company presented disaggregated revenue based on the type of goods or services provided to customers, the geographical region, and the timing of transfer of goods and services. 
       The Company presented a reconciliation of the disaggregated revenue with the revenue information disclosed for each reportable segment. Refer note 30 for the detailed information.`,
      {
        key: 'note18-contract-balances',
        label: '18.1 Contract balances',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          { key: 'contract-trade-receivables', label: 'Trade receivables', valueCurrent: contractBalances.tradeReceivables.current, valuePrevious: contractBalances.tradeReceivables.previous },
          { key: 'contract-assets', label: 'Contract assets', valueCurrent: contractBalances.contractAssets.current, valuePrevious: contractBalances.contractAssets.previous },
          { key: 'contract-liabilities', label: 'Contract liabilities', valueCurrent: contractBalances.contractLiabilities.current, valuePrevious: contractBalances.contractLiabilities.previous },
        ],
        },
        'Trade receivables are non-interest bearing and are generally on terms of 30 to 90 days. At 31 March 2024, ₹ 7,050.91 Lakhs (31 March 2023: ₹ 4,608.50 Lakhs ) was recognised as provision for expected credit losses on trade receivables.',
        'Contract assets relates to revenue earned from ongoing supply and installation service contracts as well as retention money receivable from customers. As such, the balances of this account vary and depend on the number of such contracts at the end of the year.',
        'Contract liabilities include long-term advances received to and short-term advances received to render supply and installation services as well as transaction price allocated to unexpired service obligations.',
          {
            key: 'note18-performance-obligation-total',
            label: `18.2 Performance obligation
            
            Information about the Company's performance obligations are summarised below:
            
            Industrial Automation Services`,
            valueCurrent: saleOfProducts.current,
            valuePrevious: saleOfProducts.previous,
            isGrandTotal:true,
          },

          'The performance obligation is satisfied over-time and payment is generally due upon completion of installation and acceptance of the customer. In some contracts, short-term advances are required before the installation service is provided',
          'Procurement services',
          'There are contracts with customers to acquire buy out items like UPS, Cables Batteries, on their behalf, The Company is acting as agent in these arrangements. The performance obligation is satisfied, and payment is due upon receipt of the equipment by the customer.',

      {
        key: 'note18-performance-obligation',
        label: `The transaction price allocated to the remaining performance obligations (unsatisfied or partially unsatisfied) as at 31 March are, as follows:`,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          { key: 'performance-within-1y', label: 'Within one year', valueCurrent: remainingPerformanceObligations.withinOneYear.current, valuePrevious: remainingPerformanceObligations.withinOneYear.previous },
          { key: 'performance-more-1y', label: 'More than one year', valueCurrent: remainingPerformanceObligations.moreThanOneYear.current, valuePrevious: remainingPerformanceObligations.moreThanOneYear.previous },
          {
            key: 'note18-performance-obligation-total',
            label: '',
            valueCurrent: remainingPerformanceObligations.withinOneYear.current+remainingPerformanceObligations.moreThanOneYear.current,
            valuePrevious: remainingPerformanceObligations.withinOneYear.previous+remainingPerformanceObligations.moreThanOneYear.previous,
            isGrandTotal:true,
          },

        ],
}
    ]
  };
};
const calculateNote19 = (): FinancialNote => {
  const interestBank = {
    current: -(getAmount('amountCurrent', ['other income'], ['interest income'])),
    previous:-( getAmount('amountPrevious', ['other income'], ['interest income'])),
  };

  const interestOther = {
    current: -(getAmount('amountCurrent', ['other income'], ['interest from financial assets at amortised cost'])),
    previous: -(getAmount('amountPrevious', ['other income'], ['interest from financial assets at amortised cost'])),
  };

  const totalInterestIncome = {
    current: interestBank.current + interestOther.current,
    previous: interestBank.previous + interestOther.previous,
  };

  const reimbursements = {
  current: Number(((834608.6 / 1e5)).toFixed(2)), // 1e5 = 100000
  previous: Number((87.70922).toFixed(2)),
  };

  const bondRecoveries = {
    current: 0,
    previous: 4.46,
  };

  const insuranceRefund = {
    current: 0,
    previous: Number((2.21368).toFixed(2)),
  };

  const others = {
    current: -(getAmount('amountCurrent', ['other income'], ['other non-operating income ']))-reimbursements.current,
    previous: 33.08,
  };

  const totalMiscIncome = {
    current: reimbursements.current + bondRecoveries.current + insuranceRefund.current + others.current,
    previous: reimbursements.previous + bondRecoveries.previous + insuranceRefund.previous + others.previous,
  };

  const totalOtherIncome = {
    current: totalInterestIncome.current + totalMiscIncome.current,
    previous: totalInterestIncome.previous + totalMiscIncome.previous,
  };

  return {
    noteNumber: 19,
    title: 'Other income',
    totalCurrent: null,
    totalPrevious: null,
    content: [
      {
        key: 'note19-summary',
        label: 'Note 19 Other income',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'note19-interest',
            label: '(a) Interest income (Refer Note (i) below)',
            valueCurrent: totalInterestIncome.current,
            valuePrevious: totalInterestIncome.previous,
          },
          {
            key: 'note19-other',
            label: `(b) Other non-operating income: 
                               Miscellaneous Income (Refer Note (ii) below)`,
            valueCurrent: totalMiscIncome.current,
            valuePrevious: totalMiscIncome.previous,
          },
          {
            key: 'note19-summary-total',
            label: '',
            valueCurrent: totalOtherIncome.current,
            valuePrevious: totalOtherIncome.previous,
            isGrandTotal:true,
          },

        ]
      },
      {
        key: 'note19-interest-breakup',
        label: 'Note (i) Interest income on financial assets at amortised cost comprises:',
        valueCurrent: null,
        valuePrevious: null,
        children: [
          { key: 'note19-bank', label: '-Interest income from bank on deposits', valueCurrent: interestBank.current, valuePrevious: interestBank.previous },
          { key: 'note19-other-interest', label: '-Interest income on other financial assets', valueCurrent: interestOther.current, valuePrevious: interestOther.previous },
          {
            key: 'note19-interest-breakup-total',
            label: 'Total - Interest income',
            valueCurrent: totalInterestIncome.current,
            valuePrevious: totalInterestIncome.previous,
            isGrandTotal:true,
          },
        ]
      },
      {
        key: 'note19-misc-breakup',
        label: 'Note (ii) Other non-operating income comprises:',
        valueCurrent: null,
        valuePrevious: null,
        children: [
          { key: 'note19-reimb', label: '(a) Reimbursements from YHQ', valueCurrent: reimbursements.current, valuePrevious: reimbursements.previous },
          { key: 'note19-bond', label: '(b) Bond Recoveries', valueCurrent: bondRecoveries.current, valuePrevious: bondRecoveries.previous },
          { key: 'note19-insurance', label: '(c) Insurance Refund', valueCurrent: insuranceRefund.current, valuePrevious: insuranceRefund.previous },
          { key: 'note19-others', label: '(d) Others', valueCurrent: others.current, valuePrevious: others.previous },
          {
            key: 'note19-misc-breakup-total',
            label: 'Total - Miscellaneous Income',
            valueCurrent: totalMiscIncome.current,
            valuePrevious: totalMiscIncome.previous,
            isGrandTotal:true,
          },
        ]
      }
    ]
  };
};
const calculateNote20 = (): FinancialNote => {
      const allRawMaterials = {
        current: getAmount("amountCurrent", ["inventories"], ["raw material"]),
        previous: getAmount(
          "amountPrevious",
          ["inventories"],
          ["raw material"]
        ),
      };

      const clossingStock = {
        current: allRawMaterials.current,
        previous: allRawMaterials.previous,
      };

      const openStock = {
        current: allRawMaterials.previous,
        previous: 650.79,
      };

      const costOfMaterialsConsumed = {
        current: getAmount(
          "amountCurrent",
          ["direct expenses", "cost of material consumed"],
          ["cost of materials consumed"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["direct expenses", "cost of material consumed"],
          ["cost of materials consumed"]
        ),
      };

      const produtAndAccessories = {
        current: 50087.71,
        previous: 30082.82,
      };

      const workInProgress = {
        current: getAmount(
          "amountCurrent",
          ["inventories"],
          ["work-in-progress"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["inventories"],
          ["work-in-progress"]
        ),
      };

      const goodsInTransitStock = {
        current: getAmount(
          "amountCurrent",
          ["inventories"],
          ["goods-in-transit- (acquired for trading)"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["inventories"],
          ["goods-in-transit- (acquired for trading)"]
        ),
      };

      const allStockInTrade = {
        current: getAmount(
          "amountCurrent",
          ["inventories"],
          ["stock-in-trade"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["inventories"],
          ["stock-in-trade"]
        ),
      };

      const stockInTradeSubTotal = {
        current: allStockInTrade.current + goodsInTransitStock.current,
        previous: allStockInTrade.previous + goodsInTransitStock.previous,
      };

      const workInProgressBOY = {
        current: workInProgress.previous,
        previous: 1431.0,
      };
      const stockInTradeBOY = {
        current: stockInTradeSubTotal.previous,
        previous: 3496.34,
      };

      const inventoryEOY = {
        current: stockInTradeSubTotal.current + workInProgress.current,
        previous: stockInTradeSubTotal.previous + workInProgress.previous,
      };
      const inventoryBOY = {
        current: stockInTradeBOY.current + workInProgressBOY.current,
        previous: stockInTradeBOY.previous + workInProgressBOY.previous,
      };

      const netIncDec = {
        current: inventoryBOY.current - inventoryEOY.current,
        previous: inventoryBOY.previous - inventoryEOY.previous,
      };

      const purchase = {
        current:
          costOfMaterialsConsumed.current -
          produtAndAccessories.current -
          netIncDec.current -
          openStock.current +
          clossingStock.current,
        previous:
          costOfMaterialsConsumed.previous -
          produtAndAccessories.previous -
          netIncDec.previous -
          openStock.previous +
          clossingStock.previous,
      };
      const subTotal = {
        current: purchase.current + openStock.current - clossingStock.current,
        previous:
          purchase.previous + openStock.previous - clossingStock.previous,
      };

      return {
        noteNumber: 20,
        title: "",
        totalCurrent: null,
        totalPrevious: null,
        content: [
          {
            key: "note20-cogs",
            label: "a Cost of materials consumed",
            isGrandTotal: true,
            valueCurrent: null,
            valuePrevious: null,
            children: [
              {
                key: "note20-openstock",
                label: "Opening stock",
                valueCurrent: openStock.current,
                valuePrevious: openStock.previous,
              },
              {
                key: "note20-purchase",
                label: "Add: Purchases",
                valueCurrent: purchase.current,
                valuePrevious: purchase.previous,
              },
              {
            key: 'note20-cogs-total',
            label: '',
            valueCurrent: openStock.current + purchase.current,
            valuePrevious: openStock.previous + purchase.previous,
            isGrandTotal:true,
          },

              {
                key: "note20-closingstock",
                label: "Less: Closing stock",
                valueCurrent: clossingStock.current,
                valuePrevious: clossingStock.previous,
              },
              {
            key: 'note20-cogs-total-final',
            label: 'Total',
            valueCurrent: subTotal.current,
            valuePrevious: subTotal.previous,
            isGrandTotal:true,
          },
            ],
          },
          {
            key: "note20-purchase-traded-goods",
            label: "Note 20b Purchase of traded goods",
            isSubtotal: true,
            valueCurrent: null,
            valuePrevious: null,
            children: [
              {
                key: "note20-prod-access",
                label: "Products and Accessories",
                valueCurrent: produtAndAccessories.current,
                valuePrevious: produtAndAccessories.previous,
              },
          {
            key: 'note20-purchase-traded-goods-total',
            label: 'Total',
            valueCurrent: produtAndAccessories.current,
            valuePrevious: produtAndAccessories.previous,
            isGrandTotal:true,
          },
            ],
          },
          {
            key: "note20-changes-in-inventories",
            label:
              "Note 20c Changes in inventories of work-in-progress and stock in trade",
            isSubtotal: true,
            valueCurrent: null,
            valuePrevious: null,
            children: [
              {
                key: "note20-inventory-eoy",
                label: "Inventories at the end of the year:",
                isSubtotal: true,
                valueCurrent: null,
                valuePrevious: null,
                children: [
                  {
                    key: "note20-inventory-eoy-wip",
                    label: "Work-in-progress",
                    valueCurrent: workInProgress.current,
                    valuePrevious: workInProgress.previous,
                  },
                  {
                    key: "note20-inventory-eoy-sit",
                    label: "Stock-in-trade",
                    valueCurrent: stockInTradeSubTotal.current,
                    valuePrevious: stockInTradeSubTotal.previous,
                  },
                 {
            key: 'note20-inventory-eoy-total',
            label: '',
            valueCurrent: inventoryEOY.current,
            valuePrevious: inventoryEOY.previous,
            isGrandTotal:true,
          },
                ],
              },

              {
                key: "note20-inventory-boy",
                label: "Inventories at the beginning of the year:",
                isSubtotal: true,
                valueCurrent: null,
                valuePrevious: null,
                children: [
                  {
                    key: "note20-inventory-boy-wip",
                    label: "Work-in-progress",
                    valueCurrent: workInProgressBOY.current,
                    valuePrevious: workInProgressBOY.previous,
                  },
                  {
                    key: "note20-inventory-boy-sit",
                    label: "Stock-in-trade",
                    valueCurrent: stockInTradeBOY.current,
                    valuePrevious: stockInTradeBOY.previous,
                  },
                  {
            key: 'note20-inventory-boy-total',
            label: '',
            valueCurrent: inventoryBOY.current,
            valuePrevious: inventoryBOY.previous,
            isGrandTotal:true,
          },
                ],
              },
              {
            key: 'note20-changes-in-inventories-total',
            label: 'Net (increase)/ Decrease',
            valueCurrent: netIncDec.current,
            valuePrevious: netIncDec.previous,
            isGrandTotal:true,
          },
            ],
          },
        ],
      };
    };
const calculateNote21 = (): FinancialNote => {
      const salary = {
        current: getAmount(
          "amountCurrent",
          ["employee benefits expense"],
          ["salaries and wages"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["employee benefits expense"],
          ["salaries and wages"]
        ),
      };
      const contribution = {
        current: getAmount(
          "amountCurrent",
          ["employee benefits expense"],
          ["contributions to provident and other funds"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["employee benefits expense"],
          ["contributions to provident and other funds"]
        ),
      };
      const welfare = {
        current: getAmount(
          "amountCurrent",
          ["employee benefits expense"],
          ["staff welfare expenses"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["employee benefits expense"],
          ["staff welfare expenses"]
        ),
      };

      const grandTotal = {
        current: salary.current + contribution.current + welfare.current,
        previous: salary.previous + contribution.previous + welfare.previous,
      };

      return {
        noteNumber: 21,
        title: "Employee benefits expense",
        totalCurrent: null,
        totalPrevious: null,
        content: [
          {
            key: "note21-salary-wages",
            label: "Salaries, wages and Bonus",

            valueCurrent: salary.current,
            valuePrevious: salary.previous,
          },
          {
            key: "note21-contribution",
            label:
              "Contributions to provident and other funds (Refer Note No. 28(a))",
            valueCurrent: contribution.current,
            valuePrevious: contribution.previous,
          },
          {
            key: "note21-employee-benefits",
            label: "Staff welfare expenses",
            valueCurrent: welfare.current,
            valuePrevious: welfare.previous,
          },
          {
            key: "note21-total",
            label: "",
            isGrandTotal: true,
            valueCurrent: grandTotal.current,
            valuePrevious: grandTotal.previous,
          },
        ],
      };
    };
const calculateNote22 = (): FinancialNote => {
      const leaseLiability = {
        current: getAmount(
          "amountCurrent",
          ["finance cost"],
          ["interest under ind as-116"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["finance cost"],
          ["interest under ind as-116"]
        ),
      };
      const msme = {
        current: getAmount(
          "amountCurrent",
          ["finance cost"],
          ["msme interest"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["finance cost"],
          ["msme interest"]
        ),
      };
      const others = {
        current: getAmount(
          "amountCurrent",
          ["finance cost"],
          ["other interest"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["finance cost"],
          ["other interest"]
        ),
      };

      const grandTotal = {
        current: leaseLiability.current + msme.current + others.current,
        previous: leaseLiability.previous + msme.previous + others.previous,
      };

      return {
        noteNumber: 22,
        title: "Finance cost",
        totalCurrent: null,
        totalPrevious: null,
        content: [
          {
            key: "note22-interest",
            label: "Interest expense on:",
            valueCurrent: null,
            valuePrevious: null,
            children: [
              {
                key: "note22-lease-liability",
                label: "Lease liability",
                valueCurrent: leaseLiability.current,
                valuePrevious: leaseLiability.previous,
              },
              {
                key: "note22-contribution",
                label: "MSME Interest",
                valueCurrent: msme.current,
                valuePrevious: msme.previous,
              },
              {
                key: "note22-employee-benefits",
                label: "Others",
                valueCurrent: others.current,
                valuePrevious: others.previous,
              },
            ],
          },

          {
            key: "note22-total",
            label: "",
            isGrandTotal: true,
            valueCurrent: grandTotal.current,
            valuePrevious: grandTotal.previous,
          },
        ],
      };
    };
const calculateNote23 = (): FinancialNote => {
      const property = {
        current: getAmount(
          "amountCurrent",
          ["depreciation expense"],
          ["depreciation for the year on property, plant and equipment"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["depreciation expense"],
          ["depreciation for the year on property, plant and equipment"]
        ),
      };
      const rouAsset = {
        current: getAmount(
          "amountCurrent",
          ["depreciation expense"],
          ["depreciation on rou asset"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["depreciation expense"],
          ["depreciation on rou asset"]
        ),
      };
      const intangibleAsset = {
        current: getAmount(
          "amountCurrent",
          ["depreciation expense"],
          ["amortization for the year on intangible assets"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["depreciation expense"],
          ["amortization for the year on intangible assets"]
        ),
      };

      const grandTotal = {
        current: property.current + rouAsset.current + intangibleAsset.current,
        previous: property.previous + rouAsset.previous + intangibleAsset.previous,
      };

      return {
        noteNumber: 23,
        title: "Depreciation Expense ",
        totalCurrent: 0,
        totalPrevious: 0,
        content: [
          {
            key: "note23-subhead",
            label: "Depreciation/ Amortisation",
            valueCurrent: null,
            valuePrevious: null,
            children: [
              {
                key: "note23-property",
                label: "Property, plant and equipment : Refer Note 3a",
                valueCurrent: property.current,
                valuePrevious: property.previous,
              },
              {
                key: "note23-right-of-use-asset",
                label: "Right of use asset : Refer Note 4a",
                valueCurrent: rouAsset.current,
                valuePrevious: rouAsset.previous,
              },
              {
                key: "note23-intangible-assets",
                label: "Intangible assets : Refer Note 4b",
                valueCurrent: intangibleAsset.current,
                valuePrevious: intangibleAsset.previous,
              },
            ],
          },

          {
            key: "note23-total",
            label: "",
            isGrandTotal: true,
            valueCurrent: grandTotal.current,
            valuePrevious: grandTotal.previous,
          },
        ],
      };
    };
const calculateNote24 = (): FinancialNote => {
      const packingMaterial = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["consumption of packing materials"]
        )+0.01,
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["consumption of packing materials"]
        )+0.01,
      };
      const powerFuel = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["power and fuel"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["power and fuel"]
        ),
      };
      const rent = {
        current: getAmount(  "amountCurrent",
          ["other expenses"],
          ["rent including lease rentals"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["rent including lease rentals"]
        ),
      };
      const buildingRepair = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["repairs and maintenance - buildings"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["repairs and maintenance - buildings"]
        ),
      };
      const otherRepair = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["repairs and maintenance - others"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["repairs and maintenance - others"]
        ),
      };
      const systemUsage = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["system usage fee (ygs implementation cost)"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["system usage fee (ygs implementation cost)"]
        ),
      };
      const insurance = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["insurance"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["insurance"]
        ),
      };
      const ratesTaxes = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["rates and taxes"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["rates and taxes"]
        ),
      };
      const communication = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["communication"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["communication"]
        ),
      };
      const travelling = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["travelling and conveyance"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["travelling and conveyance"]
        ),
      };
      const lossonFD = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["loss on fixed assets sold / scrapped / written off "]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["loss on fixed assets sold / scrapped / written off "]
        ),
      };
      const printingandStationery = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["printing and stationery"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["printing and stationery"]
        ),
      };
      const sellingExpence = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["selling expenses"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["selling expenses"]
        ),
      };
      const salesCommission = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["sales commission"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["sales commission"]
        ),
      };
      const Donations = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["donations and contributions"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["donations and contributions"]
        ),
      };
      const legalProfessional = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["legal and professional"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["legal and professional"]
        ),
      };
      const netLossFC = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["net loss on foreign currency transactions and translation"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["net loss on foreign currency transactions and translation"]
        ),
      };
      const doubtfulTrade  = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["provision for doubtful trade receivables/(provision written back) (net)"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["provision for doubtful trade receivables/(provision written back) (net)"]
        ),
      };
      const estimateLoss = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["provision for estimated losses on construction contracts /(provision written back)"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["provision for estimated losses on construction contracts /(provision written back)"]
        ),
      };
      const expLoss = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["provision for expected loss on onerous contracts"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["provision for expected loss on onerous contracts"]
        ),
      };
      const sittingFee = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["directors' sitting fees"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["directors' sitting fees"]
        ),
      };
      const bankCharge = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["bank charges "]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["bank charges "]
        ),
      };
      const corpSocialResp = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["corporate social responsibility"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["corporate social responsibility"]
        ),
      };
      const usageFee = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["prism usage fees"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["prism usage fees"]
        ),
      };
      const globSaleFee = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["global sales and marketing activity fee"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["global sales and marketing activity fee"]
        ),
      };
      const managementFee = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["management fee"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["management fee"]
        ),
      };
      const engSerFee = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["engineering service fees"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["engineering service fees"]
        ),
      };
      const engSupFee = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["engineering support fees"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["engineering support fees"]
        ),
      };
      const supSerFee = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["support service fees"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["support service fees"]
        ),
      };
      const subContract = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["sub-contract expenses"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["sub-contract expenses"]
        ),
      };
      const eduTraining = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["education & training "]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["education & training "]
        ),
      };
      const reqExp = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["recruitment expense"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["recruitment expense"]
        ),
      };
      const warantyExp = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["warranty expenses"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["warranty expenses"]
        ),
      };
      const membership = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["membership fees"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["membership fees"]
        ),
      };
      const miscellaneous = {
        current: getAmount(
          "amountCurrent",
          ["other expenses"],
          ["miscellaneous expenses"]
        ),
        previous: getAmount(
          "amountPrevious",
          ["other expenses"],
          ["miscellaneous expenses"]
        ),
      };


      const grandTotal = {
        current: packingMaterial.current +
                  powerFuel.current +
                  rent.current +
                  buildingRepair.current +
                  otherRepair.current +
                  systemUsage.current +
                  insurance.current +
                  ratesTaxes.current +
                  communication.current +
                  travelling.current +
                  lossonFD.current +
                  printingandStationery.current +
                  sellingExpence.current +
                  salesCommission.current +
                  Donations.current +
                  legalProfessional.current +
                  netLossFC.current +
                  doubtfulTrade.current +
                  estimateLoss.current +
                  expLoss.current +
                  sittingFee.current +
                  bankCharge.current +
                  corpSocialResp.current +
                  usageFee.current +
                  globSaleFee.current +
                  managementFee.current +
                  engSerFee.current +
                  engSupFee.current +
                  supSerFee.current +
                  subContract.current +
                  eduTraining.current +
                  reqExp.current +
                  warantyExp.current +
                  membership.current +
                  miscellaneous.current,
        previous: packingMaterial.previous +
                  powerFuel.previous +
                  rent.previous +
                  buildingRepair.previous +
                  otherRepair.previous +
                  systemUsage.previous +
                  insurance.previous +
                  ratesTaxes.previous +
                  communication.previous +
                  travelling.previous +
                  lossonFD.previous +
                  printingandStationery.previous +
                  sellingExpence.previous +
                  salesCommission.previous +
                  Donations.previous +
                  legalProfessional.previous +
                  netLossFC.previous +
                  doubtfulTrade.previous +
                  estimateLoss.previous +
                  expLoss.previous +
                  sittingFee.previous +
                  bankCharge.previous +
                  corpSocialResp.previous +
                  usageFee.previous +
                  globSaleFee.previous +
                  managementFee.previous +
                  engSerFee.previous +
                  engSupFee.previous +
                  supSerFee.previous +
                  subContract.previous +
                  eduTraining.previous +
                  reqExp.previous +
                  warantyExp.previous +
                  membership.previous +
                  miscellaneous.previous
      };

      return {
        noteNumber: 24,
        title: "Other expenses",
        totalCurrent: null,
        totalPrevious: null,
        content: [
          
              {
                key: "note24-packingMaterial",
                label: "Consumption of packing materials",
                valueCurrent: packingMaterial.current,
                valuePrevious: packingMaterial.previous,
              },
              {
                key: "note24-powerFuel",
                label: "Power and fuel",
                valueCurrent: powerFuel.current,
                valuePrevious: powerFuel.previous,
              },
              {
                key: "note24-rent",
                label: "Rent including lease rentals ",
                valueCurrent: rent.current,
                valuePrevious: rent.previous,
              },
              {
                key: "note24-buildingRepair",
                label: "Repairs and maintenance - Buildings",
                valueCurrent: buildingRepair.current,
                valuePrevious: buildingRepair.previous,
              },
              {
                key: "note24-otherRepair",
                label: "Repairs and maintenance - Others",
                valueCurrent: otherRepair.current,
                valuePrevious: otherRepair.previous,
              },
              {
                key: "note24-systemUsage",
                label: "System usage fee (YGS implementation cost) [Refer note: 31]",
                valueCurrent: systemUsage.current,
                valuePrevious: systemUsage.previous,
              },
              {
                key: "note24-insurance",
                label: "Insurance",
                valueCurrent: insurance.current,
                valuePrevious: insurance.previous,
              },
              {
                key: "note24-ratesTaxes",
                label: "Rates and taxes",
                valueCurrent: ratesTaxes.current,
                valuePrevious: ratesTaxes.previous,
              },
              {
                key: "note24-communication",
                label: "Communication expense [Refer note: 31]",
                valueCurrent: communication.current,
                valuePrevious: communication.previous,
              },
              {
                key: "note24-travelling",
                label: "Travelling and conveyance expense",
                valueCurrent: travelling.current,
                valuePrevious: travelling.previous,
              },
              {
                key: "note24-lossonFD",
                label: "Loss/(Gain) on fixed assets sold / scrapped / written off ",
                valueCurrent: lossonFD.current,
                valuePrevious: lossonFD.previous,
              },
              {
                key: "note24-printingandStationery",
                label: "Printing and stationery",
                valueCurrent: printingandStationery.current,
                valuePrevious: printingandStationery.previous,
              },
              {
                key: "note24-sellingExpence",
                label: "Selling expenses",
                valueCurrent: sellingExpence.current,
                valuePrevious: sellingExpence.previous,
              },
              {
                key: "note24-salesCommission",
                label: "Sales commission",
                valueCurrent: salesCommission.current,
                valuePrevious: salesCommission.previous,
              },
              {
                key: "note24-Donations",
                label: "Donations and contributions",
                valueCurrent: Donations.current,
                valuePrevious: Donations.previous,
              },
              {
                key: "note24-legalProfessional",
                label: "Legal and professional fees (Refer Note (i) below)",
                valueCurrent: legalProfessional.current,
                valuePrevious: legalProfessional.previous,
              },
              {
                key: "note24-netLossFC",
                label: "Net loss/(gain) on foreign currency transactions and translations",
                valueCurrent: netLossFC.current,
                valuePrevious: netLossFC.previous,
              },
              {
                key: "note24-doubtfulTrade",
                label: "Provision for doubtful trade receivables/(provision written back) (net)",
                valueCurrent: doubtfulTrade.current,
                valuePrevious: doubtfulTrade.previous,
              },
              {
                key: "note24-estimateLoss",
                label: "Provision for estimated losses on construction contracts /(provision written back) [Refer note: 33]",
                valueCurrent: estimateLoss.current,
                valuePrevious: estimateLoss.previous,
              },
              {
                key: "note24-expLoss",
                label: "Provision for expected loss on onerous contracts (Refer Note 33)",
                valueCurrent: expLoss.current,
                valuePrevious: expLoss.previous,
              },
              {
                key: "note24-sittingFee",
                label: "Directors' sitting fees",
                valueCurrent: sittingFee.current,
                valuePrevious: sittingFee.previous,
              },
              {
                key: "note24-bankCharge",
                label: "Bank charges ",
                valueCurrent: bankCharge.current,
                valuePrevious: bankCharge.previous,
              },
              {
                key: "note24-corpSocialResp",
                label: "Corporate Social Responsibility(Refer Note 27)",
                valueCurrent: corpSocialResp.current,
                valuePrevious: corpSocialResp.previous,
              },
              {
                key: "note24-usageFee",
                label: "Prism Usage Fees [Refer note: 31]",
                valueCurrent: usageFee.current,
                valuePrevious: usageFee.previous,
              },
              {
                key: "note24-globSaleFee",
                label: "Global sales and marketing activity fee [Refer note: 31]",
                valueCurrent: globSaleFee.current,
                valuePrevious: globSaleFee.previous,
              },
              {
                key: "note24-managementFee",
                label: "Management Fee [Refer note: 31]",
                valueCurrent: managementFee.current,
                valuePrevious: managementFee.previous,
              },
              {
                key: "note24-engSerFee",
                label: "Engineering service fees [Refer note: 31]",
                valueCurrent: engSerFee.current,
                valuePrevious: engSerFee.previous,
              },
              {
                key: "note24-engSupFee",
                label: "Engineering support fees (ESF) [Refer note: 31]",
                valueCurrent: engSupFee.current,
                valuePrevious: engSupFee.previous,
              },
              {
                key: "note24-supSerFee",
                label: "Support Service Fees [Refer note: 31]",
                valueCurrent: supSerFee.current,
                valuePrevious: supSerFee.previous,
              },
              {
                key: "note24-subContract",
                label: "Sub-contract expenses",
                valueCurrent: subContract.current,
                valuePrevious: subContract.previous,
              },
              {
                key: "note24-eduTraining",
                label: "Education & Training ",
                valueCurrent: eduTraining.current,
                valuePrevious: eduTraining.previous,
              },
              {
                key: "note24-reqExp",
                label: "Recruitment expense",
                valueCurrent: reqExp.current,
                valuePrevious: reqExp.previous,
              },
              {
                key: "note24-warantyExp",
                label: "Warranty expenses (Net of utilisation) [ Refer Note 33]",
                valueCurrent: warantyExp.current,
                valuePrevious: warantyExp.previous,
              },
              {
                key: "note24-membership",
                label: "Membership Fees",
                valueCurrent: membership.current,
                valuePrevious: membership.previous,
              },
              {
                key: "note24-miscellaneous",
                label: "Miscellaneous expenses",
                valueCurrent: miscellaneous.current,
                valuePrevious: miscellaneous.previous,
              },

            

          {
            key: "note24-total",
            label: "Total",
            isGrandTotal: true,
            valueCurrent: grandTotal.current,
            valuePrevious: grandTotal.previous,
          },
'Notes:',
              {
                key: "note24-notes",
                label: "(i) Includes payments to the statutory auditors (excluding goods and service tax):",
                valueCurrent: null,
                valuePrevious: null,
                children: [
                  {
                    key: "note24-statutoryAudit",
                    label: "As auditors - statutory audit:",
                    valueCurrent: 51.00,
                    valuePrevious: 51.00,
                
                  },
                  {
                    key: "note24- taxAudit",
                    label: "For tax audit",
                    valueCurrent: 5.00,
                    valuePrevious:5.00,
                
                  },
                ],
              },

          {
            key: "note24-total1",
            label: "Total",
            isGrandTotal: true,
            valueCurrent: 56.00,
            valuePrevious: 56.00,
          },
        ],
      };
    };
const calculateNote25 = (): FinancialNote => {
 const incomeTax = {
        current: 11114.10,
        previous: 9455.42,
        
      };
  const indirectTax = {
          current: 638.94,
          previous: 371.83,
          
        };
  const epfo = {
          current: 1416.55,
          previous: 1416.55,
          
        };  
        
  const pop = {
          current: 1532.61,
          previous: 709.88,
          
        };
     

  

  return {
    noteNumber: 25,
    title: 'Contingent liabilities and commitments (to the extent not provided for)',
    totalCurrent: null, // Not applicable; shown as a disclosure table
    totalPrevious:null,
    content: [
      {
        key: 'note25-1',
        label: '(i)  Contingent liabilities ',
        valueCurrent: null,
        valuePrevious:null,
        children: [
          {
            key: 'note25-2',
            label: '(a) Claims against the Company not acknowledged as debt ',
            valueCurrent: null,
            valuePrevious:null,
            children: [
              {
                key: 'note25-3',
                label: '(i) Income tax matters in dispute (includes paid under protest ₹. 837.7 lakhs, as at 31 March 2023 ₹. 837.77 lakhs)',
                valueCurrent: incomeTax.current,
                valuePrevious: incomeTax.previous,
              },
              {
                key: 'note25-4',
                label: '(ii) Indirect tax matters in dispute (includes paid under protest ₹.49.05 lakhs, as at 31 March 2023 ₹. 49.05 lakhs)',
                valueCurrent: indirectTax.current,
                valuePrevious:indirectTax.previous,
              },
              {
                key: 'note25-5',
                label: "(iii) Employees' provident fund organisation (EPFO) matters of Yokogawa India Limited Employees Provident Fund in dispute (including paid under protest  ₹. 784.66 lakhs , as at 31 March 2023 ₹.784.66 lakhs)",
                valueCurrent: epfo.current,
                valuePrevious:epfo.previous,
              },
              
            ],
            
          },
          {
                key: 'note25-6',
                isSubtotal: true,
                label: "Contingent liabilities disclosed above represent possible obligation where possibility of cash outflow to settle the obligation is not remote. ",
                valueCurrent: incomeTax.current + indirectTax.current + epfo.current,
                valuePrevious:incomeTax.previous + indirectTax.previous + epfo.previous,
              },

        ],
      },
              
      {
        key: 'note25-7',
        label: '(ii) Other Commitments',
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
                key: 'note25-8',
                label: "(a) Commitment towards procurement of property, plant and equipment",
                valueCurrent: pop.current,
                valuePrevious:pop.previous,
              },
        ],
      },
      {
                key: 'note25-8-1',
                label: "Total",
                isSubtotal: true,
                valueCurrent: pop.current,
                valuePrevious:pop.previous,
              },

      {
        key: 'note25-9',
        label: '(iii) Guarantees',
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
                key: 'note25-10',
                label: "Guarantees given by banks on behalf of the Company for contractual obligations of the Company.\nThe necessary terms and conditions have been complied with and no liabilities have arisen.",
                valueCurrent: 43194.01,
                valuePrevious:39386.84,
              },
        ],
      },
      {
                key: 'note25-11',
                label: "",
                isSubtotal: true,
                valueCurrent: 43194.01,
                valuePrevious:39386.84,
              },
            ],
};
};
const calculateNote26 = (): FinancialNote => {
  const principalUnpaid = {
    current: getAmount('amountCurrent', ['trade payables'], ['total outstanding dues of micro enterprises and small enterprises']),
    previous: getAmount('amountPrevious', ['trade payables'], ['total outstanding dues of micro enterprises and small enterprises']),
  };

  const interestUnpaid = {
    current: 89.91,
    previous:61.58,
  };

  const interestDuePayable = {
    current: getAmount("amountCurrent",["finance cost"],["msme interest"]),
    previous: getAmount("amountPrevious",["finance cost"],["msme interest"]),
  };

  const interestAccruedUnpaid = {
    current: 89.91,
    previous: 61.58,
  };

  return {
    noteNumber: 26,
    title: 'Disclosures required under Section 22 of the Micro, Small and Medium Enterprises Development Act, 2006',
    totalCurrent: null, // Not applicable; shown as a disclosure table
    totalPrevious: null,
    content: [
      {
        key: 'note26-1',
        label: '(i) Principal amount remaining unpaid to any supplier as at the end of the accounting year',
        valueCurrent: principalUnpaid.current,
        valuePrevious: principalUnpaid.previous,
      },
      {
        key: 'note26-2',
        label: '(ii) Interest due thereon remaining unpaid to any supplier as at the end of the accounting year',
        valueCurrent: interestUnpaid.current,
        valuePrevious: interestUnpaid.previous,
      },
      {
        key: 'note26-3',
        label: '(iii) The amount of interest paid along with the amounts of the payment made to the supplier beyond the appointed day ',
        valueCurrent: 0,
        valuePrevious: 0,
      },
      {
        key: 'note26-4',
        label: '(iv) The amount of interest due and payable for the year',
        valueCurrent: interestDuePayable.current,
        valuePrevious: interestDuePayable.previous,
      },
      {
        key: 'note26-5',
        label: '(v) The amount of interest accrued and remaining unpaid at the end of the accounting year',
        valueCurrent: interestAccruedUnpaid.current,
        valuePrevious: interestAccruedUnpaid.previous,
      },
      {
        key: 'note26-6',
        label: '(vi) The amount of further interest due and payable even in the succeeding year, until such date when the interest dues as above are actually paid',
        valueCurrent: 0,
        valuePrevious: 0,
      },
    ],
    footer: 'The said information regarding Micro and Small Enterprises has been determined to the extent such parties have been identified on the basis of information collected by the Management bases on enquiries made with the parties. This has been relied upon by the auditors.',
  };
};
const calculateNote27 = (): FinancialNote => {

  const grossAmount = {
        current: 191.43,
        previous: 122.41,
        
      };
  const amountSpent = {
        current: 191.43,
        previous: 79.60,
        
      };

  const construction = {
   incash:0,
   ytp:0,

   preincash: 0,
   preytp: 0,
   
  };
  const others = {
   incash:amountSpent.current,
   ytp:0, 
   preincash:122.41 ,
   preytp: 0, 
  };

 
  return {
    noteNumber: 27,
    title: 'Corporate Social Responsibility (CSR)',
    totalCurrent: null, // Not applicable; shown as a disclosure table
    totalPrevious: null,
    content: [
      'As per Section 135 of the Companies Act, 2013, a CSR committee has been formed by the Company. The areas for CSR activities are promoting education, healthcare and woman economic empowerment, providing disaster relief and undertaking rural development projects.',
      {
        key: 'note27-1',
        label: '(a) Gross amount required to be spent by the company during the year ',
        valueCurrent: grossAmount.current,
        valuePrevious: grossAmount.previous,
        
      },
      {
        key: 'note27-2',
        label: '(b) Amount spent during the year ',
        valueCurrent: amountSpent.current,
        valuePrevious:amountSpent.previous,
        
      },
      {
        key: 'note27-3',
        label: '(c) shortfall at the end of the year, ',
        valueCurrent: 0,
        valuePrevious: 122.41,
        
      },
      {
        key: 'note27-4',
        label: '(d) total of previous years shortfall ',
        valueCurrent: 0,
        valuePrevious: 122.41,
        
      },
      {
        key: 'note27-5',
        label: '(e) reason for shortfall',
        valueCurrent:null,
        valuePrevious: null,

      },


      
      {
        type: "table",
        headers: [
          "31 March 2024",
          "In cash",
          "Yet  to be paid in cash",
          "Total"
        ],
        rows: [
          
          [
            "(i) Construction/acquisition of any asset",
            format(construction.incash),
            format(construction.ytp),
            format(construction.incash + construction.ytp),
          ],
          [
            "(ii) On purposes other than (i) above ",
            format(others.incash),
            format(others.ytp),
            format(others.incash + others.ytp),
          ],
          [
            "Total",
            format(construction.incash+others.incash),
            format(construction.ytp+others.ytp),
            format(construction.ytp+others.ytp + construction.incash + others.incash),
          ],
          
          
        ]
      },
      
      {
        type: "table",
        headers: [
          "'31 March 2023",
          "In cash",
          "Yet  to be paid in cash",
          "Total"
        ],
        rows: [
          
          [
            "(i) Construction/acquisition of any asset",
            format(construction.preincash),
            format(construction.preytp),
            format(construction.preincash + construction.preytp),
          ],
          [
            "(ii) On purposes other than (i) above ",
            format(others.preincash),
            format(others.preytp),
            format(others.preincash + others.preytp),
          ],
          [
            "Total",
            format(construction.preincash+others.preincash),
            format(construction.preytp+others.preytp),
            format(construction.preytp+others.preytp + construction.preincash + others.preincash),
          ],
          
          
        ]
      }
      ],
      footer:`(a) Gross amount required to be spent by the company during the year is ₹ 191.43 lakhs (Previous year is ₹ 122.41 lakhs).
              (b) Amount spent during the year is ₹ 191.43 lakhs ( Previous year is ₹ 122.41 lakhs)
              (c)  Amount donated towards promotion of education and eradication of hunger.`
};
};
const calculateNote28 = (): FinancialNote => {
 const currentservice = {
  current:310.60,
  previous:246.45
 }
 const interest = {
  current : 4.35,
  previous: -4.51
 }
 const returnasset = {
  current:8.86,
  previous:0
 }
 const DBO = {
  current:75.36,
  previous:-53.76
 }
 const DBO2 = {
  current:46.40,
  previous:44.40
 }
 const benefit = {
  current:3479.28,
  previous: 3032.76
 }
 const fair = {
  current:3096.49,
  previous: 2974.55
 }
 const movementinterest = {
  current: 226.42,
  previous: 200.75
 }
 const benefitpayment = {
  current:-212.26,
  previous: -176.07
 }
 const plan = {
  current:222.08,
  previous:205.26
 }
 const openbenefit = {
  current :120.99,
  previous:112.14
 }
 const discount ={
  current: 7.20,
  previous: 7.45
 }
 const salary = {
  current: 9.50,
  previous:9.50
 }
 const attrition = {
  current:5,
  previous:5
 }

 const dis = ['3192.81','3811.28','2784.96','3318.87'];
 const growth =['3729.89','3232.65','3260.06','2810.23'];
 const attr = ['3440.47','3522.40','3002.09','3066.84'];
 const mortality = ['3478..06','3480.50','3031.70','3033.82'];

 const par24 = 263.12 ;
 const par25 = 314.84 ;
 const par26 = 302.62 ;
 const par27 = 291.89 ;
 const par28 = 384.60 ;
 const par29 = 1691.59 ;
 const payouts = 4513.91;
  return {
    noteNumber: 28,
    title: 'Employee benefit plans',
    totalCurrent: null, 
    totalPrevious: null,
    content: [
      {
        key: 'note28-1',
        label: '28(a)  Defined contribution plans ',
        isSubtotal:true,
        valueCurrent: null,
        valuePrevious: null,
      },
`The Company makes Provident Fund and Superannuation Fund contributions to defined contribution plans for qualifying employees. Under the Schemes, the Company is required to contribute a specified percentage of the payroll costs to fund the benefits.  The Company recognised ₹ 798.70 Lakhs (Year ended 31 March 2023 ₹ 696.11 Lakhs) for Provident Fund contributions and ₹ 401.01 Lakhs (Year ended 31 March 2023 ₹ 349.60 Lakhs) for Superannuation Fund contributions. The contributions payable to these plans by the Company are at rates specified in the rules of the schemes. `,
      {
        key: 'note28-2',
        label: `28(b)  Defined benefit plans 
                Gratuity`,
        isSubtotal:true,
        valueCurrent: null,
        valuePrevious: null,
      },
      `The Gratuity scheme is a final salary defined benefit plan, that provides for a lumpsum payment at the time of separation; based on scheme rules the benefits are calculated on the basis of last drawn salary and the period of service at the time of separation and paid as lumpsum. There is a vesting period of 5 years.`,
      'These plans typically expose the company to actuarial risks such as:',
      `(i) Investment Risk: The fund is managed by LIC, fund manager. So the details of composition of plan assets managed by the fund manager is not available with the company. However, the fall in plan assets will increase the defined benefit obligation.`,
      `(ii) Interest rates risks: the defined benefit obligation calculated uses a discount rate based on government bonds. If bond yields fall, the defined benefit will tend to increase.`,
      `(iii) Salary Inflation risks: The present value of the defined benefit plan liability is calculated by reference to the future salaries of plans participants. As such increase in salary will increase the defined benefit obligation.`,
      `(iv) Demographic risks: The present value of the defined benefit plan liability is calculated by reference to the best estimate of the mortality of plan participants during their employment as the increase in life  expectancy of the plan participants will increase the plan's liability.`,

      `In respect of the plan, the most recent actuary valuation of plan assets and the present values of the defined benefit obligation were carried out as at March 31,2024 and  March 31, 2023 . The present value of the defined benefit obligation, and the related service cost and the past service cost, were measured using the projected unit credit method.`,
      {
        key: 'note28-amount',
        label: 'Amount recognised in comprehensive income in respect of these defined benefit plans are as follows:',
        isSubtotal:true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
              {
                key: 'note28-amount-service',
                label: "Service cost",
                valueCurrent: null,
                valuePrevious: null,
              },
              {
                key: 'note28-amount-current-service',
                label: "Current service cost",
                valueCurrent: currentservice.current,
                valuePrevious: currentservice.previous,
              },
              {
                key: 'note28-amount-past-service',
                label: "Past service cost",
                valueCurrent: null,
                valuePrevious: null,
              },
              {
                key: 'note28-amount-interest',
                label: "Net interest expense/(income)",
                valueCurrent: interest.current,
                valuePrevious: interest.previous,
              },
              {
                key: 'note28-amount-long',
                label: "Immediate recognition of (gain)/losses-Other long term benefits",
                valueCurrent: null,
                valuePrevious: null,
              },
              {
                key: 'note28-amount-total',
                label: "",
                isGrandTotal:true,
                valueCurrent: currentservice.current + interest.current ,
                valuePrevious: currentservice.previous + interest.previous ,
              },
        ],
      },
{
        key: 'note28-benefit',
        label: 'Amount recognised in other comprehensive income in respect of these defined benefit plans are as follows:',
        isSubtotal:true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
              {
                key: 'note28-benefit-return',
                label: "Return on plan assets (excluding amount included in net interest expense)",
                valueCurrent: returnasset.current,
                valuePrevious: returnasset.previous,
              },
              {
                key: 'note28-benefit-DBO',
                label: "Actuarial gains and loss arising from changes in financial assumptions in DBO",
                valueCurrent: DBO.current,
                valuePrevious: DBO.previous,
              },
              {
                key: 'note28-benefit-DBO2',
                label: "Actuarial gains and loss arising from experience adjustments in DBO",
                valueCurrent: DBO2.current,
                valuePrevious: DBO2.previous,
              },
              {
                key: 'note28-benefit-total',
                label: "",
                isGrandTotal:true,
                valueCurrent: returnasset.current+DBO.current+DBO2.current,
                valuePrevious: returnasset.previous+DBO.previous+DBO2.previous,
              },
              {
                key: 'note28-benefit-total-final',
                label: "Total",
                isGrandTotal:true,
                valueCurrent: currentservice.current + interest.current +returnasset.current+DBO.current+DBO2.current,
                valuePrevious: currentservice.previous + interest.previous + returnasset.previous+DBO.previous+DBO2.previous,
              },
        ],
      },
{
        key: 'note28-balancesheet',
        label: 'Amount recognised in the balance sheet',
        isSubtotal:true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
              {
                key: 'note28-balancesheet-present',
                label: "Present value of defined benefit obligation ",
                valueCurrent: benefit.current,
                valuePrevious: benefit.previous,
              },
              {
                key: 'note28-balancesheet-fair',
                label: "Fair value of plan assets",
                valueCurrent: fair.current,
                valuePrevious: fair.previous,
              },
              {
                key: 'note28-balancesheet-subtotal',
                label: "",
                valueCurrent: benefit.current - fair.current,
                valuePrevious: benefit.previous - fair.previous,
              },
              {
                key: 'note28-balancesheet-current',
                label: "Current portion of the above",
                valueCurrent: null,
                valuePrevious: null,
              },
              {
                key: 'note28-balancesheet-noncurrent',
                label: "Non current portion of the above",
                valueCurrent: benefit.current - fair.current,
                valuePrevious: benefit.previous - fair.previous,
              },
        ],
      },
      {
        key: 'note28-movement',
        label: 'Movement in present value of defined benefit obligation are as follows:',
        isSubtotal:true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
              {
                key: 'note28-movement-opening',
                label: "Opening defined benefit obligation",
                valueCurrent: benefit.previous,
                valuePrevious: 2770.99,
              },
              {
                key: 'note28-movement-expenses',
                label: "Expenses recognised in profit and loss account",
                valueCurrent: null,
                valuePrevious: null,
              },
              {
                key: 'note28-movement-current',
                label: "-Current service cost",
                valueCurrent: currentservice.current,
                valuePrevious: currentservice.previous,
              },
              {
                key: 'note28-movement-past',
                label: "-Past service cost",
                valueCurrent: null,
                valuePrevious: null,
              },
              {
                key: 'note28-movement-interest',
                label: "-Interest expense (income)",
                valueCurrent: movementinterest.current,
                valuePrevious: movementinterest.previous,
              },
              {
                key: 'note28-movement-income',
                label: "Recognised in other comprehensive income",
                valueCurrent: null,
                valuePrevious: null,
              },
              {
                key: 'note28-movement-gain',
                label: "Remeasurement (gains)/losses",
                valueCurrent: null,
                valuePrevious: null,
              },
              {
                key: 'note28-movement-loss',
                label: "-Actuarial (gain)/loss arising from:",
                valueCurrent: null,
                valuePrevious: null,
              },
              {
                key: 'note28-movement-demographic',
                label: "i. Demographic assumptions",
                valueCurrent: null,
                valuePrevious: null,
              },
              {
                key: 'note28-movement-financial',
                label: "ii. Financial assumptions",
                valueCurrent: DBO.current,
                valuePrevious: DBO.previous,
              },
              {
                key: 'note28-movement-expense',
                label: "iii. Experience adjustments",
                valueCurrent: DBO2.current,
                valuePrevious: DBO2.previous,
              },
              {
                key: 'note28-movement-payments',
                label: "Benefit payments",
                valueCurrent: benefitpayment.current,
                valuePrevious: benefitpayment.previous,
              },
              {
                key: 'note28-movement-close',
                label: "Closing defined obligation",
                isGrandTotal:true,
                valueCurrent: benefit.previous +currentservice.current +movementinterest.current +DBO.current + DBO2.current + benefitpayment.current ,
                valuePrevious: 2770.99 + currentservice.previous +movementinterest.previous +DBO.previous + DBO2.previous + benefitpayment.previous ,
              },
        ],
      },
{
        key: 'note28-fairmovement',
        label: 'Movement in fair value of plan assets is as follows:',
        isSubtotal:true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
              {
                key: 'note28-fairmovement-open',
                label: "Opening fair value of plan assets",
                valueCurrent: 0,
                valuePrevious: 2833.21,
              },
              {
                key: 'note28-fairmovement-open-fair',
                label: "Amount recognised in Profit & Loss Account",
                valueCurrent: null,
                valuePrevious: null,
              },
              {
                key: 'note28-fairmovement-open-plan',
                label: "- Expected return on plan assets",
                valueCurrent: plan.current,
                valuePrevious: plan.previous,
              },
              {
                key: 'note28-fairmovement-open-other',
                label: "Recognised in other comprehensive income",
                valueCurrent: null,
                valuePrevious: null,
              },
              {
                key: 'note28-fairmovement-open-gain',
                label: "Remeasurement gains/(losses)",
                valueCurrent: null,
                valuePrevious: null,
              },
              {
                key: 'note28-fairmovement-open-return',
                label: "- Actual return on plan assets in excess of the expected return",
                valueCurrent: -(returnasset.current),
                valuePrevious: null,
              },
              {
                key: 'note28-fairmovement-open-benefit',
                label: "Contributions by employer (including benefit payments recoverable)",
                valueCurrent: openbenefit.current,
                valuePrevious: openbenefit.previous,
              },
              {
                key: 'note28-fairmovement-open-benefitpayment',
                label: "Benefit payments",
                valueCurrent: benefitpayment.current,
                valuePrevious: benefitpayment.previous,
              },
              {
                key: 'note28-fairmovement-close',
                label: "Closing fair value of plan asset",
                isGrandTotal:true,
                valueCurrent: 0+plan.current +(-(returnasset.current))+openbenefit.current+benefitpayment.current,
                valuePrevious: 2833.23+plan.previous+0+openbenefit.previous+benefitpayment.previous,
              },
        ],
      },
{
        key: 'note28-plan-assets',
        label: 'The Major categories of plan assets(%)',
        isSubtotal:true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
              {
                key: 'note28-plan-assets-insurance',
                label: "Assets under insurance schemes",
                valueCurrent: 100,
                valuePrevious: 100,
              },
              {
                key: 'note28-plan-assets-Actuarial',
                label: "Actuarial assumptions",
                isSubtotal:true,
                valueCurrent: null,
                valuePrevious: null,
              },
              {
                key: 'note28-plan-assets-Actuarial-1',
                label: "1. Discount rate",
                valueCurrent: discount.current,
                valuePrevious: discount.previous,
              },
              {
                key: 'note28-plan-assets-Actuarial-2',
                label: "2. Expected rate of return on plan assets",
                valueCurrent: discount.current,
                valuePrevious: discount.previous,
              },
              {
                key: 'note28-plan-assets-Actuarial-3',
                label: "3. Salary escalation",
                valueCurrent: salary.current,
                valuePrevious: salary.previous,
              },
              {
                key: 'note28-plan-assets-Actuarial-4',
                label: "4. Attrition rate",
                valueCurrent: attrition.current,
                valuePrevious: attrition.previous,
              },
              {
                key: 'note28-plan-assets-Actuarial-4',
                label: "4. Attrition rate",
                valueCurrent: attrition.current,
                valuePrevious: attrition.previous,
              },
        ],
      },
'Sensitivity analysis:',
'Significant actuarial assumptions for the determination of the defined benefit obligation are discount rate, expected salary increase and mortality. The sensitivity analysis below have been determined based on reasonably possible changes of the assumptions occurring at the end of the reporting period, while holding all other assumptions constant. The results of sensitivity analysis is given below:',
'Gratuity',
      {
        type: "table",
        headers: [
          'Particulars',
          "For the Year ended 31 March 2024\nIncrease",
          "For the Year ended 31 March 2024\nDecrease",
          "For the Year ended 31 March 2023\nIncrease",
          "For the Year ended 31 March 2023\nDecrease"
        ],
        rows: [
          ['Discount Rate (- / + 100 Basis Points)',...dis],
          ["Salary Growth Rate (- / + 100 Basis Points)",...growth],
          ["Attrition rate (- / + 100 Basis Points)",...attr],
          ["Mortality Rate (- / + 10% of mortality rates)",...mortality]      
        ]
      },
      'Sensitivity analysis presented above may not be representative of the actual change in the defined benefit obligation as it is unlikely that the change in assumptions would occur in isolation of one another as some of the assumptions may be correlated. There are no changes from the previous period in the methods and assumptions used in preparing the sensitivity analysis.',
      'There has been no change in the process used by the Company to manage its risks from prior periods.',
      'Expected future cash outflows towards the plans are as follows:',
      {
        type: "table",
        headers: [
          "Particulars",
          "Amount\nUndiscounted values",
        ],
        rows: [
          
          ['2024-25', format(par24)],
          ['2025-26',format(par25)],
          ['2026-27',format(par26)],
          ['2027-28',format(par27)],
          ['2028-29',format(par28)],
          ['2029-30 to 2033- 34',format(par29)],
          ['Payouts above ten years',format(payouts)]  
        ]
      }
    ],
};
};
const calculateNote29 = (): FinancialNote => {
  const rou = {
    current: 3041.87,
    previous: 1580.65,
  };

  const long = {
    current: 2264.28,
    previous: 1000.49,
  };

  const short = {
    current: 855.63,
    previous: 685.66,
  };

  const dep = {
    current: 805.15,
    previous: 479.54,
  };

  const financecost = {
    current: 203.14,
    previous: 139.74,
  };

  const interest = {
    current: 203.14,
    previous: 139.74,
  };

    const open = {
    current: 1686.15,
    previous: 1516.95,
  };
  const add = {
    current: 2266.37,
    previous: 871.32,
  }
  const payments = {
    current: -1035.75,
    previous: -841.86,
  }

  const year = {
    current: Number((855.63045).toFixed(2)),
    previous: Number((685.66).toFixed(2)),
  }
  const year5 = {
    current: Number((1949.07284).toFixed(2)),
    previous: Number((909.55).toFixed(2)),
  }
  
    const years = {
    current: Number((1176.10644).toFixed(2)),
    previous: Number((1176.10644).toFixed(2)),
  }

  const nonlease = {
    current : 1947.93,
    previous: 0
  }
    const lease = {
    current : 673.04,
    previous: 0
  }
  const yr5 = {
    current : 407.07,
    previous: 0
  }
    const rectotal = {
    current : lease.current+lease.current+lease.current+lease.current+yr5.current,
    previous: 0
  }
  const less = {
    current : 478.26,
    previous: 0
  }
    const after = {
    current : lease.current+lease.current+lease.current+lease.current+yr5.current,
    previous: 0
  }
    const within = {
    current : lease.current,
    previous: 0
  }
  const afterlease = {
    current : 1947.93,
    previous: 0
  }
  const withinlease = {
    current : 673.04,
    previous: 0
  }
  const profitselling = {
    current : 331.32,
    previous: 0
  }
  const profitfinance = {
    current : 126.74,
    previous: 0
  }
  return {
    noteNumber: 29,
    title: 'Leases',
    subtitle: "Rental expenses recorded for short term leases was ₹ 847.12 lakhs (31 March 2023 - ₹ 853.60 lakhs ) for the year ended on 31 March 2024.",
    totalCurrent: null,
    totalPrevious: null,
    content: [
      {
        key: 'note29-balance',
        label: 'Amounts recognized in Balance Sheet were as follows:',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'note29-balance-rou',
            label: 'ROU Assets',
            valueCurrent: rou.current,
            valuePrevious: rou.previous,
          },
          {
            key: 'note29-balance-long',
            label: 'Operating lease liabilities',
            valueCurrent: null,
            valuePrevious: null,
            children: [
              {
                key: 'note29-balance-long-term',
                label: '        - Long Term liabilities',
                valueCurrent: long.current,
                valuePrevious: long.previous,
              },
              {
                key: 'note29-balance-short',
                label: '        - Short Term liabilities',
                valueCurrent: short.current,
                valuePrevious: short.previous,
              },
            ],
          },
        ],
      },
      {
        key: 'note29-pl',
        label: 'Amounts recognized in profit and loss were as follows:',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'note29-pl-depreciation',
            label: 'Depreciation Expenditure',
            valueCurrent: dep.current,
            valuePrevious: dep.previous,
          },
          {
            key: 'note29-pl-finance',
            label: 'Finance Cost on Lease Liabilities',
            valueCurrent: financecost.current,
            valuePrevious: financecost.previous,
          },
          {
            key: 'note29-pl-impact',
            label: 'Impact on the statement of profit and loss for the year ended',
            isGrandTotal:true,
            valueCurrent: dep.current + financecost.current,
            valuePrevious: dep.previous + financecost.previous,
          },
        ],
      },
      {
        key: 'note29-movement',
        label: 'Movement in Lease Liability ',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'note29-pl-open',
            label: 'Opening Balance',
            valueCurrent: open.current,
            valuePrevious: open.previous,
          },
          {
            key: 'note29-pl-add',
            label: 'Additions during the year',
            valueCurrent: add.current,
            valuePrevious: add.previous,
          },
          {
            key: 'note29-pl-interest',
            label: 'Interest Expense',
            valueCurrent: interest.current,
            valuePrevious: interest.previous,
          },
          {
            key: 'note29-pl-payments',
            label: 'Payments made during the year',
            valueCurrent: payments.current,
            valuePrevious: payments.previous,
          },
          {
            key: 'note29-pl-close',
            label: 'Closing Balance',
            valueCurrent: open.current + add.current + interest.current - payments.current,
            valuePrevious: open.previous + add.previous + interest.previous - payments.previous,
          },
        ],
      },
    {
        key: 'note29-movement',
        label: ' Supplemental cash flow information related to leases was as follows :',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'note29-pl-leases',
            label: 'Total cash outflow for leases   ',
            valueCurrent: - payments.current,
            valuePrevious:- payments.previous,
          },
        ],
      },
      {
        key: 'note29-maturities',
        label: ' Maturities of lease liabilities were as follows (Undiscounted lease payments to be paid)',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
        children: [
          {
            key: 'note29-pl-1',
            label: 'Not later than 1 year',
            valueCurrent: year.current,
            valuePrevious:year.previous,
          },
          {
            key: 'note29-pl-5',
            label: 'Later than 1 year and not later than 5 years',
            valueCurrent: year5.current,
            valuePrevious:year5.previous,
          },
          {
            key: 'note29-pl-years',
            label: 'Later than 5 years',
            valueCurrent: years.current,
            valuePrevious:years.previous,
          },
          {
            key: 'note29-pl-totallease',
            label: 'Total Lease Payments',
            isGrandTotal:true,
            valueCurrent: year.current + year5.current + years.current,
            valuePrevious:year.previous + year5.previous + years.previous,
          },
        ],
      },
     {
  key: 'note29a-finance-lease',
  label: 'Note 29A: Finance lease receivables',
  isSubtotal: true,
  valueCurrent: null,
  valuePrevious: null,
  children: [
    {
      key: 'note29a-bs-recognized',
      label: 'Amounts recognized in Balance Sheet were as follows',
      isSubtotal: true,
      valueCurrent: null,
      valuePrevious: null,
      children: [
        {
          key: 'note29a-lease',
          label: 'Net Investment in Lease',
          valueCurrent: null,
          valuePrevious: null,
          children: [
        {
          key: 'note29a-lease-noncurrent',
          label: '     - Non-current',
          valueCurrent: nonlease.current,
          valuePrevious: nonlease.previous,
        },
        {
          key: 'note29a-lease-current',
          label: '     - current',
          valueCurrent: lease.current,
          valuePrevious: lease.previous,
        },
          ],
        },
      ],
    },
    {
      key: 'note29a-under-lease',
      label: 'Amounts receivable under finance lease',
      isSubtotal: true,
      valueCurrent: null,
      valuePrevious: null,
      children: [
        { key: 'note29a-year1', label: 'Year 1', valueCurrent: lease.current, valuePrevious: lease.previous },
        { key: 'note29a-year2', label: 'Year 2', valueCurrent: lease.current, valuePrevious: lease.previous },
        { key: 'note29a-year3', label: 'Year 3', valueCurrent: lease.current, valuePrevious: lease.previous },
        { key: 'note29a-year4', label: 'Year 4', valueCurrent: lease.current, valuePrevious: lease.previous },
        { key: 'note29a-year5', label: 'Year 5', valueCurrent: yr5.current, valuePrevious: yr5.previous },
        { key: 'note29a-year6plus', label: 'Year 6 onwards', valueCurrent: 0, valuePrevious: 0 },
        {
          key: 'note29a-total',
          label: 'Total',
          isGrandTotal:true,
          valueCurrent: rectotal.current,
          valuePrevious: rectotal.previous,
        },
        {
          key: 'note29a-unearned',
          label: 'Less: unearned finance income',
          valueCurrent: less.current,
          valuePrevious: less.previous,
        },
        {
          key: 'note29a-net-investment',
          label: 'Present value of lease payments receivable / Net Investment in Lease',
          isSubtotal:true,
          valueCurrent: rectotal.current - less.current,
          valuePrevious: rectotal.previous - less.previous,
        },
      ],
    },
    {
          key: 'note29a-net-analysed',
          label: 'Undiscounted lease payments analysed as:',
          valueCurrent: null,
          valuePrevious: null,
          isSubtotal: true,
          children: [
        {
          key: 'note29a-after',
          label: '-     Recoverable after 12 months',
          valueCurrent: after.current,
          valuePrevious: after.previous,
        },
        {
          key: 'note29a-within',
          label: '-     Recoverable within 12 months',
          valueCurrent: within.current,
          valuePrevious: within.previous,
        },
          ],
        },
        {
          key: 'note29a-net-lease-investment',
          label: 'Net investment in the lease analysed as:',
          valueCurrent: null,
          valuePrevious: null,
          isSubtotal: true,
          children: [
        {
          key: 'note29a-after-lease',
          label: '-     Recoverable after 12 months',
          valueCurrent: afterlease.current,
          valuePrevious: afterlease.previous,
        },
        {
          key: 'note29a-within-lease',
          label: '-     Recoverable within 12 months',
          valueCurrent: withinlease.current,
          valuePrevious: withinlease.previous,
        },
          ],
        },
        {
          key: 'note29a-profit',
          label: `The Company entered into finance leasing arrangements as a lessor for certain equipment to its customer. The term of finance leases entered into is 5 years. These lease contracts do not include extension or early termination options. The average effective interest rate contracted approximates 7.61% (2022-23: Nil) per annum. The net investment in lease is secured by bank guarantee issued by customer's bank.
          
          
          The following table presents the amounts included in profit or loss:`,
          valueCurrent: null,
          valuePrevious: null,
          children:[
        {
          key: 'note29a-profit-selling',
          label: '- Selling profit/loss for finance leases',
          valueCurrent: profitselling.current,
          valuePrevious: profitselling.previous,
        },
        {
          key: 'note29a-profit-finance',
          label: '- Finance income on the net investment in finance leases',
          valueCurrent: profitfinance.current,
          valuePrevious: profitfinance.previous,
        },
        {
          key: 'note29a-profit-finance',
          label: '- Income relating to variable lease payments not included in the net investment in finance leases',
          valueCurrent: 0,
          valuePrevious: 0,
        },
          ]
        },
  ],
}
 
    ],
  };
};
const format = (value: number): string => value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const calculateNote30 = (): FinancialNote => {
  const sales = {
    india: 161479.36,
    outsideIndia: 42873.18,
    indiaPrev: 109500.30,
    outsideIndiaPrev: 32508.85,
    total:204352.54,
    totalPrev:142009.15
  };

  const otherIncome = {
    india: 1481.14,
    outsideIndia: 0,
    indiaPrev: 894.19,
    outsideIndiaPrev: 0,
    total:1481.14,
    totalPrev:894.19
  };

  const income = {
    india: sales.india + otherIncome.india,
    outsideIndia: sales.outsideIndia + otherIncome.outsideIndia,
    indiaPrev: sales.indiaPrev + otherIncome.indiaPrev,
    outsideIndiaPrev: sales.outsideIndiaPrev + otherIncome.outsideIndiaPrev,
    total: sales.total + otherIncome.total, 
    totalPrev: sales.totalPrev + otherIncome.totalPrev
  };

  // const totalIncome = {
  //   current: income.india + income.outsideIndia,
  //   previous: income.indiaPrev + income.outsideIndiaPrev,
  // };

  const expenses = {
    raw: { india: 89409.88, indiaPrev: 64964.44, outside: 27213.63, outsidePrev: 15294.89,total:116623.51,totalPrev:80259.33 },
    employee: { india: 25287.18, indiaPrev: 19323.73, outside: 6241.15, outsidePrev: 5087.83,total:31528.33,totalPrev:25011.56 },
    depreciation: { india: 1606.35, indiaPrev: 870.85, outside: 414.22, outsidePrev: 259.79,total:2020.57,totalPrev:1130.64 },
    other: { india: 35405.04, indiaPrev: 19801.56, outside: 3500.23, outsidePrev: 4645.80,total:38905.27,totalPrev:24447.36},
    finance:{total:243.20,totalPrev:260.43}
  };
  
  const totalExpense = {
    india: expenses.raw.india +expenses.employee.india+expenses.depreciation.india+expenses.other.india,
    indiaPrev: expenses.raw.indiaPrev +expenses.employee.indiaPrev+expenses.depreciation.indiaPrev+expenses.other.indiaPrev,
    outside: expenses.raw.outside + expenses.employee.outside + expenses.depreciation.outside + expenses.other.outside,
    outsidePrev: expenses.raw.outsidePrev + expenses.employee.outsidePrev + expenses.depreciation.outsidePrev + expenses.other.outsidePrev,
    total: expenses.raw.total +expenses.employee.total+expenses.depreciation.total+expenses.other.total+expenses.finance.total,
    totalPrev:expenses.raw.totalPrev +expenses.employee.totalPrev+expenses.depreciation.totalPrev+expenses.other.totalPrev+expenses.finance.totalPrev
  };

  const Assets = {
    india: 137694.98,
    outsideIndia: 119527.19,
    indiaPrev: 10645.12,
    outsideIndiaPrev: 7831.74,
    total:148340.10,
    totalPrev:127358.93
  };

  const isassets = {
    total:8118.21,
    totalPrev:6977.07
  }
  const isassetsincome = {
    total:8120.24,
    totalPrev:6880.71
  }
    const liabilities = {
    india: 71283.40,
    outsideIndia: 58876.22,
    indiaPrev: 26589.01,
    outsideIndiaPrev: 34367.05,
    total:97872.41,
    totalPrev:93243.27
  };
    const taxliabilities = {
    total:2694.28,
    totalPrev:2694.28
  };
  const capital = {
    india:6109.71,
    outsideIndia: 6029.89,
    total:6109.71,
    totalPrev:6029.89
  }

  return {
    noteNumber: 30,
    title: "Segment information",
    totalCurrent: null,
    totalPrevious: null,
    footer:`Note:
    The Secondary Segment is determined based on location of the customers. All other assets are situated in India.`,
    content: [
      `As part of structural reform global project, the Yokogawa Group has established Structure between the Parent Company and its Subsidiaries wherein for each Global Business Function, a corresponding Regional Business/Process Function will be responsible for routine business/process operations. These Regional Business/Process Functions will make operating decisions in ratification with Managing Director of the Company and have been identified as the Chief Operating Decision Maker (CODM) as defined by Ind AS 108, operating segments. 
The Company has identified geographic segments as operating and reportable segment. Revenues and expenses directly attributable to the geographic segment are reported under such segments. Assets and liabilities that are directly attributable or allocable to the segments are disclosed under the reportable segments. All other assets and liabilities are disclosed as unallocable. Fixed assets that are used interchangeably amongst segments are not allocated to the reportable segments. Geographical revenues are allocated based on the location of the customer. Geographic segments of the Company includes Japan, Singapore, Middle East & others.`,
      {
        key: "note30-intro",
        label: `The geographic segments individually contributing 10 percent or more of the Company’s revenues and segment assets are shown separately:`,
        valueCurrent: null,
        valuePrevious: null,
      },
      {
        type: "table",
        headers: [
          "Geographic segment",
          "India\n31 March 2024",
          "\n31 March 2023",
          "Outside India\n31 March 2024",
          "\n31 March 2023",
          "Total\n31 March 2024",
          "\n31 March 2023"
        ],
        rows: [
          ["Revenue by geographical segment"],
          [
            "a) Sale and services(Net)",
            format(sales.india),
            format(sales.indiaPrev),
            format(sales.outsideIndia),
            format(sales.outsideIndiaPrev),
            format(sales.total),
            format(sales.totalPrev)
          ],
          [
            "b) Other income",
            format(otherIncome.india),
            format(otherIncome.indiaPrev),
            "-",
            "-",
            format(otherIncome.total),
            format(otherIncome.totalPrev)
          ],
          [
            "Total income",
            format(income.india),
            format(income.indiaPrev),
            format(income.outsideIndia),
            format(income.outsideIndiaPrev),
            format(income.total),
            format(income.totalPrev)
          ],
          ["Income/(Expenses)"],
          [
            "Cost of raw material and components consumed",
            format(expenses.raw.india),
            format(expenses.raw.indiaPrev),
            format(expenses.raw.outside),
            format(expenses.raw.outsidePrev),
            format(expenses.raw.total),
            format(expenses.raw.totalPrev)
          ],
          [
            "Employee benefits expense",
            format(expenses.employee.india),
            format(expenses.employee.indiaPrev),
            format(expenses.employee.outside),
            format(expenses.employee.outsidePrev),
            format(expenses.employee.total),
            format(expenses.employee.totalPrev)
          ],
          [
            "Depreciation and amortization",
            format(expenses.depreciation.india),
            format(expenses.depreciation.indiaPrev),
            format(expenses.depreciation.outside),
            format(expenses.depreciation.outsidePrev),
            format(expenses.depreciation.total),
            format(expenses.depreciation.totalPrev)
          ],
          [
            "Other Expenses",
            format(expenses.other.india),
            format(expenses.other.indiaPrev),
            format(expenses.other.outside),
            format(expenses.other.outsidePrev),
            format(expenses.other.total),
            format(expenses.other.totalPrev)
          ],
          ["Unallocable"],
          ["i) Finance Cost",
            '-',
            '-',
            '-',
            '-',
            format(expenses.finance.total),
            format(expenses.finance.totalPrev)
          ],
          [
            "Total Expenses",
            format(totalExpense.india),
            format(totalExpense.indiaPrev),
            format(totalExpense.outside),
            format(totalExpense.outsidePrev),
            format(totalExpense.total),
            format(totalExpense.totalPrev),
          ],
          [
            "Segment Profit",
            format(income.india - totalExpense.india ),
            format(income.indiaPrev - totalExpense.indiaPrev ),
            format(income.outsideIndia - totalExpense.outside ),
            format(income.outsideIndiaPrev - totalExpense.outsidePrev),
            format(income.total - totalExpense.total),
            format(income.totalPrev - totalExpense.totalPrev),
          ],
          [
            "Assets",
            format(Assets.india ),
            format(Assets.indiaPrev ),
            format(Assets.outsideIndia ),
            format(Assets.outsideIndiaPrev),
            format(Assets.total),
            format(Assets.totalPrev),
          ],
          [
            "Unaliocable Assets"
          ],
          [
            "i) Deffered tax assets(net)",
            "-",
            "-",
            "-",
            "-",
            format(isassets.total),
            format(isassets.totalPrev), 
          ],
          [
            "ii) Income tax assets(net)",
            "-",
            "-",
            "-",
            "-",
            format(isassetsincome.total),
            format(isassetsincome.totalPrev), 
          ],
         [
            "Total Assets",
            format(Assets.india ),
            format(Assets.indiaPrev ),
            format(Assets.outsideIndia ),
            format(Assets.outsideIndiaPrev),
            format(Assets.total + isassets.total + isassetsincome.total),
            format(Assets.totalPrev + isassets.totalPrev + isassetsincome.totalPrev),
          ],
          [
            "Liabilities",
            format(liabilities.india ),
            format(liabilities.indiaPrev ),
            format(liabilities.outsideIndia ),
            format(liabilities.outsideIndiaPrev),
            format(liabilities.total),
            format(liabilities.totalPrev),
          ],
          ["Unallocable Liabilities"],
          [
            "i)Income tax Liabilities(net)",
            "-",
            "-",
            "-",
            "-",
            format(taxliabilities.total),
            format(taxliabilities.totalPrev),
          ],
          [
            "Total Liabilities",
            format(liabilities.india ),
            format(liabilities.indiaPrev ),
            format(liabilities.outsideIndia ),
            format(liabilities.outsideIndiaPrev),
            format(liabilities.total + taxliabilities.total),
            format(liabilities.totalPrev + taxliabilities.totalPrev),
          ],
          [
            "Capital Expenditure",
            format(capital.india ),
            format(capital.outsideIndia ),
            format(capital.total),
            format(capital.totalPrev),
          ],
        ]
      }
    ],

  };
};
const calculateNote32 = (): FinancialNote => {
  const netProfit = {
    current: 22560.10,
    previous: 7458.01,
  };

  const weightedAvgShares = {
    current: 8505469,
    previous: 8505469,
  };

  const faceValue = 10.0;

  const earningsPerShare = {
    current: Number(((netProfit.current *1e5)/weightedAvgShares.current).toFixed(2)),
    previous: Number(((netProfit.previous *1e5)/weightedAvgShares.previous).toFixed(2)),
  };

  return {
    noteNumber: 32,
    title: 'Earnings per share',
    subtitle: 'Basic and Diluted',
    totalCurrent: null,
    totalPrevious: null,
    content: [
      {
        key: 'note32-netprofit',
        label: 'Net profit for the year',
        valueCurrent: netProfit.current,
        valuePrevious: netProfit.previous,
      },
      {
        key: 'note32-shares',
        label: 'Weighted average number of equity shares',
        valueCurrent: weightedAvgShares.current,
        valuePrevious: weightedAvgShares.previous,
      },
      {
        key: 'note32-face',
        label: 'Par value per share (in Rs.)',
        valueCurrent: faceValue,
        valuePrevious: faceValue,
      },
      {
        key: 'note32-eps',
        label: 'Earnings per share - basic and diluted (in Rs.)',
        valueCurrent: earningsPerShare.current,
        valuePrevious: earningsPerShare.previous,
      },
      {
            key: 'note5-nc-emp-total',
            label: '',
            valueCurrent: earningsPerShare.current,
            valuePrevious: earningsPerShare.previous,
            isGrandTotal:true,
          },
    ],
  };
};
const calculateNote33 = (): FinancialNote => {
  const provisions = [
    {
      key: 'note33-warranty',
      label: 'Provision for product support (Warranty)',
      current: { opening: 484.96, additions: 60.17, utilisation: 30.60, closing: 514.53 },
      previous: { opening: 547.93, additions: -48.73, utilisation: 111.70, closing: -484.96 },
    },
    {
      key: 'note33-onerous',
      label: 'Provision for estimated losses on onerous contracts',
      current: { opening: 1787.08, additions: 2738.95, utilisation: 1059.91, closing: 3466.12 },
      previous: { opening: 1390.82, additions: -931.55, utilisation: 535.30, closing: -1787.08 },
    },
    {
      key: 'note33-construction',
      label: 'Provision for estimated losses on construction contracts',
      current: { opening: 10294.67, additions: 7538.28, utilisation: 6272.86, closing: 11560.09 },
      previous: { opening: 11599.89, additions: -5741.18, utilisation: 7046.40, closing: -10294.67 },
    },
    {
      key: 'note33-servicetax',
      label: 'Provision for service tax',
      current: { opening: 0, additions: 1575.47, utilisation: 0, closing: 1575.47 },
      previous: { opening: 1575.47, additions: 0, utilisation: 0, closing: -1575.47 },
    },
  ];

  const total = {
    current: provisions.reduce((sum, p) => sum + p.current.closing, 0),
    previous: provisions.reduce((sum, p) => sum + Math.abs(p.previous.closing), 0),
  };

  return {
  noteNumber: 33,
  title: "Details of provisions",
  totalCurrent: null,
  totalPrevious: null,
  content: [
      {
        key: 'note32-title',
        label: `The Company has made provision for various contractual obligations based on its assessment of the amount it estimates to incur to meet such obligations, details of which are given below:`,
        valueCurrent: null,
        valuePrevious: null,
      },
    {
      type: "table",
      headers: [
        "",
        "As at 1 April 2023",
        "Additions",
        "Utilisation",
        "As at 31 March 2024"
      ],
      rows: [
        [
          "Provision for product support (Warranty)",
          "484.96\n(547.93)",
          "60.17\n(48.78)",
          "30.60\n(111.70)",
          "514.53\n(484.96)"
        ],
        [
          "Provision for estimated losses on onerous contracts",
          "1,787.08\n(1,390.82)",
          "2,738.95\n(931.55)",
          "1,059.91\n(535.30)",
          "3,466.12\n(1,787.08)"
        ],
        [
          "Provision for estimated losses on construction contracts",
          "10,294.67\n(11,599.89)",
          "7,538.28\n(5,741.18)",
          "6,272.86\n(7,046.40)",
          "11,560.09\n(10,294.67)"
        ],
        [
          "Provision for service tax",
          "1,575.47\n(1575.47)",
          "-\n(-)",
          "-\n(-)",
          "1,575.47\n(1575.47)"
        ],
        [
          "Total as on 31 March 2024",
          "14,142.18",
          "10,337.40",
          "7,363.37",
          "17,116.20"
        ],
        [
          "Total as on 31 March 2023",
          "(15,114.12)",
          "(6,721.46)",
          "(7,693.40)",
          "(14,142.18)"
        ]
      ]
    }
  ],
}
};
const calculateNote34 = (): FinancialNote => {
  // --- Profit and Loss Section ---
  const currentIncomeTax = 
  {
    current : 7227.51,
    previous : 4540.22,
  }
    const relating = 
  {
    current : -1108.27,
    previous : -204.21,
  }
      const benefits = 
  {
    current : 32.87,
    previous : -2.36,
  }
    const opening = 
  {
    previous : 6775.22,
  }
    const closing = 
  {
    previous : opening.previous + benefits.previous -(-(relating).previous),
    current : opening.previous + benefits.previous -(-(relating).previous) + benefits.current -(-(relating).current),
  }
  const account = 
  {
    current : 28679.34,
    previous : 11794.02,
  }
  const enacted = 
  {
    current : 25.168,
    previous : 25.168,
  }
  const short = 
  {
    current : -587.67,
    previous : 220.78,
  }

  const expectedloss = 
  {
    current : 6119.24,
    previous : 4336.01,
  }
    const liability = 
  {
    current : 0,
    previous : 156.67,
  }
  const provision = 
  {
    current : 810.47,
    previous : 236.73,
  }
  const difference = 
  {
    current : 402.67,
    previous : 0,
  }
    const debts = 
  {
    current : 1834.74,
    previous : 1159.87,
  }
    const servicetax = 
  {
    current : 386.49,
    previous : 396.51,
  }
    const loss = 
  {
    current : 3781.80,
    previous : 3040.74,
  }
  const others = 
  {
    current : 902.04,
    previous : 2299.89,
  }
  return {
    noteNumber: 34,
    title: 'Income Tax',
    subtitle:'The major components of income tax expense are:',
    content: [
      {
        key: 'note34-income-tax',
        label: 'Current income tax:',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null,
      },
          {
            key: 'note34-pl-current-tax',
            label: 'Current income tax charge',
            valueCurrent: currentIncomeTax.current,
            valuePrevious: currentIncomeTax.previous,
          },
          {
            key: 'note34-pl-deferred-tax',
            label: 'Deferred tax charge / (credit)',
            isSubtotal:true,
            valueCurrent: null,
            valuePrevious: null,
          },
      {
        key: 'note34-oci',
        label: 'Relating to the origination and reversal of temporary differences',
        valueCurrent: relating.current,
        valuePrevious: relating.previous
      },
          {
            key: 'note34-oci-dbt',
            label: 'Income tax expense reported in Statement of Profit and Loss',
            isSubtotal:true,
            valueCurrent: currentIncomeTax.current + relating.current,
            valuePrevious: currentIncomeTax.previous + relating.previous,
          },
      {
        key: 'note34-recon',
        label: 'Deferred tax related to items recognised in other comprehensive income',
        isSubtotal: true,
        valueCurrent: null,
        valuePrevious: null
      },
          {
            key: 'note34-benefit',
            label: 'Income tax relating to re-measurement gains on defined benefit plans',
            valueCurrent: benefits.current,
            valuePrevious: benefits.previous,
          },
          {
            key: 'note34-recon-oci-movement',
            label: 'Income tax expense reported in other comprehensive income',
            valueCurrent: benefits.current,
            valuePrevious: benefits.previous,
          },
          {
            key: 'note34-reconciliation',
            label: 'Reconciliation of deferred tax(net)',
            valueCurrent: null,
            valuePrevious: null,
            isSubtotal: true
          },
          {
            key: 'note34-reconciliation-open',
            label: 'Opening balance',
            valueCurrent: closing.previous,
            valuePrevious: opening.previous
          },
          {
            key: 'note34-reconciliation-tax-credit',
            label: 'Tax credit/ (expense) during the year recognized in statement of profit and loss',
            valueCurrent: -relating.current,
            valuePrevious: -relating.previous
          },
          {
            key: 'note34-reconciliation-tax-expense',
            label: 'Tax expense during the year recognised in other comprehensive income',
            valueCurrent: benefits.current,
            valuePrevious: benefits.previous
          },
          {
            key: 'note34-reconciliation-closing',
            label: 'Closing balance',
            isSubtotal:true,
            valueCurrent: closing.current,
            valuePrevious: closing.previous
          },
          {
            key: 'note34-reconciliation-v2',
            label: 'Reconciliation of tax expense and the accounting profit multiplied by Indias domestic tax rate',
            valueCurrent: null,
            valuePrevious: null,
            isSubtotal:true
          },
          {
            key: 'note34-reconciliation-v3',
            label: 'Accounting profit before tax and exceptional item',
            valueCurrent: account.current,
            valuePrevious: account.previous
          },
          {
            key: 'note34-reconciliation-v4',
            label: 'Enacted income tax rate in India',
            valueCurrent: enacted.current  ,
            valuePrevious: enacted.previous
          },
          {
            key: 'note34-reconciliation-tax',
            label: 'Tax on accounting profit at statutory income tax rate 25.168% (in FY 2022-23 25.168%)',
            valueCurrent: account.current * (enacted.current/100),
            valuePrevious: account.previous * (enacted.previous/100)
          },
          {
            key: 'note34-reconciliation-taxable',
            label: 'Tax effects of amounts which are not deductible (taxable) in calculating taxable income',
            valueCurrent: -(account.current * (enacted.current/100)) + expectedloss.current -short.current,
            valuePrevious: -(account.current * (enacted.previous/100))+ expectedloss.previous-short.previous
          },
          {
            key: 'note34-reconciliation-taxliability',
            label: 'Tax effect of items constituting deferred tax liability (Refer below for details)',
            valueCurrent: 0,
            valuePrevious: 0
          },
          {
            key: 'note34-reconciliation-taxasset',
            label: 'Tax effect of items constituting deferred tax assets (Refer below for details)',
            valueCurrent: 0,
            valuePrevious: 0
          },
          {
            key: 'note34-reconciliation-taxprofit',
            label: 'Tax effect on items that will not be reclassified to Profit & Loss Account',
            valueCurrent: 0,
            valuePrevious: 0
          },
          {
            key: 'note34-reconciliation-disallowances',
            label: 'Other disallowances',
            valueCurrent: 0,
            valuePrevious: 0
          },
          {
            key: 'note34-reconciliation-short',
            label: 'Short/ (excess) provision for previous year',
            valueCurrent: short.current,
            valuePrevious: short.previous
          },
          {
            key: 'note34-reconciliation-expected',
            label: 'Expected income tax expense',
            valueCurrent: (account.current * (enacted.current/100)) + (-(account.current * (enacted.current/100)) + expectedloss.current -short.current) + short.current,
            valuePrevious: (account.previous * (enacted.previous/100)) + (-(account.current * enacted.current)+ expectedloss.previous-short.previous) + short.previous
          },
          {
            key: 'note34-reconciliation-expectedloss',
            label: 'Income tax expense reported in the statement of Profit and Loss',
            valueCurrent: expectedloss.current,
            valuePrevious: expectedloss.previous 
          },
          {
            key: 'note34-Deferred',
            label: 'Deferred tax (liability) / asset ',
            valueCurrent: null,
            valuePrevious: null,
            isSubtotal:true
          },
          {
            key: 'note34-Deferred-liability-main',
            label: 'Tax effect of items constituting deferred tax liability',
            valueCurrent: null,
            valuePrevious: null 
          }, 
          {
            key: 'note34-Deferred-assets',
            label: 'On difference between book balance and tax balance of fixed assets',
            valueCurrent: liability.current,
            valuePrevious: liability.previous 
          },   
          {
            key: 'note34-Deferred-liability',
            label: 'Tax effect of items constituting deferred tax liability',
            valueCurrent: liability.current,
            valuePrevious: liability.previous 
          }, 
          {
            key: 'note34-Deferred-asset-main',
            label: 'Tax effect of items constituting deferred tax assets',
            valueCurrent:null,
            valuePrevious: null 
          },  
          {
            key: 'note34-Deferred-asset-provision',
            label: 'Provision for compensated absences, gratuity and other employee benefits',
            valueCurrent:provision.current,
            valuePrevious: provision.previous 
          },
          {
            key: 'note34-Deferred-asset-difference',
            label: 'On difference between book balance and tax balance of fixed assets',
            valueCurrent:difference.current,
            valuePrevious: difference.previous 
          }, 
          {
            key: 'note34-Deferred-asset-debt',
            label: 'Provision for doubtful debts/advances',
            valueCurrent:debts.current,
            valuePrevious: debts.previous 
          },  
          {
            key: 'note34-Deferred-asset-servicetax',
            label: 'Provision for  service tax',
            valueCurrent:servicetax.current,
            valuePrevious: servicetax.previous 
          },  
          {
            key: 'note34-Deferred-asset-loss',
            label: 'Provision for estimated loss on contract',
            valueCurrent:loss.current,
            valuePrevious: loss.previous 
          },  
          {
            key: 'note34-Deferred-asset-Others',
            label: 'Others',
            valueCurrent:others.current,
            valuePrevious: others.previous 
          },   
          {
            key: 'note34-Deferred-asset-total',
            label: '',
            valueCurrent:provision.current+difference.current+debts.current+servicetax.current+loss.current+others.current,
            valuePrevious: provision.previous+difference.previous+debts.previous+servicetax.previous+loss.previous+others.previous 
          },   
          {
            key: 'note34-blank',
            label: '',
            valueCurrent:null,
            valuePrevious: null 
          }, 
          {
            key: 'note34-total',
            label: 'Net deferred tax (liability) / asset',
            valueCurrent:(provision.current+difference.current+debts.current+servicetax.current+loss.current+others.current) - liability.current,
            valuePrevious: (provision.previous+difference.previous+debts.previous+servicetax.previous+loss.previous+others.previous) - liability.previous
          },   
        ],
    totalCurrent: null,
    totalPrevious: null,
  };
};
const calculateNote35 = (): FinancialNote => {
  const calculateBalance = (rows: string[][]): string[] => {
    const parseNum = (val: string | undefined): number => {
  if (!val) return 0;
  return parseFloat(val.replace(/[(),]/g, '')) || 0;
};
  const result: number[] = [];
  for (let i = 0; i < 4; i++) {
    const colSum = rows.reduce((sum, row) => sum + parseNum(row[i]), 0);
    result.push(colSum);
  }
  return result.map(val =>
    val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
};

  const calculateRowTotal = (row: string[]): string => {
  const sum = row
    .slice(0, 7)
    .reduce((acc, val) => acc + (parseFloat(val.replace(/,/g, '')) || 0), 0);
  return sum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const equity = {
current:64011.86,
previous:45279.16,
}
const per= {
current:100,
previous:100
}
const total= {
current:equity.current,
previous:equity.previous
}

const res = ['55651.89', '51164.06', '55651.89','51164.06'];
const cash = ['12743.41','3723.25','12743.41','3723.25'];
const bank = ['15244.56','21423.31','15244.56','21423.31'];
const loan = ['6.39','2.73','6.39','2.73'];
const other = ['41664.08','27737.58','41664.08','27737.58'];
const totalasset = calculateBalance([res,cash, bank, loan,other]);

const pay = ['50544.58','55422.65','50544.58','55422.65'];
const lease =['3119.91','1686.15','3119.91','1686.15'];
const otherpay = ['502.76','454.57','502.76','454.57'];
const totalliability =calculateBalance([pay,lease, otherpay]);

const BOY =  3030.3;
const creditloss = {
  current :3974.25,
  previous:1651.28
}
const creditreverse = {
  current:-1531.85,
  previous:-73.07
}
const top5 = {
  current:39885.05,
  previous:27914.35
}
const top = {
  current :11125.15,
  previous:8227.11
}
const india ={
  current:52275.12,
  previous:51807.57
}
const rest = {
  current :10427.68,
  previous:3965.00
}
const  trade = ['50544.58','',''];
trade.push(calculateRowTotal(trade));
const leaseliabilities = ['855.63','1203.70','1060.58'];
leaseliabilities.push(calculateRowTotal(leaseliabilities));
const otherfinancial = ['502.76','',''];
otherfinancial.push(calculateRowTotal(otherfinancial));
const final =calculateBalance([trade,leaseliabilities, otherfinancial]);

const  trade1 = ['39610.27','15262.69','549.69'];
trade1.push(calculateRowTotal(trade1));
const leaseliabilities1 = ['685.66','1000.49',''];
leaseliabilities1.push(calculateRowTotal(leaseliabilities1));
const otherfinancial1 = ['454.57','',''];
otherfinancial1.push(calculateRowTotal(otherfinancial1));
const final1 =calculateBalance([trade1,leaseliabilities1, otherfinancial1]);

const usdforeign = '128.66';
const usdforeign1 ='95.27';
const usdforeign2 ='7824.93';

const usdtrade ='8.85';
const usdtrade1 ='6.81';
const usdpay ='276.06';
const usdpay1 ='258.29';
const usdpay2 ='21213.36';
const euro ='8.42';
const euro1 ='6.25';
const euro2 ='544.44';
const bdt ='6.38';
const bdt1 = '-2.94';
const bdt2 ='-2.26';
const cad ='0.06';
const cad1 ='3.63';
const sgd ='0.07';
const sgd1 ='0.06';
const sgd2 ='3.66';
const jpy = '5468.20';
const jpy1 ='21007.05';
const jpy2 ='12604.23';
const php ='0.37';
const php1 ='0.37';
const php2 ='0.55';

const assetusd ='82.74';
const assetbdt ='0.75';
const assetsgd ='61.26';

const liabilityusd ='82.74';
const liabilityeur ='89.20';
const liabilitybdt ='0.75';
const liabilitycad ='61.10';
const liabilityaed ='22.75';
const liabilitysgd ='61.26';
const liabilityjpy ='0.55';
const liabilitygbp ='104.49';
const liabilityphp ='1.48';

const assetusd1 = '82.13';
const assetbdt1 ='0.77';
const assetsgd1 = '60.96';
const liabilityusd1 = '82.13';
const liabilityeur1 ='87.11';
const liabilitybdt1 = '0.77';
const liabilitycad1 = '60.47';
const liabilityaed1 ='22.40';
const liabilitysgd1 ='60.96';
const liabilityjpy1 ='0.66';
const liabilitygbp1 ='99.06';
const liabilityphp1 ='1.48';

const inr = '-121.96';
const inr1 = '-133.88';
const EURO ='-7.51';
const EURO1 = '-5.44';
const BDT = '-0.05';
const BDT1 = '-0.09';
const SGD = '-0.04';
const YEN = '-29.88';
const YEN1 = '-126.04';
const PHP ='-0.01'

  return {
    noteNumber: 35,
    title: 'Financial instuments',
    totalCurrent: null,
    totalPrevious: null,
    content: [
      {
        key: 'note35-capital',
        label: 'A    Capital management',
        isSubtotal: true,
        valueCurrent:   null,
        valuePrevious:  null,
        children: [
          {
            key: 'note35-capital-description',
            label: 'The Companys policy is to maintain a strong capital base so as to maintain investor, creditor and market confidence and to sustain future development of the business. The Company monitors the return on capital as well as the level of dividends on its equity shares. The Companys objective when managing capital is to maintain an optimal structure so as to maximise share-holder value.',
            valueCurrent: null,
            valuePrevious: null,
          },
           {
            key: 'note35-capital-table',
            label: 'Total equity attributable to the equity shareholders of the company ',
            valueCurrent: equity.current,
            valuePrevious: equity.previous,
          },
          {
            key: 'note35-capital-table1',
            label: 'As a percentage of total capital',
            valueCurrent: per.current,
            valuePrevious: per.previous,
          },
          {
            key: 'note35-capital-table2',
            label: 'Borrowings',
            valueCurrent: 0,
            valuePrevious: 0,
          },
          {
            key: 'note35-capital-table3',
            label: 'As a percentage of total capital',
            valueCurrent: 0,
            valuePrevious: 0,
          },
          {
            key: 'note35-capital-table-total',
            label: 'Total',
            isGrandTotal:true,
            valueCurrent: total.current,
            valuePrevious: total.previous,
          },
        ],
      },
      `The Company is equity financed which is evident from the capital structure table. Further, the Company has always been a net cash Company with cash and bank balances along with liquid investments.`,
          {
            key: 'note35-category',
            label: 'B.    Categories of financial Instruments',
            valueCurrent: null,
            valuePrevious: null,
            isSubtotal:true,
          },
          `The fair value of financial instruments by categories as at 31 March 2023, 31 March 2022 is as below:`,
          {
        type: 'table',
        headers: [
          'Particulars',
          'Carrying Value\nAs at 31 March 2024',
          'Carrying Value\nAs at 31 March 2023',
          'Fair Value\nAs at 31 March 2024',
          'Fair Value\nAs at 31 March 2023'
        ],
        rows: [
          ['Financial assets'],
          ['Measured at amortised cost'],
          ['(a) Trade receivables',...res],
          ['(b) Cash and cash equivalents',...cash],
          ['(c) Bank balance other than cash and cash equivalent',...bank],
          ['(d) Loans',...loan],
          ['(e) Other financial assets',...other],
          ['Total',...totalasset],
          ['Financial liabilities'],
          ['Measured at amortised cost'],
          ['(a) Trade payables',...pay],
          ['(b) Lease Liabilities',...lease],
          ['(b) Other financial liabilities',...otherpay],
          ['Total',...totalliability]
        ]
      },
       {
            key: 'note35-financialrisk',
            label: 'C.    Financial risk management',
            valueCurrent: null,
            valuePrevious: null,
            isSubtotal:true,
          },
          `The Company's activities expose it to a variety of financial risks: market risk, credit risk and liquidity risk. The Company's focus is to foresee the unpredictability of financial markets and seek to minimize potential adverse effects on it's financial performance. The primary market risk to the Company is foreign exchange exposure risk. The Company's exposure to credit risk is influenced mainly by the individual characteristic of each customer. `,
          `The Company's financial risk management is supported by the finance department and enterprise risk management committee:
 - protect the Company's financial results and position from financial risks
 - maintain market risks within acceptable parameters, while optimising returns; and
 - protect the Company's financial investments, while maximising returns.`,
 `The Company does not actively engage in the trading of financial assets for speculative purposes nor does it write options. The most significant financial risks to which the Company is exposed are described below.`,
 {
            key: 'note35-financialrisk-credit',
            label: '           (i) Management of credit risk',
            valueCurrent: null,
            valuePrevious: null,
            isSubtotal:true,
          },
          `Credit risk is the risk of financial loss to the Company arising from counter party failure to meet its contractual obligations. Credit risk encompasses of both, the direct risk of default and the risk of deterioration of creditworthiness as well as concentration of risks. Credit risk is controlled by analysing credit limits and creditworthiness of customers on a continuous basis to whom the credit has been granted after necessary approvals for credit. `,
          {
            key: 'note35-financialrisk-trade',
            label: 'Trade and other receivables',
            valueCurrent: null,
            valuePrevious: null,
            isSubtotal:true,
          },
          `The Company assess the customers credit quality by taking into account their financial position, past experience and other factors. The Company’s exposure to credit risk is influenced mainly by the individual characteristics of each customer. The demographics of the customer, including the default risk of the industry and country in which the customer operates, also has an influence on credit risk assessment.
Trade receivables are typically unsecured and are derived from revenue earned from customers primarily located in India and Japan. Credit risk has always been managed by the Company through credit approvals, establishing credit limits and continuously monitoring the creditworthiness of customers to which the Company grants credit terms in the normal course of business. On account of adoption of Ind AS 109, Financial Instruments, the Company uses expected credit loss model to assess the impairment loss or gain. The provision for expected credit loss takes into account available external and internal credit risk factors and Company's historical experience for customers.`,
{
            key: 'note35-financialrisk-BOY',
            label: 'Balance at the beginning',
            valueCurrent: BOY + creditloss.previous + creditloss.previous,
            valuePrevious: BOY,
          },
          {
            key: 'note35-financialrisk-creditloss',
            label: 'Expected Credit Loss recognized',
            valueCurrent: creditloss.current,
            valuePrevious: creditloss.previous,
          },
          {
            key: 'note35-financialrisk-creditloss-reverse',
            label: 'Expected Credit Loss reversed',
            valueCurrent: creditreverse.current,
            valuePrevious: creditloss.previous,
          },
          {
            key: 'note35-financialrisk-BEY',
            label: 'Balance at the end',
            valueCurrent:  BOY + creditloss.previous + creditloss.previous+ creditloss.current +creditreverse.current,
            valuePrevious: BOY + creditloss.previous + creditloss.previous,
          },
          {
            key: 'note35-revenue',
            label: 'Revenue from top 5 customers',
            valueCurrent: top5.current,
            valuePrevious: top5.previous,
          },
          {
            key: 'note35-revenue-top',
            label: 'Revenue from top customer',
            valueCurrent: top.current,
            valuePrevious: top.previous,
          },
          {
            key: 'note35-geo',
            label: 'Geographical concentration of credit risk',
            valueCurrent: null,
            valuePrevious: null,
            isSubtotal:true,
          },
          `The Company has geographical concentration of trade receivables, net of advances as given below:`,
          {
            key: 'note35-geo-india',
            label: 'India',
            valueCurrent: india.current,
            valuePrevious: india.previous,
          },
          {
            key: 'note35-geo-rest',
            label: 'Rest of the world',
            valueCurrent: rest.current,
            valuePrevious: rest.previous,
          },
          `Geographical concentration of the credit risk is allocated based on the location of the customers.`,
          {
            key: 'note35-financialrisk-liquidity',
            label: '           (ii) Management of liquidity risk',
            valueCurrent: null,
            valuePrevious: null,
            isSubtotal:true,
          },
          `Liquidity risk is the risk that the Company will not be able to meet its financial obligations as they become due. The Company’s approach to managing liquidity is to ensure that it will have sufficient funds to meet its liabilities when due without incurring unacceptable losses. In doing this, management considers both normal and stressed conditions. A material and sustained shortfall in the cash flow could undermine the Company’s credit rating and impair investor confidence. The Company’s treasury department is responsible for liquidity, funding as well as settlement management. In addition, processes and policies related to such risks are overseen by senior management.`,
          `The following table shows the maturity analysis of the Company's financial liabilities based on contractually agreed undiscounted cash flows:`,
      {
        type: 'table',
        headers: [
          'As at 31 March 2024',
          'Less than 1 Year',
          '1 Year to 5 Year',
          'More than 5 Years',
          'Total'
        ],
        rows: [
          ['Trade payables',...trade],
          ['Lease Liabilities',...leaseliabilities],
          ['Other financial liabilities',...otherfinancial],
          ['Total',...final],
        ]
      },
      {
        type: 'table',
        headers: [
          'As at 31 March 2023',
          'Less than 1 Year',
          '1 Year to 5 Year',
          'More than 5 Years',
          'Total'
        ],
        rows: [
          ['Trade payables',...trade1],
          ['Lease Liabilities',...leaseliabilities1],
          ['Other financial liabilities',...otherfinancial1],
          ['Total',...final1],
        ]
      },
          {
            key: 'note35-fina-risk',
            label: 'C Financial risk management (contd)',
            valueCurrent: null,
            valuePrevious: null,
          },
          {
            key: 'note35-fina-risk',
            label: '          (iii) Management of market risk',
            valueCurrent: null,
            valuePrevious: null,
          },
          `The Company's size and operations result in it being exposed to the following market risks that arise from its use of financial instruments:
              • interest rate risk
              • price risk
              • currency risk
           The above risks may affect the Company's income and expenses, or the value of its financial instruments. The objective of the Company’s management of market risk is to maintain this risk within acceptable parameters, while optimising returns. The Company’s exposure to, and management of, these risks is explained below:`,
      {
        type: 'table',
        headers: [
          'MANAGEMENT POLICY',
          'POTENTIAL IMPACT OF RISK',
          'SENSITIVITY TO RISK',
        ],
        rows: [
          [`(i) Interest rate risk
            The Company is not exposed to interest rate risk because it does not have any borrowings`,'NA','The Company is not exposed to interest Risk'],
          [`(ii) Price risk
            Major raw materials purchase is from international market and less dependency on domestic market. The prices of the Company's raw materials generally fluctuate in line with commodity cycles.`,'The objective of the Company is to minimise the impact of raw material cost fluctuations.Centralised procurement team evaluate and manage through operating procedures and sourcing policies.','The prices of the Companys raw materials generally fluctuate in line with commodity cycles. Hence sensitivity analysis is not done.'],
          [`(iii) Currency risk
            The Company operates internationally and consequently the Company is exposed to foreign exchange risk through its sales and purchases from overseas suppliers in various foreign currencies. The exchange rate between the rupee and foreign currencies has changed substantially in recent years and may fluctuate substantially in the future. Consequently, the results of the Company’s operations are adversely affected as the rupee appreciates/ depreciates against these currencies.`,'Considering the countries and economic environment in which the Company operates, its operations are subject to risks arising from fluctuations in exchange rates in those countries. The risks primarily relate to fluctuations in US Dollar, Euro, BDT, SGD, JPY, AED and SEK  against the functional currency of the Company. As a result, if the value of the Indian rupee appreciates relative to these foreign currencies, the Company’s profits measured in rupees may increase. The exchange rate between the Indian rupee and these foreign currencies has changed substantially in recent periods and may continue to fluctuate substantially in the future. ','The Company has risk management team and treasury team who will monitor and reduce the risk due to exchange fluctuation. For the year ended 31 March, 2024 for the every 1% increase/decrease in respective foreign currencies compared to functional currency of the Company would impact operating margins before tax. Refer below.'],
        ]
      },
      'The following table sets forth information relating to foreign currency exposures as at 31 March 2024 and 31 March 2023 :',
      {
        type: 'table',
        headers: [
          'Particulars \n Included In',
          'Particulars \N Currency',
          'As at 31 March 2024 \n Amount in foreign currency in Lakhs',
          'As at 31 March 2024 \n Amount in ₹ Lakhs',
          'As at 31 March 2023 \n Amount in foreign currency in Lakhs',
          'As at 31 March 2023 \n Amount in ₹ Lakhs',
        ],
        rows: [
          ['Trade receivables','USD',usdforeign,(Number(usdforeign) * Number(assetusd)).toString(),usdforeign1,usdforeign2],
          ['','BDT','','',usdtrade,usdtrade1],
          ['Financial liabilities'],
          ['Trade payables','USD',usdpay,(Number(usdpay) * Number(liabilityusd)).toString(),usdpay1,usdpay2],
          ['','EURO',euro,(Number(euro) * Number(liabilityeur)).toString(),euro1,euro2],
          ['',' BDT',bdt,(Number(bdt) * Number(liabilitybdt)).toString(),bdt1,bdt2],
          ['','CAD','','',cad,cad1],
          ['','SGD',sgd,(Number(sgd) * Number(liabilitysgd)).toString(),sgd1,sgd2],
          ['','JPY',jpy,(Number(jpy) * Number(liabilityjpy)).toString(),jpy1,jpy2],
          ['','GBP','','','',''],
          ['','PHP',php,(Number(php) * Number(liabilityphp)).toString(),php1,php2]
        ]
      },
      {
        type: 'table',
        headers: [
          'Conversion rates',
          'Financial assets \n USD',
          'Financial assets \n BDT',
          'Financial assets \n SGD',
          'Financial liabilities \n USD',
          'Financial liabilities \n EUR',
          'Financial liabilities \n BDT',
          'Financial liabilities \n CAD',
          'Financial liabilities \n AED',
          'Financial liabilities \n SGD',
          'Financial liabilities \n JPY',
          'Financial liabilities \n GBP',
          'Financial liabilities \n PHP',
        ],
        rows: [
          ['As at March 2024',assetusd,assetbdt,assetsgd,liabilityusd,liabilityeur,liabilitybdt,liabilitysgd,liabilityjpy,liabilitygbp,liabilityphp],
          ['As at March 2023',assetusd1,assetbdt1,assetsgd1,liabilityusd1,liabilityeur1,liabilitybdt1,liabilitycad1,liabilityaed1,liabilitysgd1,liabilityjpy1,liabilitygbp1,liabilityphp1]
        ]
      },
      'Sensitivity',
      `The following table details the Company’s sensitivity to a 1% increase and decrease in the ₹ against the relevant foreign currencies. 1% is the sensitivity rate used when reporting foreign currency risk internally to key management personnel and represents management’s assessment of the reasonably possible change in foreign exchange rates. The sensitivity analysis includes only outstanding foreign currency denominated monetary items and adjusts their translation at the year-end for a 1% change in foreign currency rates, with all other variables held constant. A positive number below indicates an increase in profit or equity where ₹ strengthens 1% against the relevant currency. For a 1% weakening of ₹ against the relevant currency, there would be a comparable impact on profit or equity, and the balances below would be negative.`,
      {
        type: 'table',
        headers: [
          'Particulars',
          'Increase \n 31 March 2024',
          'Decrease \n 31 March 2024',
          'Increase \n 31 March 2023',
          'Decrease \n 31 March 2023',
        ],
        rows: [
          ['Sensitivity'],
          ['INR/USD',inr,(-inr).toString(),inr1,(-inr1).toString()],
          ['INR/EURO',EURO,(-EURO).toString(),EURO1,(-EURO1).toString()],
          ['INR/BDT',BDT,(-BDT).toString(),BDT1,(-BDT1).toString()],
          ['INR/SGD',SGD,(-SGD).toString(),SGD,(-SGD).toString()],
          ['INR/CAD','','',SGD,(-SGD).toString()],
          ['INR/YEN',YEN,(-YEN).toString(),YEN1,(-YEN1).toString()],
          ['INR/PHP',PHP,(-PHP).toString(),PHP,(-PHP).toString()]
        ]
      },
          {
            key: 'note35-D',
            label: 'Fair Value Measurement',
            valueCurrent: null,
            valuePrevious: null,
          },
          `Fair value is the price that would be received to sell an asset or paid to transfer a liability in an orderly transaction between Market participants at the measurement date, regardless of whether that price is directly observable or estimated using another valuation technique. In estimating the fair value of an asset or a liability, the Company takes into account the characteristics of the asset or liability if Market participants would take those characteristics into account when pricing the asset or liability, at the measurement date. Fair value for measurement and/or disclosure purposes in these financial statements is determined on such a basis, except for leasing transactions that are within the scope of Ind AS 116, and measurements that have some similarities to fair value but are not fair value, such as net realisable value in Ind AS 2 or value in use in Ind AS 36.`,

          `In addition, for financial reporting purposes, fair value measurements are categorised into Level 1, 2, or 3 based on the degree to which the inputs to the fair value measurements are observable and the significance of the inputs to the fair value measurement in its entirety, which are described as follows:`,
          `- Level 1 inputs are quoted prices (unadjusted) in active Markets for identical assets or liabilities that the entity can access at the measurement date;`,
          `- Level 2 inputs are inputs, other than quoted prices included within Level 1, that are observable for the asset or liability, either directly or indirectly; and`,
          `- Level 3 inputs are unobservable inputs for the asset or liability.`,
          `The fair value hierachy of Financial Instruments of the company are measured under Level 3 .`,
        ],
      };
};

    const note3 = calculateNote3();
    const note4 = calculateNote4();
    const note5 = calculateNote5();
    const note6 = calculateNote6();
    const note7 = calculateNote7();
    const note8 = calculateNote8();
    const note9 = calculateNote9();
    const note10 = calculateNote10();
    const note11 = calculateNote11();
    const note12 = calculateNote12();
    const note13 = calculateNote13();
    const note14 = calculateNote14();
    const note15 = calculateNote15();
    const note16 = calculateNote16();
    const note17 = calculateNote17();
    const note18 = calculateNote18();
    const note19 = calculateNote19();
    const note20 = calculateNote20();
    const note21 = calculateNote21();
    const note22 = calculateNote22();
    const note23 = calculateNote23();
    const note24 = calculateNote24();
    const note25 = calculateNote25();
    const note26 = calculateNote26();
    const note27 = calculateNote27();
    const note28 = calculateNote28();
    const note29 = calculateNote29();
    const note30 = calculateNote30();
    const note32 = calculateNote32();
    const note33 = calculateNote33();
    const note34 = calculateNote34();
    const note35 = calculateNote35();
    const allNotes = [note3,note4,note5,note6,note7,note8,note9,note10,note11,note12,note13,note14,note15,note16,note17,note18,note19,note20,note21,note22,note23,note24,note25,note26,note27,note28,note29,note30,note32,note33,note34,note35]; // [FIX] Add all calculated notes

    const processNode = (node: TemplateItem,enrichedData: MappedRow[],getAmount: (
    year: 'amountCurrent' | 'amountPrevious',
    level1Keywords?: string[],
    level2Keywords?: string[]
  ) => number): HierarchicalItem => {
      const children = node.children?.map(child => processNode(child, enrichedData, getAmount));
      let valueCurrent: number | null = 0;
      let valuePrevious: number | null = 0;

      function findNestedItem(item: HierarchicalItem, path: string[]): HierarchicalItem | undefined {
  let current: HierarchicalItem | undefined = item;
  for (const key of path) {
    current = current?.children?.find(child => child.key === key);
    if (!current) break;
  }
  return current;
}    
  // [FIX] Map the totals from the calculated notes back to the main statements
if (node.key === 'bs-assets-c-inv') {
          valueCurrent = note8.totalCurrent;
          valuePrevious = note8.totalPrevious;
      }
else if (node.key === 'bs-assets-c-other') {
  const banks = note10.content.find(
    (item): item is HierarchicalItem =>
      typeof item === 'object' && item !== null && 'key' in item && item.key === 'note10-total'
  );
  if (banks) {
    valueCurrent = banks.valueCurrent;
    valuePrevious = banks.valuePrevious;
  }
}
else if(node.key ==='bs-assets-nc-other'){
  const yr = note10.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note10-noncurrent'
  );
  const child = yr?.children?.find(child => child.key === 'Non-current-total');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
      } 
      else if (node.key === 'bs-assets-c-fin-cce') {
  const yr = note11.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note10-bwb-group'
  );
  const child = yr?.children?.find(child => child.key === 'note11-total');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
      }
else if (node.key === 'bs-assets-c-fin-bank') {
  const yr = note11.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note10-bwb-group-other'
  );
  const child = yr?.children?.find(child => child.key === 'note10-bwb-group-other-total');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
}
else if (node.key === 'bs-assets-nc-fin-loan') {
  const yr = note5.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note5-noncurrent'
  );
  const child = yr?.children?.find(child => child.key === 'note5-nc-emp');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
}
else if (node.key === 'bs-assets-c-fin-loans') {
  const yr = note5.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note5-current'
  );
  const child = yr?.children?.find(child => child.key === 'note5-c-emp');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
}
else if (node.key === 'bs-assets-nc-fin-other') {
  const yr = note6.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note6-noncurrent'
  );
  const child = yr?.children?.find(child => child.key === 'note6-nc-total');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
}
else if (node.key === 'bs-assets-c-fin-other') {
  const yr = note6.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note6-current'
  );
  const child = yr?.children?.find(child => child.key === 'note6-c-total');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
}
else if (node.key === 'bs-liab-c-fin-enterprises') {
  const msmes = note14.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note14-msme-group');
  if (msmes) {
    valueCurrent = Math.abs(msmes.valueCurrent??0);
    valuePrevious = Math.abs(msmes.valuePrevious??0);
  }
}
else if (node.key === 'bs-liab-c-fin-creators') {
  const nonmsmes = note14.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note14-nonmsme-group');
  if (nonmsmes) {
    valueCurrent = Math.abs(nonmsmes.valueCurrent??0);
    valuePrevious = Math.abs(nonmsmes.valuePrevious??0);
  }
}
else if (node.key === 'bs-liab-c-fin-enterprises-other') {
  const othercr = note15.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note15-footer-other');
  if (othercr) {
    valueCurrent = Math.abs(othercr.valueCurrent??0);
    valuePrevious = Math.abs(othercr.valuePrevious??0);
  }
}
else if (node.key === 'bs-liab-c-other') {
  const lib = note16.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note16-total');
  if (lib) {
    valueCurrent = Math.abs(lib.valueCurrent??0);
    valuePrevious = Math.abs(lib.valuePrevious??0);
  }
}
else if (node.key === 'bs-liab-nc-prov') {
  const borrow = note17.content.find(
  (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note17-noncurrent');
const subchild = borrow ? findNestedItem(borrow, ['note17-gratuity','note17-gratuity-net']) : undefined;
if (subchild) {
  valueCurrent = -(subchild.valueCurrent ?? 0);
  valuePrevious = -(subchild.valuePrevious ?? 0);
}
}
else if (node.key === 'bs-liab-c-prov') {
  const lib = note17.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note17-total');
  if (lib) {
    valueCurrent = Math.abs(lib.valueCurrent??0);
    valuePrevious = Math.abs(lib.valuePrevious??0);
  }
}
else if (node.key === 'is-rev-ops') {
  const yr = note18.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note18-disaggregate'
  );
  const child = yr?.children?.find(child => child.key === 'note18-other-rev-total-final');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
}
else if (node.key === 'is-other-inc') {
  const yr = note19.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note19-summary'
  );
  const child = yr?.children?.find(child => child.key === 'note19-summary-total');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
  }
  else if (node.key === 'is-exp-mat') {
  const yr = note20.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note20-cogs'
  );
  const child = yr?.children?.find(child => child.key === 'note20-cogs-total-final');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
}

else if (node.key === 'is-exp-pur') {
  const yr = note20.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note20-purchase-traded-goods'
  );
  const child = yr?.children?.find(child => child.key === 'note20-purchase-traded-goods-total');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
}

else if (node.key === 'is-exp-inv') {
  const yr = note20.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note20-changes-in-inventories'
  );
  const child = yr?.children?.find(child => child.key === 'note20-changes-in-inventories-total');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
}
else if (node.key === 'is-exp-emp') {
  const inc = note21.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key ==='note21-total');
  if (inc) {
    valueCurrent = inc.valueCurrent??0;
    valuePrevious = inc.valuePrevious??0;
  }
}
else if (node.key === 'is-exp-fin') {
  const inc = note22.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note22-total');
  if (inc) {
    valueCurrent = inc.valueCurrent??0;
    valuePrevious = inc.valuePrevious??0;
  }
}
else if (node.key === 'is-exp-dep') {
  const inc = note23.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note23-total');
  if (inc) {
    valueCurrent = inc.valueCurrent??0;
    valuePrevious = inc.valuePrevious??0;
  }
}
else if (node.key === 'is-exp-oth') {
  const inc = note24.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note24-total');
  if (inc) {
    valueCurrent = inc.valueCurrent??0;
    valuePrevious = inc.valuePrevious??0;
  }
}

else if (node.key === 'bs-assets-nc-fin-income') {
  const borrow = note7.content.find(
  (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note7-asset-section');
const subchild = borrow ? findNestedItem(borrow, ['note7-main','note7-under-protest-total']) : undefined;
if (subchild) {
  valueCurrent = subchild.valueCurrent ?? 0;
  valuePrevious = subchild.valuePrevious ?? 0;
}
}
else if (node.key === 'bs-liab-c-tax') {
  const yr = note7.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note7-liability-section'
  );
  const child = yr?.children?.find(child => child.key === 'note7a-main');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
}
else if (node.key === 'bs-eq-other') {
  const incLbt = note13.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note13-total');
  if (incLbt) {
    valueCurrent = incLbt.valueCurrent??0;
    valuePrevious = incLbt.valuePrevious??0;
  }
}
else if (node.key === 'is-eps-value') {
  const ear = note32.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note32-eps');
  if (ear) {
    valueCurrent = ear.valueCurrent??0;
    valuePrevious = ear.valuePrevious??0;
  }
}
else if (node.key === 'bs-assets-c-fin-tr') {
  const rec = note9.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note9-total');
  if (rec) {
    valueCurrent = rec.valueCurrent??0;
    valuePrevious = rec.valuePrevious??0;
  }
}

else if (node.key === 'is-oci-remesure') {
  const yr = note28.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note28-benefit'
  );
  const child = yr?.children?.find(child => child.key === 'note28-benefit-total');
  if (child) {
    valueCurrent = -(child.valueCurrent ?? 0);
    valuePrevious = -(child.valuePrevious ?? 0);
  }
}
else if (node.key === 'bs-liab-nc-fin-borrow') {
const borrow = note29.content.find(
  (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note29-balance'
);

const subchild = borrow ? findNestedItem(borrow, ['note29-balance-long', 'note29-balance-long-term']) : undefined;

if (subchild) {
  valueCurrent = subchild.valueCurrent ?? 0;
  valuePrevious = subchild.valuePrevious ?? 0;
}
}
else if (node.key === 'bs-liab-c-fin-liability') {
  const yr = note29.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note29-maturities'
  );
  const child = yr?.children?.find(child => child.key === 'note29-pl-1');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
}
else if (node.key === 'is-tax-curr') {
  const currenttax = note34.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note34-pl-current-tax');
  if (currenttax) {
    valueCurrent = currenttax.valueCurrent??0;
    valuePrevious = currenttax.valuePrevious??0;
  }
}
else if (node.key === 'is-tax-def') {
  const deffered = note34.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note34-oci');
  if (deffered) {
    valueCurrent = deffered.valueCurrent??0;
    valuePrevious = deffered.valuePrevious??0;
  }
}
else if (node.key === 'is-oci-tax') {
  const benefit = note34.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note34-benefit');
  if (benefit) {
    valueCurrent = benefit.valueCurrent??0;
    valuePrevious = benefit.valuePrevious??0;
  }
}
else if (node.key === 'bs-assets-nc-ppe') {
const table = note3.content.find(
  (item): item is TableContent => (item as TableContent).type === 'table'
);
  if (table) {
    const ppeRow = table.rows.find(row => row[0] === 'As at 31 March 2024');
    if (ppeRow) {
      valueCurrent = parseFloat(ppeRow[ppeRow.length - 1].replace(/,/g, '')) || 0;
    }
    const prevRow = table.rows.find(row => row[0] === 'As at 31 March 2023');
    if (prevRow) {
      valuePrevious = parseFloat(prevRow[prevRow.length - 1].replace(/,/g, '')) || 0;
    }
  }
}
else if (node.key === 'bs-assets-nc-cwip') {
  const tables = note3.content.filter(
    (item): item is TableContent => (item as TableContent).type === 'table'
  );
  // Assuming the second table in content is the CWIP table
  const cwipTable = tables[1]; // index 1 for second table
  if (cwipTable) {
    const currentRow = cwipTable.rows.find(row => row[0] === 'Total as on 31 March 2024');
    if (currentRow) {
  valueCurrent = Math.abs(parseFloat(currentRow[currentRow.length - 1].replace(/,/g, ''))) || 0;
}
    const previousRow = cwipTable.rows.find(row => row[0] === 'Total as on 31 March 2023');
    if (previousRow) {
  valuePrevious = Math.abs(parseFloat(previousRow[previousRow.length - 1].replace(/,/g, ''))) || 0;
}
  }
}
else if (node.key === 'bs-assets-nc-rou') {
const table = note4.content.find(
  (item): item is TableContent => (item as TableContent).type === 'table'
);
  if (table) {
    const ppeRow = table.rows.find(row => row[0] === 'As at 31 March 2024');
    if (ppeRow) {
      valueCurrent = parseFloat(ppeRow[ppeRow.length - 1].replace(/,/g, '')) || 0;
    }
    const prevRow = table.rows.find(row => row[0] === 'As at 31 March 2023');
    if (prevRow) {
      valuePrevious = parseFloat(prevRow[prevRow.length - 1].replace(/,/g, '')) || 0;
    }
  }
}
else if (node.key === 'bs-assets-nc-intangible') {
  const tables = note4.content.filter(
    (item): item is TableContent => (item as TableContent).type === 'table'
  );
  // Assuming the second table in content is the CWIP table
  const cwipTable = tables[1]; // index 1 for second table
  if (cwipTable) {
    const currentRow = cwipTable.rows.find(row => row[0] === 'As at 31 March 2024');
    if (currentRow) {
      valueCurrent = parseFloat(currentRow[currentRow.length - 1].replace(/,/g, '')) || 0;
    }
    const previousRow = cwipTable.rows.find(row => row[0] === 'As at 31 March 2023');
    if (previousRow) {
      valuePrevious = parseFloat(previousRow[previousRow.length - 1].replace(/,/g, '')) || 0;
    }
  }
}
else if (node.key === 'bs-assets-nc-otherintangible') {
  const tables = note4.content.filter(
    (item): item is TableContent => (item as TableContent).type === 'table'
  );
  // Assuming the second table in content is the CWIP table
  const cwipTable = tables[2]; // index 1 for second table
  if (cwipTable) {
    const currentRow = cwipTable.rows.find(row => row[0] === 'Total as on 31 March 2024');
    if (currentRow) {
  valueCurrent = Math.abs(parseFloat(currentRow[currentRow.length - 1].replace(/,/g, ''))) || 0;
}
    const previousRow = cwipTable.rows.find(row => row[0] === 'Total as on 31 March 2023');
    if (previousRow) {
  valuePrevious = Math.abs(parseFloat(previousRow[previousRow.length - 1].replace(/,/g, ''))) || 0;
}
  }
}

else if (node.key === 'bs-eq-captial') {
  const currentAmount = getAmount('amountCurrent',node.keywords,['equity share capital']);
  const previousAmount = getAmount('amountPrevious',node.keywords,['equity share capital']);
  valueCurrent = Math.abs(currentAmount);
  valuePrevious = Math.abs(previousAmount);
}
else if (node.key === 'is-except') {
        valueCurrent = 12166.54;
      }

// #cashflow

else if (node.key === 'cf-op-pro') {
        valueCurrent = 22560.10;
        valuePrevious = 7458.01;
      }
else if (node.key === 'cf-op-sub-tax') {
  const benefit = note34.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note34-oci-dbt');
  if (benefit) {
    valueCurrent = benefit.valueCurrent??0;
    valuePrevious = benefit.valuePrevious??0;
  }
}
else if (node.key === 'cf-op-sub-dep') {
  const benefit = note23.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note23-total');
  if (benefit) {
    valueCurrent = benefit.valueCurrent??0;
    valuePrevious = benefit.valuePrevious??0;
  }
}
else if (node.key === 'cf-op-sub-prov') {
        valueCurrent = -12166.54;
        valuePrevious = 0;
      }
else if (node.key === 'cf-op-sub-interest') {
  const yr = note19.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note19-interest-breakup'
  );
  const child = yr?.children?.find(child => child.key === 'note19-interest-breakup-total');
  if (child) {
    valueCurrent = -(child.valueCurrent ?? 0);
    valuePrevious = -(child.valuePrevious ?? 0);
  }
}
else if (node.key === 'cf-op-sub-interest-2') {
  const yr = note22.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note22-interest'
  );
  const child = yr?.children?.find(child => child.key === 'note22-lease-liability');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
}
else if (node.key === 'cf-op-sub-prov-2') {
  const benefit = note24.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note24-doubtfulTrade');
  if (benefit) {
    valueCurrent = benefit.valueCurrent??0;
    valuePrevious = benefit.valuePrevious??0;
  }
}
else if (node.key === 'cf-op-sub-loss') {
  const benefit = note24.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note24-lossonFD');
  if (benefit) {
    valueCurrent = benefit.valueCurrent??0;
    valuePrevious = benefit.valuePrevious??0;
  }
}
else if (node.key === 'cf-op-sub-prov-3') {
  const benefit = note24.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note24-estimateLoss');
  if (benefit) {
    valueCurrent = benefit.valueCurrent??0;
    valuePrevious = benefit.valuePrevious??0;
  }
}
else if (node.key === 'cf-op-sub-prov-4') {
  const benefit = note24.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note24-expLoss');
  if (benefit) {
    valueCurrent = benefit.valueCurrent??0;
    valuePrevious = benefit.valuePrevious??0;
  }
}
else if (node.key === 'cf-op-sub-loss-1') {
        valueCurrent = -76.80;
        valuePrevious = 732.58;
      }
else if (node.key==='cf-op'){
  valueCurrent=null;
  valuePrevious=null;
}
else if (node.key==='cf-op-mov'){
  valueCurrent=null;
  valuePrevious=null;
}

else if (node.key==='cf-op-sub'){
  valueCurrent=null;
  valuePrevious=null;
}
else if (node.key==='cf-op-mov-inv'){
  valueCurrent=1558.37;
  valuePrevious=-3805.23;
}

else if (node.key==='cf-op-mov-rec'){
  valueCurrent=-8412.56;
  valuePrevious=1093.92;
}
else if (node.key==='cf-op-mov-short'){
  valueCurrent=-3.66;
  valuePrevious=0.09;
}
else if (node.key==='cf-op-mov-nonfinancial'){
  valueCurrent=-1836.00;
  valuePrevious=-73.19;
}
else if (node.key==='cf-op-mov-nonasset'){
  valueCurrent=-2.93;
  valuePrevious=126.75;
}
else if (node.key==='cf-op-mov-long'){
  valueCurrent=2.57;
  valuePrevious=1.91;
}
else if (node.key==='cf-op-mov-financial'){
  valueCurrent=-12220.97;
  valuePrevious=-7213.34;
}
else if (node.key==='cf-op-mov-current'){
  valueCurrent=2040.51;
  valuePrevious=-1096.87;
}
else if (node.key==='cf-op-mov-pay'){
  valueCurrent=7242.02;
  valuePrevious=9236.29;
}
else if (node.key==='cf-op-mov-currentlib'){
  valueCurrent=4676.58;
  valuePrevious=1781.27;
}
else if (node.key==='cf-op-mov-otherlib'){
  valueCurrent=48.19;
  valuePrevious=-2.56;
}
else if (node.key==='cf-op-mov-long-prov'){
  valueCurrent=324.58;
  valuePrevious=58.21;
}
else if (node.key==='cf-op-mov-short-prov'){
  valueCurrent=-101.09;
  valuePrevious=-53.61;
}
else if (node.key==='cf-op-direct-tax'){
  valueCurrent=-8467.04;
  valuePrevious=-5119.83;
}
else if (node.key==='cf-inv'){
  valueCurrent=null;
  valuePrevious=null;
}
else if (node.key==='cf-inv-capex'){
  valueCurrent=-3146.69;
  valuePrevious=-2754.78;
}
else if (node.key==='cf-inv-capex-ppe'){
  valueCurrent=43.93;
  valuePrevious=21.45;
}
else if (node.key==='cf-inv-capex-cce'){
  valueCurrent=6178.75;
  valuePrevious=-16756.93;
}
else if (node.key==='cf-inv-capex-interest'){
  valueCurrent=1311.79;
  valuePrevious=699.67;
}
else if (node.key==='cf-fin'){
  valueCurrent=null;
  valuePrevious=null;
}
else if (node.key==='cf-fin-lib'){
  valueCurrent=-1035.75;
  valuePrevious=-841.85;
}
else if (node.key==='cf-fin-dividend'){
  valueCurrent=-3729.65;
  valuePrevious=0;
}
else if (node.key==='cf-foreign'){
  valueCurrent=416.94;
  valuePrevious=353.54;
}
else if (node.key==='cf-net-total-prev'){
  valueCurrent=3723.25;
  valuePrevious=14296.55;
}
else if (node.key==='cf-cce-prev'){
  valueCurrent=12743.41;
  valuePrevious=3723.25;
}
else if (node.key==='cf-cce'){
  valueCurrent=null;
  valuePrevious=null;
}
else if (node.key === 'cf-cce-cih') {
  const benefit = note11.content.find((item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note10-coh');
  if (benefit) {
    valueCurrent = benefit.valueCurrent??0;
    valuePrevious = benefit.valuePrevious??0;
  }
}
else if (node.key==='cf-cce-bank'){
  valueCurrent=null;
  valuePrevious=null;
}
else if (node.key === 'cf-cce-current') {
  const yr = note11.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note10-bwb-group'
  );
  const child = yr?.children?.find(child => child.key === 'note10-bwb-ca');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
}
else if (node.key === 'cf-cce-eefc') {
  const yr = note11.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note10-bwb-group'
  );
  const child = yr?.children?.find(child => child.key === 'note10-bwb-eefc');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
}
else if (node.key === 'cf-cce-fixed') {
  const yr = note11.content.find(
    (item): item is HierarchicalItem => typeof item === 'object' && item !== null && 'key' in item && item.key === 'note10-bwb-group'
  );
  const child = yr?.children?.find(child => child.key === 'note10-bwb-dep');
  if (child) {
    valueCurrent = child.valueCurrent ?? 0;
    valuePrevious = child.valuePrevious ?? 0;
  }
}
else if (node.key==='cf-op-profit'){
  valueCurrent=24132.27;
  valuePrevious=13771.99;
} else if (node.key==='cf-op-cgo'){
  valueCurrent=17447.88;
  valuePrevious=13825.33;
}
else if (node.key==='cf-op-cgo-total'){
  valueCurrent=4387.78;
  valuePrevious=-18790.59;
}
else if (node.key==='cf-net-total'){
  valueCurrent=8603.22;
  valuePrevious=-10926.97;
}
else if (node.key==='cf-cce-total'){
  valueCurrent=12743.41;
  valuePrevious=3723.25;
}
      
      else if (node.keywords) {
        valueCurrent = getAmount('amountCurrent', node.keywords);
        valuePrevious = getAmount('amountPrevious', node.keywords);
      } else if (children?.length) {
        valueCurrent = children.reduce((sum, c) => sum + (c.valueCurrent ?? 0), 0);
        valuePrevious = children.reduce((sum, c) => sum + (c.valuePrevious ?? 0), 0);
      } else if (node.formula) {
        const [id1, op, id2] = node.formula;
        const val1 = totals.get(id1 as string);
        const val2 = totals.get(id2 as string);
        if (val1 && val2) {
          valueCurrent = op === '+' ? val1.current + val2.current : val1.current - val2.current;
          valuePrevious = op === '+' ? val1.previous + val2.previous : val1.previous - val2.previous;
        } else {
            valueCurrent = null;
            valuePrevious = null;
        }
      } else {
        valueCurrent = null;
        valuePrevious = null;
      }
      
      if (node.id) {
        totals.set(node.id, { current: valueCurrent ?? 0, previous: valuePrevious ?? 0 });
      }

      return { ...node, valueCurrent, valuePrevious, children };
    };


     return {
      balanceSheet: BALANCE_SHEET_STRUCTURE.map(node => processNode(node, enrichedData, getAmount)),
      incomeStatement: INCOME_STATEMENT_STRUCTURE.map(node => processNode(node, enrichedData, getAmount)),
      cashFlow: CASH_FLOW_STRUCTURE.map(node => processNode(node, enrichedData, getAmount)),
      notes: allNotes,
      accountingPolicies: ACCOUNTING_POLICIES_CONTENT,
    };
  }, [rawData,editedNotes]);
};
// --- 5. UI COMPONENTS ---
const DrillDownTable = ({ title, data, expandedKeys, onToggleRow }: { title: string; data: HierarchicalItem[]; expandedKeys: Set<string>; onToggleRow: (key: string) => void; }) => {
    const renderRow = (row: HierarchicalItem, depth: number) => {
      const hasChildren = row.children && row.children.length > 0;
      const rowStyles: any = {};
      const cellStyles: any = {
        fontWeight: depth === 0 || row.isSubtotal || row.isGrandTotal ? 'bold' : 'normal',
        verticalAlign: 'middle',
      };

      if (depth === 0) {
        rowStyles.backgroundColor = '#f0f0f0';
        cellStyles.borderTop = `1px solid #ccc`;
        cellStyles.borderBottom = `1px solid #ccc`;
      }
      if (row.isSubtotal && depth > 0) {
        cellStyles.borderTop = `1px solid #e0e0e0`;
      }
      if (row.isGrandTotal) {
        rowStyles.backgroundColor = '#f0f0f0';
        cellStyles.borderTop = `2px solid #333`;
        cellStyles.borderBottom = `2px solid #333`;
      }

      return (
        <Fragment key={row.key}>
            <TableRow sx={rowStyles}>
                <TableCell sx={{...cellStyles, paddingLeft: `${(depth * 1.5) + 1}rem`, textTransform: depth === 0 ? 'uppercase' : 'none' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Button size="small" onClick={() => onToggleRow(row.key)} variant="text" sx={{ mr: 1, minWidth: 'auto', p: '2px 4px', color: 'text.secondary', visibility: hasChildren ? 'visible' : 'hidden' }}>
                            {expandedKeys.has(row.key) ? '▼' : '▶'}
                        </Button>
                        {row.label}
                    </Box>
                </TableCell>
                <TableCell align="center" sx={cellStyles}>{row.note}</TableCell>
                <TableCell align="right" sx={cellStyles}>{formatCurrency(row.valueCurrent)}</TableCell>
                <TableCell align="right" sx={cellStyles}>{formatCurrency(row.valuePrevious)}</TableCell>
            </TableRow>
            {hasChildren && expandedKeys.has(row.key) && row.children?.map(child => renderRow(child, depth + 1))}
        </Fragment>
      );
    };
    
    return (
        <Paper sx={{ my: 2, overflow: 'hidden' }}>
            <Box sx={{ p: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6" mb={1}>{title}</Typography>
                    <Typography variant="body2" color="text.secondary">₹ in Lakhs</Typography>
                </Box>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{width: '50%'}}>Particulars</TableCell>
                            <TableCell align="center">Note No.</TableCell>
                            <TableCell align="right">For the year ended 31 March 2024</TableCell>
                            <TableCell align="right">For the year ended 31 March 2023</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>{data.map(row => renderRow(row, 0))}</TableBody>
                </Table>
            </Box>
        </Paper>
    );
};
// --- 6. EXPORT & MODAL COMPONENTS ---
const handleExportExcel = async (data: FinancialData) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FinancialApp';
  workbook.created = new Date();

  const addHierarchicalRows = (worksheet: Worksheet, items: HierarchicalItem[], depth: number) => {
    items.forEach(item => {
      const isTotal = item.isGrandTotal || item.isSubtotal;
      const row = worksheet.addRow([]); // Add empty row first to get a reference
      
      const noteSheetName = item.note ? `Note ${item.note}` : null;

      row.getCell(1).value = `${' '.repeat(depth * 4)}${item.label}`;
      row.getCell(2).value = item.note || '';

      if (item.note && noteSheetName && workbook.getWorksheet(noteSheetName)) {
        row.getCell(3).value = { text: formatCurrency(item.valueCurrent)!, hyperlink: `'${noteSheetName}'!A1`, tooltip: `Go to Note ${item.note}`};
        row.getCell(4).value = { text: formatCurrency(item.valuePrevious)!, hyperlink: `'${noteSheetName}'!A1`, tooltip: `Go to Note ${item.note}`};
      } else {
        row.getCell(3).value = item.valueCurrent ?? undefined;
        row.getCell(4).value = item.valuePrevious ?? undefined;
      }
      
      row.font = { bold: isTotal || depth === 0 };
      if (depth === 0 || item.isGrandTotal) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
          row.border = { 
            top: { style: item.isGrandTotal ? 'medium' : 'thin' }, 
            bottom: { style: item.isGrandTotal ? 'medium' : 'thin' } 
          };
      }
      
      row.getCell(3).numFmt = '#,##0.00;(#,##0.00)';
      row.getCell(4).numFmt = '#,##0.00;(#,##0.00)';
      row.getCell(3).alignment = { horizontal: 'right' };
      row.getCell(4).alignment = { horizontal: 'right' };
       if(item.note) {
        row.getCell(3).font = { color: { argb: 'FF0000FF' }, underline: true, bold: isTotal || depth === 0 };
        row.getCell(4).font = { color: { argb: 'FF0000FF' }, underline: true, bold: isTotal || depth === 0 };
      }
      
      if (item.children) {
        addHierarchicalRows(worksheet, item.children, depth + 1);
      }
    });
  };

  const createSheet = (title: string, sheetData: HierarchicalItem[]) => {
    const worksheet = workbook.addWorksheet(title);
    worksheet.columns = [
      { header: 'Particulars', key: 'particulars', width: 60 },
      { header: 'Note No.', key: 'note', width: 15, style: { alignment: { horizontal: 'center' }} },
      { header: 'For the year ended 31 March 2024', key: 'current', width: 25 },
      { header: 'For the year ended 31 March 2023', key: 'previous', width: 25 },
    ];
    worksheet.getRow(1).font = { bold: true };
    addHierarchicalRows(worksheet, sheetData, 0);
  };
  
  const createNoteSheet = (note: FinancialNote) => {
    const worksheet = workbook.addWorksheet(`Note ${note.noteNumber}`);
    worksheet.views = [{ showGridLines: false }];
    
    // --- FIX: Define table styles for reuse ---
    const tableHeaderFill: Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    const tableBorders: Partial<Border> = { style: 'thin', color: { argb: 'FF000000' } };
    const fullTableBorder = { top: tableBorders, left: tableBorders, bottom: tableBorders, right: tableBorders };

    worksheet.addRow([`Note ${note.noteNumber}: ${note.title}`]).font = { bold: true, size: 14 };
    if (note.subtitle) {
      worksheet.addRow([note.subtitle]).font = { italic: true };
    }
    worksheet.addRow([]); // Spacer

    const addNoteContent = (items: (HierarchicalItem | TableContent)[], depth: number) => {
        items.forEach(item => {
            // --- FIX: Type guard to handle both HierarchicalItem and TableContent ---
            if ('key' in item) { // It's a HierarchicalItem
                const row = worksheet.addRow([
                    `${' '.repeat(depth * 4)}${item.label}`,
                    item.isSubtotal || item.isGrandTotal ? item.valueCurrent : (item.children ? '' : item.valueCurrent),
                    item.isSubtotal || item.isGrandTotal ? item.valuePrevious : (item.children ? '' : item.valuePrevious),
                ]);
                
                row.getCell(2).numFmt = '#,##0.00;(#,##0.00)';
                row.getCell(3).numFmt = '#,##0.00;(#,##0.00)';
                row.getCell(2).alignment = { horizontal: 'right' };
                row.getCell(3).alignment = { horizontal: 'right' };

                if(item.isSubtotal) {
                    row.font = { bold: true };
                    row.eachCell(c => c.border = { top: { style: 'thin' } });
                }
                if(item.isGrandTotal) {
                    row.font = { bold: true };
                    row.eachCell(c => c.border = { top: { style: 'thin' }, bottom: { style: 'double' } });
                }
                if(item.children) {
                    // Pass only hierarchical children
                    addNoteContent(item.children, depth + 1);
                }
            } else { // It's a TableContent
                worksheet.addRow([]); // Spacer before table
                const numCols = item.headers.length;
                worksheet.mergeCells(worksheet.rowCount, 1, worksheet.rowCount, numCols);

                const headerRow = worksheet.addRow(item.headers);
                headerRow.eachCell((cell) => {
                  cell.font = { bold: true };
                  cell.fill = tableHeaderFill;
                  cell.border = fullTableBorder;
                  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                });

                item.rows.forEach(rowData => {
                    const dataRow = worksheet.addRow(rowData);
                    dataRow.eachCell((cell) => {
                        cell.border = fullTableBorder;
                        cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
                    });
                    dataRow.getCell(1).alignment = { horizontal: 'left'};
                });
                worksheet.addRow([]); // Spacer after table
            }
        });
    };
    
    // --- FIX: Check if the first item is a table to set columns appropriately ---
    const isFirstItemTable =
  note.content.length > 0 &&
  typeof note.content[0] === 'object' &&
  note.content[0] !== null &&
  'type' in note.content[0] &&
  (note.content[0] as TableContent).type === 'table';

    if (isFirstItemTable) {
        const table = note.content[0] as TableContent;
        worksheet.columns = table.headers.map((h, i) => ({
            key: `col${i}`,
            width: i === 0 ? 50 : 20, // First column wider
        }));
    } else {
        worksheet.columns = [
            { key: 'particulars', width: 60 },
            { key: 'current', width: 20 },
            { key: 'previous', width: 20 },
        ];
        const headerRow = worksheet.addRow(['', 'As at 31 March 2024', 'As at 31 March 2023']);
        headerRow.font = { bold: true };
        headerRow.eachCell(cell => {
            cell.alignment = { horizontal: 'right' };
            cell.border = { bottom: { style: 'thin' } };
        });
        headerRow.getCell(1).alignment = { horizontal: 'left' };
    }
    
    addNoteContent(
  note.content.filter(
    (item): item is TableContent | HierarchicalItem =>
      typeof item === 'object' && item !== null
  ),
  0
);


    worksheet.addRow([]); // Spacer
    if(note.footer) {
        const footerRow = worksheet.addRow([note.footer]);
        footerRow.getCell(1).alignment = { wrapText: true };
        worksheet.mergeCells(footerRow.number, 1, footerRow.number, worksheet.columns.length);
    }
  };


  const createPoliciesSheet = (title: string, policies: AccountingPolicy[]) => {
    const worksheet = workbook.addWorksheet(title);
    worksheet.columns = [
        { header: 'Significant Accounting Policies', key: 'policy', width: 120 },
    ];
    worksheet.getRow(1).font = { bold: true, size: 14 };

    worksheet.views = [ { showGridLines: false } ];

    const tableHeaderFill: Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    const tableBorders: Partial<Border> = { style: 'thin', color: { argb: 'FF000000' } };
    const fullTableBorder = { top: tableBorders, left: tableBorders, bottom: tableBorders, right: tableBorders };

    policies.forEach(policy => {
        worksheet.addRow([policy.title]).font = { bold: true, size: 12 };
        worksheet.addRow([]);
        
        policy.text.forEach(content => {
            if (typeof content === 'string') {
                const textRow = worksheet.addRow([content]);
                textRow.getCell(1).alignment = { wrapText: true, vertical: 'top' };
            } else if (content.type === 'table') {
                const headerRow = worksheet.addRow(content.headers);
                headerRow.eachCell(cell => {
                    cell.font = { bold: true };
                    cell.fill = tableHeaderFill;
                    cell.border = fullTableBorder;
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                });
                
                content.rows.forEach(rowData => {
                    const dataRow = worksheet.addRow(rowData);
                    dataRow.eachCell((cell, colNumber) => {
                         cell.border = fullTableBorder;
                         if (colNumber === 1) {
                             cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
                         } else {
                             cell.alignment = { vertical: 'middle', horizontal: 'center' };
                         }
                    });
                });
            }
            worksheet.addRow([]);
        });
        worksheet.addRow([]);
    });
  };
  
  
  createSheet('Balance Sheet', data.balanceSheet);
  createSheet('Profit & Loss', data.incomeStatement);
  createSheet('Cash Flow', data.cashFlow);
  data.notes.forEach(note => createNoteSheet(note));
  createPoliciesSheet('Accounting Policies', data.accountingPolicies);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, 'Financial_Statements.xlsx');
};
const ExcelConfirmDialog = ({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: () => void; }) => (
  <Dialog open={open} onClose={onClose} aria-labelledby="excel-confirm-dialog-title">
    <DialogTitle id="excel-confirm-dialog-title">Confirm Export</DialogTitle>
    <DialogContent><DialogContentText>Do you want to download the financial statements as an Excel file?</DialogContentText></DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button onClick={onConfirm} variant="contained" autoFocus>Confirm & Download</Button>
    </DialogActions>
  </Dialog>
);
const RenderPdfNoteRow = ({ item, depth }: { item: HierarchicalItem; depth: number }) => {
    let rowStyle: any = PDF_STYLES.noteRow;
    if (item.isSubtotal) rowStyle = {...PDF_STYLES.noteSubTotalRow, ...((item.children) && {marginBottom: 0})};
    if (item.isGrandTotal) rowStyle = PDF_STYLES.noteGrandTotalRow;

    const textStyle = { fontFamily: (item.isSubtotal || item.isGrandTotal) ? 'Helvetica-Bold' : 'Helvetica' };

    return (
          <View key={item.key}>
            <View style={rowStyle} wrap={false}>
              <Text style={[textStyle,PDF_STYLES.colParticulars,{ paddingLeft: depth * 15 }]}>{item.label}</Text>
                 <Text style={[textStyle, PDF_STYLES.noteColAmount]}>
                    {item.isSubtotal || item.isGrandTotal ? formatCurrency(item.valueCurrent) : (item.children ? '' : formatCurrency(item.valueCurrent))}
                </Text>
                 <Text style={[textStyle, PDF_STYLES.noteColAmount]}>
                    {item.isSubtotal || item.isGrandTotal ? formatCurrency(item.valuePrevious) : (item.children ? '' : formatCurrency(item.valuePrevious))}
                </Text>
            </View>
            {item.children?.map(child => <RenderPdfNoteRow key={child.key} item={child} depth={depth + 1} />)}
          </View>
    )
}
// --- FIX: New component to render a table within a PDF note ---
const RenderPdfNoteTable = ({ data }: { data: TableContent }) => (
  <View style={[PDF_STYLES.policyTable, { width: '100%', marginTop: 10 }]}>
      <View style={PDF_STYLES.policyTableRow}>
          {data.headers.map((header, hIndex) => (
              <Text key={hIndex} style={[PDF_STYLES.policyTableHeaderCell, {fontSize: 8}]}>{header}</Text>
          ))}
      </View>
      {data.rows.map((row, rIndex) => (
          <View key={rIndex} style={PDF_STYLES.policyTableRow}>
              {row.map((cell, cIndex) => (
                  <Text key={cIndex} style={[PDF_STYLES.policyTableCell, {fontSize: 8, textAlign: cIndex === 0 ? 'left' : 'right'}]}>{cell}</Text>
              ))}
          </View>
      ))}
  </View>
);
const RenderPdfNote = ({ note }: { note: FinancialNote }) => {
    // --- FIX: Check if the note content is primarily a table for layout purposes ---
     const isTableNote = note.content.length > 0 &&
  typeof note.content[0] === 'object' &&
  note.content[0] !== null &&
  'type' in note.content[0] &&
  (note.content[0] as TableContent).type === 'table';

    return (
        <View style={PDF_STYLES.section} id={`note-${note.noteNumber}`} break>
            <Text style={PDF_STYLES.notePageHeader}>Notes forming part of the financial statements</Text>
            <Text style={PDF_STYLES.title}>(All amounts in ₹ lakhs, unless otherwise stated)</Text>
            <View style={{marginTop: 15}}>
                 <Text style={PDF_STYLES.noteTitle}>Note {note.noteNumber}: {note.title}</Text>
                 {note.subtitle && <Text style={PDF_STYLES.noteSubtitle}>{note.subtitle}</Text>}

                 {/* --- FIX: Conditionally render headers based on content type --- */}
                 {!isTableNote && (
                    <View style={PDF_STYLES.tableHeader}>
                        <Text style={PDF_STYLES.noteColParticulars}> </Text>
                        <Text style={PDF_STYLES.noteColAmount}>As at 31 March 2024</Text>
                        <Text style={PDF_STYLES.noteColAmount}>As at 31 March 2023</Text>
                    </View>
                 )}
                 
                 {/* --- FIX: Map with type guard to render either row or table --- */}
                 {note.content.map((item, index) => {
    if (typeof item === 'string') {
        // Render plain text paragraphs
        return (
            <Text key={index} style={PDF_STYLES.noteParagraph}>
                {item}
            </Text>
        );
    }

    if (typeof item === 'object' && item !== null) {
        if ('key' in item) {
            return (
                <RenderPdfNoteRow
                    key={item.key}
                    item={item as HierarchicalItem}
                    depth={0}
                />
            );
        }

        if ('type' in item && item.type === 'table') {
            return (
                <RenderPdfNoteTable
                    key={index}
                    data={item as TableContent}
                />
            );
        }
    }

    return null; // Fallback in case of unexpected content
})}


                 {note.footer && <Text style={PDF_STYLES.noteFooter}>{note.footer}</Text>}
            </View>
        </View>
    );
}
const RenderPdfRow = ({ item, depth }: { item: HierarchicalItem; depth: number }) => {
  const isTotal = item.isGrandTotal || item.isSubtotal;
  let rowStyle: any = PDF_STYLES.row;
  if(depth === 0) rowStyle = PDF_STYLES.topLevelRow;
  else if (item.isGrandTotal) rowStyle = PDF_STYLES.grandTotalRow;
  else if (item.isSubtotal) rowStyle = PDF_STYLES.subTotalRow;

  const textStyle: any[] = [
      isTotal || depth === 0 ? PDF_STYLES.rowTextBold : PDF_STYLES.rowText,
  ];

  const AmountCell = ({ value }: { value: number | null }) => (
      <Text style={[...textStyle, PDF_STYLES.colAmount]}>{formatCurrency(value)}</Text>
  );
  
  const LinkedAmountCell = ({ value, note }: { value: number | null, note?: string | number }) => {
    if (note) {
      return (
        <Link src={`#note-${note}`} style={{...PDF_STYLES.colAmount, textDecoration: 'none' }}>
            <Text style={[...textStyle, { color: 'black', textDecoration:'none' }]}>
                {formatCurrency(value)}
            </Text>
        </Link>
      )
    }
    return <AmountCell value={value} />
  }

  return (
    <Fragment>
      <View style={rowStyle} wrap={false}>
              <Text style={[...textStyle,PDF_STYLES.colParticulars, { paddingLeft: depth > 0 ? (depth * 15) + 5 : 5, textTransform: depth === 0 ? 'uppercase' : 'none' }]}>
          {item.label}
      </Text>
        <Text style={[...textStyle, PDF_STYLES.colNote]}>{item.note}</Text>
        <LinkedAmountCell value={item.valueCurrent} note={item.note} />
        <LinkedAmountCell value={item.valuePrevious} note={item.note} />
      </View>
      {item.children?.map(child => <RenderPdfRow key={child.key} item={child} depth={depth + 1} />)}
    </Fragment>
  );
}; 
const PDFDocumentComponent = ({ data }: { data: FinancialData }) => (
  <Document>
    <Page size="A4" style={PDF_STYLES.page}>
      <Text style={PDF_STYLES.title}>Financial Statements</Text>
      
      <View style={PDF_STYLES.section}>
        <Text style={PDF_STYLES.sectionHeader}>Balance Sheet</Text>
        <View style={PDF_STYLES.tableHeader}>
            <Text style={PDF_STYLES.colParticulars}>Particulars</Text>
            <Text style={PDF_STYLES.colNote}>Note</Text>
            <Text style={PDF_STYLES.colAmount}>31 Mar 2024</Text>
            <Text style={PDF_STYLES.colAmount}>31 Mar 2023</Text>
        </View>
        {data.balanceSheet.map(item => <RenderPdfRow key={item.key} item={item} depth={0} />)}
      </View>
      <View style={PDF_STYLES.section} break>
        <Text style={PDF_STYLES.sectionHeader}>Statement of Profit and Loss</Text>
         <View style={PDF_STYLES.tableHeader}>
            <Text style={PDF_STYLES.colParticulars}>Particulars</Text>
            <Text style={PDF_STYLES.colNote}>Note</Text>
            <Text style={PDF_STYLES.colAmount}>31 Mar 2024</Text>
            <Text style={PDF_STYLES.colAmount}>31 Mar 2023</Text>
        </View>
        {data.incomeStatement.map(item => <RenderPdfRow key={item.key} item={item} depth={0} />)}
      </View>

      <View style={PDF_STYLES.section} break>
        <Text style={PDF_STYLES.sectionHeader}>Cash Flow Statement</Text>
         <View style={PDF_STYLES.tableHeader}>
            <Text style={PDF_STYLES.colParticulars}>Particulars</Text>
            <Text style={PDF_STYLES.colNote}>Note</Text>
            <Text style={PDF_STYLES.colAmount}>31 Mar 2024</Text>
            <Text style={PDF_STYLES.colAmount}>31 Mar 2023</Text>
        </View>
        {data.cashFlow.map(item => <RenderPdfRow key={item.key} item={item} depth={0} />)}
      </View>
      {data.notes.map(note => <RenderPdfNote key={note.noteNumber} note={note} />)}
    </Page>
    <Page size="A4" style={PDF_STYLES.page}>
      <View style={PDF_STYLES.section}>
        <Text style={PDF_STYLES.sectionHeader}>Significant Accounting Policies</Text>
        {data.accountingPolicies.map((policy, index) => (
          <View key={index} style={PDF_STYLES.policyBlock}>
            <Text style={PDF_STYLES.policyTitle} minPresenceAhead={20}>{policy.title}</Text>
            
            {policy.text.map((content, contentIndex) => {
              if (typeof content === 'string') {
                return <Text key={contentIndex} style={PDF_STYLES.policyText}>{content}</Text>;
              } else if (content.type === 'table') {
                return (
                  <View key={contentIndex} style={PDF_STYLES.policyTable}>
                    <View style={PDF_STYLES.policyTableRow}>
                      {content.headers.map((header, hIndex) => (
                        <Text key={hIndex} style={PDF_STYLES.policyTableHeaderCell}>{header}</Text>
                      ))}
                    </View>
                    {content.rows.map((row, rIndex) => (
                      <View key={rIndex} style={PDF_STYLES.policyTableRow}>
                        {row.map((cell, cIndex) => (
                           <Text key={cIndex} style={PDF_STYLES.policyTableCell}>{cell}</Text>
                        ))}
                      </View>
                    ))}
                  </View>
                );
              }
              return <Text key={contentIndex} style={PDF_STYLES.policyText}></Text>;
            })}
          </View>
        ))}
      </View>
    </Page>
  </Document>
);
const PdfModal = ({ open, onClose, data }: { open: boolean; onClose: () => void; data: FinancialData }) => {
  useEffect(() => {
    console.log('PdfModal open:', open);
    return () => {
      console.log('PdfModal closing');
    };
  }, [open]);

  const handleClose = () => {
    try {
      onClose();
    } catch (error) {
      console.error('Error during close:', error);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogContent sx={{ height: '80vh' }}>
        {open && (
          <PDFViewer width="100%" height="100%">
            <PDFDocumentComponent data={data} />
          </PDFViewer>
        )}
      </DialogContent>
      <DialogActions>
        {open && (
          <PDFDownloadLink document={<PDFDocumentComponent data={data} />} fileName="financial_statements.pdf" style={{ textDecoration: 'none' }}>
            {({ loading }) => (
              <Button variant="contained" disabled={loading}>
                {loading ? 'Generating...' : 'Download PDF'}
              </Button>
            )}
          </PDFDownloadLink>
        )}
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
);}
const getAllExpandableKeys = (items: HierarchicalItem[]): string[] => {
  const keys: string[] = [];
  items.forEach(item => {
    if (item.children && item.children.length > 0) {
      keys.push(item.key);
      keys.push(...getAllExpandableKeys(item.children));
    }
  });
  return keys;
};


interface ManualJE {
  id: number;
  glAccount: string;
  "Financial Year Ended (FYE) 2023-03-31": string;
  "Financial Year Ended (FYE) 2024-03-31": string;
}

interface RenamedData {
  Level1Desc: string;
  Level2Desc: string;
  accountType: string;
  amountCurrent: number;
  amountPrevious: number;
  createdby: string;
  functionalArea: string;
  glAccount: number;  
}




export const joinManualJEAndRenamedData = (
  manualJE: ManualJE[],
  renamedData: RenamedData[]
): RenamedData[] => {
  return renamedData.map((row) => {
    // Find matching manualJE record
    const je = manualJE.find((je) => je.glAccount === row.glAccount.toString());
    
    // If no match, return original row
    if (!je) {
      return row;
    }

    // Apply adjustments from manualJE
    const currentAdjustment = parseFloat(je["Financial Year Ended (FYE) 2024-03-31"]) || 0;
    const previousAdjustment = parseFloat(je["Financial Year Ended (FYE) 2023-03-31"]) || 0;

    return {
      ...row,
      amountCurrent: row.amountCurrent + currentAdjustment,
      amountPrevious: row.amountPrevious + previousAdjustment,
    };
  });
};
// --- 7. MAIN APPLICATION COMPONENT ---
interface FinancialStatementsProps {
  data: MappedRow[];
  amountKeys: { amountCurrentKey: string; amountPreviousKey: string };
}
const FinancialStatements: React.FC<FinancialStatementsProps> = ({ data, amountKeys }) => {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [isPdfModalOpen, setPdfModalOpen] = useState(false);
  const [isExcelConfirmOpen, setExcelConfirmOpen] = useState(false);
  const [editedNotes, setEditedNotes] = useState<FinancialNote[]>([]); // Initialize as empty array
  const [isNotesEditorOpen, setNotesEditorOpen] = useState(false);
  const [editorContainer, setEditorContainer] = useState<HTMLElement | null>(null);
  const [manualJE, setManualJE] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJEs = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/journal/updated');
        const data = await response.json();
        setManualJE(data);
      } catch (error) {
        console.error('Error fetching journal entry:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchJEs();
  }, []);
console.log("manualJE",manualJE)

  // Move hooks to top level
  const renamedData = data.map(row => {
    const currentValue = row[amountKeys.amountCurrentKey];
    const previousValue = row[amountKeys.amountPreviousKey];
    const amountCurrent = typeof currentValue === 'string' || typeof currentValue === 'number'
      ? parseFloat(currentValue as string)
      : 0;
    const amountPrevious = typeof previousValue === 'string' || typeof previousValue === 'number'
      ? parseFloat(previousValue as string)
      : 0;

    const { [amountKeys.amountCurrentKey]: _, [amountKeys.amountPreviousKey]: __, ...rest } = row;

    return {
      ...rest,
      amountCurrent: isNaN(amountCurrent) ? 0 : amountCurrent,
      amountPrevious: isNaN(amountPrevious) ? 0 : amountPrevious,
    };
  });

  

  console.log('renamedData', renamedData);
  const financialData = useFinancialData(renamedData, editedNotes);

  const allExpandableKeys = useMemo(() => {
    const bsKeys = getAllExpandableKeys(financialData.balanceSheet);
    const isKeys = getAllExpandableKeys(financialData.incomeStatement);
    const cfKeys = getAllExpandableKeys(financialData.cashFlow);
    return [...bsKeys, ...isKeys, ...cfKeys];
  }, [financialData]);

  // Render loading state in JSX
  if (loading) {
    return <div>Loading...</div>;
  }

  const handleToggleRow = (key: string) => {
    setExpandedKeys(prev => {
      const newSet = new Set(prev);
      newSet.has(key) ? newSet.delete(key) : newSet.add(key);
      return newSet;
    });
  };

  const handleExcelConfirm = () => {
    handleExportExcel(financialData);
    setExcelConfirmOpen(false);
  };

  const handleToggleExpandAll = () => {
    if (expandedKeys.size === allExpandableKeys.length) {
      setExpandedKeys(new Set());
    } else {
      setExpandedKeys(new Set(allExpandableKeys));
    }
  };

  const handleEditNotes = () => {
    const newWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    if (newWindow) {
      newWindow.document.title = 'Edit Financial Notes';
      const container = newWindow.document.createElement('div');
      newWindow.document.body.appendChild(container);
      newWindow.document.body.style.margin = '0';

      const styles = Array.from(document.getElementsByTagName('style'));
      styles.forEach(style => {
        newWindow.document.head.appendChild(style.cloneNode(true));
      });
      const links = Array.from(document.getElementsByTagName('link'));
      links.forEach(link => {
        if (link.rel === 'stylesheet') {
          newWindow.document.head.appendChild(link.cloneNode(true));
        }
      });

      setEditorContainer(container);
      setNotesEditorOpen(true);

      newWindow.addEventListener('beforeunload', () => {
        setNotesEditorOpen(false);
        setEditorContainer(null);
      });
    }
  };

  const handleCloseEditor = () => {
    if (editorContainer) {
      const editorWindow = editorContainer.ownerDocument.defaultView;
      editorWindow?.close();
    }
    setNotesEditorOpen(false);
    setEditorContainer(null);
  };

  const handleSaveChanges = (updatedNotes: FinancialNote[]) => {
    setEditedNotes(updatedNotes);
    handleCloseEditor();
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" sx={{ mt: 2, mb: 2, textAlign: 'center' }}>Financial Statements</Typography>

      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          onClick={handleToggleExpandAll}
        >
          {expandedKeys.size === allExpandableKeys.length ? 'Collapse All' : 'Expand All'}
        </Button>
        <Button variant="contained" color="info" onClick={handleEditNotes}>
          Edit Notes
        </Button>
      </Box>
      {isNotesEditorOpen && editorContainer && (
        createPortal(
          <NotesEditor
            notes={financialData.notes}
            onSave={handleSaveChanges}
            onClose={handleCloseEditor}
          />,
          editorContainer
        )
      )}

      <DrillDownTable title="Balance Sheet" data={financialData.balanceSheet} expandedKeys={expandedKeys} onToggleRow={handleToggleRow} />
      <DrillDownTable title="Statement of Profit and Loss" data={financialData.incomeStatement} expandedKeys={expandedKeys} onToggleRow={handleToggleRow} />
      <DrillDownTable title="Cash Flow Statement" data={financialData.cashFlow} expandedKeys={expandedKeys} onToggleRow={handleToggleRow} />

      <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'center' }}>
        <Button variant="contained" color="primary" onClick={() => setExcelConfirmOpen(true)}>
          Export to Excel
        </Button>
        <Button variant="contained" color="secondary" onClick={() => setPdfModalOpen(true)}>
          View Full PDF
        </Button>
      </Box>
      <ExcelConfirmDialog
        open={isExcelConfirmOpen}
        onClose={() => setExcelConfirmOpen(false)}
        onConfirm={handleExcelConfirm}
      />
      <PdfModal open={isPdfModalOpen} onClose={() => setPdfModalOpen(false)} data={financialData} />
    </Box>
  );
};

export default FinancialStatements;
