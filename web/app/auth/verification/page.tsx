"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

type VerificationUser = {
  id: number;
  fullName: string;
  email: string;
};

export default function VerificationPage() {
  const router = useRouter();

  const [user, setUser] = useState<VerificationUser | null>(null);
  const [otp, setOtp] = useState("");

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const stored = sessionStorage.getItem("yahzel_verification_user");

    if (!stored) {
      router.replace("/auth/login");
      return;
    }

    try {
      // The handoff value can only be read after mount: touching
      // sessionStorage during render would break hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(JSON.parse(stored));
    } catch {
      sessionStorage.removeItem("yahzel_verification_user");
      router.replace("/auth/login");
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      return;
    }

    setError("");
    setMessage("");

    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit verification code.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          otp,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Unable to verify your email.");
        return;
      }

      localStorage.setItem("yahzel_token", data.token);
      localStorage.setItem("yahzel_user", JSON.stringify(data.user));

      sessionStorage.removeItem("yahzel_verification_user");

      router.push("/dashboard");
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!user) {
      return;
    }

    setError("");
    setMessage("");
    setResending(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/verify/resend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Unable to resend the code.");
        return;
      }

      setMessage("A new verification code has been generated.");
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setResending(false);
    }
  }

  if (!user) {
    return null;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-yz-bg px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-6 text-2xl font-extrabold tracking-tight text-yz-ink">
            yahzel
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-yz-ink">
            Verify your email
          </h1>

          <p className="mt-2 text-sm leading-6 text-yz-neutral-600">
            We sent a 6-digit verification code to{" "}
            <span className="font-semibold text-yz-ink">{user.email}</span>.
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

          {message && (
            <div className="mb-5 border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {message}
            </div>
          )}

          <div>
            <label
              htmlFor="otp"
              className="mb-2 block text-sm font-semibold text-yz-ink"
            >
              Verification code
            </label>

            <input
              id="otp"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={otp}
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className="w-full border border-yz-neutral-300 bg-white px-4 py-3 text-center text-xl tracking-[0.4em] text-yz-ink outline-none transition focus:border-yz-ink"
              placeholder="000000"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-5 w-full bg-yz-ink px-4 py-3 text-sm font-bold text-white transition hover:bg-yz-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Verifying..." : "Verify email"}
          </button>

          <div className="mt-6 text-center">
            <p className="text-sm text-yz-neutral-600">
              Didn&apos;t receive a code?
            </p>

            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="mt-2 text-sm font-bold text-yz-ink hover:text-yz-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resending ? "Generating..." : "Resend verification code"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
