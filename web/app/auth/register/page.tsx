"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function Register() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName,
          email,
          password,
          confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Unable to create your account.");
        return;
      }

      sessionStorage.setItem(
        "yahzel_verification_user",
        JSON.stringify(data.user),
      );

      router.push("/auth/verification");
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
            Create your account
          </h1>

          <p className="mt-2 text-sm text-yz-neutral-600">
            Get started with Yahzel.
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
                htmlFor="fullName"
                className="mb-2 block text-sm font-semibold text-yz-ink"
              >
                Full Name
              </label>

              <input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="w-full border border-yz-neutral-300 bg-white px-4 py-3 text-sm text-yz-ink outline-none transition focus:border-yz-ink"
                placeholder="Your full name"
              />
            </div>

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
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full border border-yz-neutral-300 bg-white px-4 py-3 text-sm text-yz-ink outline-none transition focus:border-yz-ink"
                placeholder="Create a password"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-2 block text-sm font-semibold text-yz-ink"
              >
                Confirm Password
              </label>

              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full border border-yz-neutral-300 bg-white px-4 py-3 text-sm text-yz-ink outline-none transition focus:border-yz-ink"
                placeholder="Confirm your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-yz-ink px-4 py-3 text-sm font-bold text-white transition hover:bg-yz-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </div>

          <div className="mt-6 border-t border-yz-neutral-200 pt-6 text-center text-sm text-yz-neutral-600">
            Already have an account?{" "}
            <Link
              href="/auth/login"
              className="font-bold text-yz-ink hover:text-yz-accent"
            >
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}