# What to build (review this before writing code)

## Why this exists

QuickBooks Enterprise stays on the Windows server for payroll and tax. It is a bad place to do the actual work.

We cannot track a job from quote → invoice → money. We duplicate old estimates to make new ones. We cannot mark an invoice paid correctly when a factor funds it (advance, reserve, fee, customer pays the bank) versus when the customer pays us. We do not reconcile POs in QB and we will not start there.

Staff need a local app that does the paperwork. QuickBooks gets a file when we choose to send one.

## What it is

Office-only web app on the Mac Mini. Seven people use a browser on the LAN. Three admins can fund invoices, manage users, and export to QuickBooks. Not on the internet.

Spine of the product:

**estimate or sales order → invoice → money**

An invoice is never typed from scratch. It is converted from an estimate or a sales order (both are preliminary quotes; same form, different label).

Then we record money as it actually moves:

- customer paid Doortronix, or
- factor advanced / held reserve / took a fee / customer paid the factor / reserve came back

An invoice is not “paid” because someone typed a deposit. The dollars have to tie or it stays open.

Same item list is used for quote lines, invoice lines, POs, and a simple on-hand qty. Starting qty comes from a count or a QB item report, not from faith in the old file.

## What success looks like

Open an invoice and see, on one screen:

- which quote it came from
- what the customer was billed
- who was supposed to pay
- advance, reserve, fees, cash we actually received
- whether the math ties

Search an old estimate, duplicate it, change the job. That replaces “Cursor remember 400 PDFs.”

Print estimate / SO / invoice / PO as PDF. Factor is CC’d on the customer invoice. Factor never looks at QuickBooks.

## What QuickBooks still does

- Payroll and tax filings
- Accountant books spend from the bank
- Accountant needs sales totals by category and taxable vs not

The app must **be able** to upload lists and transactions into Desktop via IIF:

- Default pack: sales by category + tax (journal)
- Full pack: estimates, invoices, POs, payments if we ever need them

IIF will not link a payment to an invoice. Do not pretend it will. Test every import on a **copy** of the company file first.

No live two-way sync.

## Where it runs

- Mac Mini: app + Postgres + PDFs + IIF export + Cursor (Privacy Mode on)
- Staff PCs: browser to the Mini on the LAN
- Windows server: QuickBooks only. Admin copies the IIF from a shared folder and imports.

Do not paste the company file, payroll, or the full customer list into Cursor. Fake customers for development. Sample forms (a few PDFs) are for letterhead and wording only.

## Build order

1. Login, two roles (user / admin)
2. Customers, vendors, items (seed names from a QB list export)
3. Estimate / sales order form, PDF, duplicate
4. Convert → invoice, invoice PDF
5. Funding + receive payment + exception if numbers do not tie
6. PO + receive qty
7. IIF export packs + export history (do not send the same row twice)

## Do not build in v1

Payroll, bank feeds, live QB connector, 3-way bill match, fixing old QB history, public website, AI that posts money by itself.

## Stack

Next.js + TypeScript + Prisma + PostgreSQL on the Mini. Local accounts. No cloud.

If anything in this file conflicts with a fancier architecture, this file wins.
