/**
 * /account - the signed-in user's own profile.
 *
 * Read-only facts (email, role, member since) sit apart from the editable
 * form, so it is obvious which parts of an account a user can change
 * themselves and which are the system's to set.
 */

import ProfileForm from "@/components/ProfileForm";
import Card from "@/components/ui/Card";
import { getProfile } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<UserRole, string> = {
  customer: "Customer",
  business_owner: "Business owner",
  admin: "Administrator",
};

export default async function AccountPage(): Promise<JSX.Element> {
  await requireUser("/account");
  // Read through /profile rather than reusing the session lookup, so the page
  // shows what the server currently holds after an edit.
  const user = await getProfile();

  const memberSince = new Date(user.created_at);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Your account
      </h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        Update how businesses reach you.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-2">
          <h2 className="mb-3 font-semibold text-slate-900">Details</h2>
          <ProfileForm user={user} />
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Account
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium text-slate-700">Email</dt>
              <dd className="break-words text-slate-600">{user.email}</dd>
              <dd className="mt-0.5 text-xs text-slate-500">
                Used to sign in, so it cannot be changed here.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Role</dt>
              <dd className="text-slate-600">
                {ROLE_LABELS[user.role] ?? user.role}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700">Member since</dt>
              <dd className="text-slate-600">
                {Number.isNaN(memberSince.getTime())
                  ? user.created_at
                  : memberSince.toLocaleDateString("en-CA", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
