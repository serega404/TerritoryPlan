export type Point = { x: number; y: number };
export type Position = Point & { z: number };
type Base = {
  id: string;
  name: string;
  color: string;
  position: Position;
  rotation: number;
  hidden: boolean;
  floorGroup?: FloorGroup;
};
export type Surface = Base & {
  type: "floor" | "roof";
  points: Point[];
  thickness: number;
};
export type Opening = {
  id: string;
  type: "door" | "window";
  name: string;
  segmentId: string;
  offset: number;
  width: number;
  height: number;
  sill: number;
  hinge?: "left" | "right";
  swing?: 1 | -1;
};
export type Wall = Base & {
  type: "wall";
  points: Point[];
  segmentIds: string[];
  thickness: number;
  height: number;
  openings: Opening[];
};
export type SolidKind =
  | "stairs"
  | "column"
  | "bed"
  | "plant"
  | "palm"
  | "spruce"
  | "podium"
  | "table"
  | "chair"
  | "sofa"
  | "box"
  | "cylinder";
export type Solid = Base & {
  type: SolidKind;
  width: number;
  depth: number;
  height: number;
  steps: number;
};
export type Entity = Surface | Wall | Solid;
export type Project = {
  version: 1;
  name: string;
  entities: Entity[];
  appliedFixes?: string[];
};
export const uid = () => crypto.randomUUID();
export const clone = <T>(value: T): T => structuredClone(value);
export const isSurface = (e: Entity): e is Surface =>
  e.type === "floor" || e.type === "roof";
export const isWall = (e: Entity): e is Wall => e.type === "wall";
export const isSolid = (e: Entity): e is Solid => !isSurface(e) && !isWall(e);
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export function bounds(points: Point[]) {
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX, depth: maxY - minY };
}
export function area(points: Point[]) {
  return (
    Math.abs(
      points.reduce((s, a, i) => {
        const b = points[(i + 1) % points.length];
        return s + a.x * b.y - b.x * a.y;
      }, 0),
    ) / 2
  );
}
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onSegment = (a: Point, b: Point, p: Point) =>
  Math.abs(cross(a, b, p)) < 1e-8 &&
  p.x >= Math.min(a.x, b.x) - 1e-8 &&
  p.x <= Math.max(a.x, b.x) + 1e-8 &&
  p.y >= Math.min(a.y, b.y) - 1e-8 &&
  p.y <= Math.max(a.y, b.y) + 1e-8;
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const c1 = cross(a, b, c),
    c2 = cross(a, b, d),
    c3 = cross(c, d, a),
    c4 = cross(c, d, b);
  return (
    (c1 * c2 < 0 && c3 * c4 < 0) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}
const fail = (message: string): never => {
  throw new Error(message);
};
function number(
  value: unknown,
  label: string,
  min = -10000,
  max = 10000,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail(`${label}: допустимо от ${min} до ${max}.`);
}
function text(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 160)
    fail(`${label}: нужно от 1 до 160 символов.`);
}
export function validateContour(points: Point[], closed: boolean) {
  if (
    !Array.isArray(points) ||
    points.length < (closed ? 3 : 2) ||
    points.length > 500
  )
    fail(
      closed
        ? "Контур должен содержать от 3 до 500 вершин."
        : "Стена должна содержать от 2 до 500 вершин.",
    );
  for (const p of points) {
    if (!p || typeof p !== "object") fail("Неверная вершина.");
    number(p.x, "Координата X");
    number(p.y, "Координата Y");
  }
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) {
    if (distance(points[i], points[(i + 1) % points.length]) < 0.01)
      fail("Соседние вершины должны быть разнесены минимум на 1 см.");
    // Adjacent collinear edges may continue forward, but must not double back.
    const prev =
      i > 0 ? points[i - 1] : closed ? points[points.length - 1] : null;
    const next = points[(i + 1) % points.length];
    if (
      prev &&
      Math.abs(cross(prev, points[i], next)) < 1e-8 &&
      (prev.x - points[i].x) * (next.x - points[i].x) +
        (prev.y - points[i].y) * (next.y - points[i].y) >
        0
    )
      fail("Контур не должен возвращаться по своему ребру.");
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (closed && i === 0 && j === n - 1)) continue;
      if (
        intersects(
          points[i],
          points[(i + 1) % points.length],
          points[j],
          points[(j + 1) % points.length],
        )
      )
        fail("Контур не должен пересекать сам себя.");
    }
  }
  if (closed && area(points) < 0.01)
    fail("Площадь контура должна быть больше 0,01 м².");
}
export function validateWall(wall: Wall) {
  if (
    !Array.isArray(wall.segmentIds) ||
    wall.segmentIds.length !== wall.points.length - 1 ||
    new Set(wall.segmentIds).size !== wall.segmentIds.length
  )
    fail("Неверные сегменты стены.");
  if (!Array.isArray(wall.openings) || wall.openings.length > 100)
    fail("Слишком много проёмов в стене.");
  for (const o of wall.openings) {
    if (!o || typeof o !== "object") fail("Неверный проём.");
    text(o.id, "Идентификатор проёма");
    text(o.name, "Название проёма");
    if (o.type !== "door" && o.type !== "window")
      fail("Неизвестный тип проёма.");
    const i = wall.segmentIds.indexOf(o.segmentId);
    if (i < 0) fail("Проём привязан к отсутствующему сегменту.");
    number(o.offset, "Отступ проёма", 0);
    number(o.width, "Ширина проёма", 0.05, 1000);
    number(o.height, "Высота проёма", 0.05, 1000);
    number(o.sill, "Подоконник", 0, 1000);
    if (o.hinge !== undefined && o.hinge !== "left" && o.hinge !== "right")
      fail("Неверная сторона петель.");
    if (o.swing !== undefined && o.swing !== 1 && o.swing !== -1)
      fail("Неверная сторона открывания.");
    if (
      o.offset + o.width >
        distance(wall.points[i], wall.points[i + 1]) + 1e-7 ||
      o.sill + o.height > wall.height + 1e-7
    )
      fail(
        `«${o.name}» не помещается в стене. Уменьшите проём или увеличьте стену.`,
      );
    for (const other of wall.openings)
      if (
        other !== o &&
        other.segmentId === o.segmentId &&
        o.offset < other.offset + other.width - 1e-7 &&
        o.offset + o.width > other.offset + 1e-7 &&
        o.sill < other.sill + other.height - 1e-7 &&
        o.sill + o.height > other.sill + 1e-7
      )
        fail("Проёмы не должны пересекаться.");
  }
}
const kinds = [
  "floor",
  "roof",
  "wall",
  "stairs",
  "column",
  "bed",
  "plant",
  "palm",
  "spruce",
  "podium",
  "table",
  "chair",
  "sofa",
  "box",
  "cylinder",
];
export function validateProject(project: Project) {
  if (!project || project.version !== 1 || !Array.isArray(project.entities))
    fail("Это не проект редактора версии 1.");
  text(project.name, "Название проекта");
  if (
    project.appliedFixes !== undefined &&
    (!Array.isArray(project.appliedFixes) ||
      project.appliedFixes.length > 100 ||
      project.appliedFixes.some(
        (fix) => typeof fix !== "string" || fix.length > 100,
      ))
  )
    fail("Неверная история исправлений проекта.");
  if (project.entities.length > 2000)
    fail("В проекте допустимо до 2000 объектов.");
  const ids = new Set<string>();
  const addId = (id: string) => {
    text(id, "Идентификатор");
    if (ids.has(id)) fail("Идентификаторы объектов должны быть уникальны.");
    ids.add(id);
  };
  for (const e of project.entities) {
    if (!e || typeof e !== "object" || !kinds.includes(e.type))
      fail("Неизвестный тип объекта.");
    addId(e.id);
    text(e.name, "Название объекта");
    if (
      e.floorGroup !== undefined &&
      !floorGroups.some((level) => level.id === e.floorGroup)
    )
      fail("Неизвестная группа этажа.");
    if (typeof e.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(e.color))
      fail("Цвет должен быть записан как #RRGGBB.");
    if (typeof e.hidden !== "boolean" || !e.position)
      fail("Неверные свойства объекта.");
    number(e.position.x, "X");
    number(e.position.y, "Y");
    number(e.position.z, "Высота");
    number(e.rotation, "Поворот", -36000, 36000);
    if (isSurface(e) || isWall(e)) {
      validateContour(e.points, isSurface(e));
      number(e.thickness, "Толщина", 0.01, 1000);
      if (isWall(e)) {
        number(e.height, "Высота стены", 0.05, 1000);
        validateWall(e);
        e.segmentIds.forEach((id) => text(id, "Сегмент"));
        e.openings.forEach((o) => addId(o.id));
      }
    } else {
      number(e.width, "Ширина", 0.05, 1000);
      number(e.depth, "Глубина", 0.05, 1000);
      number(e.height, "Высота", 0.05, 1000);
      number(e.steps, "Ступени", 1, 100);
      if (!Number.isInteger(e.steps)) fail("Число ступеней должно быть целым.");
    }
  }
  return project;
}
export function parseProject(raw: string): Project {
  if (raw.length > 5_000_000) fail("Файл слишком большой: максимум 5 МБ.");
  let data: Project;
  try {
    data = JSON.parse(raw);
  } catch {
    return fail("Не удалось прочитать JSON. Выберите файл проекта редактора.");
  }
  try {
    validateProject(data);
  } catch (error) {
    if (error instanceof TypeError) fail("Структура файла проекта повреждена.");
    throw error;
  }
  // Whitelist persisted fields so extra imported keys never enter the document.
  return {
    version: 1,
    name: data.name,
    ...(data.appliedFixes === undefined
      ? {}
      : { appliedFixes: [...data.appliedFixes] }),
    entities: data.entities.map((e) => {
      const base = {
        id: e.id,
        name: e.name,
        color: e.color,
        position: { x: e.position.x, y: e.position.y, z: e.position.z },
        rotation: e.rotation,
        hidden: e.hidden,
        ...(e.floorGroup === undefined ? {} : { floorGroup: e.floorGroup }),
      };
      if (isSurface(e))
        return {
          ...base,
          type: e.type,
          points: e.points.map((p) => ({ x: p.x, y: p.y })),
          thickness: e.thickness,
        };
      if (isWall(e))
        return {
          ...base,
          type: e.type,
          points: e.points.map((p) => ({ x: p.x, y: p.y })),
          thickness: e.thickness,
          height: e.height,
          segmentIds: [...e.segmentIds],
          openings: e.openings.map((o) => ({
            id: o.id,
            type: o.type,
            name: o.name,
            segmentId: o.segmentId,
            offset: o.offset,
            width: o.width,
            height: o.height,
            sill: o.sill,
            ...(o.hinge === undefined ? {} : { hinge: o.hinge }),
            ...(o.swing === undefined ? {} : { swing: o.swing }),
          })),
        };
      return {
        ...base,
        type: e.type,
        width: e.width,
        depth: e.depth,
        height: e.height,
        steps: e.steps,
      };
    }),
  };
}
export const labels: Record<Entity["type"], string> = {
  floor: "Площадка",
  roof: "Крыша",
  wall: "Стена",
  stairs: "Лестница",
  column: "Колонна",
  bed: "Клумба",
  plant: "Растение",
  palm: "Пальма",
  spruce: "Ель",
  podium: "Подиум",
  table: "Стол",
  chair: "Стул",
  sofa: "Двухместный диван",
  box: "Прямоугольник",
  cylinder: "Цилиндр",
};
export function makeSurface(
  type: "floor" | "roof",
  points: Point[],
  name = labels[type],
  z = 0,
): Surface {
  validateContour(points, true);
  const b = bounds(points),
    x = (b.minX + b.maxX) / 2,
    y = (b.minY + b.maxY) / 2;
  return {
    id: uid(),
    type,
    name,
    color: type === "roof" ? "#abc9cc" : "#d6dfca",
    position: { x, y, z },
    rotation: 0,
    hidden: false,
    points: points.map((p) => ({ x: p.x - x, y: p.y - y })),
    thickness: 0.15,
  };
}
export function makeWall(points: Point[]): Wall {
  validateContour(points, false);
  const b = bounds(points),
    x = (b.minX + b.maxX) / 2,
    y = (b.minY + b.maxY) / 2;
  return {
    id: uid(),
    type: "wall",
    name: "Стена",
    color: "#d0cec3",
    position: { x, y, z: 0 },
    rotation: 0,
    hidden: false,
    points: points.map((p) => ({ x: p.x - x, y: p.y - y })),
    thickness: 0.25,
    height: 3.5,
    segmentIds: points.slice(1).map(() => uid()),
    openings: [],
  };
}
export function makeSolid(type: SolidKind, x = 0, y = 0, z = 0): Solid {
  const sizes: Record<SolidKind, [number, number, number, string]> = {
    stairs: [3.8, 3.2, 1.6, "#c9c6b8"],
    column: [0.6, 0.6, 7.4, "#9daba3"],
    bed: [4, 4, 0.65, "#65866a"],
    plant: [1.5, 1.5, 2.5, "#39674a"],
    palm: [5, 5, 6.5, "#3f7547"],
    spruce: [2.8, 2.8, 5, "#315e43"],
    podium: [4, 4, 0.6, "#c8a980"],
    table: [1.8, 0.9, 0.75, "#b89c77"],
    chair: [0.55, 0.55, 0.85, "#ac9274"],
    sofa: [1.65, 0.8, 0.95, "#bc2637"],
    box: [2, 2, 1, "#a1b8ac"],
    cylinder: [1.5, 1.5, 1, "#a1b8ac"],
  };
  const [width, depth, height, color] = sizes[type];
  return {
    id: uid(),
    type,
    name: labels[type],
    color,
    position: { x, y, z },
    rotation: 0,
    hidden: false,
    width,
    depth,
    height,
    steps: 8,
  };
}
export function initialProject(): Project {
  const rectangle = (
    name: string,
    x: number,
    y: number,
    w: number,
    d: number,
    z: number,
    type: "floor" | "roof" = "floor",
    color = "#e8cda4",
  ) => {
    const e = makeSurface(
      type,
      [
        { x: x - w / 2, y: y - d / 2 },
        { x: x + w / 2, y: y - d / 2 },
        { x: x + w / 2, y: y + d / 2 },
        { x: x - w / 2, y: y + d / 2 },
      ],
      name,
      z,
    );
    e.color = color;
    return e;
  };
  // The reference is a schematic, not a consistent scale drawing. Keep its
  // labelled 30 × 12 m activity area and use separate entrance/planting aprons.
  const entities: Entity[] = [
    rectangle("Основная площадка", 0, 0, 30, 12, 0, "floor", "#c8d6b5"),
    rectangle("Передняя площадка", 0, 9.25, 30, 6.5, 0, "floor", "#c8d6b5"),
    rectangle(
      "Северная полоса озеленения",
      0,
      -6.75,
      30,
      1.5,
      0,
      "floor",
      "#c8d6b5",
    ),
    rectangle("Северная галерея", 0, -10, 40, 5, 1.6),
    rectangle("Левая галерея", -17.5, 2.5, 5, 20, 1.6),
    rectangle("Правая галерея", 17.5, 2.5, 5, 20, 1.6),
    rectangle(
      "Верхний балкон · 5 × 25 м",
      2.5,
      -15,
      25,
      5,
      1.6,
      "floor",
      "#d6ccbe",
    ),
    rectangle(
      "Западный проход балкона",
      -13.75,
      -13.75,
      7.5,
      2.5,
      1.6,
      "floor",
      "#d6ccbe",
    ),
    rectangle(
      "Северный уступ балкона",
      -12.5,
      -16.25,
      5,
      2.5,
      1.6,
      "floor",
      "#d6ccbe",
    ),
    rectangle(
      "Восточный проход балкона",
      17.5,
      -15,
      5,
      5,
      1.6,
      "floor",
      "#d6ccbe",
    ),
    rectangle("Боковой балкон", -22.5, 0, 5, 25, 1.6, "floor", "#d8e1e4"),
    rectangle("Главный вход", 0, 11.75, 10, 1.5, 1.6, "floor", "#eee3cf"),
    rectangle("Организаторы", 18, 9.75, 4, 5.5, 1.61, "floor", "#b4d4a5"),
  ];
  const solid = (
    type: SolidKind,
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
    color?: string,
    rotation = 0,
  ) => {
    const e = makeSolid(type, x, y, z);
    Object.assign(e, { name, width: w, depth: d, height: h, rotation });
    if (color) e.color = color;
    entities.push(e);
    return e;
  };
  const planting = (name: string, points: Point[]) => {
    const e = makeSurface("floor", points, name, 0.22);
    e.color = "#73905b";
    e.thickness = 0.22;
    entities.push(e);
    return e;
  };
  const plant = (
    name: string,
    x: number,
    y: number,
    z = 0,
    size = 1,
    height = 1.7,
    index = 0,
  ) =>
    solid(
      "plant",
      name,
      x,
      y,
      z,
      size,
      size,
      height,
      ["#376243", "#4f7747", "#68874b", "#2e644b"][index % 4],
    );
  const wall = (
    name: string,
    points: Point[],
    z = 1.6,
    height = 3.2,
    thickness = 0.3,
  ) => {
    const e = makeWall(points);
    Object.assign(e, { name, height, thickness, color: "#7d8b8d" });
    e.position.z = z;
    entities.push(e);
    return e;
  };
  const aperture = (
    w: Wall,
    name: string,
    segment: number,
    offset: number,
    width: number,
    type: "door" | "window" = "door",
  ) =>
    w.openings.push({
      id: uid(),
      type,
      name,
      segmentId: w.segmentIds[segment],
      offset,
      width,
      height: type === "door" ? 2.6 : 1.5,
      sill: type === "door" ? 0 : 1.1,
    });

  // Five stairs, with their high ends touching the raised galleries/entrance.
  for (const [name, x, y, rotation, width, depth] of [
    ["Северная лестница слева", -6, -6, 180, 5, 3],
    ["Северная лестница справа", 6, -6, 180, 5, 3],
    ["Центральная лестница", 0, 9.25, 0, 8, 3.5],
    ["Боковая лестница слева", -14, 2.8, 90, 3, 2],
    ["Боковая лестница справа", 14, 2.8, -90, 3, 2],
  ] as const) {
    const e = solid(
      "stairs",
      name,
      x,
      y,
      0,
      width,
      depth,
      1.6,
      "#d6cfbf",
      rotation,
    );
    e.steps = 8;
  }

  // Circular beds flank a two-step concentric podium.
  solid(
    "cylinder",
    "Нижняя ступень подиума",
    0,
    2.5,
    0,
    4.8,
    4.8,
    0.18,
    "#bca17a",
  );
  solid("podium", "Подиум", 0, 2.5, 0.18, 4.2, 4.2, 0.18, "#e0c8a3");
  for (const [side, x] of [
    ["Левая", -7.5],
    ["Правая", 7.5],
  ] as const) {
    solid(
      "bed",
      `${side} круглая клумба`,
      x,
      2.5,
      0,
      4.8,
      4.8,
      0.48,
      "#64804d",
    );
    plant(`${side} клумба · пальма`, x, 2.5, 0.48, 2.1, 3.3);
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 7;
      plant(
        `${side} клумба · куст ${i + 1}`,
        x + Math.cos(a) * 1.45,
        2.5 + Math.sin(a) * 1.45,
        0.48,
        0.95,
        1.1,
        i,
      );
    }
  }
  const leftZone = [
    { x: -15, y: 6.4 },
    { x: -13.8, y: 6.6 },
    { x: -11.6, y: 7.4 },
    { x: -9.7, y: 8.7 },
    { x: -8.2, y: 10.3 },
    { x: -7, y: 12.5 },
    { x: -15, y: 12.5 },
  ];
  planting("Левая зелёная зона", leftZone);
  planting(
    "Правая зелёная зона",
    leftZone.map((p) => ({ x: -p.x, y: p.y })).reverse(),
  );
  const cornerPlants = [
    [-14.1, 7.4],
    [-12.5, 7.8],
    [-14, 9],
    [-12.4, 9.4],
    [-10.8, 9.7],
    [-14, 11.4],
    [-12.4, 11.5],
    [-10.7, 11.5],
    [-9, 11.7],
  ];
  for (const side of [-1, 1])
    cornerPlants.forEach(([x, y], i) =>
      plant(
        `${side === 1 ? "Левая" : "Правая"} зелёная зона · растение ${i + 1}`,
        x * side,
        y,
        0.22,
        1.35,
        1.25 + (i % 3) * 0.65,
        i,
      ),
    );

  // Slim beds and greenery around the central space, interrupted by stairs.
  for (const side of [-1, 1]) {
    const label = side === -1 ? "Левое" : "Правое";
    for (const [y, depth] of [
      [-4.6, 4.8],
      [-0.35, 1.5],
      [5.15, 1.6],
    ]) {
      solid(
        "box",
        `${label} пристенное озеленение`,
        side * 14.35,
        y,
        0,
        0.7,
        depth,
        0.35,
        "#6e8651",
      );
      const n = Math.max(1, Math.floor(depth / 1.1));
      for (let i = 0; i < n; i++)
        plant(
          `${label} озеленение · ${y} · ${i + 1}`,
          side * 14.35,
          y - depth / 2 + ((i + 0.5) * depth) / n,
          0.35,
          0.85,
          1.2,
          i,
        );
    }
    for (const [x, width] of [
      [10.9, 6.3],
      [1.8, 3.2],
    ]) {
      solid(
        "box",
        `${label} северное озеленение`,
        side * x,
        -6.9,
        0,
        width,
        0.75,
        0.32,
        "#7b915c",
      );
      for (let i = 0; i < 3; i++)
        plant(
          `${label} северный бордюр · ${x} · ${i + 1}`,
          side * (x + ((i - 1) * width) / 3),
          -6.9,
          0.32,
          0.8,
          1.05,
          i,
        );
    }
  }

  // Columns mark both the inner and outer gallery edges, as in the sketch.
  const columns = [
    [-20, -7.5],
    [-15, -7.5],
    [-8.8, -7.5],
    [3.3, -7.5],
    [8.5, -7.5],
    [15, -7.5],
    [20, -7.5],
    [-15, -2.7],
    [15, -2.7],
    [-20, -0.8],
    [-20, 6.5],
    [-15, 6.5],
    [15, 6.5],
    [-15, 12.5],
    [15, 12.5],
  ];
  columns.forEach(([x, y], i) =>
    solid("column", `Колонна ${i + 1}`, x, y, 1.6, 0.72, 0.72, 7.4),
  );

  // Perimeter, balcony doors, glazed exterior walls and entrance doors.
  const north = wall("Наружная стена верхнего балкона", [
    { x: -17.5, y: -12.5 },
    { x: -17.5, y: -15 },
    { x: -15, y: -15 },
    { x: -15, y: -17.5 },
    { x: 20, y: -17.5 },
    { x: 20, y: -12.5 },
  ]);
  for (const offset of [2, 8, 14, 20, 26, 31])
    aperture(north, "Окно верхнего балкона", 3, offset, 2, "window");
  const balconyWall = wall("Проходы на верхний балкон", [
    { x: -17.5, y: -12.5 },
    { x: 20, y: -12.5 },
  ]);
  for (const [name, x] of [
    ["Западный проход", -16],
    ["Левый проход", -7.5],
    ["Правый проход", 7.5],
    ["Восточный проход", 18],
  ] as const)
    aperture(balconyWall, name, 0, x + 17.5 - 0.6, 1.2);
  const west = wall("Стена между боковым балконом и галереей", [
    { x: -20, y: -12.5 },
    { x: -20, y: 12.5 },
  ]);
  aperture(west, "Двери на боковой балкон", 0, 21.7, 2.2);
  const outerWest = wall("Наружная стена бокового балкона", [
    { x: -25, y: -12.5 },
    { x: -25, y: 12.5 },
  ]);
  for (const offset of [1.5, 7, 13, 19])
    aperture(outerWest, "Окно бокового балкона", 0, offset, 3, "window");
  for (const [name, y] of [
    ["Северный выход бокового балкона", -12.5],
    ["Южный выход бокового балкона", 12.5],
  ] as const) {
    const e = wall(name, [
      { x: -25, y },
      { x: -20, y },
    ]);
    aperture(e, name, 0, 3, 1.2);
  }
  wall("Восточная наружная стена", [
    { x: 20, y: -12.5 },
    { x: 20, y: 12.5 },
  ]);
  const south = wall("Стена главного входа", [
    { x: -20, y: 12.5 },
    { x: 20, y: 12.5 },
  ]);
  aperture(south, "Главный вход · слева", 0, 16, 1.7);
  aperture(south, "Главный вход · справа", 0, 22.3, 1.7);
  // Low cutaway parapets keep the galleries readable without hiding the garden.
  for (const side of [-1, 1])
    for (const [a, b] of [
      [-7.5, 1.3],
      [4.3, 12.5],
    ])
      wall(
        `${side < 0 ? "Левое" : "Правое"} ограждение галереи`,
        [
          { x: side * 15, y: a },
          { x: side * 15, y: b },
        ],
        1.6,
        0.38,
        0.13,
      );
  for (const [a, b] of [
    [-15, -8.5],
    [-3.5, 3.5],
    [8.5, 15],
  ])
    wall(
      "Ограждение северной галереи",
      [
        { x: a, y: -7.5 },
        { x: b, y: -7.5 },
      ],
      1.6,
      0.38,
      0.13,
    );

  // Round cafe tables are made of editable cylinders plus four chairs.
  const cafe = (name: string, x: number, y: number) => {
    solid(
      "cylinder",
      `${name} · столешница`,
      x,
      y,
      2.27,
      1.05,
      1.05,
      0.08,
      "#c6b8a3",
    );
    solid("column", `${name} · ножка`, x, y, 1.6, 0.12, 0.12, 0.67, "#8f8c7d");
    for (const [dx, dy, rotation] of [
      [-0.9, 0, -90],
      [0.9, 0, 90],
      [0, -0.9, 0],
      [0, 0.9, 180],
    ])
      solid(
        "chair",
        `${name} · стул`,
        x + dx,
        y + dy,
        1.6,
        0.48,
        0.48,
        0.8,
        "#c4b9a8",
        rotation,
      );
  };
  for (const [i, x] of [-12.4, -6.5, 7.5, 15.6].entries())
    cafe(`Верхний балкон · столик ${i + 1}`, x, -15);
  for (const [i, y] of [-8.5, -1.5, 6].entries())
    cafe(`Боковой балкон · столик ${i + 1}`, -22.5, y);
  for (const [i, x, y] of [
    [1, -16.6, -13.8],
    [2, -13.8, -16.7],
    [3, 18.5, -16.6],
    [4, 18.5, -14],
    [5, 12.7, -15.2],
    [6, -22.5, -5],
    [7, -22.5, 9],
    [8, -19, -11.3],
    [9, 19, -11.3],
  ])
    plant(`Декоративное растение ${i}`, x, y, 1.6, 0.9, 1.9, i);

  // Service spaces on the right-hand raised gallery.
  solid(
    "box",
    "Зона кейтеринга · стойка",
    19.05,
    2.2,
    1.6,
    0.9,
    7,
    0.9,
    "#ded7c6",
  );
  for (let i = 0; i < 6; i++)
    solid(
      "cylinder",
      `Кейтеринг · поднос ${i + 1}`,
      19.05,
      -0.6 + i * 1.1,
      2.5,
      0.42,
      0.42,
      0.05,
      "#8e9b9b",
    );
  wall(
    "Перегородка организаторов",
    [
      { x: 16, y: 12.5 },
      { x: 16, y: 7 },
    ],
    1.6,
    2.7,
    0.18,
  );
  const office = wall(
    "Вход к организаторам",
    [
      { x: 16, y: 7 },
      { x: 20, y: 7 },
    ],
    1.6,
    2.7,
    0.18,
  );
  aperture(office, "Дверь к организаторам", 0, 2.1, 1.2);
  solid(
    "table",
    "Стол организаторов",
    18,
    9.8,
    1.6,
    1.25,
    2.25,
    0.76,
    "#cfbd95",
  );
  for (const side of [-1, 1])
    for (const y of [9.2, 10.4])
      solid(
        "chair",
        "Стул организаторов",
        18 + side * 0.9,
        y,
        1.6,
        0.5,
        0.5,
        0.85,
        "#c2b491",
        side === 1 ? 90 : -90,
      );
  entities.push(
    rectangle("Стеклянная крыша", 0, 0, 40, 25, 9, "roof", "#b2cdd0"),
  );
  return applyGardenUpdates(
    correctGardenLevels({ version: 1, name: "Зимний сад ЮФУ", entities }),
  );
}

/** Apply the latest layout correction without resetting unrelated user edits. */
export function correctGardenLevels(
  project: Project,
  balconyElevation = 4.8,
): Project {
  const next = clone(project);
  const balcony = next.entities.find(
    (e) => e.name === "Боковой балкон" && isSurface(e),
  );
  if (!balcony) throw new Error("В проекте не найден боковой балкон.");
  const delta = balconyElevation - balcony.position.z,
    oldElevation = balcony.position.z;
  const deckBounds = bounds((balcony as Surface).points);
  const balconyWalls = new Set([
    "Стена между боковым балконом и галереей",
    "Наружная стена бокового балкона",
    "Северный выход бокового балкона",
    "Южный выход бокового балкона",
  ]);
  for (const e of next.entities) {
    const point = toLocal(balcony, e.position);
    const onBalcony =
      isSolid(e) &&
      point.x > deckBounds.minX + 0.001 &&
      point.x < deckBounds.maxX - 0.001 &&
      point.y >= deckBounds.minY &&
      point.y <= deckBounds.maxY &&
      e.position.z >= oldElevation - 0.01;
    if (
      e.id === balcony.id ||
      balconyWalls.has(e.name) ||
      e.name.startsWith("Боковой балкон ·") ||
      onBalcony
    )
      e.position.z += delta;
  }
  const obsolete = new Set([
    "Верхний балкон · 5 × 25 м",
    "Западный проход балкона",
    "Северный уступ балкона",
    "Восточный проход балкона",
  ]);
  const previousHall = next.entities.find(
    (e) => (e.name === "Холл" || obsolete.has(e.name)) && isSurface(e),
  );
  const hall = makeSurface(
    "floor",
    [
      { x: -20, y: -17.5 },
      { x: 20, y: -17.5 },
      { x: 20, y: -12.5 },
      { x: -20, y: -12.5 },
    ],
    "Холл",
    1.6,
  );
  if (previousHall) {
    hall.id = previousHall.id;
    hall.color = previousHall.color;
    hall.thickness = (previousHall as Surface).thickness;
    hall.hidden = previousHall.hidden;
  }
  next.entities = next.entities.filter(
    (e) =>
      !obsolete.has(e.name) &&
      e.name !== "Холл" &&
      !(
        isSolid(e) &&
        e.position.x >= -20 &&
        e.position.x <= 20 &&
        e.position.y >= -17.5 &&
        e.position.y <= -12.5
      ),
  );
  next.entities.splice(Math.min(6, next.entities.length), 0, hall);
  const north = next.entities.find(
    (e) =>
      e.name === "Наружная стена верхнего балкона" ||
      (e.name === "Наружная стена холла" && isWall(e) && e.points.length > 4),
  );
  if (north && isWall(north)) {
    const replacement = makeWall([
      { x: -20, y: -12.5 },
      { x: -20, y: -17.5 },
      { x: 20, y: -17.5 },
      { x: 20, y: -12.5 },
    ]);
    replacement.id = north.id;
    replacement.name = "Наружная стена холла";
    replacement.position.z = north.position.z;
    replacement.height = north.height;
    replacement.thickness = north.thickness;
    replacement.color = north.color;
    replacement.hidden = north.hidden;
    replacement.openings = north.openings.flatMap((o) => {
      const i = north.segmentIds.indexOf(o.segmentId),
        index = i === 0 ? 0 : i === 3 ? 1 : i === 4 ? 2 : -1;
      return index < 0
        ? []
        : [
            {
              ...o,
              name: o.name.replace("верхнего балкона", "холла"),
              segmentId: replacement.segmentIds[index],
              offset: o.offset + (i === 3 ? 5 : 0),
            },
          ];
    });
    next.entities[next.entities.indexOf(north)] = replacement;
  }
  const front = next.entities.find(
    (e) => e.name === "Проходы на верхний балкон",
  );
  if (front && isWall(front)) {
    const left = toWorld(front, front.points[0]).x;
    front.position.x = 0;
    front.position.y = -12.5;
    front.rotation = 0;
    front.points = [
      { x: -20, y: 0 },
      { x: 20, y: 0 },
    ];
    front.name = "Проходы в холл";
    front.openings = front.openings.map((o) => ({
      ...o,
      offset: o.offset + left + 20,
    }));
  }
  return next.entities.some((e) => e.name === "Левая галерея")
    ? alignBalconyAboveGallery(next)
    : validateProject(next);
}

export const floorGroups = [
  { id: "ground", name: "1 этаж", height: "0 м" },
  { id: "gallery", name: "Галереи и холл", height: "+1,6 м" },
  { id: "upper", name: "2 этаж · балкон", height: "+4,8 м" },
  { id: "roof", name: "Крыша", height: "" },
] as const;
export type FloorGroup = (typeof floorGroups)[number]["id"];
export type FloorView = FloorGroup | "all" | "lower";
export function floorInView(view: FloorView, floor: FloorGroup) {
  return (
    view === "all" ||
    view === floor ||
    (view === "lower" && (floor === "ground" || floor === "gallery"))
  );
}
export function entityFloor(entity: Entity): FloorGroup {
  if (entity.type === "roof") return "roof";
  if (entity.floorGroup) return entity.floorGroup;
  if (entity.position.z >= 4.75) return "upper";
  if (entity.position.z >= 1.55) return "gallery";
  return "ground";
}
/** A full-height gallery wall extended to ground belongs to both lower-level views. */
export function entityFloors(entity: Entity): FloorGroup[] {
  const floor = entityFloor(entity);
  return isWall(entity) &&
    floor === "gallery" &&
    entity.position.z <= 0.001 &&
    entity.height >= 2
    ? ["ground", "gallery"]
    : [floor];
}

/** Close the missing exterior span below the raised side balcony. */
export function completeOuterPerimeter(project: Project): Project {
  const next = clone(project);
  const upper = next.entities.find(
    (e) => isWall(e) && e.name === "Наружная стена бокового балкона",
  );
  if (!upper || !isWall(upper) || upper.position.z <= 0) return next;
  const id = `lower-perimeter:${upper.id}`;
  if (next.entities.some((e) => e.id === id)) return next;
  const lower = clone(upper);
  lower.id = id;
  lower.name = "Наружная стена под боковым балконом";
  lower.segmentIds = lower.segmentIds.map((_, i) => `${id}:segment:${i}`);
  lower.height = upper.position.z;
  lower.position.z = 0;
  lower.floorGroup = "gallery";
  lower.openings = [];
  next.entities.push(lower);
  return next;
}

/** Extend full-height first-floor walls to ground without moving their tops or openings. */
export function extendFirstFloorWalls(project: Project): Project {
  const next = clone(project);
  for (const e of next.entities) {
    if (
      !isWall(e) ||
      entityFloor(e) !== "gallery" ||
      e.position.z <= 0 ||
      e.height < 2
    )
      continue;
    const delta = e.position.z;
    e.floorGroup = entityFloor(e);
    e.position.z = 0;
    e.height += delta;
    e.openings = e.openings.map((o) => ({ ...o, sill: o.sill + delta }));
  }
  // Existing infill under the same walls is now redundant; fill only remaining gaps.
  return encloseRaisedPlatforms(completeOuterPerimeter(next));
}

/** Upgrade the existing garden once, keeping later user edits and unrelated projects intact. */
export function applyGardenPerimeterFix(project: Project): Project {
  const fix = "ground-perimeter-v1";
  if (project.appliedFixes?.includes(fix)) return project;
  if (
    !["Основная площадка", "Боковой балкон", "Стена главного входа"].every(
      (name) => project.entities.some((e) => e.name === name),
    )
  )
    return project;
  const corrected = extendFirstFloorWalls(project);
  corrected.appliedFixes = [...(project.appliedFixes ?? []), fix];
  return validateProject(corrected);
}

/** Replace the northern planters with seating once; later user edits stay intact. */
function applyGardenSeating(project: Project): Project {
  const current = applyGardenPerimeterFix(project);
  const fix = "square-columns-north-sofas-v1";
  if (current.appliedFixes?.includes(fix)) return current;
  if (!current.entities.some((e) => e.name === "Северная полоса озеленения"))
    return current;
  const next = clone(current);
  next.entities = next.entities.filter(
    (e) =>
      !/^(Левое|Правое) северное озеленение$|^(Левое|Правое) северный бордюр ·/.test(
        e.name,
      ),
  );
  for (const e of next.entities) {
    if (e.type === "column") e.depth = e.width;
    if (e.name === "Северная полоса озеленения")
      e.name = "Северная зона отдыха";
  }
  // Leave the two northern stair approaches and the side planting strips clear.
  [-12.3, -10.1, -2, 0, 2, 10.1, 12.3].forEach((x, i) => {
    const sofa = makeSolid("sofa", x, -6.85, 0);
    sofa.id = `north-sofa:${i + 1}`;
    sofa.name = `Красный двухместный диван ${i + 1}`;
    next.entities.push(sofa);
  });
  next.appliedFixes = [...(next.appliedFixes ?? []), fix];
  return encloseRaisedPlatforms(next);
}

/** Replace only the right corner planting once, preserving later manual edits. */
function applyGardenPalm(project: Project): Project {
  const current = applyGardenSeating(project);
  const fix = "right-green-zone-palm-v1";
  if (current.appliedFixes?.includes(fix)) return current;
  const zone = current.entities.find(
    (e) => e.name === "Правая зелёная зона" && isSurface(e),
  );
  if (!zone || !isSurface(zone)) return current;
  const plants = current.entities.filter(
    (e) =>
      e.type === "plant" && e.name.startsWith("Правая зелёная зона · растение"),
  );
  if (!plants.length) return current;
  const next = clone(current);
  const removed = new Set(plants.map((e) => e.id));
  const palm = makeSolid("palm", 0, 0, zone.position.z);
  // The original planting centres define a safe position inside the corner bed.
  palm.position.x =
    plants.reduce((sum, e) => sum + e.position.x, 0) / plants.length;
  palm.position.y =
    plants.reduce((sum, e) => sum + e.position.y, 0) / plants.length;
  palm.name = "Правая зелёная зона · большая пальма";
  next.entities = next.entities.flatMap((e) =>
    e.id === plants[0].id ? [palm] : removed.has(e.id) ? [] : [e],
  );
  next.appliedFixes = [...(next.appliedFixes ?? []), fix];
  return next;
}

/** Replace the left corner planting once; each tree remains individually editable. */
export function applyGardenUpdates(project: Project): Project {
  const current = applyGardenPalm(project),
    fix = "left-green-zone-spruces-v1";
  if (current.appliedFixes?.includes(fix)) return current;
  const zone = current.entities.find(
    (e) => e.name === "Левая зелёная зона" && isSurface(e),
  );
  const plants = current.entities.filter(
    (e) =>
      e.type === "plant" && e.name.startsWith("Левая зелёная зона · растение"),
  );
  if (!zone || !plants.length) return current;
  const next = clone(current),
    removed = new Set(plants.map((e) => e.id));
  const centre = {
    x: plants.reduce((s, e) => s + e.position.x, 0) / plants.length,
    y: plants.reduce((s, e) => s + e.position.y, 0) / plants.length,
  };
  const trees = [
    makeSolid("spruce", centre.x - 1.25, centre.y - 1.35, zone.position.z),
    makeSolid("spruce", centre.x + 1.15, centre.y + 1.15, zone.position.z),
  ];
  trees[0].name = "Левая зелёная зона · большая ель";
  trees[1].name = "Левая зелёная зона · малая ель";
  Object.assign(trees[1], { width: 2.3, depth: 2.3, height: 4, rotation: 23 });
  next.entities = next.entities.flatMap((e) =>
    e.id === plants[0].id ? trees : removed.has(e.id) ? [] : [e],
  );
  next.appliedFixes = [...(next.appliedFixes ?? []), fix];
  return next;
}

/** Keep the 25 m balcony above both the left gallery and its northern junction. */
export function alignBalconyAboveGallery(project: Project): Project {
  const next = clone(project),
    balcony = next.entities.find(
      (e) => e.name === "Боковой балкон" && isSurface(e),
    ),
    gallery = next.entities.find(
      (e) => e.name === "Левая галерея" && isSurface(e),
    );
  if (!balcony || !gallery)
    throw new Error("Не найдены боковой балкон и левая галерея.");
  const dx = gallery.position.x - balcony.position.x,
    box = bounds((balcony as Surface).points);
  const wallNames = new Set([
    "Стена между боковым балконом и галереей",
    "Наружная стена бокового балкона",
    "Северный выход бокового балкона",
    "Южный выход бокового балкона",
  ]);
  const members = next.entities.filter((e) => {
    const p = toLocal(balcony, e.position);
    return (
      e.id === balcony.id ||
      wallNames.has(e.name) ||
      e.name.startsWith("Боковой балкон ·") ||
      (isSolid(e) &&
        e.position.z >= balcony.position.z - 0.01 &&
        p.x >= box.minX &&
        p.x <= box.maxX &&
        p.y >= box.minY &&
        p.y <= box.maxY)
    );
  });
  members.forEach((e) => {
    e.position.x += dx;
  });
  return validateProject(next);
}

/** Close only the exposed sides below the +1.6 m slabs, not their shared seams. */
export function encloseRaisedPlatforms(project: Project): Project {
  const prefix = "platform-infill:",
    next = clone(project);
  next.entities = next.entities.filter((e) => !e.id.startsWith(prefix));
  const platforms = next.entities.filter(
    (e): e is Surface =>
      e.type === "floor" && Math.abs(e.position.z - 1.6) < 0.05,
  );
  const polygons = platforms.map((e) => ({
    entity: e,
    points: e.points.map((p) => toWorld(e, p)),
  }));
  const edges = polygons.flatMap((poly) =>
    poly.points.map((a, i) => ({
      a,
      b: poly.points[(i + 1) % poly.points.length],
    })),
  );
  const existing = next.entities.filter(isWall).flatMap((w) =>
    w.segmentIds.map((_, i) => ({
      a: toWorld(w, w.points[i]),
      b: toWorld(w, w.points[i + 1]),
      wall: w,
    })),
  );
  const vecCross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
  const inside = (p: Point, poly: Point[]) => {
    let result = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i],
        b = poly[j];
      if (
        a.y > p.y !== b.y > p.y &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
      )
        result = !result;
    }
    return result;
  };
  const covered = (p: Point) => polygons.some((poly) => inside(p, poly.points));
  const quant = (n: number) => Math.round(n * 10000);
  const added = new Set<string>();
  for (const poly of polygons)
    for (let index = 0; index < poly.points.length; index++) {
      const a = poly.points[index],
        b = poly.points[(index + 1) % poly.points.length],
        d = { x: b.x - a.x, y: b.y - a.y },
        length = distance(a, b),
        cuts = [0, 1];
      for (const edge of [...edges, ...existing]) {
        const s = { x: edge.b.x - edge.a.x, y: edge.b.y - edge.a.y },
          v = { x: edge.a.x - a.x, y: edge.a.y - a.y },
          denom = vecCross(d, s);
        if (Math.abs(denom) > 1e-8) {
          const t = vecCross(v, s) / denom,
            u = vecCross(v, d) / denom;
          if (t > 0 && t < 1 && u >= -1e-8 && u <= 1 + 1e-8) cuts.push(t);
        } else if (Math.abs(vecCross(v, d)) < 1e-7)
          for (const p of [edge.a, edge.b]) {
            const t =
              ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / (length * length);
            if (t > 0 && t < 1) cuts.push(t);
          }
      }
      cuts.sort((x, y) => x - y);
      for (let i = 0; i < cuts.length - 1; i++) {
        const start = { x: a.x + d.x * cuts[i], y: a.y + d.y * cuts[i] },
          end = { x: a.x + d.x * cuts[i + 1], y: a.y + d.y * cuts[i + 1] };
        if (distance(start, end) < 0.02) continue;
        const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
          normal = { x: (-d.y / length) * 0.002, y: (d.x / length) * 0.002 };
        if (
          covered({ x: mid.x + normal.x, y: mid.y + normal.y }) ===
          covered({ x: mid.x - normal.x, y: mid.y - normal.y })
        )
          continue;
        const key = [
          `${quant(start.x)},${quant(start.y)}`,
          `${quant(end.x)},${quant(end.y)}`,
        ]
          .sort()
          .join("/");
        if (added.has(key)) continue;
        added.add(key);
        const top = poly.entity.position.z - poly.entity.thickness;
        if (top < 0.05) continue;
        const occupied = existing
          .filter((edge) => onSegment(edge.a, edge.b, mid))
          .map((edge) => [
            Math.max(0, edge.wall.position.z),
            Math.min(top, edge.wall.position.z + edge.wall.height),
          ])
          .filter(([lo, hi]) => hi > lo)
          .sort((a, b) => a[0] - b[0]);
        let bottom = 0;
        const spans: number[][] = [];
        for (const [lo, hi] of occupied) {
          if (lo > bottom) spans.push([bottom, lo]);
          bottom = Math.max(bottom, hi);
        }
        if (bottom < top) spans.push([bottom, top]);
        for (const [lo, hi] of spans) {
          if (hi - lo < 0.05) continue;
          const wall = makeWall([start, end]);
          wall.id = `${prefix}${key}:${quant(lo)},${quant(hi)}`;
          wall.segmentIds = [`${wall.id}:segment`];
          wall.name = `Стена под площадкой · ${poly.entity.name}`.slice(0, 150);
          wall.position.z = lo;
          wall.height = hi - lo;
          wall.thickness = 0.15;
          wall.color = "#b0b5a7";
          wall.floorGroup = "gallery";
          next.entities.push(wall);
        }
      }
    }
  return validateProject(next);
}
export class History {
  current: Project;
  past: Project[] = [];
  future: Project[] = [];
  constructor(project: Project) {
    this.current = clone(validateProject(project));
  }
  commit(next: Project) {
    validateProject(next);
    if (JSON.stringify(next) === JSON.stringify(this.current)) return;
    this.past.push(this.current);
    if (this.past.length > 100) this.past.shift();
    this.current = clone(next);
    this.future = [];
  }
  undo() {
    const p = this.past.pop();
    if (p) {
      this.future.push(this.current);
      this.current = p;
    }
    return this.current;
  }
  redo() {
    const p = this.future.pop();
    if (p) {
      this.past.push(this.current);
      this.current = p;
    }
    return this.current;
  }
}
export function toWorld(e: Entity, p: Point): Point {
  const a = (e.rotation * Math.PI) / 180;
  return {
    x: e.position.x + p.x * Math.cos(a) - p.y * Math.sin(a),
    y: e.position.y + p.x * Math.sin(a) + p.y * Math.cos(a),
  };
}
export function toLocal(e: Entity, p: Point): Point {
  const a = (-e.rotation * Math.PI) / 180,
    x = p.x - e.position.x,
    y = p.y - e.position.y;
  return {
    x: x * Math.cos(a) - y * Math.sin(a),
    y: x * Math.sin(a) + y * Math.cos(a),
  };
}
export function resized(e: Entity, w: number, d: number): Entity {
  const next = clone(e);
  if (isSurface(next) || isWall(next)) {
    const b = bounds(next.points);
    next.points = next.points.map((p) => ({
      x: b.width > 1e-7 ? (p.x * w) / b.width : p.x,
      y: b.depth > 1e-7 ? (p.y * d) / b.depth : p.y,
    }));
  } else {
    next.width = w;
    next.depth = next.type === "column" ? w : d;
  }
  return next;
}

export type ResizeHandle = { x: number; y: number; z: number };
export function resizeBounds(e: Entity) {
  const b = isSolid(e)
    ? {
        minX: -e.width / 2,
        maxX: e.width / 2,
        minY: -(e.type === "column" ? e.width : e.depth) / 2,
        maxY: (e.type === "column" ? e.width : e.depth) / 2,
      }
    : bounds(e.points);
  const flatX = isWall(e) && b.maxX - b.minX < 1e-7,
    flatY = isWall(e) && b.maxY - b.minY < 1e-7;
  return {
    minX: b.minX - (flatX ? e.thickness / 2 : 0),
    maxX: b.maxX + (flatX ? e.thickness / 2 : 0),
    minY: b.minY - (flatY ? e.thickness / 2 : 0),
    maxY: b.maxY + (flatY ? e.thickness / 2 : 0),
    minZ: isSurface(e) ? -e.thickness : 0,
    maxZ: isSurface(e) ? 0 : e.height,
  };
}

/** Resize a local side/corner, keeping its opposite side fixed in world space. */
export function resizeFromHandle(
  e: Entity,
  handle: ResizeHandle,
  delta: ResizeHandle,
): Entity {
  if (e.type === "column" && handle.x && handle.y)
    delta = { ...delta, y: delta.x * handle.x * handle.y };
  const old = resizeBounds(e),
    next = clone(e);
  const limits = (min: number, max: number, side: number, amount: number) =>
    side < 0
      ? [Math.min(min + amount, max - 0.050000001), max]
      : side > 0
        ? [min, Math.max(max + amount, min + 0.050000001)]
        : [min, max];
  const [x0, x1] = limits(old.minX, old.maxX, handle.x, delta.x),
    [y0, y1] = limits(old.minY, old.maxY, handle.y, delta.y),
    [z0, z1] = limits(old.minZ, old.maxZ, handle.z, delta.z);
  const dx = (x0 + x1 - old.minX - old.maxX) / 2,
    dy = (y0 + y1 - old.minY - old.maxY) / 2;
  const shift = toWorld(e, { x: dx, y: dy });
  next.position.x = shift.x;
  next.position.y = shift.y;
  if (isSolid(next)) {
    next.width = x1 - x0;
    next.depth = y1 - y0;
    if (next.type === "column") {
      const size = handle.x ? next.width : next.depth;
      next.width = next.depth = size;
    }
    next.height = z1 - z0;
    next.position.z = e.position.z + z0;
  } else {
    const b = bounds(next.points),
      sx = (x1 - x0) / (old.maxX - old.minX),
      sy = (y1 - y0) / (old.maxY - old.minY);
    next.points = next.points.map((p) => ({
      x: x0 + (p.x - old.minX) * sx - dx,
      y: y0 + (p.y - old.minY) * sy - dy,
    }));
    if (isSurface(next)) {
      next.thickness = z1 - z0;
      next.position.z = e.position.z + z1;
    } else {
      if (b.width < 1e-7 && handle.x) next.thickness = x1 - x0;
      if (b.depth < 1e-7 && handle.y) next.thickness = y1 - y0;
      next.height = z1 - z0;
      next.position.z = e.position.z + z0;
      if (z0)
        next.openings = next.openings.map((o) => ({ ...o, sill: o.sill - z0 }));
    }
  }
  validateProject({ version: 1, name: "Изменение размера", entities: [next] });
  return next;
}
export function duplicate(e: Entity): Entity {
  const n = clone(e);
  n.id = uid();
  n.name += " (копия)";
  n.position.x += 1;
  n.position.y += 1;
  if (isWall(n)) {
    const old = [...n.segmentIds];
    n.segmentIds = n.segmentIds.map(() => uid());
    n.openings = n.openings.map((o) => ({
      ...o,
      id: uid(),
      segmentId: n.segmentIds[old.indexOf(o.segmentId)],
    }));
  }
  return n;
}

/** Move an opening along its wall segment, keeping it inside and rejecting overlaps. */
export function moveOpening(
  wall: Wall,
  openingId: string,
  offset: number,
): Wall {
  const next = clone(wall),
    o = next.openings.find((o) => o.id === openingId);
  if (!o) throw new Error("Проём не найден.");
  const index = next.segmentIds.indexOf(o.segmentId);
  o.offset = Math.max(
    0,
    Math.min(
      distance(next.points[index], next.points[index + 1]) - o.width,
      offset,
    ),
  );
  validateWall(next);
  return next;
}
export function doorSwing(o: Opening) {
  return {
    hinge: o.offset + (o.hinge === "right" ? o.width : 0),
    along: o.hinge === "right" ? -1 : 1,
    side: o.swing ?? 1,
  };
}

/** Footprint of a wall panel in segment coordinates. Miters close endpoint corners;
 * T junctions overlap the receiving wall. Only rendering changes, not the axes or openings. */
export function wallPanelFootprint(
  w: Wall,
  index: number,
  panel: { left: number; width: number; bottom: number; height: number },
  entities: Entity[],
): Point[] {
  const a = w.points[index],
    b = w.points[index + 1],
    length = distance(a, b),
    half = w.thickness / 2;
  const ux = (b.x - a.x) / length,
    uy = (b.y - a.y) / length;
  const local = (p: Point) => {
    const q = toLocal(w, p),
      dx = q.x - a.x,
      dy = q.y - a.y;
    return { x: dx * ux + dy * uy, y: -dx * uy + dy * ux };
  };
  const ends = [0, length].map((x, end) => {
    const neighbors: { d: Point; half: number; through: boolean }[] = [];
    for (const other of entities) {
      if (
        !isWall(other) ||
        other.hidden ||
        other.position.z > w.position.z + panel.bottom + 1e-6 ||
        other.position.z + other.height <
          w.position.z + panel.bottom + panel.height - 1e-6
      )
        continue;
      for (let j = 0; j < other.points.length - 1; j++) {
        if (other.id === w.id && j === index) continue;
        const c = local(toWorld(other, other.points[j])),
          d = local(toWorld(other, other.points[j + 1]));
        const dx = d.x - c.x,
          dy = d.y - c.y,
          len = Math.hypot(dx, dy);
        const t = ((x - c.x) * dx - c.y * dy) / (len * len);
        if (
          t < -1e-6 ||
          t > 1 + 1e-6 ||
          Math.hypot(c.x + t * dx - x, c.y + t * dy) > 0.001
        )
          continue;
        const sign = t > 0.5 ? -1 : 1;
        if (Math.abs(dy / len) < 1e-6) continue;
        neighbors.push({
          d: { x: (sign * dx) / len, y: (sign * dy) / len },
          half: other.thickness / 2,
          through: t > 1e-6 && t < 1 - 1e-6,
        });
      }
    }
    if (!neighbors.length) return [x, x];
    const inward = end === 0 ? 1 : -1;
    if (neighbors.length === 1 && !neighbors[0].through) {
      const n = neighbors[0];
      return [1, -1].map((side) => {
        const sign = -side * inward;
        const ox = -n.d.y * n.half * sign,
          oy = n.d.x * n.half * sign;
        const delta = ox + ((side * half - oy) * n.d.x) / n.d.y;
        return (
          x +
          Math.max(
            -8 * Math.max(half, n.half),
            Math.min(8 * Math.max(half, n.half), delta),
          )
        );
      });
    }
    const extension = Math.max(
      ...neighbors.map((n) =>
        Math.min(n.half / Math.abs(n.d.y), 8 * Math.max(half, n.half)),
      ),
    );
    return [x - inward * extension, x - inward * extension];
  });
  let polygon = [
    { x: ends[0][0], y: half },
    { x: ends[1][0], y: half },
    { x: ends[1][1], y: -half },
    { x: ends[0][1], y: -half },
  ];
  // Clip internal panel edges so joining never fills a door or window.
  const clip = (limit: number, sign: number) => {
    const result: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i],
        q = polygon[(i + 1) % polygon.length];
      const insideP = sign * (p.x - limit) >= -1e-9,
        insideQ = sign * (q.x - limit) >= -1e-9;
      if (insideP) result.push(p);
      if (insideP !== insideQ)
        result.push({
          x: limit,
          y: p.y + ((q.y - p.y) * (limit - p.x)) / (q.x - p.x),
        });
    }
    polygon = result;
  };
  if (panel.left > 1e-8) clip(panel.left, 1);
  if (panel.left + panel.width < length - 1e-8)
    clip(panel.left + panel.width, -1);
  return polygon;
}

/** Non-overlapping rectangles left after subtracting all openings from one wall segment. */
export function wallPanels(w: Wall, index: number, entities: Entity[] = []) {
  const length = distance(w.points[index], w.points[index + 1]);
  const openings = w.openings.filter(
    (o) => o.segmentId === w.segmentIds[index],
  );
  const xs = [
    ...new Set([
      0,
      length,
      ...openings.flatMap((o) => [o.offset, o.offset + o.width]),
    ]),
  ].sort((a, b) => a - b);
  const panels: {
    left: number;
    bottom: number;
    width: number;
    height: number;
  }[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i],
      b = xs[i + 1],
      mid = (a + b) / 2;
    const intervals = openings
      .filter((o) => mid > o.offset && mid < o.offset + o.width)
      .map((o) => [o.sill, o.sill + o.height])
      .sort((a, b) => a[0] - b[0]);
    let bottom = 0;
    for (const [low, high] of intervals) {
      if (low > bottom + 1e-8)
        panels.push({ left: a, bottom, width: b - a, height: low - bottom });
      bottom = Math.max(bottom, high);
    }
    if (bottom < w.height - 1e-8)
      panels.push({ left: a, bottom, width: b - a, height: w.height - bottom });
  }
  // Different-height neighbors must join only across the shared vertical span.
  const levels = entities
    .filter(isWall)
    .filter((other) => !other.hidden)
    .flatMap((other) => [
      other.position.z - w.position.z,
      other.position.z + other.height - w.position.z,
    ]);
  return panels.flatMap((panel) => {
    const cuts = [
      ...new Set([
        panel.bottom,
        panel.bottom + panel.height,
        ...levels.filter(
          (z) =>
            z > panel.bottom + 1e-8 && z < panel.bottom + panel.height - 1e-8,
        ),
      ]),
    ].sort((a, b) => a - b);
    return cuts
      .slice(0, -1)
      .map((bottom, i) => ({ ...panel, bottom, height: cuts[i + 1] - bottom }));
  });
}
