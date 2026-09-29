import { db } from "@/lib/db";
import { getContext } from "@/lib/session";
import { UsersAdmin, type BranchRow, type UserRow } from "./UsersAdmin";

export default async function UsersPage() {
  const { staff } = await getContext("users.manage");
  const [users, branches] = await Promise.all([
    db.q<UserRow>(
      `select s.id, s.full_name, s.email, s.role, s.branch_id, s.is_active, b.name as branch_name, s.created_at
         from staff s left join branches b on b.id = s.branch_id
        where s.company_id = ?1
        order by s.is_active desc, s.full_name collate nocase`,
      [staff.company_id]
    ),
    db.q<BranchRow>("select id, name from branches where company_id = ?1 order by name", [staff.company_id]),
  ]);
  return <UsersAdmin users={users} branches={branches} currentId={staff.id} defaultBranchId={staff.branch_id} />;
}
