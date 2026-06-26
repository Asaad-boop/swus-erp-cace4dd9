# HRM Simplification Plan

## Akhon ki problem

Tinta alada "people" concept ache, eta confusion toiri korche:

```text
/erp/hr/staff       → App user (auth + role + brand access)        [1110 lines]
/erp/hr/employees   → HR record (profile, payroll, attendance)     [317 lines]
/erp/users          → Customer accounts                            [218 lines]
```

Ekjon real karmochari add korte gele teen jaygai teen rokom form fill korte hocche. Add Employee, Add Staff, Add User — sob alada flow, alada field, alada dialog. HR module-eo onek sub-pages (departments, designations, shifts, leave policy, holidays, payroll runs, reports) — onek gula khali ache ba use hoy na.

## Ki ki simplification korbo

### 1. "Add Person" — ekta unified wizard

Tinta add flow ke ekta 3-step dialog e merge korbo:

```text
Step 1: Basics       → Name, Phone, Email, Photo
Step 2: Access       → Role (or "No login"), Brand access
Step 3: Employment   → Department, Designation, Joining date, Salary
                       (optional — "Skip for now" button)
```

- Step 3 skip korle shudhu auth user create hobe (light staff)
- Sob step fill korle full employee record + auth + role ekshathe create hobe
- Backend e ekta server fn — `createPerson({ basics, access?, employment? })` — internally `createAppUser` + employee insert chain korbe

### 2. Navigation collapse

HR sidebar ekhon 12+ entries. 5 e namabo:

```text
HR Dashboard
People         (merged staff + employees, ek table, columns toggle)
Attendance     (muster + history ek page e tabs)
Leave          (requests + calendar tabs, policy settings e sore)
Payroll
─────────────
Settings       (departments, designations, shifts, holidays, leave policy — sob ekhane)
```

`/erp/users` (customer accounts) ke `/erp/customers` e move korbo — HR theke alada, naam-eo clear.

### 3. People table — ek jaygay shob

Single table with smart filters:
- Filter: `Type` = All / Staff (has login) / Employee (HR record) / Both
- Filter: Role, Department, Status (active/banned/left)
- Row click → unified detail drawer (tabs: Profile, Access, Employment, Activity)
- Bulk actions: change role, assign brand, deactivate

Ekhon-er duita alada page (`erp.hr.staff.tsx` 1110 lines + `erp.hr.employees.index.tsx` 317 lines) ke ekta page e merge korle ~600 lines e nama jabe.

### 4. Ki ki baad/hide korbo

- **Reports page** — jodi data sparse, hide. Numbers thakle dashboard e moove kore daa.
- **Leave Policy / Holidays / Designations** — alada top-level link na rekhe HR Settings tab e neshte daa
- **Shifts Assign** — Attendance page er moddhe inline kore daa
- Roles list (9 ta) review — `moderator` + `customer` baad dile 7 ta thakbe, dropdown choto hobe
- Memory rule onujayi: jei card/section e data nei, oita auto-hide korbo

## File-level moves

```text
NEW:    src/components/erp/hr/add-person-dialog.tsx       (3-step wizard)
NEW:    src/routes/_authenticated/erp.hr.people.tsx       (merged table)
NEW:    src/lib/erp/hr/person.functions.ts                (createPerson, updatePerson)

KEEP:   erp.hr.index, erp.hr.attendance, erp.hr.leave, erp.hr.payroll, erp.hr.settings
MERGE:  erp.hr.staff + erp.hr.employees.index → erp.hr.people
MOVE:   erp.hr.departments/designations/holidays/shifts/leave.policy → tabs inside erp.hr.settings
MOVE:   erp.users → erp.customers (out of HR scope)
DROP:   erp.hr.employees.new (replaced by dialog)
```

DB schema change kichu na — shudhu UI + server-fn composition.

## Rollout

1. People table + Add Person wizard build (alada route, parallel)
2. Settings page e tabs add kore departments/designations/etc inline
3. Sidebar navigation update + old routes redirect
4. Old files delete

Plan-e tomar feedback dao — kon part agei dhori, kichu rakhte chao, ba aro ki baad dite chao?