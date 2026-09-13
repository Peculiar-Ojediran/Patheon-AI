"use client";

import { useEffect, useRef, useState } from "react";
import { Orbit, Rotate3D } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ORBITALS, sampleOrbital } from "@/lib/physics";
import type { OrbitalId } from "@/lib/types";

interface QuantumSceneProps {
  orbital: OrbitalId;
  playing: boolean;
  particleCount: number;
  resetKey: number;
  onReady?: (ready: boolean) => void;
}

const vertexShader = `
  attribute float phase;
  attribute float brightness;
  uniform float pointSize;
  uniform float viewportHeight;
  uniform float pixelRatio;
  varying vec3 pointColor;
  varying float pointBrightness;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(pointSize * viewportHeight / max(1.0, -viewPosition.z), 1.0, 14.0) * pixelRatio;
    pointColor = phase > 0.0 ? vec3(0.47, 1.0, 0.79) : vec3(0.20, 0.66, 0.73);
    pointBrightness = brightness;
  }
`;

const fragmentShader = `
  uniform float strength;
  varying vec3 pointColor;
  varying float pointBrightness;
  void main() {
    float radius = length(gl_PointCoord - 0.5) * 2.0;
    if (radius > 1.0) discard;
    float glow = exp(-radius * radius * 3.8) * (1.0 - smoothstep(0.7, 1.0, radius));
    gl_FragColor = vec4(pointColor, glow * strength * pointBrightness);
  }
`;

type SceneRuntime = { reset: () => void };

export default function QuantumScene({
  orbital,
  playing,
  particleCount,
  resetKey,
  onReady,
}: QuantumSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const axisLabelsRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const playingRef = useRef(playing);
  const readyCallbackRef = useRef(onReady);
  const [status, setStatus] = useState<
    "loading" | "ready" | "unavailable" | "lost"
  >("loading");

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    readyCallbackRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    runtimeRef.current?.reset();
  }, [resetKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let animationFrame = 0;
    let contextLost = false;
    let firstFrame = true;
    let needsRender = true;
    let previousTime = 0;
    let viewportWidth = 1;
    let viewportHeight = 1;
    let renderer: THREE.WebGLRenderer;
    readyCallbackRef.current?.(false);

    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        powerPreference: "high-performance",
      });
    } catch {
      animationFrame = requestAnimationFrame(() => {
        if (!disposed) setStatus("unavailable");
      });
      return () => {
        disposed = true;
        cancelAnimationFrame(animationFrame);
      };
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText =
      "display:block;width:100%;height:100%;outline-offset:-4px;cursor:grab;touch-action:none";
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute(
      "aria-label",
      `${ORBITALS[orbital].label} hydrogen orbital probability cloud. Drag to rotate, scroll to zoom. When focused, use arrow keys to rotate, plus or minus to zoom, and Home to reset.`,
    );
    container.appendChild(renderer.domElement);

    const definition = ORBITALS[orbital];
    const worldScale = definition.meanRadius;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      42,
      1,
      worldScale * 0.02,
      worldScale * 30,
    );
    camera.up.set(0, 0, 1);
    const initialPosition = new THREE.Vector3(0.65, -0.93, 0.32)
      .normalize()
      .multiplyScalar(worldScale * 4.95);
    camera.position.copy(initialPosition);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.55;
    controls.minDistance = worldScale * 2.4;
    controls.maxDistance = worldScale * 9;
    controls.minPolarAngle = 0.15;
    controls.maxPolarAngle = Math.PI - 0.15;
    controls.autoRotateSpeed = 0.35;
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const orbitalGroup = new THREE.Group();
    orbitalGroup.rotation.set(0.16, -0.3, 0);
    scene.add(orbitalGroup);
    const sample = sampleOrbital(orbital, particleCount);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(sample.positions, 3),
    );
    geometry.setAttribute("phase", new THREE.BufferAttribute(sample.phases, 1));
    const brightness = new Float32Array(sample.count);
    for (let index = 0; index < brightness.length; index++)
      brightness[index] = 0.45 + ((index * 13.735) % 1) * 0.55;
    geometry.setAttribute(
      "brightness",
      new THREE.BufferAttribute(brightness, 1),
    );

    function makePointMaterial(size: number, strength: number) {
      return new THREE.ShaderMaterial({
        uniforms: {
          pointSize: { value: size },
          viewportHeight: { value: 1 },
          pixelRatio: { value: renderer.getPixelRatio() },
          strength: { value: strength },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    }
    const pointMaterial = makePointMaterial(worldScale * 0.025, 0.85);
    const haloMaterial = makePointMaterial(worldScale * 0.082, 0.07);
    orbitalGroup.add(
      new THREE.Points(geometry, haloMaterial),
      new THREE.Points(geometry, pointMaterial),
    );

    // Spatial guides use the same physical coordinates as the probability samples.
    const guideMaterial = new THREE.LineDashedMaterial({
      color: 0x477d74,
      transparent: true,
      opacity: 0.24,
      dashSize: worldScale * 0.055,
      gapSize: worldScale * 0.045,
      depthWrite: false,
    });
    const axisMaterial = new THREE.LineBasicMaterial({
      color: 0x538477,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    const guideGeometries: THREE.BufferGeometry[] = [];
    for (const radius of [definition.radialPeak, definition.radialPeak * 1.8]) {
      const ringPoints = Array.from({ length: 161 }, (_, index) => {
        const angle = (index / 160) * Math.PI * 2;
        return new THREE.Vector3(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          0,
        );
      });
      const ringGeometry = new THREE.BufferGeometry().setFromPoints(ringPoints);
      guideGeometries.push(ringGeometry);
      const ring = new THREE.Line(ringGeometry, guideMaterial);
      ring.computeLineDistances();
      orbitalGroup.add(ring);
    }
    const axisExtent = worldScale * 2.35;
    const axisEnds = [
      new THREE.Vector3(axisExtent, 0, 0),
      new THREE.Vector3(0, axisExtent, 0),
      new THREE.Vector3(0, 0, axisExtent),
    ];
    for (const end of axisEnds) {
      const axisGeometry = new THREE.BufferGeometry().setFromPoints([
        end.clone().negate(),
        end,
      ]);
      guideGeometries.push(axisGeometry);
      orbitalGroup.add(new THREE.Line(axisGeometry, axisMaterial));
    }

    // Dim, non-data background markers provide depth; the data cloud is mint/teal.
    const starPositions = new Float32Array(220 * 3);
    for (let index = 0; index < starPositions.length; index++) {
      const fraction = Math.sin(index * 127.1 + 311.7) * 43758.5453;
      starPositions[index] =
        (fraction - Math.floor(fraction) - 0.5) * worldScale * 13;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(starPositions, 3),
    );
    const starMaterial = new THREE.PointsMaterial({
      color: 0x81a898,
      size: 1.25,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.23,
      depthWrite: false,
    });
    scene.add(new THREE.Points(starGeometry, starMaterial));

    function resize() {
      if (disposed) return;
      const bounds = container!.getBoundingClientRect();
      viewportWidth = Math.max(1, bounds.width);
      viewportHeight = Math.max(1, bounds.height);
      renderer.setSize(viewportWidth, viewportHeight, false);
      camera.aspect = viewportWidth / viewportHeight;
      camera.updateProjectionMatrix();
      pointMaterial.uniforms.viewportHeight.value = viewportHeight;
      haloMaterial.uniforms.viewportHeight.value = viewportHeight;
      needsRender = true;
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    function reset() {
      camera.position.copy(initialPosition);
      controls.target.set(0, 0, 0);
      controls.update(0);
      needsRender = true;
    }
    runtimeRef.current = { reset };

    function onKeyDown(event: KeyboardEvent) {
      const { key } = event;
      if (
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "+",
          "=",
          "-",
          "_",
          "Home",
        ].includes(key)
      )
        return;
      event.preventDefault();
      if (key === "Home") {
        reset();
        return;
      }
      const alignment = new THREE.Quaternion().setFromUnitVectors(
        camera.up,
        new THREE.Vector3(0, 1, 0),
      );
      const offset = camera.position
        .clone()
        .sub(controls.target)
        .applyQuaternion(alignment);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      if (key === "ArrowLeft") spherical.theta -= 0.12;
      if (key === "ArrowRight") spherical.theta += 0.12;
      if (key === "ArrowUp")
        spherical.phi = Math.max(controls.minPolarAngle, spherical.phi - 0.12);
      if (key === "ArrowDown")
        spherical.phi = Math.min(controls.maxPolarAngle, spherical.phi + 0.12);
      if (key === "+" || key === "=")
        spherical.radius = Math.max(
          controls.minDistance,
          spherical.radius * 0.9,
        );
      if (key === "-" || key === "_")
        spherical.radius = Math.min(
          controls.maxDistance,
          spherical.radius * 1.1,
        );
      camera.position.copy(
        new THREE.Vector3()
          .setFromSpherical(spherical)
          .applyQuaternion(alignment.invert())
          .add(controls.target),
      );
      controls.update(0);
      needsRender = true;
    }
    const onPointerDown = () => {
      renderer.domElement.style.cursor = "grabbing";
    };
    const onPointerUp = () => {
      renderer.domElement.style.cursor = "grab";
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      readyCallbackRef.current?.(false);
      setStatus("lost");
    };
    const onContextRestored = () => {
      contextLost = false;
      firstFrame = true;
      needsRender = true;
    };
    renderer.domElement.addEventListener("keydown", onKeyDown);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    renderer.domElement.addEventListener(
      "webglcontextrestored",
      onContextRestored,
    );

    const projected = new THREE.Vector3();
    const labels = axisLabelsRef.current?.children;
    function animate(time: number) {
      if (disposed) return;
      animationFrame = requestAnimationFrame(animate);
      const delta = previousTime
        ? Math.min((time - previousTime) / 1000, 0.05)
        : 0;
      previousTime = time;
      if (contextLost || document.hidden) return;
      // The parent disables initial autoplay for reduced motion. An explicit
      // press of Play remains available to people who choose to rotate the view.
      controls.autoRotate = playingRef.current;
      controls.enableDamping = !motionPreference.matches;
      const changed = controls.update(delta);
      if (!changed && !needsRender && !firstFrame) return;
      renderer.render(scene, camera);
      if (labels) {
        axisEnds.forEach((end, index) => {
          projected
            .copy(end)
            .applyMatrix4(orbitalGroup.matrixWorld)
            .project(camera);
          const label = labels[index] as HTMLElement;
          label.style.transform = `translate(${(projected.x * 0.5 + 0.5) * viewportWidth}px, ${(-projected.y * 0.5 + 0.5) * viewportHeight}px)`;
          label.style.opacity =
            projected.z > 1 ||
            Math.abs(projected.x) > 0.94 ||
            Math.abs(projected.y) > 0.9
              ? "0"
              : "1";
        });
      }
      needsRender = false;
      if (firstFrame) {
        firstFrame = false;
        setStatus("ready");
        readyCallbackRef.current?.(true);
      }
    }
    animationFrame = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      runtimeRef.current = null;
      renderer.domElement.removeEventListener("keydown", onKeyDown);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        onContextLost,
      );
      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        onContextRestored,
      );
      controls.dispose();
      geometry.dispose();
      pointMaterial.dispose();
      haloMaterial.dispose();
      guideGeometries.forEach((guide) => guide.dispose());
      guideMaterial.dispose();
      axisMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [orbital, particleCount]);

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      data-testid="quantum-scene"
      data-scene-status={status}
    >
      <div ref={containerRef} className="absolute inset-0" />
      <div
        ref={axisLabelsRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 font-mono text-[10px] text-[#789387]"
        style={{ opacity: status === "ready" ? 1 : 0 }}
      >
        <span className="absolute left-0 top-0 pl-2">x</span>
        <span className="absolute left-0 top-0 pl-2">y</span>
        <span className="absolute left-0 top-0 pl-2">z</span>
      </div>
      {status !== "ready" && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center"
          role="status"
          aria-live="polite"
        >
          {status === "loading" ? (
            <Orbit
              size={28}
              className="text-emerald-300/60 motion-safe:animate-spin"
              style={{ animationDuration: "8s" }}
            />
          ) : (
            <Rotate3D size={32} className="text-emerald-300/60" />
          )}
          <p className="text-sm text-slate-300">
            {status === "loading"
              ? "Preparing probability cloud…"
              : status === "lost"
                ? "3D view paused while the graphics context recovers."
                : "3D rendering isn’t available in this browser."}
          </p>
          {status !== "loading" && (
            <p className="max-w-xs text-xs leading-5 text-slate-500">
              {ORBITALS[orbital].description}{" "}
              {status === "unavailable"
                ? "Enable hardware acceleration or open a WebGL-capable browser to explore the model."
                : "The orbital parameters and research tools remain available."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
