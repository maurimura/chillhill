import { defaultCar, type CarId } from '../config/cars.ts';
import { challengeDefaults, trafficCarIds, type ChallengeConfig } from '../config/challenge.ts';
import {
  initialState,
  stepDriving,
  type DrivingSettings,
  type DrivingState,
  type Input,
} from './driving.ts';
import { random, roadAt, type RouteSettings } from './route.ts';
import { touchDrivingSteer } from './touch-input.ts';
import { roadDeparture, sweptTrafficEncounter } from './collision.ts';
import {
  awardNearMiss,
  initialScore,
  resetScoreEncounter,
  stepDriftScore,
  stepScore,
  type RunScore,
} from './scoring.ts';
export { sweptTrafficCollision } from './collision.ts';

export type ChallengeSettings = DrivingSettings & RouteSettings;
export type ChallengePhase = 'racing' | 'crashed' | 'falling' | 'gameover';
export type ChallengeIncident = 'bounds' | 'traffic';

export interface TrafficVehicle {
  id: number;
  car: CarId;
  color: string;
  distance: number;
  offset: number;
  /** Positive metres/second along the vehicle's own forward direction. */
  speed: number;
  /** Right lane travels downhill (+1); left lane travels uphill (-1). */
  lane: -1 | 1;
  passed: boolean;
  /** Encounter state lives only as long as this bounded traffic instance. */
  seenAhead?: boolean;
  nearMissClose?: boolean;
  nearMissBlocked?: boolean;
  /** Speed when the close pass first qualified, never the later clearing speed. */
  nearMissSpeed?: number;
}

export interface ChallengeState {
  phase: ChallengePhase;
  lives: number;
  /** Legacy telemetry key; now counts close, collision-free passes in either direction. */
  overtakes: number;
  score: RunScore;
  phaseTime: number;
  recoveryProgress: number;
  graceRemaining: number;
  lastIncident: ChallengeIncident | null;
  incidentSpeed: number;
  incidentLateralSpeed: number;
  offRoad: OffRoadRecovery;
  traffic: TrafficVehicle[];
  /** Serial numbers keep recycled traffic deterministic without an ever-growing pool. */
  nextTrafficId: number;
}

export interface OffRoadRecovery {
  active: boolean;
  /** Which actual body edge crossed the road; the centre may still be inside. */
  side: -1 | 0 | 1;
  /** Metres outside the safe whole-car envelope, not distance from road centre. */
  excursion: number;
  /** Shared spent fraction across both verges; only safe driving can restore it. */
  exposure: number;
  /** Seconds remaining if the car stays at its current distance from the road. */
  remaining: number;
  /** Continuous on-road time, including the cooldown and gradual refill. */
  rejoinTime: number;
}

const initialOffRoad = (): OffRoadRecovery => ({
  active: false,
  side: 0,
  excursion: 0,
  exposure: 0,
  remaining: 0,
  rejoinTime: 0,
});

/** Shallow mistakes get time; increasingly wide departures burn the same budget faster. */
export function offRoadAllowance(
  excursion: number,
  config: Readonly<ChallengeConfig> = challengeDefaults,
) {
  const fraction = Math.max(0, Math.min(1, excursion / Math.max(0.01, config.offRoadRange)));
  const full = Math.max(0.1, config.offRoadSeconds);
  const shortest = Math.max(0.1, Math.min(full, config.offRoadMinSeconds));
  return full + (shortest - full) * fraction ** 1.25;
}

function stepOffRoad(
  recovery: OffRoadRecovery,
  overrun: number,
  dt: number,
  config: Readonly<ChallengeConfig>,
) {
  recovery.excursion = Math.max(0, overrun);
  if (overrun <= 0) {
    if (recovery.exposure > 0) {
      const previousTime = recovery.rejoinTime;
      recovery.rejoinTime += dt;
      if (recovery.rejoinTime + 1e-9 >= config.offRoadRejoinSeconds) recovery.active = false;
      const cooldown = Math.max(0, config.offRoadCooldownSeconds);
      // Only the part of this step AFTER the cooldown can refill the budget.
      // Crossing to the other verge resets this clock, not the spent budget.
      const refillTime =
        Math.max(0, recovery.rejoinTime - cooldown) - Math.max(0, previousTime - cooldown);
      recovery.exposure = Math.max(
        0,
        recovery.exposure - refillTime / Math.max(0.1, config.offRoadRefillSeconds),
      );
      recovery.remaining = (1 - recovery.exposure) * Math.max(0.1, config.offRoadSeconds);
      if (recovery.exposure < 1e-9) Object.assign(recovery, initialOffRoad());
    }
    return false;
  }
  recovery.active = true;
  recovery.rejoinTime = 0;
  const allowance = offRoadAllowance(overrun, config);
  recovery.exposure = Math.min(1, recovery.exposure + dt / allowance);
  if (overrun >= Math.max(0.01, config.offRoadRange)) recovery.exposure = 1;
  recovery.remaining = Math.max(0, (1 - recovery.exposure) * allowance);
  return recovery.exposure >= 1 - 1e-9;
}

const trafficColors = ['#cad5cb', '#dbb689', '#879ea8', '#b49bad', '#a5ad86', '#d2cac1'];

function spawnTraffic(
  challenge: ChallengeState,
  distance: number,
  lane: TrafficVehicle['lane'],
  settings: ChallengeSettings,
  config: Readonly<ChallengeConfig>,
): TrafficVehicle {
  const id = challenge.nextTrafficId++;
  const rng = random(Math.imul(settings.seed, 73856093) ^ Math.imul(id + 1, 19349663));
  return {
    id,
    car: trafficCarIds[Math.floor(rng() * trafficCarIds.length)],
    color: trafficColors[Math.floor(rng() * trafficColors.length)],
    distance,
    offset: (settings.roadWidth / 4) * lane,
    speed: (settings.maxSpeed / 3.6) * config.trafficSpeedRatio,
    lane,
    passed: false,
  };
}

function replenishTraffic(
  challenge: ChallengeState,
  driving: DrivingState,
  settings: ChallengeSettings,
  config: Readonly<ChallengeConfig>,
) {
  // Also recycle distant leaders if the player has stopped for a while. The
  // bounded pool can never leave the visible road permanently empty.
  const count = Math.max(0, Math.min(16, Math.trunc(config.trafficCount)));
  const horizon = config.firstTrafficDistance + Math.max(count, 1) * config.trafficSpacing * 1.8;
  challenge.traffic = challenge.traffic.filter(
    (vehicle) =>
      vehicle.distance > driving.distance - 45 && vehicle.distance < driving.distance + horizon,
  );
  if (challenge.traffic.length > count) challenge.traffic.length = count;
  while (challenge.traffic.length < count) {
    // Reserve slots for each direction: faster-recycling oncoming cars must
    // not gradually turn the entire pool into one direction of traffic.
    const left = challenge.traffic.filter((vehicle) => vehicle.lane === -1).length;
    const right = challenge.traffic.length - left;
    const lane =
      left < Math.floor(count / 2) && (right >= Math.ceil(count / 2) || left <= right) ? -1 : 1;
    // Oncoming traffic closes much faster. Prepare it farther ahead and leave
    // larger gaps in that stream so overtaking has a readable opening.
    let distance =
      driving.distance +
      config.firstTrafficDistance +
      (lane === -1 ? config.trafficSpacing * 1.5 : 0);
    const occupied = challenge.traffic
      .map((vehicle) => {
        const spacing =
          vehicle.lane === -1 && lane === -1 ? config.trafficSpacing * 2.5 : config.trafficSpacing;
        return { start: vehicle.distance - spacing, end: vehicle.distance + spacing };
      })
      .sort((a, b) => a.start - b.start);
    for (const interval of occupied) {
      if (interval.end <= distance) continue;
      if (interval.start >= distance) break;
      distance = interval.end;
    }
    challenge.traffic.push(spawnTraffic(challenge, distance, lane, settings, config));
  }
}

export function initialChallenge(
  settings: ChallengeSettings,
  driving: DrivingState = initialState(),
  config: Readonly<ChallengeConfig> = challengeDefaults,
): ChallengeState {
  const challenge: ChallengeState = {
    phase: 'racing',
    lives: Math.max(1, Math.trunc(config.lives)),
    overtakes: 0,
    score: initialScore(),
    phaseTime: 0,
    recoveryProgress: 0,
    graceRemaining: Math.max(0, config.graceSeconds),
    lastIncident: null,
    incidentSpeed: 0,
    incidentLateralSpeed: 0,
    offRoad: initialOffRoad(),
    traffic: [],
    nextTrafficId: 0,
  };
  replenishTraffic(challenge, driving, settings, config);
  return challenge;
}

function incident(challenge: ChallengeState, driving: DrivingState, reason: ChallengeIncident) {
  resetScoreEncounter(challenge.score);
  challenge.lives = Math.max(0, challenge.lives - 1);
  challenge.phase = reason === 'bounds' ? 'falling' : 'crashed';
  challenge.phaseTime = 0;
  challenge.recoveryProgress = 0;
  challenge.graceRemaining = 0;
  challenge.lastIncident = reason;
  challenge.offRoad.active = false;
  for (const vehicle of challenge.traffic) {
    if (vehicle.nearMissClose) vehicle.nearMissBlocked = true;
    vehicle.nearMissClose = false;
  }
  challenge.incidentSpeed = driving.speed;
  challenge.incidentLateralSpeed =
    Math.sign(driving.offset || 1) * Math.max(6.5, Math.abs(driving.lateralSpeed));
  // Gameplay motion stops at impact. A fall retains a short outward coast
  // below, and rendering samples the terrain under that position for height.
  driving.speed = 0;
  driving.lateralSpeed = 0;
  driving.yawVelocity = 0;
  driving.driftAmount = 0;
}

/** Restart at the current stretch without resetting odometer or near-miss score. */
export function respawnChallenge(
  challenge: ChallengeState,
  driving: DrivingState,
  settings: ChallengeSettings,
  config: Readonly<ChallengeConfig> = challengeDefaults,
) {
  if (challenge.lives <= 0) {
    challenge.phase = 'gameover';
    return;
  }
  const distance = driving.distance,
    travelled = driving.travelled;
  Object.assign(driving, initialState(), {
    distance,
    travelled,
    offset: settings.roadWidth / 4,
    headingOffset: 0,
  });
  challenge.phase = 'racing';
  challenge.phaseTime = 0;
  challenge.recoveryProgress = 0;
  challenge.graceRemaining = Math.max(0, config.graceSeconds);
  challenge.incidentSpeed = 0;
  challenge.incidentLateralSpeed = 0;
  challenge.offRoad = initialOffRoad();
  resetScoreEncounter(challenge.score);
  // Clearing a small safety bubble avoids a new life immediately overlapping
  // the same crashed vehicle. Existing distant traffic continues unchanged.
  challenge.traffic = challenge.traffic.filter(
    (vehicle) => Math.abs(vehicle.distance - distance) > 38,
  );
  replenishTraffic(challenge, driving, settings, config);
}

/**
 * Fixed-step challenge simulation. Call only while play is active; a zero dt
 * is an exact no-op, including grace/recovery timers and traffic movement.
 */
export function stepChallenge(
  challenge: ChallengeState,
  driving: DrivingState,
  input: Input,
  settings: ChallengeSettings,
  dt: number,
  config: Readonly<ChallengeConfig> = challengeDefaults,
) {
  if (!(dt > 0) || !Number.isFinite(dt) || challenge.phase === 'gameover') return;
  dt = Math.min(dt, 0.05);
  challenge.phaseTime += dt;
  if (challenge.phase !== 'racing') {
    if (challenge.phase === 'falling') {
      const forward = challenge.incidentSpeed * Math.exp(-challenge.phaseTime * 2) * dt;
      driving.distance += forward / roadAt(driving.distance, settings).metric;
      driving.travelled += forward;
      driving.offset += challenge.incidentLateralSpeed * Math.exp(-challenge.phaseTime * 0.7) * dt;
    }
    challenge.recoveryProgress = Math.min(
      1,
      challenge.phaseTime / Math.max(0.01, config.recoverySeconds),
    );
    if (challenge.recoveryProgress >= 1) {
      if (challenge.lives <= 0) challenge.phase = 'gameover';
      else respawnChallenge(challenge, driving, settings, config);
    }
    return;
  }

  const before = { ...driving };
  const wasOffRoad = challenge.offRoad.active;
  const road = roadAt(driving.distance, settings);
  const command = input.touch
    ? { ...input, steer: touchDrivingSteer(input.steer, driving, road.curvature) }
    : input;
  stepDriving(driving, command, settings, dt, road.curvature, road.metric, 'challenge');
  const wasProtected = challenge.graceRemaining > 0;
  challenge.graceRemaining = Math.max(0, challenge.graceRemaining - dt);
  const departure = roadDeparture(driving, settings.car ?? defaultCar, settings);
  const overrun = departure.excursion;
  challenge.offRoad.side = departure.side;
  const outside = overrun > 0;
  if (wasProtected) Object.assign(challenge.offRoad, initialOffRoad());
  const recoveryExpired = !wasProtected && stepOffRoad(challenge.offRoad, overrun, dt, config);
  const safePass = !wasProtected && !outside && !wasOffRoad && !challenge.offRoad.active;
  stepScore(
    challenge.score,
    dt,
    overrun,
    driving.speed * 3.6,
    driving.travelled - before.travelled,
    wasProtected,
  );
  const moving = Math.min(before.speed, driving.speed) * 3.6 >= config.nearMissMinSpeed;
  let collided = false;
  const completedNearMissSpeeds: number[] = [];
  for (const vehicle of challenge.traffic) {
    const previousDistance = vehicle.distance;
    vehicle.offset = (settings.roadWidth / 4) * vehicle.lane;
    vehicle.speed = (settings.maxSpeed / 3.6) * config.trafficSpeedRatio;
    vehicle.distance +=
      (vehicle.lane * vehicle.speed * dt) / roadAt(vehicle.distance, settings).metric;
    const encounter = sweptTrafficEncounter(
      before,
      driving,
      vehicle,
      previousDistance,
      settings.car,
      settings,
      vehicle.passed ? 0 : config.nearMissDistance,
    );
    if (!wasProtected && encounter.collided) collided = true;
    if (vehicle.passed) continue;
    vehicle.seenAhead ||= encounter.approached;
    // An invalid overlap poisons this encounter, even if grace ends or the
    // driver rejoins just before clearing it. Dirty pending passes cannot score.
    if ((encounter.alongside || vehicle.nearMissClose) && (!safePass || !moving))
      vehicle.nearMissBlocked = true;
    if (encounter.collided) vehicle.nearMissBlocked = true;
    if (
      encounter.close &&
      vehicle.seenAhead &&
      !vehicle.nearMissBlocked &&
      !vehicle.nearMissClose
    ) {
      vehicle.nearMissClose = true;
      vehicle.nearMissSpeed = Math.min(before.speed, driving.speed) * 3.6;
    }
    if (encounter.cleared) {
      vehicle.passed = true;
      if (safePass && moving && vehicle.nearMissClose && !vehicle.nearMissBlocked)
        completedNearMissSpeeds.push(
          vehicle.nearMissSpeed ?? Math.min(before.speed, driving.speed) * 3.6,
        );
    }
  }
  if (!wasProtected && (recoveryExpired || collided)) {
    incident(challenge, driving, collided ? 'traffic' : 'bounds');
    return;
  }

  // Any collision this step takes priority, including with a different car.
  // Use the same rear-slip signal as tire smoke, independently of visual density.
  stepDriftScore(challenge.score, dt, driving.driftAmount, driving.speed * 3.6, safePass);
  // Award only after the whole body clears; each traffic ID can score once.
  challenge.overtakes += completedNearMissSpeeds.length;
  for (const speed of completedNearMissSpeeds) awardNearMiss(challenge.score, speed);
  replenishTraffic(challenge, driving, settings, config);
}
