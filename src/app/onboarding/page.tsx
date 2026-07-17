import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/supabase/queries";
import { HouseholdSetupForm } from "@/components/onboarding/household-setup-form";

export default async function OnboardingPage() {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) redirect("/login");
  if (profile) redirect("/");

  const defaultName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-8">
      <HouseholdSetupForm defaultName={defaultName} />
    </div>
  );
}
