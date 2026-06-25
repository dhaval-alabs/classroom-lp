import { redirect } from "next/navigation";
import { isAdminAuthed } from "@/lib/adminauth";
import AdminDashboard from "./AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdminAuthed())) redirect("/admin/login");
  return <AdminDashboard />;
}
