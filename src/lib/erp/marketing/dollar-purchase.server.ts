export async function assertDollarPurchaseAccess(supabase: any, userId: string) {
  const [{ data: admin }, { data: ops }, { data: accountant }, { data: marketing }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "operations" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "accountant" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "marketing_manager" }),
  ]);

  if (!admin && !ops && !accountant && !marketing) {
    throw new Error("Not authorized");
  }
}