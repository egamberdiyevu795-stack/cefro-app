import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { AuthForm } from "@/features/account/AuthForm";
import { safeNextPath } from "@/features/account/safe-next";

export const metadata: Metadata = { title: "Sign in" };

export default async function Page(props: PageProps<"/login">) {
  const next = safeNextPath((await props.searchParams).next);
  const query = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted">Sign in to keep your practice history on every device.</p>
      </div>
      <Card>
        <AuthForm mode="login" next={next} />
      </Card>
      <p className="text-sm text-muted">
        No account yet? <Link href={`/register${query}`} className="font-medium text-brand">Create one</Link>
      </p>
    </div>
  );
}
