export type PedestrianDirection = 'both' | 'forward' | 'reverse' | 'none';

export interface PedestrianWayDecision {
  include: boolean;
  direction: PedestrianDirection;
  reason: string;
  highway: string | undefined;
}

export const PEDESTRIAN_PROFILE_VERSION = '2026-08-15-v2';

const PEDESTRIAN_HIGHWAYS = new Set(['pedestrian', 'footway', 'path', 'steps']);
const ROAD_HIGHWAYS = new Set([
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'residential',
  'living_street',
  'unclassified',
  'road',
]);
const EXPLICIT_FOOT_ALLOWED = new Set(['yes', 'designated', 'permissive']);
const FOOT_RESTRICTION_REASONS: Readonly<Record<string, string>> = {
  customers: 'foot-customers',
  destination: 'foot-destination',
  no: 'foot-no',
  private: 'foot-private',
  use_sidepath: 'foot-use-sidepath',
};
const ACCESS_RESTRICTION_REASONS: Readonly<Record<string, string>> = {
  customers: 'access-customers',
  destination: 'access-destination',
  no: 'access-no',
  private: 'access-private',
};
const INACTIVE_HIGHWAYS = new Set(['construction', 'proposed', 'disused', 'abandoned']);
const BLOCKING_BARRIERS = new Set([
  'fence',
  'wall',
  'retaining_wall',
  'hedge',
  'city_wall',
  'guard_rail',
  'jersey_barrier',
]);

const excluded = (tags: Readonly<Record<string, string>>, reason: string): PedestrianWayDecision => ({
  include: false,
  direction: 'none',
  reason,
  highway: tags.highway,
});

const footDirection = (tags: Readonly<Record<string, string>>): Exclude<PedestrianDirection, 'none'> => {
  const value = tags['oneway:foot']?.toLowerCase();
  if (value === 'yes' || value === '1' || value === 'true') return 'forward';
  if (value === '-1' || value === 'reverse') return 'reverse';
  return 'both';
};

const roadReason = (tags: Readonly<Record<string, string>>): string => {
  const sidewalk = tags.sidewalk?.toLowerCase();
  const sidewalkBoth = tags['sidewalk:both']?.toLowerCase();
  const sidewalkLeft = tags['sidewalk:left']?.toLowerCase();
  const sidewalkRight = tags['sidewalk:right']?.toLowerCase();
  const sidewalkValues = [sidewalk, sidewalkBoth, sidewalkLeft, sidewalkRight];
  if (sidewalkValues.includes('separate')) return 'walkable-road-separate-sidewalk';
  if (sidewalkValues.some((value) => ['both', 'left', 'right', 'yes', 'lane'].includes(value ?? ''))) {
    return 'walkable-road-sidewalk';
  }
  const explicitlyNoSidewalk = (value: string | undefined): boolean => value === 'no' || value === 'none';
  if (
    explicitlyNoSidewalk(sidewalk) ||
    explicitlyNoSidewalk(sidewalkBoth) ||
    (explicitlyNoSidewalk(sidewalkLeft) && explicitlyNoSidewalk(sidewalkRight))
  ) {
    return 'walkable-road-no-sidewalk';
  }
  return 'walkable-road';
};

/**
 * Conservative through-walking profile used by the bundled graph generator.
 * Precedence is lifecycle -> foot restriction -> physical barrier -> general
 * access restriction -> explicit foot override -> crossing/highway class.
 * Destination/customer-only ways are excluded because the compact graph does
 * not model endpoint-conditional access and must never use them as shortcuts.
 * Motor-vehicle `oneway` does not restrict walking; only `oneway:foot` does.
 */
export function evaluatePedestrianWay(tags: Readonly<Record<string, string>>): PedestrianWayDecision {
  const highway = tags.highway?.toLowerCase();
  const foot = tags.foot?.toLowerCase();
  const access = tags.access?.toLowerCase();
  const barrier = tags.barrier?.toLowerCase();
  const explicitFootAllowed = foot !== undefined && EXPLICIT_FOOT_ALLOWED.has(foot);

  if (
    !highway ||
    INACTIVE_HIGHWAYS.has(highway) ||
    tags.construction === 'yes' ||
    tags.proposed === 'yes' ||
    tags.disused === 'yes' ||
    tags.abandoned === 'yes'
  ) {
    return excluded(tags, highway ? 'inactive-highway' : 'unsupported-highway');
  }
  const footRestrictionReason = FOOT_RESTRICTION_REASONS[foot ?? ''];
  if (footRestrictionReason) return excluded(tags, footRestrictionReason);
  if (BLOCKING_BARRIERS.has(barrier ?? '')) return excluded(tags, 'barrier-blocking');
  if (barrier === 'gate' && !explicitFootAllowed) return excluded(tags, 'barrier-gate-unverified');
  const accessRestrictionReason = ACCESS_RESTRICTION_REASONS[access ?? ''];
  if (accessRestrictionReason && !explicitFootAllowed) {
    return excluded(tags, accessRestrictionReason);
  }

  const direction = footDirection(tags);
  if (explicitFootAllowed && (accessRestrictionReason || barrier === 'gate')) {
    return { include: true, direction, reason: 'explicit-foot-override', highway };
  }
  if (highway === 'crossing' || tags.footway === 'crossing' || tags.crossing) {
    return { include: true, direction, reason: 'legal-crossing', highway };
  }
  if (PEDESTRIAN_HIGHWAYS.has(highway)) {
    return { include: true, direction, reason: 'pedestrian-way', highway };
  }
  if (highway === 'service') {
    return { include: true, direction, reason: 'walkable-service', highway };
  }
  if (highway === 'track') {
    return { include: true, direction, reason: 'walkable-track', highway };
  }
  if (ROAD_HIGHWAYS.has(highway)) {
    return { include: true, direction, reason: roadReason(tags), highway };
  }
  return {
    include: false,
    direction: 'none',
    reason: 'unsupported-highway',
    highway: tags.highway,
  };
}
