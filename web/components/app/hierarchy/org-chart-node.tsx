import type { SVGProps } from "react";

import type { DepartmentSummary } from "@/lib/departments";
import type { Position, PositionNode } from "@/lib/hierarchy";

/** What the node needs to know about who (if anyone) occupies it. */
export type OccupancyDisplay = {
  /** null when the position is vacant. */
  occupantName: string | null;
  isHeadPosition: boolean;
};

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
  getOccupancy,
  getDepartment,
  onAddChild,
  onEdit,
  onDelete,
  onManageOccupant,
  onViewDepartment,
}: {
  node: PositionNode;
  getOccupancy: (positionId: number) => OccupancyDisplay;
  /** The department this position heads, if any. */
  getDepartment: (positionId: number) => DepartmentSummary | undefined;
  onAddChild: (parentId: number) => void;
  onEdit: (position: Position) => void;
  onDelete: (position: Position) => void;
  onManageOccupant: (position: Position) => void;
  onViewDepartment: (department: DepartmentSummary) => void;
}) {
  const occupancy = getOccupancy(node.id);
  const department = getDepartment(node.id);

  return (
    <li>
      <div className="flex w-[9.5rem] flex-col items-center gap-1 rounded-md border border-yz-neutral-300 bg-yz-panel px-3 py-2.5 text-center shadow-sm">
        {occupancy.isHeadPosition && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-yz-neutral-500">
            Organisation Head
          </span>
        )}

        <span className="line-clamp-2 text-[13px] leading-tight font-semibold text-yz-ink">
          {node.name}
        </span>

        {/* People are never their own tree node — this is a label on the
            position, not a second node. See occupancy.service.ts: a
            position's occupant is a fact about the position, not a place in
            the tree of its own. */}
        <button
          type="button"
          onClick={() => onManageOccupant(node)}
          className="rounded-sm text-[11.5px] leading-tight text-yz-neutral-600 hover:underline"
        >
          {occupancy.occupantName ? (
            <span className="font-semibold text-yz-ink">
              {occupancy.occupantName}
            </span>
          ) : (
            <span className="italic text-yz-neutral-500">Vacant</span>
          )}
        </button>

        {/* The department this position heads, shown ON the position — its
            members are seen through the department (this chip opens a members
            view), never as child tree nodes. Distinct from the occupant line
            and the Organisation Head badge above. */}
        {department && (
          <button
            type="button"
            onClick={() => onViewDepartment(department)}
            title={`View ${department.name} members`}
            className="max-w-full rounded-sm border border-yz-neutral-300 bg-yz-neutral-100 px-1.5 py-0.5 text-[10.5px] leading-tight font-semibold text-yz-neutral-700 transition-colors duration-150 hover:border-yz-ink hover:text-yz-ink"
          >
            <span className="line-clamp-1">
              Dept: {department.name} · {department.memberCount}{" "}
              {department.memberCount === 1 ? "person" : "people"}
            </span>
          </button>
        )}

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
            label={`Manage who occupies ${node.name}`}
            onClick={() => onManageOccupant(node)}
          >
            <Icon>
              <path d="M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
              <path d="M3.5 13c.5-2.5 2.3-4 4.5-4s4 1.5 4.5 4" />
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
              getOccupancy={getOccupancy}
              getDepartment={getDepartment}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              onManageOccupant={onManageOccupant}
              onViewDepartment={onViewDepartment}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
