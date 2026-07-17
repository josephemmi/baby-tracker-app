import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/supabase/queries";
import { SignupForm } from "@/components/auth/signup-form";

export default async function SignupPage() {
  const { user, profile } = await getCurrentUserAndProfile();

  if (user && profile) redirect("/");
  if (user && !profile) redirect("/onboarding");

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-8">
      <SignupForm />
    </div>
  );
}
