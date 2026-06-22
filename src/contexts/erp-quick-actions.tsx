import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useBrand } from "@/contexts/brand-context";
import { useAccounts, useCategories } from "@/hooks/erp/use-finance-query";
import { TransactionForm } from "@/components/erp/finance/transaction-form";
import { TransferDialog } from "@/components/erp/finance/transfer-dialog";
import type { TxnType } from "@/lib/erp/finance";

type Ctx = {
  openTxn: (type: TxnType) => void;
  openTransfer: () => void;
};

const QuickActionsContext = createContext<Ctx | null>(null);

export function useErpQuickActions() {
  const ctx = useContext(QuickActionsContext);
  if (!ctx) throw new Error("useErpQuickActions must be used within ErpQuickActionsProvider");
  return ctx;
}

export function ErpQuickActionsProvider({ children }: { children: ReactNode }) {
  const { activeBrand, brands, brandIds, isAllBrands } = useBrand();
  const brandId = activeBrand?.id ?? null;
  const { data: accounts = [] } = useAccounts(brandIds);
  const { data: categories = [] } = useCategories(brandIds);

  const [txnOpen, setTxnOpen] = useState(false);
  const [txnType, setTxnType] = useState<TxnType>("expense");
  const [transferOpen, setTransferOpen] = useState(false);

  const openTxn = useCallback((t: TxnType) => {
    setTxnType(t);
    setTxnOpen(true);
  }, []);
  const openTransfer = useCallback(() => setTransferOpen(true), []);

  const value = useMemo(() => ({ openTxn, openTransfer }), [openTxn, openTransfer]);

  return (
    <QuickActionsContext.Provider value={value}>
      {children}
      {brandIds.length > 0 && (
        <>
          <TransactionForm
            open={txnOpen}
            onClose={() => setTxnOpen(false)}
            brandId={isAllBrands ? null : brandId}
            brands={brands}
            accounts={accounts}
            categories={categories}
            defaultType={txnType}
          />
          <TransferDialog
            open={transferOpen}
            onClose={() => setTransferOpen(false)}
            brandId={isAllBrands ? null : brandId}
            brands={brands}
            accounts={accounts}
          />
        </>
      )}
    </QuickActionsContext.Provider>
  );
}