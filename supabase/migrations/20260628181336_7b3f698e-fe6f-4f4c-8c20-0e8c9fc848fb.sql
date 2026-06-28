
SET session_replication_role = 'replica';

-- Orders & Fulfillment
TRUNCATE TABLE
  public.order_items, public.order_notes, public.order_status_history, public.order_locks,
  public.courier_shipments, public.courier_history_cache, public.mkt_order_attributions,
  public.abandoned_carts, public.addresses, public.orders
RESTART IDENTITY CASCADE;

-- Inventory movements
TRUNCATE TABLE
  public.stock_movements, public.low_stock_alerts, public.reorder_suggestions,
  public.stocktake_items, public.stocktake_sessions
RESTART IDENTITY CASCADE;

-- Reset product stock
UPDATE public.products SET stock = 0, reserved_stock = 0;
UPDATE public.product_variants SET stock = 0, reserved_stock = 0;

-- Returns / Exchanges
TRUNCATE TABLE
  public.erp_return_timeline, public.erp_return_cases, public.erp_exchange_cases
RESTART IDENTITY CASCADE;

-- CRM
TRUNCATE TABLE
  public.crm_activities, public.crm_tasks, public.crm_customer_notes, public.crm_customer_tags,
  public.crm_customer_meta, public.crm_imported_customers, public.crm_saved_filters
RESTART IDENTITY CASCADE;

-- Finance
TRUNCATE TABLE
  public.erp_journal_lines, public.erp_journal_entries, public.erp_transactions,
  public.erp_ar_payments, public.erp_bill_payments, public.erp_supplier_payments,
  public.erp_bills, public.erp_cod_remittances,
  public.erp_reconciliation_rows, public.erp_reconciliation_runs,
  public.erp_statement_lines, public.erp_statement_imports,
  public.erp_recurring_runs, public.erp_recurring_rules,
  public.erp_tax_entries, public.erp_finance_attachments, public.erp_finance_audit,
  public.erp_product_expense_allocations, public.erp_budgets, public.erp_period_locks
RESTART IDENTITY CASCADE;

UPDATE public.erp_accounts SET current_balance = 0, opening_balance = 0;

-- Meta Ad Wallet
TRUNCATE TABLE
  public.meta_spend_consumptions, public.meta_fifo_lots,
  public.meta_dollar_purchases, public.meta_ad_wallet_ledger
RESTART IDENTITY CASCADE;

-- HR
TRUNCATE TABLE
  public.hr_attendance, public.hr_payslips, public.hr_payroll_runs,
  public.hr_leave_requests, public.hr_leave_balances,
  public.hr_documents, public.hr_employment_history, public.hr_employee_shifts,
  public.hr_employees
RESTART IDENTITY CASCADE;

-- Supply Chain
TRUNCATE TABLE
  public.imp_carton_items, public.imp_cartons, public.imp_po_items,
  public.imp_status_history, public.imp_payments, public.imp_purchase_orders,
  public.imp_cargo_ledger, public.imp_cargo_bills, public.imp_cargo_agents,
  public.local_po_receipt_items, public.local_po_receipts,
  public.local_po_items, public.local_purchase_orders,
  public.erp_suppliers
RESTART IDENTITY CASCADE;

-- Marketing logs
TRUNCATE TABLE
  public.mkt_insights_daily, public.mkt_sync_log, public.mkt_tracking_events, public.mkt_manual_expenses,
  public.meta_capi_log, public.analytics_events, public.page_views,
  public.activity_log, public.activity_logs, public.admin_audit_log
RESTART IDENTITY CASCADE;

-- Reviews & Coupons
TRUNCATE TABLE public.coupon_usage, public.coupons, public.reviews RESTART IDENTITY CASCADE;

-- PO sequences
TRUNCATE TABLE public.imp_po_sequences RESTART IDENTITY CASCADE;

SET session_replication_role = 'origin';
