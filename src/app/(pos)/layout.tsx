import { Rail } from "@/components/Rail";
import { canManage, getContext } from "@/lib/session";

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const { staff } = await getContext();
  const initials = staff.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <div className="flex min-h-screen">
      <Rail initials={initials || "?"} canManage={canManage(staff.role)} />
      <div className="grow min-w-0 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
    </div>
  );
}
