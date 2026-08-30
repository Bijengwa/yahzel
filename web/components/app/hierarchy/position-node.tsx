import { Button } from "@/components/ui/button";
import type { Position, PositionNode as PositionNodeType } from "@/lib/hierarchy";

/**
 * One position and its subtree, indented by depth. This is deliberately a
 * plain nested list, not a diagram library — the tree is usually shallow
 * (a handful of levels), and a list reflows correctly on narrow screens
 * where a canvas-style org chart would force horizontal scrolling.
 */
export function PositionNodeRow({
  node,
  depth,
  onAddChild,
  onEdit,
  onDelete,
}: {
  node: PositionNodeType;
  depth: number;
  onAddChild: (parentId: number) => void;
  onEdit: (position: Position) => void;
  onDelete: (position: Position) => void;
}) {
  return (
    <li>
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-yz-neutral-200 bg-yz-panel px-3 py-2"
        style={{ marginLeft: depth * 20 }}
      >
        <span className="min-w-0 truncate text-[13.5px] font-semibold text-yz-ink">
          {node.name}
        </span>

        <span className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onAddChild(node.id)}
          >
            + Add
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEdit(node)}
          >
            Edit
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDelete(node)}
          >
            Delete
          </Button>
        </span>
      </div>

      {node.children.length > 0 && (
        <ul className="mt-1 space-y-1">
          {node.children.map((child) => (
            <PositionNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
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
