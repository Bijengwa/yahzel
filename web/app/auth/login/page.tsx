"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { TextField } from "@/components/ui/field";
import { AuthMessage, AuthShell, AuthSubmit } from "../auth-shell";

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
    <AuthShell
      title="Welcome back"
      description="Sign in to continue to Yahzel."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link
            href="/auth/register"
            className="font-bold text-yz-ink hover:text-yz-accent"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        {error && <AuthMessage tone="error">{error}</AuthMessage>}

        <div className="space-y-3">
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
          />

          <AuthSubmit loading={loading} loadingLabel="Signing in…">
            Sign in
          </AuthSubmit>
        </div>
      </form>
    </AuthShell>
  );
}
