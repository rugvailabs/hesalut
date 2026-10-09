"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";

export default function SiteHeader() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <header className="border-b border-gray-200 bg-white">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 text-sm">
        <Link href="/" className="font-semibold">
          hesalut
        </Link>
        <div className="flex items-center gap-4">
          {isLoading ? null : user ? (
            <>
              <Link href="/dashboard" className="hover:underline">
                Dashboard
              </Link>
              <Link href="/record" className="hover:underline">
                Record
              </Link>
              <Link href="/profile" className="hover:underline">
                Profile
              </Link>
              {user.is_admin && (
                <Link
                  href="/admin/review"
                  className="rounded bg-amber-100 px-2 py-0.5 text-amber-900 hover:bg-amber-200"
                >
                  Review queue
                </Link>
              )}
              <button type="button" onClick={handleLogout} className="hover:underline">
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:underline">
                Sign in
              </Link>
              <Link href="/signup" className="hover:underline">
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
