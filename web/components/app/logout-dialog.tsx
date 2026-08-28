"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { clearSession } from "@/lib/session";

/**
 * Signing out is one click away but never one click done — the confirmation
 * says plainly what happens next so nobody loses their place by accident.
 */
export function LogoutDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  function handleLogout() {
    setLeaving(true);
    clearSession();
    router.replace("/auth/login");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log out of Yahzel?"
      description="You will need to sign in again to access your account. Nothing on your profile changes."
    >
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={leaving}>
          Cancel
        </Button>

        <Button variant="primary" onClick={handleLogout} disabled={leaving}>
          {leaving ? "Logging out…" : "Log out"}
        </Button>
      </div>
    </Modal>
  );
}
