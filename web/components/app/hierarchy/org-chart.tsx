import type { Department, HierarchyNode, Position } from "@/lib/hierarchy";
import { OrgChartNode } from "./org-chart-node";

/**
 * The organisation chart: every root node (position or department — an
 * organisation may have several of either at the top level, see
 * lib/hierarchy.ts's buildHierarchyTree) side by side, each with its subtree
 * beneath it. The horizontal-scroll wrapper is the one place a very wide
 * chart is allowed to overflow — inside its own box, never the page — at
 * every viewport, desktop and mobile alike (see globals.css's .org-tree
 * rules), so a deep, bushy tree stays usable without breaking the
 * surrounding layout on any screen size.
 */
export function OrgChart({
  roots,
  onAddChild,
  onAddDepartment,
  onEditPosition,
  onDeletePosition,
  onViewDepartment,
  onEditDepartment,
  onDeleteDepartment,
}: {
  roots: HierarchyNode[];
  onAddChild: (parentId: number) => void;
  onAddDepartment: (parentPositionId: number) => void;
  onEditPosition: (position: Position) => void;
  onDeletePosition: (position: Position) => void;
  onViewDepartment: (department: Department) => void;
  onEditDepartment: (department: Department) => void;
  onDeleteDepartment: (department: Department) => void;
}) {
  return (
    <div className="overflow-x-auto py-2">
      <div className="org-tree">
        <ul>
          {roots.map((root) => (
            <OrgChartNode
              key={`${root.kind}-${root.id}`}
              node={root}
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
      </div>
    </div>
  );
}
