import type { Position, PositionNode as PositionNodeType } from "@/lib/hierarchy";
import { OrgChartNode } from "./org-chart-node";

/**
 * The organisation chart: every root position side by side (an organisation
 * may have more than one — see lib/hierarchy.ts), each with its subtree
 * beneath it. The horizontal-scroll wrapper is the one place a very wide
 * desktop chart is allowed to overflow — inside its own box, never the page
 * — so a deep, bushy tree stays usable without breaking the surrounding
 * layout on any screen size.
 */
export function OrgChart({
  roots,
  onAddChild,
  onEdit,
  onDelete,
}: {
  roots: PositionNodeType[];
  onAddChild: (parentId: number) => void;
  onEdit: (position: Position) => void;
  onDelete: (position: Position) => void;
}) {
  return (
    <div className="overflow-x-auto py-2">
      <div className="org-tree">
        <ul>
          {roots.map((root) => (
            <OrgChartNode
              key={root.id}
              node={root}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
