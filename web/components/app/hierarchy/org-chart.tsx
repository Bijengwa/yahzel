import type { DepartmentSummary } from "@/lib/departments";
import type { Position, PositionNode as PositionNodeType } from "@/lib/hierarchy";
import { OrgChartNode, type OccupancyDisplay } from "./org-chart-node";

/**
 * The organisation chart: every root position side by side (an organisation
 * may have more than one — see lib/hierarchy.ts), each with its subtree
 * beneath it. The horizontal-scroll wrapper is the one place a very wide
 * desktop chart is allowed to overflow — inside its own box, never the page
 * — so a deep, bushy tree stays usable without breaking the surrounding
 * layout on any screen size. The inner tree is `min-w-max` so it keeps its
 * natural width and scrolls rather than shrinking or clipping.
 */
export function OrgChart({
  roots,
  getOccupancy,
  getDepartment,
  onAddChild,
  onEdit,
  onDelete,
  onManageOccupant,
  onViewDepartment,
}: {
  roots: PositionNodeType[];
  getOccupancy: (positionId: number) => OccupancyDisplay;
  getDepartment: (positionId: number) => DepartmentSummary | undefined;
  onAddChild: (parentId: number) => void;
  onEdit: (position: Position) => void;
  onDelete: (position: Position) => void;
  onManageOccupant: (position: Position) => void;
  onViewDepartment: (department: DepartmentSummary) => void;
}) {
  return (
    <div className="overflow-x-auto py-2">
      <div className="org-tree min-w-max">
        <ul>
          {roots.map((root) => (
            <OrgChartNode
              key={root.id}
              node={root}
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
      </div>
    </div>
  );
}
