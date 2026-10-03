import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { AuthForm } from "@/features/account/AuthForm";
import { safeNextPath } from "@/features/account/safe-next";

export const metadata: Metadata = { title: "Create your account" };

export default async function Page(props: PageProps<"/register">) {
  const next = safeNextPath((await props.searchParams).next);
  const query = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-muted">Keep your practice history and use it on any device. What you have practised so far is kept.</p>
      </div>
      <Card>
        <AuthForm mode="register" next={next} />
      </Card>
      <p className="text-sm text-muted">
        Already have an account? <Link href={`/login${query}`} className="font-medium text-brand">Sign in</Link>
      </p>
    </div>
  );
}
