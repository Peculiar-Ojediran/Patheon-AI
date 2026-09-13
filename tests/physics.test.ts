import assert from "node:assert/strict";
import test from "node:test";
import {
  density,
  ORBITALS,
  radialProbability,
  sampleOrbital,
  wavefunction,
} from "../src/lib/physics";
import type { OrbitalId } from "../src/lib/types";

const orbitals: OrbitalId[] = ["1s", "2p", "3d"];

test("radial probability distributions integrate to one and have the expected mean radius", () => {
  for (const orbital of orbitals) {
    let probability = 0;
    let expectedRadius = 0;
    const dr = 0.005;
    for (let r = dr / 2; r < 120; r += dr) {
      const mass = radialProbability(orbital, r) * dr;
      probability += mass;
      expectedRadius += mass * r;
    }
    assert.ok(
      Math.abs(probability - 1) < 1e-7,
      `${orbital} normalization: ${probability}`,
    );
    assert.ok(
      Math.abs(expectedRadius - ORBITALS[orbital].meanRadius) < 1e-7,
      `${orbital} mean: ${expectedRadius}`,
    );
    const peak = ORBITALS[orbital].radialPeak;
    assert.ok(
      radialProbability(orbital, peak) > radialProbability(orbital, peak + 0.1),
    );
    assert.ok(
      radialProbability(orbital, peak) > radialProbability(orbital, peak - 0.1),
    );
  }
});

test("real wavefunctions preserve symmetry, phase, and angular nodes", () => {
  assert.ok(Math.abs(density("1s", 0, 0, 0) - 1 / Math.PI) < 1e-12);
  assert.equal(density("1s", 3, 4, 0), density("1s", 0, 3, 4));
  assert.equal(wavefunction("2p", 3, 2, 0), 0);
  assert.equal(wavefunction("2p", 1, 2, 3), -wavefunction("2p", 1, 2, -3));
  assert.ok(Math.abs(wavefunction("3d", Math.sqrt(2), 0, 1)) < 1e-14);
  assert.ok(wavefunction("3d", 0, 0, 3) > 0);
  assert.ok(wavefunction("3d", 3, 0, 0) < 0);
  assert.equal(wavefunction("3d", 0, 0, 3), wavefunction("3d", 0, 0, -3));
  for (const orbital of orbitals) {
    assert.equal(wavefunction(orbital, 1e200, 0, 0), 0);
    assert.equal(radialProbability(orbital, 1e200), 0);
    assert.equal(radialProbability(orbital, -1), 0);
  }
});

test("volume density integrates over angles to radial probability", () => {
  const steps = 10000;
  for (const orbital of orbitals) {
    for (const radius of [0.5, 4, 11]) {
      let angularIntegral = 0;
      for (let index = 0; index < steps; index++) {
        const cosine = -1 + (2 * index + 1) / steps;
        angularIntegral +=
          (density(
            orbital,
            radius * Math.sqrt(1 - cosine * cosine),
            0,
            radius * cosine,
          ) *
            4 *
            Math.PI) /
          steps;
      }
      assert.ok(
        Math.abs(
          angularIntegral * radius * radius -
            radialProbability(orbital, radius),
        ) < 1e-8,
      );
    }
  }
});

test("samples are deterministic, finite, bounded, and carry the correct phase", () => {
  for (const orbital of orbitals) {
    const first = sampleOrbital(orbital, 500, 0);
    const repeat = sampleOrbital(orbital, 500, 0);
    assert.deepEqual(first, repeat);
    assert.notDeepEqual(
      first.positions,
      sampleOrbital(orbital, 500, 1).positions,
    );
    assert.equal(first.positions.length, 1500);
    for (let index = 0; index < first.count; index++) {
      const [x, y, z] = first.positions.slice(index * 3, index * 3 + 3);
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
      assert.ok(Math.hypot(x, y, z) <= first.radius);
      assert.equal(
        first.phases[index],
        Math.sign(wavefunction(orbital, x, y, z)),
      );
    }
  }
  assert.equal(sampleOrbital("1s", -100).count, 0);
  assert.equal(sampleOrbital("1s", NaN).count, 0);
  assert.equal(sampleOrbital("1s", Infinity).count, 0);
  assert.equal(sampleOrbital("1s", 12.8).count, 12);
  assert.equal(sampleOrbital("1s", 1000000).count, 60000);
});

test("sampled radial and angular moments match hydrogen probability, including the spherical Jacobian", () => {
  const angularSecondMoments = { "1s": 1 / 3, "2p": 3 / 5, "3d": 11 / 21 };
  for (const orbital of orbitals) {
    const sample = sampleOrbital(orbital, 50000, 923);
    let meanRadius = 0;
    let meanCosineSquared = 0;
    let meanZ = 0;
    for (let i = 0; i < sample.count; i++) {
      const x = sample.positions[i * 3];
      const y = sample.positions[i * 3 + 1];
      const z = sample.positions[i * 3 + 2];
      const radius = Math.hypot(x, y, z);
      meanRadius += radius / sample.count;
      meanCosineSquared += (z / radius) ** 2 / sample.count;
      meanZ += z / sample.count;
    }
    assert.ok(
      Math.abs(meanRadius / ORBITALS[orbital].meanRadius - 1) < 0.012,
      `${orbital} radius ${meanRadius}`,
    );
    assert.ok(
      Math.abs(meanCosineSquared - angularSecondMoments[orbital]) < 0.008,
      `${orbital} angular ${meanCosineSquared}`,
    );
    assert.ok(
      Math.abs(meanZ / meanRadius) < 0.02,
      `${orbital} symmetry ${meanZ}`,
    );
  }
});
