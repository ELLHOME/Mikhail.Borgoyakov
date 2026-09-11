import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox, ContactShadows } from "@react-three/drei";
import * as THREE from "three";


/* Геометрия ноутбука в условных единицах сцены */
const SCREEN_W = 3.28;                 // ширина экрана
const SCREEN_H = SCREEN_W * 10 / 16;   // 16:10 — пропорции ноутбучной матрицы
const LID_W = SCREEN_W + 0.16;
const LID_H = SCREEN_H + 0.2;
const BASE_D = LID_H * 0.94;           // глубина корпуса
// Плюс, а не минус: при -PI/2 крышка откидывалась НАЗАД экраном вверх.
// Складываться она должна вперёд, на клавиатуру, экраном вниз.
const CLOSED = Math.PI / 2;            // крышка лежит на корпусе
const OPEN = -0.2;                     // раскрыта, с лёгким наклоном назад

const KB_COLS = 14;
const KB_ROWS = 5;
const KB_W = LID_W * 0.82;
const KB_D = BASE_D * 0.4;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
// плавный старт и плавный конец — без него крышка дёргается на границах
const smooth = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

/**
 * Раскладка одного проекта по его отрезку прокрутки:
 * крышка открывается, держится открытой, закрывается — и на закрытой
 * подменяется картинка, поэтому подмены не видно.
 */
function phase(t: number) {
  if (t < 0.3) return smooth(t / 0.3);            // открывается
  if (t < 0.72) return 1;                          // держится
  return 1 - smooth((t - 0.72) / 0.28);            // закрывается
}

/** Клавиши одним instancedMesh: 70 отдельных мешей стоили бы столько же
    вызовов отрисовки, а так — один. Без клавиш площадка читается плитой. */
function Keyboard() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = KB_COLS * KB_ROWS;
  useEffect(() => {
    if (!ref.current) return;
    const m = new THREE.Object3D();
    const kw = KB_W / KB_COLS, kd = KB_D / KB_ROWS;
    let i = 0;
    for (let r = 0; r < KB_ROWS; r++) {
      for (let c = 0; c < KB_COLS; c++) {
        m.position.set(
          -KB_W / 2 + kw * (c + 0.5),
          0.062,
          -BASE_D * 0.1 - KB_D / 2 + kd * (r + 0.5),
        );
        m.scale.set(kw * 0.82, 1, kd * 0.78);
        m.updateMatrix();
        ref.current.setMatrixAt(i++, m.matrix);
      }
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, [count]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow>
      <boxGeometry args={[1, 0.012, 1]} />
      <meshStandardMaterial color="#34383f" metalness={0.42} roughness={0.58} />
    </instancedMesh>
  );
}

function Laptop({
  imgs, getP,
}: { imgs: string[]; getP: () => number }) {
  const lid = useRef<THREE.Group>(null);
  const rig = useRef<THREE.Group>(null);
  const { gl } = useThree();

  // Скриншоты сайтов 1680×1225, а матрица 16:10 — берём верхнюю часть страницы:
  // это первый экран, самое показательное место.
  const textures = useMemo(() => {
    const loader = new THREE.TextureLoader();
    return imgs.map((src) => {
      const t = loader.load(src);
      t.colorSpace = THREE.SRGBColorSpace;
      const keep = (1680 * 10 / 16) / 1225;        // какую долю высоты оставляем
      t.repeat.set(1, keep);
      t.offset.set(0, 1 - keep);                   // прижимаем к верху кадра
      t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      return t;
    });
  }, [imgs, gl]);

  const screenMat = useRef<THREE.MeshBasicMaterial>(null);
  const shown = useRef(-1);

  // первая картинка должна встать сразу: если войти в секцию с уже открытой
  // крышкой, условие «менять только на закрытой» не срабатывало и экран белел
  useEffect(() => {
    if (screenMat.current && shown.current < 0) {
      const i = Math.min(imgs.length - 1, Math.max(0, Math.floor(getP())));
      shown.current = i;
      screenMat.current.map = textures[i];
      screenMat.current.needsUpdate = true;
    }
  }, [textures, imgs.length, getP]);

  useFrame((_, dt) => {
    const p = getP();                              // дробная позиция по всей ленте
    const i = Math.min(imgs.length - 1, Math.floor(p));
    const open = phase(p - i);

    if (lid.current) {
      const target = CLOSED + (OPEN - CLOSED) * open;
      lid.current.rotation.x += (target - lid.current.rotation.x) * Math.min(1, dt * 9);
    }
    // картинку меняем только когда крышка закрыта — подмена не видна
    if (screenMat.current && shown.current !== i && open < 0.06) {
      shown.current = i;
      screenMat.current.map = textures[i];
      screenMat.current.needsUpdate = true;
    }
    if (rig.current) {
      // еле заметный доворот по ходу ленты, чтобы объект жил
      const a = (p / imgs.length - 0.5) * 0.22;
      rig.current.rotation.y += (a - rig.current.rotation.y) * Math.min(1, dt * 4);
    }
  });

  return (
    <group ref={rig} position={[0, -0.5, 0]}>
      {/* корпус */}
      <RoundedBox args={[LID_W, 0.11, BASE_D]} radius={0.045} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color="#23262d" metalness={0.72} roughness={0.34} />
      </RoundedBox>
      {/* тачпад */}
      <mesh position={[0, 0.058, BASE_D * 0.26]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[LID_W * 0.3, BASE_D * 0.26]} />
        <meshStandardMaterial color="#2b2f37" metalness={0.5} roughness={0.45} />
      </mesh>
      {/* углубление под клавиатуру */}
      <mesh position={[0, 0.057, -BASE_D * 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[KB_W + 0.08, KB_D + 0.07]} />
        <meshStandardMaterial color="#171a20" metalness={0.35} roughness={0.7} />
      </mesh>
      <Keyboard />

      {/* крышка на петле у задней кромки */}
      <group ref={lid} position={[0, 0.055, -BASE_D / 2]} rotation={[CLOSED, 0, 0]}>
        <group position={[0, LID_H / 2, 0]}>
          <RoundedBox args={[LID_W, LID_H, 0.055]} radius={0.04} smoothness={4} castShadow>
            <meshStandardMaterial color="#23262d" metalness={0.72} roughness={0.34} />
          </RoundedBox>
          {/* сам экран */}
          <mesh position={[0, 0, 0.031]}>
            <planeGeometry args={[SCREEN_W, SCREEN_H]} />
            <meshBasicMaterial ref={screenMat} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}


/** Сцена вынесена отдельным файлом: three.js весит около 800 КБ,
    и в основном бандле ему делать нечего — он подгружается лениво,
    только когда секция подходит к экрану. */
/** Камера под форму кадра: на широком экране ноутбук уходит вправо,
    рядом с текстом; на узком — становится меньше и встаёт сверху,
    иначе он раздувается во весь экран и подписи ложатся поверх. */
function Rig({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    const narrow = aspect < 1.15;
    // расстояние считаем из угла обзора, а не подбираем: при узком кадре
    // горизонтальный угол сильно меньше вертикального, и ноутбук вылезал за края
    const vfov = (cam.fov * Math.PI) / 180;
    const needW = narrow ? LID_W + 0.9 : LID_W + 0.5;
    const needH = LID_H + 1.2;
    const dist = Math.max(
      needW / 2 / (Math.tan(vfov / 2) * aspect),
      needH / 2 / Math.tan(vfov / 2),
    ) * 1.05;
    const x = narrow ? 0 : 1.45;
    cam.position.set(narrow ? 0 : x * 0.24, dist * 0.27, dist);
    // на узком кадре смотрим ниже объекта: ноутбук уходит вверх, под него встаёт текст
    cam.lookAt(x, narrow ? -1.75 : 0.15, 0);
    cam.updateProjectionMatrix();
    if (g.current) g.current.position.x = x;
  }, [camera, size]);
  return <group ref={g}>{children}</group>;
}

export default function LaptopScene({ imgs, getP }: { imgs: string[]; getP: () => number }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      shadows
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0.35, 2.3, 8.6], fov: 26 }}
    >
      <color attach="background" args={["#eaeef5"]} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[3.2, 5.4, 3.6]} intensity={1.5} castShadow
        shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4, 2.4, -2]} intensity={0.5} color="#a8c4ff" />
      <Rig>
        <Suspense fallback={null}>
          <Laptop imgs={imgs} getP={getP} />
        </Suspense>
        <ContactShadows position={[0, -0.92, 0]} opacity={0.42} scale={9} blur={2.6} far={4} />
      </Rig>
    </Canvas>
  );
}
