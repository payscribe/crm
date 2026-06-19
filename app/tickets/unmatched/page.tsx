import { redirect } from "next/navigation";

export default function UnmatchedEmailRedirectPage() {
  redirect("/tickets");
}
