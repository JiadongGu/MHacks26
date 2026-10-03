// Live vitals access. This is the only file that knows where the live pool is.
// The live pool (SpacetimeDB) is not wired yet, so every function here returns an empty result.
// To wire it, change the body of getSeries. The dashboard does not change.

export type VitalPoint = {
  /** ISO 8601 time. */
  ts: string;
  value: number;
};

export type SeriesOptions = {
  metric?: "heart_rate";
  /** Window length in minutes. */
  windowMin?: number;
  /** Bucket size in minutes. */
  bucketMin?: number;
};

/** Returns the heart rate series for a user, oldest first. Returns [] when no data exists. */
export async function getSeries(
  userId: string,
  options: SeriesOptions = {},
): Promise<VitalPoint[]> {
  void userId;
  void options;
  return [];
}
