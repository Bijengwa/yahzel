export const POSITION_OCCUPANCIES_TABLE = "position_occupancies";

/**
 * A historical fact: this organisation member held this position, from
 * `starts_at` until `ends_at` (null while still current). Never
 * overwritten — ending an occupancy sets `ends_at` on the row; it is never
 * deleted and never repointed at somebody else. See migration
 * 012_create_position_occupancies.ts for why this lives in its own table
 * rather than as a field on `positions` (hierarchy.record.ts's own comment
 * already forbids that).
 */
export type PositionOccupancyRecord = {
  id: number;
  organisation_id: number;
  position_id: number;
  member_id: number;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};
