import { useRef, useMemo, useEffect, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useTexture, Sparkles } from "@react-three/drei";
import { EffectComposer, Bloom, DepthOfField } from "@react-three/postprocessing";
import * as THREE from "three";

const BASE = import.meta.env.BASE_URL;
const NUMS = ["01", "02", "03", "04", "05", "06"];
const IMGS = NUMS.map((n) => `${BASE}works/${n}.webp`);
const VIDEO: Record<number, string> = { 0: `${BASE}works/monterra.mp4` };
const N = 6;
const W = 3.2;
const H = (W * 1225) / 1680;

// rounded-rectangle alpha mask so the textured planes have soft corners
function makeMask() {
  const cw = 512;
  const ch = Math.round((cw * H) / W);
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext("2d")!;
  const r = 40;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(cw, 0, cw, ch, r);
  ctx.arcTo(cw, ch, 0, ch, r);
  ctx.arcTo(0, ch, 0, 0, r);
  ctx.arcTo(0, 0, cw, 0, r);
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// winding path: front card (rel≈0) sits at the origin, others cascade & recede
function place(rel: number): [number, number, number, number] {
  const x = Math.sin(rel * 0.6) * 1.35;
  const y = -rel * 2.75;
  const z = -Math.abs(rel) * 2.5;
  const ry = -Math.sin(rel * 0.6) * 0.2 + rel * 0.04;
  return [x, y, z, ry];
}

function Scene({ onFocus }: { onFocus: (i: number) => void }) {
  const maps = useTexture(IMGS);
  const mask = useMemo(makeMask, []);

  // manual (non-suspending) video texture so the scene still renders if the codec is missing
  const video = useMemo(() => {
    const v = document.createElement("video");
    v.src = VIDEO[0];
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    (v as HTMLVideoElement & { autoplay: boolean }).autoplay = true;
    v.crossOrigin = "anonymous";
    v.style.position = "fixed";
    v.style.width = "1px";
    v.style.height = "1px";
    v.style.opacity = "0";
    v.style.pointerEvents = "none";
    return v;
  }, []);
  const vidTex = useMemo(() => {
    const t = new THREE.VideoTexture(video);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [video]);

  useEffect(() => {
    document.body.appendChild(video);
    video.play().catch(() => {});
    return () => { video.pause(); video.remove(); };
  }, [video]);

  useEffect(() => {
    maps.forEach((m) => {
      m.colorSpace = THREE.SRGBColorSpace;
      m.anisotropy = 8;
    });
  }, [maps]);

  const cardRefs = useRef<THREE.Mesh[]>([]);
  const glowRefs = useRef<THREE.Mesh[]>([]);
  const p = useRef(0);
  const target = useRef(0);
  const focus = useRef(-1);
  const dofTarget = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  useEffect(() => {
    const onScroll = () => {
      const sec = document.getElementById("lab");
      if (!sec) return;
      const range = sec.offsetHeight - window.innerHeight;
      const q = Math.min(1, Math.max(0, (window.scrollY - sec.offsetTop) / (range || 1)));
      target.current = q * (N - 1);
      const intro = document.getElementById("labIntro");
      if (intro) {
        const io = 1 - Math.min(1, q / 0.08);
        intro.style.opacity = String(io);
        intro.style.transform = `translateY(${-50 - (1 - io) * 20}%)`;
        intro.style.filter = io < 0.98 ? `blur(${(1 - io) * 5}px)` : "none";
        intro.style.pointerEvents = io < 0.05 ? "none" : "auto";
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useFrame(() => {
    p.current += (target.current - p.current) * 0.09;
    let fi = 0;
    let fmin = 1e9;
    for (let i = 0; i < N; i++) {
      const rel = i - p.current;
      const ar = Math.abs(rel);
      const [x, y, z, ry] = place(rel);
      const m = cardRefs.current[i];
      if (m) {
        m.position.set(x, y, z);
        m.rotation.set(0, ry, 0);
        (m.material as THREE.Material).opacity = Math.max(0, Math.min(1, 1.28 - ar * 0.42));
      }
      const g = glowRefs.current[i];
      if (g) {
        g.position.set(x, y, z - 0.03);
        g.rotation.set(0, ry, 0);
        (g.material as THREE.Material).opacity = Math.max(0, Math.min(1, 1 - ar * 1.25)) * 0.5;
      }
      if (ar < fmin) {
        fmin = ar;
        fi = i;
      }
    }
    if (fi !== focus.current) {
      focus.current = fi;
      onFocus(fi);
    }
  });

  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 6, 6]} intensity={1.3} />
      <pointLight position={[-5, -2, 4]} intensity={18} color="#5a86ff" distance={24} />
      <Sparkles count={70} scale={[16, 16, 7]} size={2.2} speed={0.22} opacity={0.3} color="#8cbcff" />
      {IMGS.map((_, i) => (
        <group key={i}>
          <mesh ref={(el) => (glowRefs.current[i] = el!)}>
            <planeGeometry args={[W * 1.02, H * 1.035]} />
            <meshBasicMaterial
              color="#5a9bff"
              transparent
              opacity={0}
              alphaMap={mask}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          <mesh ref={(el) => (cardRefs.current[i] = el!)}>
            <planeGeometry args={[W, H]} />
            <meshPhysicalMaterial
              map={i === 0 ? vidTex : maps[i]}
              alphaMap={mask}
              transparent
              roughness={0.5}
              metalness={0}
              clearcoat={0.85}
              clearcoatRoughness={0.35}
            />
          </mesh>
        </group>
      ))}
      <EffectComposer multisampling={4}>
        <DepthOfField target={dofTarget} focalLength={0.03} focusRange={0.22} bokehScale={1.5} resolutionScale={1} />
        <Bloom intensity={0.28} luminanceThreshold={0.92} luminanceSmoothing={0.25} mipmapBlur radius={0.4} />
      </EffectComposer>
    </>
  );
}

export default function LabScene({ onFocus }: { onFocus: (i: number) => void }) {
  return (
    <Canvas
      className="lab-canvas"
      camera={{ position: [0, 0, 6.3], fov: 38 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <Suspense fallback={null}>
        <Scene onFocus={onFocus} />
      </Suspense>
    </Canvas>
  );
}
