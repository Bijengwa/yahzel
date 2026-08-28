"use client";

import { assetUrl } from "@/lib/api";
import { initials } from "@/lib/format";

type AvatarProps = {
  fullName: string;
  src: string | null;
  size?: number;
  className?: string;
};

/**
 * Falls back to initials on the ink ground rather than a stock silhouette —
 * an empty avatar should still look like somebody, not like a missing file.
 */
export function Avatar({ fullName, src, size = 40, className = "" }: AvatarProps) {
  const url = assetUrl(src);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-yz-ink text-white select-none ${className}`}
      style={{ width: size, height: size }}
    >
      {url ? (
        // Uploads are served from the API host, so this stays a plain <img>
        // rather than going through the Next image optimiser.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="font-brand font-extrabold"
          style={{ fontSize: Math.max(11, Math.round(size * 0.36)) }}
        >
          {initials(fullName)}
        </span>
      )}
    </span>
  );
}
