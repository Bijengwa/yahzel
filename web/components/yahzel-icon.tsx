import type { SVGProps } from "react";

/**
 * The Yahzel mark: one radiused-hexagon container plus three tapered limb
 * paths. Every file in /public/brand is drawn from exactly this geometry —
 * keep the two in sync if the mark is ever retuned.
 */
const CONTAINER =
  "M54 4.309 L87.569 23.691 A8 8 0 0 1 91.569 30.619 L91.569 69.381 A8 8 0 0 1 87.569 76.309 L54 95.691 A8 8 0 0 1 46 95.691 L12.431 76.309 A8 8 0 0 1 8.431 69.381 L8.431 30.619 A8 8 0 0 1 12.431 23.691 L46 4.309 A8 8 0 0 1 54 4.309 Z";

const LIMBS = [
  "M40.5 46 Q45.4 67 45.5 88 A4.5 4.5 0 0 0 54.5 88 Q54.6 67 59.5 46 Z",
  "M52.2 60.1 Q65.8 44.6 82.1 33 A4.5 4.5 0 0 0 76.9 25.6 Q60.4 37 41.2 44.5 Z",
  "M47.8 60.1 Q34.2 44.6 17.9 33 A4.5 4.5 0 0 1 23.1 25.6 Q39.6 37 58.8 44.5 Z",
];

/**
 * The limbs overlap where they meet, so `fill-rule: evenodd` would leave
 * specks in the junction — the knockout has to come from a mask. The id is
 * fixed rather than generated so the component stays a Server Component with
 * no client JS, and every instance emits a byte-identical mask.
 *
 * One caveat: a duplicate id resolves to whichever mask comes first in the
 * document, and a mask inside a `display: none` subtree does not resolve at
 * all — the mark then paints as a solid block. When two instances can be on
 * one page and either might be hidden by a breakpoint, give at least one of
 * them its own `maskId`.
 */
const DEFAULT_MASK_ID = "yz-mark-knockout";

type YahzelIconProps = Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
  /** Rendered edge length in px. The mark is always square. */
  size?: number | string;
  /**
   * Accessible name. Pass `null` for decorative use next to a visible
   * "Yahzel" wordmark, which marks the icon `aria-hidden`.
   */
  title?: string | null;
  /**
   * `true` (default) knocks the Y out to transparency so the ground shows
   * through. Pass a colour instead to paint the Y — e.g. the surface colour
   * when the mark sits on a busy photograph.
   */
  knockout?: boolean | string;
  /**
   * Overrides the knockout mask id. Needed only when a page renders more than
   * one knockout mark and one of them can be hidden — see the note above.
   */
  maskId?: string;
};

export function YahzelIcon({
  size = 24,
  title = "Yahzel",
  knockout = true,
  maskId = DEFAULT_MASK_ID,
  ...props
}: YahzelIconProps) {
  const labelling =
    title === null
      ? ({ "aria-hidden": true } as const)
      : ({ role: "img", "aria-label": title } as const);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="currentColor"
      {...labelling}
      {...props}
    >
      {title !== null && <title>{title}</title>}

      {knockout === true ? (
        <>
          <defs>
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width="100"
              height="100"
            >
              <path d={CONTAINER} fill="#fff" />
              {LIMBS.map((d) => (
                <path key={d} d={d} fill="#000" />
              ))}
            </mask>
          </defs>
          <rect
            width="100"
            height="100"
            fill="currentColor"
            mask={`url(#${maskId})`}
          />
        </>
      ) : (
        <>
          <path d={CONTAINER} fill="currentColor" />
          {LIMBS.map((d) => (
            <path key={d} d={d} fill={knockout === false ? "#f3f2f2" : knockout} />
          ))}
        </>
      )}
    </svg>
  );
}

export default YahzelIcon;
