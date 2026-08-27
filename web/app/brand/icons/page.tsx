import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";

import { YahzelIcon } from "@/components/yahzel-icon";

export const metadata: Metadata = {
  title: "Yahzel icon files",
  description:
    "The nine symbol-only SVG files of the Yahzel mark, and when to reach for each.",
};

type Specimen = {
  file: string;
  description: ReactNode;
  /** Ground the mark is shown against — chosen to prove the file works there. */
  cell: string;
  name: string;
  note: string;
};

const LIGHT_CELL = {
  name: "text-[13px] font-bold",
  note: "text-[13px] leading-[1.5] text-[#6c6664]",
};

const SPECIMENS: Specimen[] = [
  {
    file: "yahzel-icon-black.svg",
    description:
      "Ink container, light Y. The default mark on white and light grounds.",
    cell: "bg-white",
    ...LIGHT_CELL,
  },
  {
    file: "yahzel-icon-white.svg",
    description: "Light container, ink Y. For dark grounds and photography.",
    cell: "bg-[#201e1d]",
    name: "text-[13px] font-bold text-[#f3f2f2]",
    note: "text-[13px] leading-[1.5] text-[#9b9694]",
  },
  {
    file: "yahzel-icon-red.svg",
    description: "Accent container, white Y. Use sparingly, one place per surface.",
    cell: "bg-white",
    ...LIGHT_CELL,
  },
  {
    file: "yahzel-icon-black-transparent-y.svg",
    description:
      "Ink container, Y knocked out to transparency — the ground shows through.",
    cell: "bg-[#e0dedc]",
    ...LIGHT_CELL,
  },
  {
    file: "yahzel-icon-white-transparent-y.svg",
    description: "Reversed knockout for dark grounds.",
    cell: "bg-[#3a3634]",
    name: "text-[13px] font-bold text-[#f3f2f2]",
    note: "text-[13px] leading-[1.5] text-[#a5a09e]",
  },
  {
    file: "yahzel-icon-currentcolor.svg",
    description: (
      <>
        Container inherits <b>currentColor</b>, Y transparent. For inline
        embedding in code.
      </>
    ),
    cell: "bg-white",
    ...LIGHT_CELL,
  },
  {
    file: "yahzel-app-icon-dark.svg",
    description:
      "Full-bleed dark tile, light mark inset with clear space. 1024 export ready.",
    cell: "bg-[#f3f2f2]",
    ...LIGHT_CELL,
  },
  {
    file: "yahzel-app-icon-light.svg",
    description: "White tile alternative for light-mode icon sets.",
    cell: "bg-[#f3f2f2]",
    ...LIGHT_CELL,
  },
];

function Caption({ spec }: { spec: Specimen }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className={spec.name}>{spec.file}</div>
      <div className={spec.note}>{spec.description}</div>
    </div>
  );
}

export default function IconFilesPage() {
  return (
    <div className="flex-1 bg-[#e6e4e3]">
      <div className="mx-auto my-12 w-[1280px] border-2 border-[#201e1d] bg-[#f3f2f2] font-brand text-[#201e1d]">
        <header className="flex flex-col gap-3 px-12 pt-12 pb-9">
          <div className="text-[13px] font-bold tracking-[0.18em] text-[#ec3013]">
            SVG FILES / SYMBOL ONLY
          </div>
          <h1 className="text-[44px] font-bold leading-none tracking-[0.02em]">
            Nine files, no wordmark
          </h1>
          <p className="max-w-[640px] text-base leading-6 text-pretty">
            All drawn from one geometry: a radiused hexagon path plus three
            tapered limb paths. No strokes to outline, no masks except where the
            Y must be transparent.
          </p>
        </header>

        <div className="h-0.5 bg-[#201e1d]" />

        <div className="grid grid-cols-3 gap-0.5 bg-[#201e1d]">
          {SPECIMENS.map((spec) => (
            <figure
              key={spec.file}
              className={`m-0 flex flex-col items-start gap-5 p-9 ${spec.cell}`}
            >
              {spec.file === "yahzel-icon-currentcolor.svg" ? (
                // Rendered through the React component rather than as an <img>:
                // an externally-loaded SVG can't inherit the page's color, so
                // this is the only cell that actually demonstrates currentColor.
                <YahzelIcon size={150} title={null} className="block" />
              ) : (
                <Image
                  src={`/brand/${spec.file}`}
                  alt=""
                  width={150}
                  height={150}
                  unoptimized
                  className="block h-[150px] w-[150px]"
                />
              )}
              <figcaption>
                <Caption spec={spec} />
              </figcaption>
            </figure>
          ))}

          <figure className="m-0 flex flex-col items-start gap-5 bg-[#f3f2f2] p-9">
            <div className="flex items-end gap-5">
              {[96, 32, 16].map((px) => (
                <Image
                  key={px}
                  src="/brand/yahzel-favicon-small-cut.svg"
                  alt=""
                  width={px}
                  height={px}
                  unoptimized
                  className="block"
                  style={{ width: px, height: px }}
                />
              ))}
            </div>
            <figcaption>
              <div className="flex flex-col gap-1.5">
                <div className="text-[13px] font-bold">
                  yahzel-favicon-small-cut.svg
                </div>
                <div className="text-[13px] leading-[1.5] text-[#6c6664]">
                  Limbs opened 3.4 units so the taper survives 24px and below.
                </div>
              </div>
            </figcaption>
          </figure>
        </div>
      </div>
    </div>
  );
}
