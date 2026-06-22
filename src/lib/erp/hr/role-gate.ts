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
  const isHrAdmin = hasRole("hr_admin" as AppRole);
  const isHrManager = hasRole("hr_manager" as AppRole);
  const isAccountant = hasRole("accountant" as AppRole);
  const isWarehouse = hasRole("warehouse_staff" as AppRole);

  const canAccess = isAdmin || isHrAdmin || isHrManager || isOps || isAccountant;
  const canSeeSalary = isAdmin || isHrAdmin || isOps;
  const canManagePayroll = isAdmin || isHrAdmin || isOps;
  const canApproveLeave = isAdmin || isHrAdmin || isOps;
  const canMarkAttendance = isAdmin || isOps || isWarehouse;
  const canManageDocuments = isAdmin || isHrAdmin || isOps;
  const canManageEmployees = isAdmin || isHrAdmin || isOps;
  const canDelete = isAdmin;

  return {
    userId,
    roles,
    isLoading,
    isAdmin,
    isHrAdmin,
    isHrManager,
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