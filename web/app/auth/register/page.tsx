"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { TextField } from "@/components/ui/field";
import { AuthMessage, AuthShell, AuthSubmit } from "../auth-shell";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function Register() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [invited, setInvited] = useState(false);

  /**
   * An organisation invitation sent to somebody with no Yahzel account links
   * here carrying the address it was sent to. Registering with that address
   * is what makes the waiting invitation theirs to answer — it never accepts
   * it for them.
   */
  useEffect(() => {
    const invitedEmail = new URLSearchParams(window.location.search).get(
      "email",
    );

    if (invitedEmail) {
      // Reading the URL can only happen after mount; doing it during render
      // would break hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEmail(invitedEmail);
      setInvited(true);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!agreed) {
      setError("Please agree to the Terms & Conditions to continue.");
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
    <AuthShell
      title="Create your account"
      description="Get started with Yahzel."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="font-bold text-yz-ink hover:text-yz-accent"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        {error && <AuthMessage tone="error">{error}</AuthMessage>}

        {invited && (
          <AuthMessage tone="ok">
            You were invited to an organisation. Register with this address and
            the invitation will be waiting for you inside Yahzel.
          </AuthMessage>
        )}

        <div className="space-y-3">
          <TextField
            id="fullName"
            name="fullName"
            type="text"
            label="Full name"
            autoComplete="name"
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Your full name"
          />

          <TextField
            id="email"
            name="email"
            type="email"
            label="Email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />

          <TextField
            id="password"
            name="password"
            type="password"
            label="Password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a password"
          />

          <TextField
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            label="Confirm password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm your password"
          />

          <label
            htmlFor="terms"
            className="flex items-start gap-2.5 text-[12.5px] leading-5 text-yz-neutral-700"
          >
            <input
              id="terms"
              name="terms"
              type="checkbox"
              required
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--yz-accent)]"
            />

            <span>
              I agree to the{" "}
              <Link
                href="/legal/terms"
                className="font-bold text-yz-ink underline underline-offset-2 hover:text-yz-accent"
              >
                Terms &amp; Conditions
              </Link>
              .
            </span>
          </label>

          <AuthSubmit loading={loading} loadingLabel="Creating account…">
            Create account
          </AuthSubmit>
        </div>
      </form>
    </AuthShell>
  );
}
