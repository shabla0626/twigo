import { redirect } from "next/navigation";

// Administrators and members share one sign-in page.
export default function AdminLoginRedirect() {
  redirect("/login?next=/admin");
}
