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

const KB_COLS = 14;   // ширина ряда в условных единицах клавиши
const KB_ROWS = 5;

/** Раскладка: ширины в единицах клавиши, сумма каждого ряда = KB_COLS.
    Одна таблица кормит и рельеф, и текстуру с буквами — иначе надписи
    разъезжаются с клавишами при любой правке. */
const KEY_ROWS: { w: number; t: string }[][] = [
  "` 1 2 3 4 5 6 7 8 9 0 - = ⌫".split(" ").map((t) => ({ w: 1, t })),
  "⇥ Q W E R T Y U I O P [ ] \\".split(" ").map((t) => ({ w: 1, t })),
  "⇪ A S D F G H J K L ; ' ⏎".split(" ").map((t, i, a) =>
    ({ w: i === a.length - 1 ? 2 : 1, t })),
  "⇧ Z X C V B N M , . / ⇧".split(" ").map((t, i, a) =>
    ({ w: i === 0 || i === a.length - 1 ? 1.5 : 1, t })),
  [
    { w: 1.3, t: "ctrl" }, { w: 1.3, t: "alt" }, { w: 1.3, t: "⌘" },
    { w: 6, t: "" }, { w: 1.3, t: "⌘" }, { w: 1.3, t: "alt" },
    { w: 0.75, t: "◂" }, { w: 0.75, t: "▸" },
  ],
];
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
/** Надписи одной текстурой: рисуем их на холсте по той же раскладке
    и кладём плёнкой поверх клавиш. Семьдесят отдельных надписей стоили бы
    семьдесят вызовов отрисовки, а так — один. */
function makeLegends() {
  const cw = 2048;
  const ch = Math.round((cw * KB_D) / KB_W);
  const c = document.createElement("canvas");
  c.width = cw; c.height = ch;
  const ctx = c.getContext("2d")!;
  const unit = cw / KB_COLS, rowH = ch / KB_ROWS;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(226,232,242,.92)";
  KEY_ROWS.forEach((row, r) => {
    let u = 0;
    row.forEach((k) => {
      if (k.t) {
        const size = k.t.length > 1 ? rowH * 0.24 : rowH * 0.38;
        ctx.font = `500 ${size}px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillText(k.t, (u + k.w / 2) * unit, (r + 0.5) * rowH);
      }
      u += k.w;
    });
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Keyboard() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = useMemo(() => KEY_ROWS.reduce((n, r) => n + r.length, 0), []);
  const legends = useMemo(makeLegends, []);
  useEffect(() => {
    if (!ref.current) return;
    const m = new THREE.Object3D();
    const unit = KB_W / KB_COLS, kd = KB_D / KB_ROWS;
    let i = 0;
    KEY_ROWS.forEach((row, r) => {
      let u = 0;
      row.forEach((k) => {
        m.position.set(
          -KB_W / 2 + unit * (u + k.w / 2),
          0.062,
          -BASE_D * 0.1 - KB_D / 2 + kd * (r + 0.5),
        );
        m.scale.set(unit * k.w * 0.88, 1, kd * 0.8);
        m.updateMatrix();
        ref.current!.setMatrixAt(i++, m.matrix);
        u += k.w;
      });
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [count]);
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow>
        <boxGeometry args={[1, 0.012, 1]} />
        <meshStandardMaterial color="#34383f" metalness={0.42} roughness={0.58} />
      </instancedMesh>
      <mesh position={[0, 0.0695, -BASE_D * 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[KB_W, KB_D]} />
        <meshBasicMaterial map={legends} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
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
  const wrongSince = useRef(0);

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
    // Картинку меняем, когда крышка закрыта — подмена не видна.
    // Но если прокрутку дёрнули резко, закрытые мгновения проскакивают и на
    // экране остаётся чужой проект. Поэтому есть срок: провисела неправильная
    // картинка полсекунды — меняем всё равно, пусть и заметно.
    if (screenMat.current && shown.current !== i) {
      const now = performance.now();
      if (!wrongSince.current) wrongSince.current = now;
      if (open < 0.12 || now - wrongSince.current > 450) {
        shown.current = i;
        screenMat.current.map = textures[i];
        screenMat.current.needsUpdate = true;
        wrongSince.current = 0;
      }
    } else if (wrongSince.current) {
      wrongSince.current = 0;
    }
    if (rig.current) {
      // Ноутбук поворачивается вокруг своей оси по ходу всей ленты:
      // от +26° в начале до -26° в конце. Раньше амплитуда была 6° —
      // это не читалось как поворот вовсе.
      const yaw = (0.5 - p / imgs.length) * 0.92;
      rig.current.rotation.y += (yaw - rig.current.rotation.y) * Math.min(1, dt * 3.5);
      // и лёгкий подъём носа, пока крышка открыта
      const tilt = -0.06 * open;
      rig.current.rotation.x += (tilt - rig.current.rotation.x) * Math.min(1, dt * 3.5);
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

      {/* Сама петля. Без неё между корпусом и крышкой оставался просвет:
          у обеих деталей скруглённые рёбра, и они соприкасались только углами. */}
      <mesh position={[0, 0.055, -BASE_D / 2]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.058, 0.058, LID_W * 0.99, 24]} />
        <meshStandardMaterial color="#1b1e24" metalness={0.6} roughness={0.42} />
      </mesh>

      {/* крышка на петле у задней кромки */}
      <group ref={lid} position={[0, 0.055, -BASE_D / 2]} rotation={[CLOSED, 0, 0]}>
        {/* чуть утоплена в петлю, чтобы стыка не было видно ни под каким углом */}
        <group position={[0, LID_H / 2 - 0.035, 0]}>
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
    // Форма холста и тип раскладки — разные вещи, и путать их нельзя.
    // Холст на широком экране занимает только 66% ширины, его пропорции
    // могут быть около единицы — но раскладка при этом двухколоночная,
    // и поднимать ноутбук вверх (как на телефоне) не надо.
    const stacked = window.innerWidth <= 1100;
    // расстояние считаем из угла обзора, а не подбираем: при узком кадре
    // горизонтальный угол сильно меньше вертикального, и ноутбук вылезал за края
    const vfov = (cam.fov * Math.PI) / 180;
    const needW = stacked ? LID_W + 0.9 : LID_W + 0.6;
    const needH = LID_H + 1.2;
    const dist = Math.max(
      needW / 2 / (Math.tan(vfov / 2) * aspect),
      needH / 2 / Math.tan(vfov / 2),
    ) * 1.05;
    // Объект всегда по центру своего холста. Сдвигать его в мировых
    // координатах, чтобы он не лез на текст, — подбор наугад: на другой
    // ширине он снова наезжал. Холст сам начинается правее колонки с текстом.
    cam.position.set(0, dist * 0.27, dist);
    // Ноутбук всегда по центру своего холста. Разводит его с текстом вёрстка:
    // на широком экране холст начинается правее колонки, на узком — занимает
    // верхнюю полосу. Двигать объект внутри сцены для этого не нужно.
    cam.lookAt(0, 0.45, 0);
    cam.updateProjectionMatrix();
    if (g.current) g.current.position.x = 0;
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
