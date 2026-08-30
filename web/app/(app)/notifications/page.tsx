import type { Metadata } from "next";

import { NotificationsScreen } from "@/components/app/notifications/notifications-screen";

export const metadata: Metadata = {
  title: "Notifications",
};

export default function NotificationsPage() {
  return <NotificationsScreen />;
}
