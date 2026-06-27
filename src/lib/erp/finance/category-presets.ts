// Common preset categories for quick seeding. Grouped by kind.
export type CategoryPreset = { name: string; kind: "expense" | "income"; group: string };

export const CATEGORY_PRESETS: CategoryPreset[] = [
  // Operations
  { name: "Office Rent", kind: "expense", group: "Operations" },
  { name: "Utilities (Electric/Water/Gas)", kind: "expense", group: "Operations" },
  { name: "Internet & Phone", kind: "expense", group: "Operations" },
  { name: "Office Supplies", kind: "expense", group: "Operations" },
  { name: "Repairs & Maintenance", kind: "expense", group: "Operations" },
  { name: "Cleaning & Pantry", kind: "expense", group: "Operations" },
  // Payroll
  { name: "Salary & Wages", kind: "expense", group: "Payroll" },
  { name: "Bonus & Incentive", kind: "expense", group: "Payroll" },
  { name: "Staff Food / Allowance", kind: "expense", group: "Payroll" },
  { name: "Employee Benefits", kind: "expense", group: "Payroll" },
  // Marketing
  { name: "Facebook / Meta Ads", kind: "expense", group: "Marketing" },
  { name: "Google Ads", kind: "expense", group: "Marketing" },
  { name: "TikTok Ads", kind: "expense", group: "Marketing" },
  { name: "Influencer / Creator", kind: "expense", group: "Marketing" },
  { name: "Content & Photography", kind: "expense", group: "Marketing" },
  { name: "Printing & Branding", kind: "expense", group: "Marketing" },
  // Logistics
  { name: "Courier / Delivery Charge", kind: "expense", group: "Logistics" },
  { name: "Packaging Materials", kind: "expense", group: "Logistics" },
  { name: "Fuel & Transport", kind: "expense", group: "Logistics" },
  { name: "Warehouse Rent", kind: "expense", group: "Logistics" },
  // Purchases
  { name: "Inventory Purchase", kind: "expense", group: "Purchases" },
  { name: "Import Duty & Customs", kind: "expense", group: "Purchases" },
  { name: "Shipping (International)", kind: "expense", group: "Purchases" },
  { name: "Local Transport (LC)", kind: "expense", group: "Purchases" },
  // Software & Subscriptions
  { name: "Software Subscriptions", kind: "expense", group: "Subscriptions" },
  { name: "Hosting / Domain", kind: "expense", group: "Subscriptions" },
  { name: "SaaS Tools", kind: "expense", group: "Subscriptions" },
  // Finance / Banking
  { name: "Bank Charges", kind: "expense", group: "Finance" },
  { name: "Payment Gateway Fee", kind: "expense", group: "Finance" },
  { name: "Loan Interest", kind: "expense", group: "Finance" },
  { name: "Tax & VAT", kind: "expense", group: "Finance" },
  // Professional
  { name: "Legal & Consultancy", kind: "expense", group: "Professional" },
  { name: "Accounting / Audit", kind: "expense", group: "Professional" },
  // Other
  { name: "Travel & Meals", kind: "expense", group: "Other" },
  { name: "Donation / CSR", kind: "expense", group: "Other" },
  { name: "Miscellaneous", kind: "expense", group: "Other" },

  // Income
  { name: "Product Sales", kind: "income", group: "Sales" },
  { name: "Wholesale Sales", kind: "income", group: "Sales" },
  { name: "Shipping Income", kind: "income", group: "Sales" },
  { name: "Service Income", kind: "income", group: "Sales" },
  { name: "Refund / Reversal", kind: "income", group: "Other" },
  { name: "Interest Income", kind: "income", group: "Other" },
  { name: "Other Income", kind: "income", group: "Other" },
];

export const PRESET_GROUPS_EXPENSE = Array.from(
  new Set(CATEGORY_PRESETS.filter((p) => p.kind === "expense").map((p) => p.group)),
);
export const PRESET_GROUPS_INCOME = Array.from(
  new Set(CATEGORY_PRESETS.filter((p) => p.kind === "income").map((p) => p.group)),
);