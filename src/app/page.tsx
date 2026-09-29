import { redirect } from "next/navigation";
import { getSessionStaff } from "@/lib/auth";
import { homeFor } from "@/lib/permissions";

export default async function Home() {
  const staff = await getSessionStaff();
  redirect(staff ? homeFor(staff.role) : "/login");
}
