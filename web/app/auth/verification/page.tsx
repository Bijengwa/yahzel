"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { FieldLabel } from "@/components/ui/field";
import { AuthMessage, AuthShell, AuthSubmit } from "../auth-shell";

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
    <AuthShell
      title="Verify your email"
      description={
        <>
          We sent a 6-digit verification code to{" "}
          <span className="font-semibold text-yz-ink">{user.email}</span>.
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        {error && <AuthMessage tone="error">{error}</AuthMessage>}

        {message && <AuthMessage tone="ok">{message}</AuthMessage>}

        <FieldLabel htmlFor="otp">Verification code</FieldLabel>

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
          className="w-full rounded-sm border border-yz-neutral-300 bg-yz-panel px-3 py-2.5 text-center text-[20px] tracking-[0.4em] text-yz-ink outline-none transition-colors duration-150 focus:border-yz-ink"
          placeholder="000000"
        />

        <div className="mt-4">
          <AuthSubmit loading={loading} loadingLabel="Verifying…">
            Verify email
          </AuthSubmit>
        </div>

        <p className="mt-4 text-center text-[12.5px] text-yz-neutral-600">
          Didn&apos;t receive a code?{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="font-bold text-yz-ink hover:text-yz-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resending ? "Generating…" : "Resend it"}
          </button>
        </p>
      </form>
    </AuthShell>
  );
}
