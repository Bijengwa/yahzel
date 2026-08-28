"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: number;
  fullName: string;
  email: string;
};

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("yahzel_token");
    const storedUser = localStorage.getItem("yahzel_user");

    if (!token || !storedUser) {
      router.replace("/auth/login");
      return;
    }

    try {
      setUser(JSON.parse(storedUser));
    } catch {
      localStorage.removeItem("yahzel_token");
      localStorage.removeItem("yahzel_user");
      router.replace("/auth/login");
    }
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("yahzel_token");
    localStorage.removeItem("yahzel_user");

    router.replace("/auth/login");
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-yz-bg">
      <header className="border-b border-yz-neutral-300 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="text-xl font-extrabold tracking-tight text-yz-ink">
            yahzel
          </div>

          <button
            onClick={handleLogout}
            className="text-sm font-bold text-yz-ink hover:text-yz-accent"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="border border-yz-neutral-300 bg-white p-8">
          <p className="text-sm font-semibold text-yz-accent">DASHBOARD</p>

          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-yz-ink">
            Welcome, {user.fullName}
          </h1>

          <p className="mt-3 text-sm text-yz-neutral-600">
            You are authenticated and your email has been verified.
          </p>

          <div className="mt-8 border-t border-yz-neutral-200 pt-6">
            <p className="text-sm text-yz-neutral-600">Signed in as</p>

            <p className="mt-1 font-semibold text-yz-ink">{user.email}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
