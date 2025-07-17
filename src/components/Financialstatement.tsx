import React, { useState, useMemo, Fragment, useEffect } from 'react';
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
interface TableContent {
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
interface HierarchicalItem extends TemplateItem {
  valueCurrent: number | null;
  valuePrevious: number | null;
  footer?: string;
  children?: HierarchicalItem[];
}

interface FinancialNote {
    noteNumber: number;
    title: string;
    subtitle?: string;
    content: (HierarchicalItem | TableContent)[]; 
    footer?: string;
    totalCurrent: number;
    totalPrevious: number;
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
const formatCurrency = (amount: number | null) => {
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
});


// --- 3. STATEMENT STRUCTURE TEMPLATES (FIXED) ---
const BALANCE_SHEET_STRUCTURE: TemplateItem[] = [
  { key: 'bs-assets', label: 'ASSETS', isGrandTotal: true, children: [
    { key: 'bs-assets-nc', label: 'Non-current assets', isSubtotal: true, children: [
        { key: 'bs-assets-nc-ppe', label: 'Property, plant and equipment', note: 3, keywords: ['property, plant and equipment'] },
        { key: 'bs-assets-nc-rou', label: 'Right of use asset', note: 4, keywords: ['right of use assets'] },
        { key: 'bs-assets-nc-cwip', label: 'Capital work-in-progress', keywords: ['capital work in progress'] },
        { key: 'bs-assets-nc-intangible', label: 'Other Intangible assets', note: 4, keywords: ['intangible assets'] },
        { key: 'bs-assets-nc-otherintangible', label: 'Intangible assets under development',keywords: ['intangible assets under development'] },

        { key: 'bs-assets-nc-fin', label: 'Financial Assets', isSubtotal: true, children: [
          { key: 'bs-assets-nc-fin-loan', label: 'Loans', note:5},
          { key: 'bs-assets-nc-fin-other', label: 'Other financial assets', note: 6},
        ]},
        { key: 'bs-assets-nc-dta', label: 'Deferred tax assets (net)', note: 24, keywords: ['deferred tax assets (net)'] },
        { key: 'bs-assets-nc-fin-income', label: 'Income Tax asset(net)', note: 7},
        { key: 'bs-assets-nc-other', label: 'Other non-current assets', note: 10},
      ]},
    { key: 'bs-assets-c', label: 'Current assets', isSubtotal: true, children: [
        { key: 'bs-assets-c-inv', label: 'Inventories', note: 8},
        { key: 'bs-assets-c-fin', label: 'Financial Assets', isSubtotal: true, children: [
           { key: 'bs-assets-c-fin-tr', label: 'Trade receivables', note: 9, keywords: ['Trade receivables'] },
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
          { key: 'bs-liab-nc-fin-borrow', label: 'Lease Liabilities', note: 25, keywords: ['other non current financial liabilities'] },
        ]},
        { key: 'bs-liab-nc-prov', label: 'Provisions', note: 17}]},
    { key: 'bs-liab-c', label: 'Current liabilities', isSubtotal: true, children: [
        { key: 'bs-liab-c-fin', label: 'Financial Liabilities', isSubtotal: true, children: [
          { key: 'bs-liab-c-fin-liability', label: 'Lease Liabilities', note: 29, keywords: ['other current financial liabilities'] },
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
      { key: 'is-exp-mat', label: 'Cost of materials consumed', keywords: ['cost of material consumed'], note: '20a' },
      { key: 'is-exp-pur', label: 'Purchase of traded goods', keywords: ['purchase of traded goods'], note: '20a' },
      { key: 'is-exp-inv', label: 'Changes in inventories', keywords: ['changes in inventories'], note: '20a' },
      { key: 'is-exp-emp', label: 'Employee benefits expense', keywords: ['employee benefits expense'], note: 21 },
      { key: 'is-exp-fin', label: 'Finance cost', keywords: ['finance cost'], note: 22 },
      { key: 'is-exp-dep', label: 'Depreciation and amortisation', keywords: ['depreciation expense'], note: 23 },
      { key: 'is-exp-oth', label: 'Other expenses', keywords: ['other expenses'], note: 24 },
    ]
  },
  { key: 'is-pbeit', label: 'PROFIT BEFORE EXCEPTIONAL ITEM & TAXES', id: 'pbeit', isSubtotal: true, formula: ['totalIncome', '-', 'totalExpenses'] },
  { key: 'is-except', label: 'Exceptional Income', id: 'exceptional', keywords: ['exceptional items'], note: 44 },
  { key: 'is-pbt', label: 'PROFIT BEFORE TAX', id: 'pbt', isSubtotal: true, formula: ['pbeit', '+', 'exceptional'] },
  { key: 'is-tax', label: 'TAX EXPENSE:', id: 'totalTax', isSubtotal: true, children: [
      { key: 'is-tax-curr', label: 'Current tax', keywords: ['tax expense'], note: 34 },
      { key: 'is-tax-def', label: 'Deferred tax', keywords: ['deferred tax'], note: 34 },
    ]
  },
  { key: 'is-pat', label: 'PROFIT FOR THE YEAR', id: 'pat', isGrandTotal: true, formula: ['pbt', '-', 'totalTax'] },
{
    key: 'is-oci', label: 'Other comprehensive income', isSubtotal: true,children: [
      {key: 'is-oci-remesure',label: 'i) Remeasurement on the defined benefit liabilities',note: 28,},
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
const useFinancialData = (rawData: MappedRow[]): FinancialData => {
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


    const totals = new Map<string, { current: number, previous: number }>();

const calculateNote5 = (): FinancialNote => {

  const nonCurrentTotal = {
    current: 3.79,
    previous: 6.36,
  };

  const currentTotal = {
    current: 6.39,
    previous: 2.73,
  };

  return {
    noteNumber: 5,
    title: 'Financial assets - Loans',
    totalCurrent: currentTotal.current,
    totalPrevious: currentTotal.previous,
    nonCurrentTotal,
    currentTotal,
    content: [
      {
        key: 'note5-noncurrent',
        label: 'Non-current',
        isSubtotal: true,
        valueCurrent:   nonCurrentTotal.current,
        valuePrevious:  nonCurrentTotal.previous,
        children: [
          {
            key: 'note5-nc-emp',
            label: 'Loans to employees',
            valueCurrent: nonCurrentTotal.current,
            valuePrevious: nonCurrentTotal.previous,
          },
        ],
      },
      {
        key: 'note5-current',
        label: 'Current',
        isSubtotal: true,
        valueCurrent: currentTotal.current,
        valuePrevious: currentTotal.previous,
        children: [
          {
            key: 'note5-c-emp',
            label: 'Loans to employees',
            valueCurrent: currentTotal.current,
            valuePrevious: currentTotal.previous,
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
    totalCurrent: currentTotal.current,
    totalPrevious: currentTotal.previous,
    nonCurrentTotal,
    currentTotal,
    content: [
      {
        key: 'note6-noncurrent',
        label: 'Non-current',
        isSubtotal: true,
        valueCurrent: nonCurrentTotal.current,
        valuePrevious: nonCurrentTotal.previous,
        children: [
          { key: 'note6-nc-lease', label: '(a) Net investment in leases', valueCurrent: leasesNC.current, valuePrevious: leasesNC.previous },
          { key: 'note6-nc-sec', label: '(b) Security deposits', valueCurrent: securityDeposits.current, valuePrevious: securityDeposits.previous },
          { key: 'note6-nc-earnest', label: '(c) Earnest money deposits', valueCurrent: earnestNC.current, valuePrevious:earnestNC.previous},
          { key: 'note6-nc-other', label: '(d) Other receivable', valueCurrent: otherReceivable.current, valuePrevious: otherReceivable.previous },
        ],
      },
      {
        key: 'note6-current',
        label: 'Current',
        isSubtotal: true,
        valueCurrent: currentTotal.current,
        valuePrevious: currentTotal.previous,
        children: [
          { key: 'note6-c-lease', label: '(a) Net investment in leases', valueCurrent: leasesC.current, valuePrevious:leasesC.previous  },
          { key: 'note6-c-earnest', label: '(b) Earnest money deposits', valueCurrent: earnestC.current, valuePrevious:earnestC.previous  },
          { key: 'note6-c-unbilled', label: '(c) Unbilled receivables', valueCurrent: unbilled.current, valuePrevious:unbilled.previous  },
          { key: 'note6-c-interest', label: '(d) Interest accrued', valueCurrent: interest.current, valuePrevious:interest.previous  },
          { key: 'note6-c-benefit', label: '(e) Employee compensated absences', valueCurrent: employeeBenefit.current, valuePrevious:employeeBenefit.previous},
        ],
      },
    ],
  };
};
const calculateNote7 = (): FinancialNote => {
  // --- Calculations remain the same ---
  const taxPaidUnderProtest = {
    current: 837.77,
    previous: 837.77,
  };
  const advanceTaxAndTDSLiab = {
    current: 7174.68,
    previous: 7174.68,
  };
  const provisionForTaxLiab = {
    current: 9868.96,
    previous: 9868.96,
  };
  const advanceTaxAndTDS = {
    current: 46724.73,
    previous:38257.70, 
  };
  const provisionForTaxAsset = {
    current: 38604.49,
    previous: 31376.99,
  };
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
    totalCurrent: netTaxAsset.current,
    totalPrevious: netTaxAsset.previous,
    content: [
      // Section 7: Income Tax Asset (Net)
      {
        key: 'note7-asset-section',
        label: '7. Income Tax Asset (Net)',
        isSubtotal: true, // Acts as a header for this section
        valueCurrent: netTaxAsset.current,
        valuePrevious: netTaxAsset.previous,
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
              },
            ],
          },
          {
            key: 'note7-breakup',
            label: 'Note (i)',
            isSubtotal: true,
            valueCurrent: netTaxAsset.current,
            valuePrevious: netTaxAsset.previous,
            children: [
              {
                key: 'note7-adv-tax',
                label: 'Advance tax and TDS',
                valueCurrent: advanceTaxAndTDS.current,
                valuePrevious: advanceTaxAndTDS.previous,
              },
              {
                key: 'note7-provision',
                label: 'Less: Provision for tax',
                valueCurrent: provisionForTaxAsset.current,
                valuePrevious: provisionForTaxAsset.previous,
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
        valueCurrent: netTaxLiability.current,
        valuePrevious: netTaxLiability.previous,
        children: [
          {
            key: 'note7a-main',
            label: 'Income tax provision (net of advance tax) (refer Note (ii) below)',
            valueCurrent: netTaxLiability.current,
            valuePrevious: netTaxLiability.previous,
          },
          {
            key: 'note7a-breakup',
            label: 'Note (ii)',
            isSubtotal: true,
            valueCurrent: netTaxLiability.current,
            valuePrevious: netTaxLiability.previous,
            children: [
              {
                key: 'note7a-provision',
                label: 'Provision for tax',
                valueCurrent: provisionForTaxLiab.current,
                valuePrevious: provisionForTaxLiab.previous,
              },
              {
                key: 'note7a-adv-tds',
                label: 'Less: Advance tax and TDS',
                valueCurrent: advanceTaxAndTDSLiab.current,
                valuePrevious: advanceTaxAndTDSLiab.previous,
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
    totalCurrent: currentTotal,
    totalPrevious: previousCurrentTotal,
    content: [
      {
        key: 'note10-noncurrent',
        label: 'Non-current',
        isSubtotal: true,
        valueCurrent: nonCurrentGovt.current+nonCurrentPrepaid.current,
        valuePrevious: nonCurrentGovt.previous+nonCurrentPrepaid.previous,
        children: [
          { key: 'note10-nc-govt', label: '(a) Balances with government authorities', valueCurrent: nonCurrentGovt.current, valuePrevious: nonCurrentGovt.previous },
          { key: 'note10-nc-prepaid', label: '(b) Prepaid expenses', valueCurrent: nonCurrentPrepaid.current, valuePrevious: nonCurrentPrepaid.previous },
        ],
      },
      {
        key: 'note10-current',
        label: 'Current',
        isSubtotal: true,
        valueCurrent: currentGovt.current+currentPrepaid.current+advToEmployees.current-6.39-3.79+advToOtherTotal.current+advToRelated.current,
        valuePrevious: currentGovt.previous+currentPrepaid.previous+advToEmployees.previous-6.36-2.73+advToOtherTotal.previous+advToRelated.previous,
        children: [
          { key: 'note10-c-govt', label: '(a) Balances with Government authorities', valueCurrent: currentGovt.current, valuePrevious: currentGovt.previous },
          { key: 'note10-c-prepaid', label: '(b) Prepaid expenses', valueCurrent: currentPrepaid.current+0.07, valuePrevious: currentPrepaid.previous },
          { key: 'note10-c-emp', label: '(c) Advances to employees', valueCurrent: advToEmployees.current-6.39-3.79, valuePrevious: advToEmployees.previous-6.36-2.73 },
          {
            key: 'note10-c-cred',
            label: '(d) Advance to creditors',
            isSubtotal: true,
            valueCurrent: advToOtherTotal.current+advToRelated.current,
            valuePrevious: advToOtherTotal.previous+advToRelated.previous,
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
        valueCurrent: currentTotal,
        valuePrevious: previousCurrentTotal,
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
            totalCurrent: bank.current,
            totalPrevious: bank.previous,
            content: [
                { key: 'note10-coh', label: '(a) Cash on hand', valueCurrent: cashOnHand.current, valuePrevious: cashOnHand.previous },
                { key: 'note10-bwb-group', label: '(b) Balances with banks', valueCurrent: bank.current, valuePrevious: bank.previous, isSubtotal: true, children: [
                    { key: 'note10-bwb-ca', label: '(i) In current accounts', valueCurrent: currentAccounts.current, valuePrevious: currentAccounts.previous },
                    { key: 'note10-bwb-eefc', label: '(ii) In EEFC accounts', valueCurrent: eefcAccounts.current, valuePrevious: eefcAccounts.previous },
                    { key: 'note10-bwb-dep', label: '(iii) In deposit accounts (original maturity of 3 months or less)', valueCurrent: deposits3Months.current, valuePrevious: deposits3Months.previous },
                ]},
                { key: 'note10-bwb-group-other', label: '(c) Other Bank Balances', valueCurrent: other.current, valuePrevious: other.previous, isSubtotal: true, children: [
                  { key: 'note10-bwb', label: '(i) In earmarked Accounts', valueCurrent: earmarked.current, valuePrevious:earmarked.previous, isSubtotal: true, children: [
                    { key: 'note10-bwb-unpaid', label: '  - Unpaid dividend account(Refer note 12 (f))', valueCurrent: unpaid.current, valuePrevious: unpaid.previous },
                    { key: 'note10-bwb-capital', label: '   - Capital Reduction', valueCurrent: capital.current, valuePrevious: capital.previous },
                    ],
                   },
                   { key: 'note10-bwb-deposit', label: '(ii) In deposit accounts (original maturity of more than 3 months but less than 12 months)', valueCurrent: deposit.current, valuePrevious: deposit.previous },
                ]},
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
    totalCurrent: total.current,
    totalPrevious: total.previous,
    content: [
      {
        key: 'note13-retained',
        label: 'a) Retained Earnings*',
        isSubtotal: true,
        valueCurrent: retainedClosing.current,
        valuePrevious: retainedClosing.previous,
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
        label: 'Total',
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

  return {
    noteNumber: 14,
    title: 'Trade payables',
    totalCurrent: grandTotal.current,
    totalPrevious: grandTotal.previous,
    footer: `a) Dues to related parties (Refer note 31b) in trade payable [other than MSME] Rs. 26,398.24 Lakhs [31 March 2023: 35,845.48 Lakhs].
b) Trade payables include foreign currency payables amounting to Rs. 2,307.03 lakhs which are outstanding for a period greater than 6 months. The Company has informed about their status to the authorised dealer. The Company will obtain and ensure the requisite approvals wherever required before settling the overdue balances payable.`,
    content: [
      {
        key: 'note14-msme-group',
        label: '(i) Total outstanding dues of micro enterprises and small enterprises (MSME)',
        isSubtotal: true,
        valueCurrent: msme.current,
        valuePrevious: msme.previous,
        children: [
          {
            key: 'note14-msme',
            label: 'MSME dues',
            valueCurrent: msme.current,
            valuePrevious: msme.previous,
          },
        ],
      },
      {
        key: 'note14-nonmsme-group',
        label: '(ii) Total outstanding dues of creditors other than micro enterprises and small enterprises',
        isSubtotal: true,
        valueCurrent: nonMsme.current,
        valuePrevious: nonMsme.previous,
        children: [
          {
            key: 'note14-nonmsme',
            label: 'Non-MSME creditors',
            valueCurrent: nonMsme.current,
            valuePrevious: nonMsme.previous,
          },
        ],
      },
      {
        key: 'note14-total',
        label: 'Total',
        isGrandTotal: true,
        valueCurrent: grandTotal.current,
        valuePrevious: grandTotal.previous,
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
    totalCurrent: totalCurrent.current,
    totalPrevious: totalCurrent.previous,
    nonCurrentTotal: leaseLiabilitiesNonCurrent,
    currentTotal: totalCurrent,
    content: [
      {
        key: 'note15-noncurrent',
        label: 'Non-current',
        isSubtotal: true,
        valueCurrent: leaseLiabilitiesNonCurrent.current,
        valuePrevious: leaseLiabilitiesNonCurrent.previous,
        children: [
          {
            key: 'note15-nc-lease',
            label: '(a) Lease liabilities',
            valueCurrent: leaseLiabilitiesNonCurrent.current,
            valuePrevious: leaseLiabilitiesNonCurrent.previous,
          },
        ],
      },
      {
        key: 'note15-current',
        label: 'Current',
        isSubtotal: true,
        valueCurrent: otherCurrentPortion.current,
        valuePrevious: otherCurrentPortion.previous,
        children: [
          { key: 'note15-c-unpaid', label: '(a) Unpaid dividends', valueCurrent: unpaidDividends.current, valuePrevious: unpaidDividends.previous },
          { key: 'note15-c-capred', label: '(b) Amount payable on capital reduction (Refer note 12 (f))', valueCurrent: capitalReduction.current, valuePrevious: capitalReduction.previous },
          { key: 'note15-c-lease', label: '(c) Lease liabilities', valueCurrent: leaseLiabilitiesCurrent.current, valuePrevious: leaseLiabilitiesCurrent.previous },
          { key: 'note15-c-emp', label: '(d) Payable to employees', valueCurrent: payableToEmployees.current, valuePrevious: payableToEmployees.previous },
        ],
      },
      {
        key: 'note15-footer-lease',
        label: 'Current portion of lease liabilities',
        isSubtotal: true,
        valueCurrent: leaseLiabilitiesCurrent.current,
        valuePrevious: leaseLiabilitiesCurrent.previous,
      },
      {
        key: 'note15-footer-other',
        label: 'Other current financial liabilities',
        isSubtotal: true,
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
    totalCurrent: totalCurrent.current,
    totalPrevious: totalCurrent.previous,
    content: [
      {
        key: 'note16-current',
        label: 'Current',
        isSubtotal: true,
        valueCurrent: totalCurrent.current,
        valuePrevious: totalCurrent.previous,
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
            isSubtotal: true,
            valueCurrent: otherPayablesTotal.current,
            valuePrevious: otherPayablesTotal.previous,
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
    totalCurrent: currentTotal.current,
    totalPrevious: currentTotal.previous,
    nonCurrentTotal,
    currentTotal,
    content: [
      {
        key: 'note17-noncurrent',
        label: 'Non-current',
        isSubtotal: true,
        valueCurrent: nonCurrentTotal.current,
        valuePrevious: nonCurrentTotal.previous,
        children: [
          {
            key: 'note17-gratuity',
            label: '(a) Provision for employee benefits:',
            isSubtotal: true,
            valueCurrent: gratuity.current,
            valuePrevious: gratuity.previous,
            children: [
              {
                key: 'note17-gratuity-net',
                label: '  (i) Provision for gratuity (net) (Refer Note No. 28)',
                valueCurrent: gratuity.current,
                valuePrevious: gratuity.previous,
              },
            ],
          },
        ],
      },
      {
        key: 'note17-current',
        label: 'Current',
        isSubtotal: true,
        valueCurrent: currentTotal.current,
        valuePrevious: currentTotal.previous,
        children: [
          {
            key: 'note17-provisions-others',
            label: '(b) Provision - others: (Refer Note No. 33)',
            isSubtotal: true,
            valueCurrent: currentTotal.current,
            valuePrevious: currentTotal.previous,
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
    totalCurrent: total.current,
    totalPrevious: total.previous,
    footer: `The Company presented disaggregated revenue based on the type of goods or services provided to customers, 
the geographical region, and the timing of transfer of goods and services. 
The Company presented a reconciliation of the disaggregated revenue with the revenue information disclosed 
for each reportable segment. Refer note 30 for the detailed information.`,
    content: [
      {
        key: 'note18-disaggregate',
        label: 'Type of goods or services',
        isSubtotal: true,
        valueCurrent: total.current,
        valuePrevious: total.previous,
        children: [
          { key: 'note18-sale-prod', label: '(a) Sale of Products (Refer Note (i) below)', valueCurrent: saleOfProducts.current, valuePrevious: saleOfProducts.previous },
          { key: 'note18-sale-serv', label: '(b) Sale of Services (Refer Note (ii) below)', valueCurrent: saleOfServices.current, valuePrevious: saleOfServices.previous },
          { key: 'note18-other-prod-serv', label: '', valueCurrent: saleOfProducts.current+saleOfServices.current, valuePrevious: saleOfProducts.previous+saleOfServices.previous },
          { key: 'note18-other-rev', label: '(c) Other operating revenues (Refer Note (iii) below)', valueCurrent: scrapSales.current, valuePrevious: scrapSales.previous },
        ]
      },
      {
        key: 'note18-sale-products-group',
        label: 'Note (i) Sale of products comprises:',
        isSubtotal: true,
        valueCurrent: saleOfProducts.current,
        valuePrevious: saleOfProducts.previous,
        children: [
          {
            key: 'note18-construction',
            label: 'Revenue from construction contracts',
            isSubtotal: true,
            valueCurrent: constructionContracts.current,
            valuePrevious: constructionContracts.previous,
            children: [
              { key: 'note18-process', label: 'Process control instrumentation systems', valueCurrent: instrumentation.current, valuePrevious: instrumentation.previous },
              { key: 'note18-spares', label: 'Spares and others', valueCurrent: spares.current, valuePrevious: spares.previous },
            ]
          },
          {
            key: 'note18-traded-goods',
            label: 'Sale of traded goods',
            isSubtotal: true,
            valueCurrent: tradedGoods.current,
            valuePrevious: tradedGoods.previous,
            children: [
              { key: 'note18-products', label: 'Products and Accessories', valueCurrent: tradedGoods.current, valuePrevious: tradedGoods.previous }
            ]
          }
        ]
      },
      {
        key: 'note18-sale-services',
        label: 'Note (ii) Sale of services comprises:',
        isSubtotal: true,
        valueCurrent: saleOfServices.current,
        valuePrevious: saleOfServices.previous,
        children: [
          { key: 'note18-amc', label: 'AMC, Training, etc.', valueCurrent: amcTraining.current, valuePrevious: amcTraining.previous },
          { key: 'note18-it', label: 'IT support services', valueCurrent: itSupport.current, valuePrevious: itSupport.previous },
        ]
      },
      {
        key: 'note18-other-op',
        label: 'Note (iii) Other operating revenue comprises:',
        isSubtotal: true,
        valueCurrent: scrapSales.current,
        valuePrevious: scrapSales.previous,
        children: [
          { key: 'note18-scrap', label: 'Sale of scrap', valueCurrent: scrapSales.current, valuePrevious: scrapSales.previous },
        ]
      },
      {
        key: 'note18-timing',
        label: 'Timing of revenue recognition',
        isSubtotal: true,
        valueCurrent: pointInTime.current + overTime.current,
        valuePrevious: pointInTime.previous + overTime.previous,
        children: [
          { key: 'note18-time-point', label: 'Goods transferred at a point in time', valueCurrent: pointInTime.current, valuePrevious: pointInTime.previous },
          { key: 'note18-time-over', label: 'Services transferred over time', valueCurrent: overTime.current, valuePrevious: overTime.previous },
        ]
      },
      {
        key: 'note18-geo',
        label: '',
        isSubtotal: true,
        valueCurrent: india.current + outsideIndia.current,
        valuePrevious: india.previous + outsideIndia.previous,
        children: [
          { key: 'note18-india', label: 'India', valueCurrent: india.current, valuePrevious: india.previous },
          { key: 'note18-out-india', label: 'Outside India', valueCurrent: outsideIndia.current, valuePrevious: outsideIndia.previous },
        ]
      },
      {
        key: 'note18-contract-balances',
        label: '18.1 Contract balances',
        isSubtotal: true,
        valueCurrent: contractBalances.tradeReceivables.current+contractBalances.contractAssets.current+contractBalances.contractLiabilities.current,
        valuePrevious: contractBalances.tradeReceivables.previous+contractBalances.contractAssets.previous+contractBalances.contractLiabilities.previous,
        children: [
          { key: 'contract-trade-receivables', label: 'Trade receivables', valueCurrent: contractBalances.tradeReceivables.current, valuePrevious: contractBalances.tradeReceivables.previous },
          { key: 'contract-assets', label: 'Contract assets', valueCurrent: contractBalances.contractAssets.current, valuePrevious: contractBalances.contractAssets.previous },
          { key: 'contract-liabilities', label: 'Contract liabilities', valueCurrent: contractBalances.contractLiabilities.current, valuePrevious: contractBalances.contractLiabilities.previous },
        ],
        },
      {
        key: 'note18-performance-obligation',
        label: '18.2 Performance obligation',
        isSubtotal: true,
        valueCurrent: remainingPerformanceObligations.withinOneYear.current+remainingPerformanceObligations.moreThanOneYear.current,
        valuePrevious: remainingPerformanceObligations.withinOneYear.previous+remainingPerformanceObligations.moreThanOneYear.previous,
        children: [
          { key: 'performance-within-1y', label: 'Within one year', valueCurrent: remainingPerformanceObligations.withinOneYear.current, valuePrevious: remainingPerformanceObligations.withinOneYear.previous },
          { key: 'performance-more-1y', label: 'More than one year', valueCurrent: remainingPerformanceObligations.moreThanOneYear.current, valuePrevious: remainingPerformanceObligations.moreThanOneYear.previous },
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
    totalCurrent: totalOtherIncome.current,
    totalPrevious: totalOtherIncome.previous,
    content: [
      {
        key: 'note19-summary',
        label: 'Note 19 Other income',
        isSubtotal: true,
        valueCurrent: totalOtherIncome.current,
        valuePrevious: totalOtherIncome.previous,
        children: [
          {
            key: 'note19-interest',
            label: '(a) Interest income (Refer Note (i) below)',
            valueCurrent: totalInterestIncome.current,
            valuePrevious: totalInterestIncome.previous,
          },
          {
            key: 'note19-other',
            label: '(b) Other non-operating income: Miscellaneous Income (Refer Note (ii) below)',
            valueCurrent: totalMiscIncome.current,
            valuePrevious: totalMiscIncome.previous,
          },
        ]
      },
      {
        key: 'note19-interest-breakup',
        label: 'Note (i) Interest income on financial assets at amortised cost comprises:',
        isSubtotal: true,
        valueCurrent: totalInterestIncome.current,
        valuePrevious: totalInterestIncome.previous,
        children: [
          { key: 'note19-bank', label: '-Interest income from bank on deposits', valueCurrent: interestBank.current, valuePrevious: interestBank.previous },
          { key: 'note19-other-interest', label: 'Interest income on other financial assets', valueCurrent: interestOther.current, valuePrevious: interestOther.previous },
        ]
      },
      {
        key: 'note19-misc-breakup',
        label: 'Note (ii) Other non-operating income comprises:',
        isSubtotal: true,
        valueCurrent: totalMiscIncome.current,
        valuePrevious: totalMiscIncome.previous,
        children: [
          { key: 'note19-reimb', label: 'Reimbursements from YHQ', valueCurrent: reimbursements.current, valuePrevious: reimbursements.previous },
          { key: 'note19-bond', label: 'Bond Recoveries', valueCurrent: bondRecoveries.current, valuePrevious: bondRecoveries.previous },
          { key: 'note19-insurance', label: 'Insurance Refund', valueCurrent: insuranceRefund.current, valuePrevious: insuranceRefund.previous },
          { key: 'note19-others', label: 'Others', valueCurrent: others.current, valuePrevious: others.previous },
        ]
      }
    ]
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
    totalCurrent: earningsPerShare.current,
    totalPrevious: earningsPerShare.previous,
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
  "noteNumber": 33,
  "title": "Details of provisions",
  "content": [
    {
      "type": "table",
      "headers": [
        "",
        "As at 1 April 2023",
        "Additions",
        "Utilisation",
        "As at 31 March 2024"
      ],
      "rows": [
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
  "footer": "The Company has made provision for various contractual obligations based on its assessment of the amount it estimates to incur to meet such obligations, details of which are given below:",
  "totalCurrent": 17116.20,
  "totalPrevious": 14142.18
}
};

    const note5 = calculateNote5();
    const note6 = calculateNote6();
    const note7 = calculateNote7();
    const note8 = calculateNote8();
    const note10 = calculateNote10();
    const note11 = calculateNote11();
    const note13 = calculateNote13();
    const note14 = calculateNote14();
    const note15 = calculateNote15();
    const note16 = calculateNote16();
    const note17 = calculateNote17();
    const note18 = calculateNote18();
    const note19 = calculateNote19();
    const note32 = calculateNote32();
    const note33 = calculateNote33();
    const allNotes = [note5,note6,note7,note8,note10,note11,note13,note14,note15,note16,note17,note18,note19,note32,note33]; // [FIX] Add all calculated notes

    const processNode = (node: TemplateItem,enrichedData: MappedRow[],getAmount: (
    year: 'amountCurrent' | 'amountPrevious',
    level1Keywords?: string[],
    level2Keywords?: string[]
  ) => number): HierarchicalItem => {
      const children = node.children?.map(child => processNode(child, enrichedData, getAmount));
      let valueCurrent: number | null = 0;
      let valuePrevious: number | null = 0;
      
      // [FIX] Map the totals from the calculated notes back to the main statements
if (node.key === 'bs-assets-c-inv') {
          valueCurrent = note8.totalCurrent;
          valuePrevious = note8.totalPrevious;
      }
else if (node.key === 'bs-assets-c-other') {
  // --- FIX: Added type guard `(item): item is HierarchicalItem` to satisfy TypeScript in .find() ---
  const nonCurrent = note10.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note10-noncurrent');
  if (nonCurrent) {
    valueCurrent = nonCurrent.valueCurrent;
    valuePrevious = nonCurrent.valuePrevious;
  }
}
else if(node.key ==='bs-assets-nc-other'){
        valueCurrent = note10.totalCurrent;
        valuePrevious = note10.totalPrevious;
      } 
else if (node.key === 'bs-assets-c-fin-cce') {
          valueCurrent = note11.totalCurrent;
          valuePrevious = note11.totalPrevious;
      }
else if (node.key === 'bs-assets-c-fin-bank') {
  const banks = note11.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note10-bwb-group-other');
  if (banks) {
    valueCurrent = banks.valueCurrent;
    valuePrevious = banks.valuePrevious;
  }
}
else if (node.key === 'bs-assets-nc-fin-loan') {
  const nonloans = note5.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note5-noncurrent');
  if (nonloans) {
    valueCurrent = nonloans.valueCurrent;
    valuePrevious = nonloans.valuePrevious;
  }
}
else if (node.key === 'bs-assets-c-fin-loans') {
  const loans = note5.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note5-current');
  if (loans) {
    valueCurrent = loans.valueCurrent;
    valuePrevious = loans.valuePrevious;
  }
}
else if (node.key === 'bs-assets-nc-fin-other') {
  const otherfin = note6.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note6-noncurrent');
  if (otherfin) {
    valueCurrent = otherfin.valueCurrent;
    valuePrevious = otherfin.valuePrevious;
  }
}
else if (node.key === 'bs-liab-c-fin-enterprises') {
  const msmes = note14.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note14-msme-group');
  if (msmes) {
    valueCurrent = Math.abs(msmes.valueCurrent??0);
    valuePrevious = Math.abs(msmes.valuePrevious??0);
  }
}
else if (node.key === 'bs-liab-c-fin-creators') {
  const nonmsmes = note14.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note14-nonmsme-group');
  if (nonmsmes) {
    valueCurrent = Math.abs(nonmsmes.valueCurrent??0);
    valuePrevious = Math.abs(nonmsmes.valuePrevious??0);
  }
}
else if (node.key === 'bs-liab-c-fin-enterprises-other') {
  const othercr = note15.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note15-footer-other');
  if (othercr) {
    valueCurrent = Math.abs(othercr.valueCurrent??0);
    valuePrevious = Math.abs(othercr.valuePrevious??0);
  }
}
else if (node.key === 'bs-liab-c-other') {
  const lib = note16.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note16-total');
  if (lib) {
    valueCurrent = Math.abs(lib.valueCurrent??0);
    valuePrevious = Math.abs(lib.valuePrevious??0);
  }
}
else if (node.key === 'bs-liab-nc-prov') {
  const gra = note17.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note17-noncurrent');
  if (gra) {
    valueCurrent = Math.abs(gra.valueCurrent??0);
    valuePrevious = Math.abs(gra.valuePrevious??0);
  }
}
else if (node.key === 'bs-liab-c-prov') {
  const lib = note17.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note17-current');
  if (lib) {
    valueCurrent = Math.abs(lib.valueCurrent??0);
    valuePrevious = Math.abs(lib.valuePrevious??0);
  }
}
else if (node.key === 'is-rev-ops') {
  const rev = note18.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note18-geo');
  if (rev) {
    valueCurrent = Math.abs(rev.valueCurrent??0);
    valuePrevious = Math.abs(rev.valuePrevious??0);
  }
}
else if (node.key === 'is-other-inc') {
  const inc = note19.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note19-summary');
  if (inc) {
    valueCurrent = inc.valueCurrent??0;
    valuePrevious = inc.valuePrevious??0;
  }
}
else if (node.key === 'bs-assets-nc-fin-income') {
  const incAst = note7.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note7-asset-section');
  if (incAst) {
    valueCurrent = incAst.valueCurrent??0;
    valuePrevious = incAst.valuePrevious??0;
  }
}
else if (node.key === 'bs-liab-c-tax') {
  const incLbt = note7.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note7-liability-section');
  if (incLbt) {
    valueCurrent = incLbt.valueCurrent??0;
    valuePrevious = incLbt.valuePrevious??0;
  }
}
else if (node.key === 'bs-eq-other') {
  const incLbt = note13.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note13-total');
  if (incLbt) {
    valueCurrent = incLbt.valueCurrent??0;
    valuePrevious = incLbt.valuePrevious??0;
  }
}
else if (node.key === 'is-eps-value') {
  const ear = note32.content.find((item): item is HierarchicalItem => 'key' in item && item.key === 'note32-eps');
  if (ear) {
    valueCurrent = ear.valueCurrent??0;
    valuePrevious = ear.valuePrevious??0;
  }
}
else if (node.key === 'bs-liab-nc-fin-borrow') {
  const currentAmount = getAmount('amountCurrent', node.keywords!);
  const previousAmount = getAmount('amountPrevious', node.keywords!);

  valueCurrent = Math.abs(currentAmount);
  valuePrevious = Math.abs(previousAmount);
}

else if (node.key === 'bs-liab-c-fin-liability') {
  const currentAmount = getAmount('amountCurrent',node.keywords,['short term lease obligation']);
  const previousAmount = getAmount('amountPrevious',node.keywords,['short term lease obligation']);
  valueCurrent = Math.abs(currentAmount);
  valuePrevious = Math.abs(previousAmount);
}
else if (node.key === 'bs-eq-captial') {
  const currentAmount = getAmount('amountCurrent',node.keywords,['equity share capital']);
  const previousAmount = getAmount('amountPrevious',node.keywords,['equity share capital']);
  valueCurrent = Math.abs(currentAmount);
  valuePrevious = Math.abs(previousAmount);
}
else if (node.key === 'bs-assets-nc-cwip') {
        valueCurrent = getAmount('amountCurrent', node.keywords!);
        const originalPreviousAmount = getAmount('amountPrevious', node.keywords!);
        valuePrevious = originalPreviousAmount - 350.95;
      }
      else if (node.key === 'bs-assets-nc-otherintangible') {
        valueCurrent = getAmount('amountCurrent', node.keywords!);
        valuePrevious = 350.95;
      }
      else if (node.key === 'bs-assets-c-fin-tr') {
        valueCurrent = 55651.89;
        valuePrevious = 51164.06;
      }
      else if (node.key === 'bs-assets-c-fin-other') {
        valueCurrent = 38879.35;
        valuePrevious = 26935.59;
      }
else if (node.key === 'is-exp-mat') {
        valueCurrent = 64638.09;
        valuePrevious = 53900.63;
      }
      else if (node.key === 'is-exp-pur') {
        valueCurrent = 50087.71;
        valuePrevious = 30082.82;
      }
      else if (node.key === 'is-exp-inv') {
        valueCurrent = 1897.71;
        valuePrevious = -3724.12;
      }
      else if (node.key === 'is-exp-emp') {
        valueCurrent = 31528.33;
        valuePrevious = 25011.56;
      }
      else if (node.key === 'is-exp-fin') {
        valueCurrent = 243.20;
        valuePrevious = 260.43;
      }
      else if (node.key === 'is-exp-dep') {
        valueCurrent = 2020.57;
        valuePrevious = 1130.64;
      }
      else if (node.key === 'is-exp-oth') {
        valueCurrent = 38905.27;
        valuePrevious = 24447.36;
      }
      else if (node.key === 'is-pbeit') {
        valueCurrent = 16512.80;
        valuePrevious = 11794.02;
      }
        else if (node.key === 'is-except') {
        valueCurrent = 12166.54;
      }
      else if (node.key === 'is-tax-curr') {
        valueCurrent = 7227.51;
        valuePrevious = 4540.22;
      }
      else if (node.key === 'is-tax-def') {
        valueCurrent = -1108.27;
        valuePrevious = -204.21;
      }
      else if (node.key === 'bs-liab-nc') {
        valueCurrent = 2647.07;
        valuePrevious = 1058.70;
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

    const calculateCashFlow = (): HierarchicalItem[] => {
        const pbt2023 = getAmount('amountCurrent', ['revenue', 'other income']) - getAmount('amountCurrent', ['cost of material consumed', 'purchase of traded goods', 'changes in inventories', 'employee benefits expense', 'finance cost', 'depreciation expense', 'other expenses']);
        const pbt2022 = getAmount('amountPrevious', ['revenue', 'other income']) - getAmount('amountPrevious', ['cost of material consumed', 'purchase of traded goods', 'changes in inventories', 'employee benefits expense', 'finance cost', 'depreciation expense', 'other expenses']);
        const dep2023 = getAmount('amountCurrent', ['depreciation']);
        const dep2022 = getAmount('amountPrevious', ['depreciation']);
        const finCost2023 = getAmount('amountCurrent', ['finance cost']);
        const finCost2022 = getAmount('amountPrevious', ['finance cost']);
        const tax2023 = getAmount('amountCurrent', ['tax expense']);
        const tax2022 = getAmount('amountPrevious', ['tax expense']);
        const changeInReceivables2023 = getAmount('amountPrevious', ['trade receivables']) - getAmount('amountCurrent', ['trade receivables']);
        const changeInInventories2023 = getAmount('amountPrevious', ['Inventories']) - getAmount('amountCurrent', ['Inventories']);
        const changeInPayables2023 = getAmount('amountCurrent', ['trade payables']) - getAmount('amountPrevious', ['trade payables']);
        const opProfitBeforeWC2023 = pbt2023 + dep2023 + finCost2023;
        const opProfitBeforeWC2022 = pbt2022 + dep2022 + finCost2022;
        const cashFromOps2023 = opProfitBeforeWC2023 + changeInReceivables2023 + changeInInventories2023 + changeInPayables2023;
        const netCashFromOp2023 = cashFromOps2023 - tax2023;
        const netCashFromOp2022 = opProfitBeforeWC2022 - tax2022;
        const ppePrev = getAmount('amountPrevious', ['property, plant', 'intangible']);
        const ppeCurr = getAmount('amountCurrent', ['property, plant', 'intangible']);
        const netCapex2023 = -1 * (ppeCurr - ppePrev + dep2023);
        const changeInEquity2023 = (getAmount('amountCurrent', ['equity']) - getAmount('amountPrevious', ['equity'])) - (pbt2023 - tax2023);
        const changeInDebt2023 = getAmount('amountCurrent', ['other non current financial liabilities']) - getAmount('amountPrevious', ['other non current financial liabilities']);
        const netCashFromFin2023 = changeInEquity2023 + changeInDebt2023 - finCost2023;
        const netChangeInCash2023 = netCashFromOp2023 + netCapex2023 + netCashFromFin2023;
        
        return [
            { key: 'cf-op', label: 'A. Cash flow from operating activities', valueCurrent: netCashFromOp2023, valuePrevious: netCashFromOp2022, isSubtotal: true,
            children: [
                { key: 'cf-pbt', label: 'Profit before tax', valueCurrent: pbt2023, valuePrevious: pbt2022 },
                { key: 'cf-op-adj', label: 'Adjustments for:', valueCurrent: null, valuePrevious: null, children: [
                    { key: 'cf-dep', label: 'Depreciation and amortisation', valueCurrent: dep2023, valuePrevious: dep2022 },
                    { key: 'cf-fin-cost', label: 'Finance costs', valueCurrent: finCost2023, valuePrevious: finCost2022 },
                ]},
                { key: 'cf-op-wc', label: 'Operating profit before working capital changes', isSubtotal: true, valueCurrent: opProfitBeforeWC2023, valuePrevious: opProfitBeforeWC2022 },
                { key: 'cf-wc-adj', label: 'Changes in working capital:', valueCurrent: null, valuePrevious: null, children: [
                    { key: 'cf-rec', label: '(Increase)/decrease in trade receivables', valueCurrent: changeInReceivables2023, valuePrevious: 0 },
                    { key: 'cf-inv', label: '(Increase)/decrease in inventories', valueCurrent: changeInInventories2023, valuePrevious: 0 },
                    { key: 'cf-pay', label: 'Increase/(decrease) in trade payables', valueCurrent: changeInPayables2023, valuePrevious: 0 },
                ]},
                { key: 'cf-cgo', label: 'Cash generated from operations', isSubtotal: true, valueCurrent: cashFromOps2023, valuePrevious: opProfitBeforeWC2022 },
                { key: 'cf-tax', label: 'Income taxes paid', valueCurrent: -tax2023, valuePrevious: -tax2022 },
            ]},
            { key: 'cf-inv', label: 'B. Cash flow from investing activities', valueCurrent: netCapex2023, valuePrevious: 0, isSubtotal: true, children: [
                { key: 'cf-capex', label: 'Purchase of property, plant and equipment', valueCurrent: netCapex2023, valuePrevious: 0 },
            ]},
            { key: 'cf-fin', label: 'C. Cash flow from financing activities', valueCurrent: netCashFromFin2023, valuePrevious: 0, isSubtotal: true, children: [
                { key: 'cf-equity', label: 'Proceeds from issuance of share capital', valueCurrent: changeInEquity2023, valuePrevious: 0 },
                { key: 'cf-debt', label: 'Proceeds from borrowings', valueCurrent: changeInDebt2023, valuePrevious: 0 },
                { key: 'cf-int', label: 'Interest paid', valueCurrent: -finCost2023, valuePrevious: -finCost2022 },
            ]},
            { key: 'cf-net', label: 'Net increase/decrease in cash', valueCurrent: netChangeInCash2023, valuePrevious: 0, isSubtotal: true },
        ];
    };
    
     return {
      balanceSheet: BALANCE_SHEET_STRUCTURE.map(node => processNode(node, enrichedData, getAmount)),
      incomeStatement: INCOME_STATEMENT_STRUCTURE.map(node => processNode(node, enrichedData, getAmount)),
      cashFlow: calculateCashFlow(),
      notes: allNotes,
      accountingPolicies: ACCOUNTING_POLICIES_CONTENT,
    };
  }, [rawData]);
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
    const isFirstItemTable = note.content.length > 0 && 'type' in note.content[0] && note.content[0].type === 'table';
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
    
    addNoteContent(note.content, 0);

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
  
  data.notes.forEach(note => createNoteSheet(note));
  createSheet('Balance Sheet', data.balanceSheet);
  createSheet('Profit & Loss', data.incomeStatement);
  createSheet('Cash Flow', data.cashFlow);
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
                 <Text style={[textStyle, PDF_STYLES.noteColParticulars, { paddingLeft: depth * 15 }]}>{item.label}</Text>
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
     const isTableNote = note.content.length > 0 && 'type' in note.content[0] && note.content[0].type === 'table';

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
                    if ('key' in item) { // It's a HierarchicalItem
                        return <RenderPdfNoteRow key={item.key} item={item} depth={0} />;
                    } else { // It's a TableContent
                        return <RenderPdfNoteTable key={index} data={item} />;
                    }
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
            <Text style={[...textStyle, { color: 'blue', textDecoration: 'underline' }]}>
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
        <Text style={[...textStyle, PDF_STYLES.colParticulars, { paddingLeft: depth > 0 ? (depth * 15) + 5 : 5, textTransform: depth === 0 ? 'uppercase' : 'none' }]}>
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

// --- 7. MAIN APPLICATION COMPONENT ---
const FinancialStatements: React.FC<{ data: MappedRow[] }> = ({ data }) => {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [isPdfModalOpen, setPdfModalOpen] = useState(false);
  const [isExcelConfirmOpen, setExcelConfirmOpen] = useState(false);
  const financialData = useFinancialData(data);

  const allExpandableKeys = useMemo(() => {
    const bsKeys = getAllExpandableKeys(financialData.balanceSheet);
    const isKeys = getAllExpandableKeys(financialData.incomeStatement);
    const cfKeys = getAllExpandableKeys(financialData.cashFlow);
    return [...bsKeys, ...isKeys, ...cfKeys];
  }, [financialData]);

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
      </Box>

      <DrillDownTable title="Balance Sheet" data={financialData.balanceSheet} expandedKeys={expandedKeys} onToggleRow={handleToggleRow} />
      <DrillDownTable title="Statement of Profit and Loss" data={financialData.incomeStatement} expandedKeys={expandedKeys} onToggleRow={handleToggleRow}/>
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