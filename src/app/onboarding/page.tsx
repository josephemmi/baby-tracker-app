import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/supabase/queries";
import { HouseholdSetupForm } from "@/components/onboarding/household-setup-form";

export default async function OnboardingPage() {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) redirect("/login");
  if (profile) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-8 dark:bg-black">
      <HouseholdSetupForm />
    </div>
  );
}
