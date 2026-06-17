import { useCurrentRole, type AppRole } from "@/hooks/use-current-role";

/**
 * HR-specific role helpers. Wraps useCurrentRole and exposes the
 * permissions the HR module needs.
 *
 * Roles allowed for general HR access: admin, operations, accountant (read-only-ish).
 * Salary / payroll: admin + operations.
 * Leave approval: admin + operations.
 * Attendance marking: admin + operations + warehouse_staff.
 */
export function useHrAccess() {
  const { roles, isLoading, userId, isAdmin, hasRole, hasAnyRole } = useCurrentRole();

  const isOps = hasRole("operations" as AppRole);
  const isAccountant = hasRole("accountant" as AppRole);
  const isWarehouse = hasRole("warehouse_staff" as AppRole);

  const canAccess = isAdmin || isOps || isAccountant;
  const canSeeSalary = isAdmin || isOps;
  const canManagePayroll = isAdmin || isOps;
  const canApproveLeave = isAdmin || isOps;
  const canMarkAttendance = isAdmin || isOps || isWarehouse;
  const canManageDocuments = isAdmin || isOps;
  const canManageEmployees = isAdmin || isOps;
  const canDelete = isAdmin;

  return {
    userId,
    roles,
    isLoading,
    isAdmin,
    isOps,
    isAccountant,
    isWarehouse,
    canAccess,
    canSeeSalary,
    canManagePayroll,
    canApproveLeave,
    canMarkAttendance,
    canManageDocuments,
    canManageEmployees,
    canDelete,
    hasRole,
    hasAnyRole,
  };
}