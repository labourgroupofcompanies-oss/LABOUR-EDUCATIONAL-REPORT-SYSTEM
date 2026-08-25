import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const doc = new PDFDocument({
  margin: 40,
  size: 'A4'
});

const outputPath = path.resolve('public/Platform_Operations_User_Manual.pdf');
const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

// Colors
const primaryGold = '#d97706';
const darkBackground = '#1c1917';
const textColor = '#222222';

// Header
doc.fillColor(primaryGold)
   .fontSize(22)
   .font('Helvetica-Bold')
   .text('LABOUR EDUCATIONAL REPORT SYSTEM', { align: 'center' });

doc.moveDown(0.3);
doc.fillColor('#444444')
   .fontSize(14)
   .font('Helvetica-Bold')
   .text('Platform Operations & Subscription Management Manual', { align: 'center' });

doc.moveDown(0.2);
doc.fillColor('#777777')
   .fontSize(9)
   .font('Helvetica')
   .text('Official Administrative System Documentation • Version 2026.1', { align: 'center' });

doc.moveDown(1.5);
doc.strokeColor('#d97706').lineWidth(2).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
doc.moveDown(1);

// Section 1: Overview
doc.fillColor(primaryGold).fontSize(14).font('Helvetica-Bold').text('1. System Overview & Role Permissions');
doc.moveDown(0.5);
doc.fillColor(textColor).fontSize(10).font('Helvetica').text(
  'The Platform Operations & Subscription Management Center (located at /platform/operations/subscriptions) provides super administrators and platform developers with complete oversight over school subscription entitlements, learner billing calculations, wallet ledgers, and platform revenue realization.'
);
doc.moveDown(1);

doc.fillColor('#333333').fontSize(10).font('Helvetica-Bold').text('Authorized System Roles & Permissions:');
doc.moveDown(0.4);
doc.font('Helvetica').fontSize(9.5)
   .text('• Super Admin (super_admin): Full control over pricing, billing cycle triggers, cycle reverts, exemptions, and wallet top-ups.')
   .text('• Platform Developer (developer): Database migrations, schema updates, audit logs, and diagnostics.')
   .text('• Accountant (accountant): Financial ledger audit, Paystack reconciliation, wallet top-ups, and CSV reporting.')
   .text('• Operations (operations): School category tagging, learner count monitoring, and exemption status checks.');

doc.moveDown(1.5);

// Section 2: Executive Dashboard KPIs
doc.fillColor(primaryGold).fontSize(14).font('Helvetica-Bold').text('2. Executive Dashboard & Real-Time KPIs');
doc.moveDown(0.5);
doc.fillColor(textColor).fontSize(10).font('Helvetica').text(
  'At the top of the interface, the Executive KPI Metrics Bar displays real-time counts across all onboarded schools:'
);
doc.moveDown(0.5);
doc.fontSize(9.5)
   .text('1. Total Schools: Total count of registered basic schools on the platform.')
   .text('2. Free Onboarding: Schools running their 16-week trial (First Term Free).')
   .text('3. Wallet Balance: Cumulative pre-funded GHS wallet balances across all active schools.')
   .text('4. Frozen Accounts: Schools whose wallet balance is below their term dues, resulting in report card locks.')
   .text('5. Exempted: Schools granted explicit administrative exemption from term fees.');

doc.moveDown(1.5);

// Section 3: Revenue Analytics Engine
doc.fillColor(primaryGold).fontSize(14).font('Helvetica-Bold').text('3. Term Subscription Revenue Analytics Engine');
doc.moveDown(0.5);
doc.fillColor(textColor).fontSize(10).font('Helvetica').text(
  'The Term Revenue Analytics dashboard calculates real-time revenue collection and receivables for any selected term:'
);
doc.moveDown(0.5);
doc.fontSize(9.5)
   .text('• Total Billed: Total subscription fees required from non-waived schools.')
   .text('• Collected Revenue: Realized revenue deducted from school wallets or collected via Paystack.')
   .text('• Outstanding Shortfall: Uncollected shortfall due from schools with insufficient funds.')
   .text('• Realization Rate (%): Percentage ratio of collected vs. billed revenue ((Collected / Billed) * 100%).')
   .text('• Category Breakdown: Real-time revenue figures for Private, GES, and International school categories.')
   .text('• Revenue Report CSV: Click Revenue Report CSV to download a complete school-by-school audit file.');

doc.addPage();

// Section 4: Subscription Matrix & Cards
doc.fillColor(primaryGold).fontSize(14).font('Helvetica-Bold').text('4. School Subscription Matrix & Card Anatomy');
doc.moveDown(0.5);
doc.fillColor(textColor).fontSize(10).font('Helvetica').text(
  'The Subscription Matrix displays all registered schools in an interactive 3D Card Grid Format or Table View.'
);
doc.moveDown(0.5);
doc.fontSize(9.5).font('Helvetica-Bold').text('School Card Layout Components:');
doc.font('Helvetica').fontSize(9)
   .text('• Header: Displays School Name, ID Badge (e.g. SCH-0042), Category, and Running Term Badge (e.g. Term 1 2025/2026).')
   .text('• Status Banner: Shows term subscription status (Waived Free Term, Paid & Approved, Payment Requested, or Bill Unpaid).')
   .text('• 2x2 Metrics Box: Displays Active Learner Count, Rate per Learner, Term Fee, Wallet Balance, and Outstanding Dues.')
   .text('• Action Footer Buttons:')
   .text('    - Top Up: Opens manual admin credit deposit modal.')
   .text('    - Exempt / Exempted: Toggles term exemption for the school.')
   .text('    - Bills: Opens billing snapshot history for the school.')
   .text('    - Config: Opens custom rate override and category settings.');

doc.moveDown(1.5);

// Section 5: Billing Cycle Trigger & Revert
doc.fillColor(primaryGold).fontSize(14).font('Helvetica-Bold').text('5. Term Billing Trigger & Cycle Revert Controls');
doc.moveDown(0.5);
doc.fillColor(textColor).fontSize(10).font('Helvetica-Bold').text('5.1 Initiating a Billing Cycle:');
doc.font('Helvetica').fontSize(9.5).text(
  'Under Term Billing Controls (Tab 3), enter Academic Year (e.g. 2025/2026), select Term, set Payment Deadline, and click START TERM BILLING. Immutable billing snapshots will be generated for all eligible schools.'
);
doc.moveDown(0.8);
doc.font('Helvetica-Bold').text('5.2 Reverting a Billing Trigger:');
doc.font('Helvetica').fontSize(9.5).text(
  'If a billing cycle was triggered by mistake or requires adjustment, click REVERT BILLING TRIGGER (or click Revert next to any cycle in the Active Billing Cycles list). Unpaid term bill snapshots are deleted, allowing administrators to adjust exemptions or pricing and re-trigger billing cleanly.'
);

doc.moveDown(1.5);

// Section 6: Wallet Management & Top-Ups
doc.fillColor(primaryGold).fontSize(14).font('Helvetica-Bold').text('6. School Wallet Management & Top-Ups');
doc.moveDown(0.5);
doc.fillColor(textColor).fontSize(9.5).font('Helvetica')
   .text('1. Click Top Up on the target school card.')
   .text('2. Enter Deposit Amount (GH₵), Reference Code, and Deposit Notes.')
   .text('3. Click Confirm Top Up. The school wallet balance updates immediately.');

doc.moveDown(1.5);

// Section 7: SQL Migrations Reference
doc.fillColor(primaryGold).fontSize(14).font('Helvetica-Bold').text('7. Database Maintenance & SQL Migrations');
doc.moveDown(0.5);
doc.fillColor(textColor).fontSize(9.5).font('Helvetica')
   .text('Ensure the following SQL scripts are executed in your Supabase SQL Editor:')
   .text('• 20260813_fix_wallet_rls_and_transactions.sql — Grants RLS permissions on report_schools and school_term_bills.')
   .text('• 20260813_add_revert_billing_and_school_exemption.sql — Installs revert_term_billing_cycle and toggle_school_term_exemption RPC functions.');

doc.moveDown(2);
doc.strokeColor('#d97706').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
doc.moveDown(0.5);
doc.fillColor('#777777').fontSize(8.5).font('Helvetica').text('Labour Educational Report System — Platform Operations Manual', { align: 'center' });

doc.end();

writeStream.on('finish', () => {
  console.log('PDF User Manual successfully generated at public/Platform_Operations_User_Manual.pdf');
});
