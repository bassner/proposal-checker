import { auth } from "@/auth";
import { PrivacyContent } from "@/components/privacy-content";

export const metadata = {
  title: "Datenschutzerklärung / Privacy Policy - Proposal Checker",
};

export default async function PrivacyPage() {
  let isAuthenticated = false;
  try {
    const session = await auth();
    isAuthenticated = !!session?.user?.id;
  } catch {
    // Auth may throw on public page — default to unauthenticated
  }
  return <PrivacyContent isAuthenticated={isAuthenticated} />;
}
