export const POSITIONS_TABLE = "positions";

/**
 * A bare organisational position: a name and who it reports to. Nothing
 * here names a person — see migration 009_create_positions.ts for why that
 * is deliberate. Connecting people to positions is a separate future
 * feature.
 */
export type PositionRecord = {
  id: number;
  organisation_id: number;
  name: string;
  parent_position_id: number | null;
  created_at: string;
  updated_at: string;
};
