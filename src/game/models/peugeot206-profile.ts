import type { Section } from '../vehicle-builder.ts';

// Original five-door 206, traced in proportions against Peugeot's May 2005
// elevation and checked against three real cars. Meters, forward = -Z.
// Feature coordinates are authored approximations, not manufacturer CAD.
export const peugeot206Cabin: Section[] = [
  { z: -0.917, width: 0.744, y: 0.938 },
  { z: -0.67, width: 0.704, y: 1.105 },
  { z: -0.36, width: 0.658, y: 1.303 },
  { z: -0.08, width: 0.649, y: 1.403 },
  { z: 0.29, width: 0.651, y: 1.432 },
  { z: 0.76, width: 0.659, y: 1.431 },
  { z: 1.12, width: 0.672, y: 1.411 },
  { z: 1.29, width: 0.687, y: 1.354 },
  { z: 1.54, width: 0.716, y: 1.184 },
  { z: 1.79, width: 0.747, y: 1.071 },
  { z: 1.855, width: 0.752, y: 1.04 },
];

// For feature sections, width = lower bound and y = upper bound.
// Rear door glass is rounded and nearly upright at its trailing edge, not a triangle.
export const peugeot206FrontWindow: Section[] = [
  { z: -0.766, width: 0.956, y: 0.981 },
  { z: -0.6, width: 0.953, y: 1.089 },
  { z: -0.33, width: 0.955, y: 1.254 },
  { z: -0.07, width: 0.959, y: 1.324 },
  { z: 0.22, width: 0.969, y: 1.349 },
  { z: 0.371, width: 0.976, y: 1.351 },
];
export const peugeot206RearWindow: Section[] = [
  { z: 0.475, width: 0.98, y: 1.351 },
  { z: 0.7, width: 0.989, y: 1.35 },
  { z: 0.95, width: 1.001, y: 1.338 },
  { z: 1.1, width: 1.026, y: 1.308 },
  { z: 1.155, width: 1.066, y: 1.266 },
  { z: 1.169, width: 1.135, y: 1.197 },
];

// Front-view lamp outline: z means height here, bounds are horizontal meters.
export const peugeot206Headlamp: Section[] = [
  { z: 0.655, width: 0.313, y: 0.4 },
  { z: 0.671, width: 0.307, y: 0.656 },
  { z: 0.705, width: 0.388, y: 0.754 },
  { z: 0.761, width: 0.539, y: 0.786 },
  { z: 0.817, width: 0.688, y: 0.784 },
  { z: 0.84, width: 0.752, y: 0.768 },
];

// One continuous lamp across the tail corner: z = perimeter fraction, bounds = heights.
export const peugeot206TailLamp: Section[] = [
  { z: 0, width: 0.72, y: 0.814 },
  { z: 0.13, width: 0.692, y: 0.895 },
  { z: 0.38, width: 0.701, y: 0.932 },
  { z: 0.6, width: 0.716, y: 0.944 },
  { z: 0.76, width: 0.774, y: 0.944 },
  { z: 0.93, width: 0.855, y: 0.936 },
  { z: 1, width: 0.899, y: 0.915 },
];
