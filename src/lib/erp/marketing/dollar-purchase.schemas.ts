import { z } from "zod";

export const dollarPurchaseSchema = z.object({
  brandId: z.string().uuid().nullable().optional(),
  adAccountId: z.string().uuid(),
  paidFromAccountId: z.string().uuid(),
  purchaseDate: z.string().min(8),
  usdAmount: z.number().positive(),
  usdRate: z.number().positive(),
  feeBdt: z.number().min(0).default(0),
  paymentMethod: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  supplierName: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  attachmentUrl: z.string().optional().nullable(),
});

export const dollarPurchaseWithIdSchema = z
  .object({ id: z.string().uuid() })
  .and(dollarPurchaseSchema);

export const dollarPurchaseActionSchema = z.object({ id: z.string().uuid() });

export const dollarPurchaseReasonActionSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().optional(),
});

export const adAccountWalletDetailSchema = z.object({
  adAccountId: z.string().uuid(),
});