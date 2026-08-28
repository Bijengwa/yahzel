"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Unable to sign in.");
        return;
      }

      if (data.requiresVerification) {
        sessionStorage.setItem(
          "yahzel_verification_user",
          JSON.stringify(data.user),
        );

        router.push("/auth/verification");
        return;
      }

      localStorage.setItem("yahzel_token", data.token);
      localStorage.setItem("yahzel_user", JSON.stringify(data.user));

      router.push("/dashboard");
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-yz-bg px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-6 text-2xl font-extrabold tracking-tight text-yz-ink">
            yahzel
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-yz-ink">
            Welcome back
          </h1>

          <p className="mt-2 text-sm text-yz-neutral-600">
            Sign in to continue to Yahzel.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="border border-yz-neutral-300 bg-white p-6 sm:p-8"
        >
          {error && (
            <div className="mb-5 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-semibold text-yz-ink"
              >
                Email
              </label>

              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full border border-yz-neutral-300 bg-white px-4 py-3 text-sm text-yz-ink outline-none transition focus:border-yz-ink"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-semibold text-yz-ink"
              >
                Password
              </label>

              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full border border-yz-neutral-300 bg-white px-4 py-3 text-sm text-yz-ink outline-none transition focus:border-yz-ink"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-yz-ink px-4 py-3 text-sm font-bold text-white transition hover:bg-yz-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </div>

          <div className="mt-6 border-t border-yz-neutral-200 pt-6 text-center text-sm text-yz-neutral-600">
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/register"
              className="font-bold text-yz-ink hover:text-yz-accent"
            >
              Create an account
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}