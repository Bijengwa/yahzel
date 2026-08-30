import type { SVGProps } from "react";

import type { Position, PositionNode } from "@/lib/hierarchy";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

/** A tight icon-only affordance — three actions, never five large buttons. */
function NodeAction({
  label,
  onClick,
  tone = "default",
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-6 w-6 items-center justify-center rounded-sm transition-colors duration-150 hover:bg-yz-neutral-200 ${
        tone === "danger"
          ? "text-yz-neutral-500 hover:text-yz-danger-ink"
          : "text-yz-neutral-500 hover:text-yz-ink"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * One box in the chart plus its subtree. The connector lines around it are
 * pure CSS (see globals.css's .org-tree rules) driven entirely by this
 * <li>/<ul> nesting — nothing here computes a pixel position.
 */
export function OrgChartNode({
  node,
  onAddChild,
  onEdit,
  onDelete,
}: {
  node: PositionNode;
  onAddChild: (parentId: number) => void;
  onEdit: (position: Position) => void;
  onDelete: (position: Position) => void;
}) {
  return (
    <li>
      <div className="flex w-[9.5rem] flex-col items-center gap-1 rounded-md border border-yz-neutral-300 bg-yz-panel px-3 py-2.5 text-center shadow-sm">
        <span className="line-clamp-2 text-[13px] leading-tight font-semibold text-yz-ink">
          {node.name}
        </span>

        <span className="flex items-center gap-0.5">
          <NodeAction label={`Add position under ${node.name}`} onClick={() => onAddChild(node.id)}>
            <Icon>
              <path d="M8 3v10M3 8h10" />
            </Icon>
          </NodeAction>

          <NodeAction label={`Edit ${node.name}`} onClick={() => onEdit(node)}>
            <Icon>
              <path d="M10.5 3.5 12.5 5.5 5 13H3v-2Z" />
            </Icon>
          </NodeAction>

          <NodeAction
            label={`Delete ${node.name}`}
            tone="danger"
            onClick={() => onDelete(node)}
          >
            <Icon>
              <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M4.5 4.5 5 13h6l.5-8.5" />
            </Icon>
          </NodeAction>
        </span>
      </div>

      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <OrgChartNode
              key={child.id}
              node={child}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
