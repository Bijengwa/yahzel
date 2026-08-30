import type { SVGProps } from "react";

import type { Department, HierarchyNode, Position } from "@/lib/hierarchy";

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

function ViewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M1.5 8S3.8 3 8 3s6.5 5 6.5 5-2.3 5-6.5 5-6.5-5-6.5-5Z" />
      <circle cx="8" cy="8" r="1.8" />
    </Icon>
  );
}

function DepartmentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="5.5" width="10" height="7.5" rx="1" />
      <path d="M6 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
    </Icon>
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
  onAddDepartment,
  onEditPosition,
  onDeletePosition,
  onViewDepartment,
  onEditDepartment,
  onDeleteDepartment,
}: {
  node: HierarchyNode;
  onAddChild: (parentId: number) => void;
  onAddDepartment: (parentPositionId: number) => void;
  onEditPosition: (position: Position) => void;
  onDeletePosition: (position: Position) => void;
  onViewDepartment: (department: Department) => void;
  onEditDepartment: (department: Department) => void;
  onDeleteDepartment: (department: Department) => void;
}) {
  return (
    <li>
      {node.kind === "department" ? (
        <div className="flex w-[10.5rem] flex-col items-center gap-1 rounded-md border border-yz-accent/40 bg-yz-accent/5 px-3 py-2.5 text-center shadow-sm">
          <span className="text-[9.5px] font-bold tracking-wide text-yz-accent uppercase">
            Department
          </span>

          <span className="line-clamp-2 text-[13px] leading-tight font-semibold text-yz-ink">
            {node.name}
          </span>

          <span className="text-[11px] leading-tight text-yz-neutral-600">
            Head: {node.headPositionName ?? "Unassigned"}
          </span>

          <span className="text-[11px] leading-tight text-yz-neutral-600">
            {node.memberCount} member{node.memberCount === 1 ? "" : "s"}
          </span>

          <span className="flex items-center gap-0.5">
            <NodeAction label={`View ${node.name}`} onClick={() => onViewDepartment(node)}>
              <ViewIcon />
            </NodeAction>

            <NodeAction label={`Edit ${node.name}`} onClick={() => onEditDepartment(node)}>
              <Icon>
                <path d="M10.5 3.5 12.5 5.5 5 13H3v-2Z" />
              </Icon>
            </NodeAction>

            <NodeAction
              label={`Delete ${node.name}`}
              tone="danger"
              onClick={() => onDeleteDepartment(node)}
            >
              <Icon>
                <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M4.5 4.5 5 13h6l.5-8.5" />
              </Icon>
            </NodeAction>
          </span>
        </div>
      ) : (
        <div className="flex w-[9.5rem] flex-col items-center gap-1 rounded-md border border-yz-neutral-300 bg-yz-panel px-3 py-2.5 text-center shadow-sm">
          <span className="line-clamp-2 text-[13px] leading-tight font-semibold text-yz-ink">
            {node.name}
          </span>

          <span className="flex items-center gap-0.5">
            <NodeAction
              label={`Add position under ${node.name}`}
              onClick={() => onAddChild(node.id)}
            >
              <Icon>
                <path d="M8 3v10M3 8h10" />
              </Icon>
            </NodeAction>

            <NodeAction
              label={`Add department under ${node.name}`}
              onClick={() => onAddDepartment(node.id)}
            >
              <DepartmentIcon />
            </NodeAction>

            <NodeAction label={`Edit ${node.name}`} onClick={() => onEditPosition(node)}>
              <Icon>
                <path d="M10.5 3.5 12.5 5.5 5 13H3v-2Z" />
              </Icon>
            </NodeAction>

            <NodeAction
              label={`Delete ${node.name}`}
              tone="danger"
              onClick={() => onDeletePosition(node)}
            >
              <Icon>
                <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M4.5 4.5 5 13h6l.5-8.5" />
              </Icon>
            </NodeAction>
          </span>
        </div>
      )}

      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <OrgChartNode
              key={`${child.kind}-${child.id}`}
              node={child}
              onAddChild={onAddChild}
              onAddDepartment={onAddDepartment}
              onEditPosition={onEditPosition}
              onDeletePosition={onDeletePosition}
              onViewDepartment={onViewDepartment}
              onEditDepartment={onEditDepartment}
              onDeleteDepartment={onDeleteDepartment}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
