import type { OrbitalId } from "./types";

export interface OrbitalDefinition {
  label: string;
  name: string;
  n: number;
  l: number;
  m: number;
  description: string;
  equation: string;
  /** Sampling cutoff, in Bohr radii. This is not an orbital boundary. */
  radius: number;
  radialPeak: number;
  meanRadius: number;
}

export const ORBITALS: Record<OrbitalId, OrbitalDefinition> = {
  "1s": {
    label: "1s",
    name: "Ground-state orbital",
    n: 1,
    l: 0,
    m: 0,
    description: "A spherical ground state with no angular or radial nodes.",
    equation: "ψ₁₀₀ = e⁻ʳ / √π",
    radius: 9,
    radialPeak: 1,
    meanRadius: 1.5,
  },
  "2p": {
    label: "2pᶻ",
    name: "Dipolar orbital",
    n: 2,
    l: 1,
    m: 0,
    description:
      "Two opposite-phase lobes separated by a nodal plane at z = 0.",
    equation: "ψ₂₁₀ = z e⁻ʳᐟ² / (4√(2π))",
    radius: 24,
    radialPeak: 4,
    meanRadius: 5,
  },
  "3d": {
    label: "3dᶻ²",
    name: "Quadrupolar orbital",
    n: 3,
    l: 2,
    m: 0,
    description:
      "Two axial lobes and an opposite-phase equatorial ring, separated by conical nodes.",
    equation: "ψ₃₂₀ = (3z² − r²)e⁻ʳᐟ³ / (81√(6π))",
    radius: 42,
    radialPeak: 9,
    meanRadius: 10.5,
  },
};

export const PHYSICS_MODEL = {
  name: "Hydrogen · nonrelativistic Schrödinger model",
  units: "Distances in Bohr radii (a₀); wavefunctions in a₀⁻³ᐟ².",
  limitations:
    "Stationary, isolated hydrogen with a fixed nucleus (Z = 1). Points sample |ψ|²; they are not electron trajectories. Color indicates wavefunction sign. Rotation changes the view, not the state. Very small outer tails are truncated for display, and each orbital is fitted to the viewport. Guide lines are spatial references.",
  source:
    "https://openstax.org/books/university-physics-volume-3/pages/8-1-the-hydrogen-atom",
} as const;

/** Normalized real hydrogen wavefunction, with x, y, z in a₀. */
export function wavefunction(
  orbital: OrbitalId,
  x: number,
  y: number,
  z: number,
): number {
  const r = Math.hypot(x, y, z);
  // Beyond this range every supported state is below floating-point precision.
  // Guard before polynomial factors can overflow for extremely large inputs.
  if (!Number.isFinite(r) || r > 2500) return 0;
  if (orbital === "1s") return Math.exp(-r) / Math.sqrt(Math.PI);
  if (orbital === "2p")
    return (z * Math.exp(-r / 2)) / (4 * Math.sqrt(2 * Math.PI));
  return (
    ((3 * z * z - r * r) * Math.exp(-r / 3)) / (81 * Math.sqrt(6 * Math.PI))
  );
}

/** Probability per unit volume, a₀⁻³. It differs from radialProbability. */
export function density(
  orbital: OrbitalId,
  x: number,
  y: number,
  z: number,
): number {
  return wavefunction(orbital, x, y, z) ** 2;
}

/** Angle-integrated probability per unit radius, a₀⁻¹. Integral over r is 1. */
export function radialProbability(orbital: OrbitalId, r: number): number {
  if (!Number.isFinite(r) || r < 0 || r > 2500) return 0;
  if (orbital === "1s") return 4 * r ** 2 * Math.exp(-2 * r);
  if (orbital === "2p") return (r ** 4 * Math.exp(-r)) / 24;
  return (8 * r ** 6 * Math.exp((-2 * r) / 3)) / 98415;
}

/** A stable PRNG, including for a zero seed. Values are strictly between 0 and 1. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return (((value ^ (value >>> 14)) >>> 0) + 0.5) / 4294967296;
  };
}

export interface OrbitalSample {
  /** XYZ coordinates in a₀, without a visual scaling or density distortion. */
  positions: Float32Array;
  /** The sign of the real wavefunction: +1 or -1. */
  phases: Float32Array;
  count: number;
  radius: number;
}

/**
 * Sample the separable distribution r²|R_nl(r)|² |Y_l0(θ,φ)|² dr dΩ.
 * For these three n = l + 1 states, the radial distribution is Gamma(2l+3, n/2).
 * Integer-shape gamma sampling is exact; angular rejection uses cos θ uniform
 * on [-1,1], preserving the solid-angle measure. A finite radius truncates less
 * than 0.0003% probability for each state. No arbitrary lobe sculpting is used.
 */
export function sampleOrbital(
  orbital: OrbitalId,
  requestedCount: number,
  seed = 73421,
): OrbitalSample {
  const definition = ORBITALS[orbital];
  if (!definition) throw new RangeError("Unknown hydrogen orbital");
  const count = Number.isFinite(requestedCount)
    ? Math.max(0, Math.min(60000, Math.floor(requestedCount)))
    : 0;
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const shape = 2 * definition.l + 3;
  const scale = definition.n / 2;

  for (let index = 0; index < count; index++) {
    let radius: number;
    do {
      radius = 0;
      for (let k = 0; k < shape; k++) radius -= Math.log(random()) * scale;
    } while (radius > definition.radius);

    let cosine: number;
    let angular: number;
    do {
      cosine = 2 * random() - 1;
      angular =
        orbital === "1s"
          ? 1
          : orbital === "2p"
            ? cosine
            : (3 * cosine * cosine - 1) / 2;
    } while (random() > angular * angular);

    const phi = 2 * Math.PI * random();
    const perpendicularRadius = radius * Math.sqrt(1 - cosine * cosine);
    positions[index * 3] = perpendicularRadius * Math.cos(phi);
    positions[index * 3 + 1] = perpendicularRadius * Math.sin(phi);
    positions[index * 3 + 2] = radius * cosine;
    phases[index] = angular >= 0 ? 1 : -1;
  }
  return { positions, phases, count, radius: definition.radius };
}
