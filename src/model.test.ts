import { describe, expect, it } from "vitest";
import {
  History,
  area,
  bounds,
  distance,
  correctGardenLevels,
  alignBalconyAboveGallery,
  entityFloor,
  entityFloors,
  encloseRaisedPlatforms,
  extendFirstFloorWalls,
  applyGardenPerimeterFix,
  applyGardenUpdates,
  floorInView,
  clone,
  duplicate,
  initialProject,
  makeSolid,
  makeSurface,
  makeWall,
  moveOpening,
  doorSwing,
  parseProject,
  resized,
  resizeBounds,
  resizeFromHandle,
  toLocal,
  toWorld,
  uid,
  validateContour,
  validateProject,
  wallPanels,
  wallPanelFootprint,
  type Project,
  type Wall,
} from "./model";

const polygon = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 2 },
  { x: 2, y: 2 },
  { x: 2, y: 6 },
  { x: 0, y: 6 },
];
describe("перемещение и открывание двери", () => {
  const wall = makeWall([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ]);
  wall.rotation = 37;
  wall.openings = [
    {
      id: "door",
      segmentId: wall.segmentIds[0],
      name: "Дверь",
      type: "door",
      offset: 2,
      width: 1,
      height: 2,
      sill: 0,
    },
  ];
  it("двигает только проём, ограничивает концами сегмента и отклоняет пересечение", () => {
    expect(moveOpening(wall, "door", 5).openings[0].offset).toBe(5);
    expect(moveOpening(wall, "door", -4).openings[0].offset).toBe(0);
    expect(moveOpening(wall, "door", 20).openings[0].offset).toBe(9);
    expect(wall.openings[0].offset).toBe(2);
    const next = clone(wall);
    next.openings.push({ ...next.openings[0], id: "other", offset: 6 });
    expect(() => moveOpening(next, "door", 6)).toThrow();
    expect(moveOpening(wall, "door", 5).points).toEqual(wall.points);
  });
  it("сохраняет четыре варианта открывания при записи и чтении проекта", () => {
    for (const hinge of ["left", "right"] as const)
      for (const swing of [1, -1] as const) {
        const next = clone(wall);
        Object.assign(next.openings[0], { hinge, swing });
        expect(doorSwing(next.openings[0])).toEqual({
          hinge: hinge === "left" ? 2 : 3,
          along: hinge === "left" ? 1 : -1,
          side: swing,
        });
        const project: Project = {
          version: 1,
          name: "Двери",
          entities: [next],
        };
        expect(parseProject(JSON.stringify(project))).toEqual(project);
      }
    expect(doorSwing(wall.openings[0])).toEqual({
      hinge: 2,
      along: 1,
      side: 1,
    });
  });
});
describe("изменение размера за грани", () => {
  it("растягивает повёрнутый объект, удерживая противоположную грань", () => {
    const e = makeSolid("box", 3, 5);
    e.rotation = 37;
    const opposite = toWorld(e, { x: -e.width / 2, y: 0 });
    const next = resizeFromHandle(
      e,
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    );
    expect(next.type).toBe("box");
    if (next.type !== "box") throw Error("box");
    expect(next.width).toBe(4);
    expect(next.depth).toBe(2);
    const after = toWorld(next, { x: -next.width / 2, y: 0 });
    expect(distance(opposite, after)).toBeLessThan(1e-7);
    expect(e.width).toBe(2);
  });
  it("масштабирует вогнутую площадку за угол и толщину без смещения противоположного угла", () => {
    const e = makeSurface("floor", polygon, "Площадка", 1.6),
      old = resizeBounds(e);
    const next = resizeFromHandle(
      e,
      { x: -1, y: -1, z: 1 },
      { x: -2, y: -1, z: 0.2 },
    );
    const b = resizeBounds(next);
    expect(
      distance(
        toWorld(e, { x: old.maxX, y: old.maxY }),
        toWorld(next, { x: b.maxX, y: b.maxY }),
      ),
    ).toBeLessThan(1e-7);
    expect(next.position.z + b.minZ).toBeCloseTo(e.position.z + old.minZ);
    expect(next.type).toBe("floor");
    if (next.type !== "floor") throw Error("floor");
    expect(next.points).toHaveLength(6);
    expect(next.thickness).toBeCloseTo(0.35);
    expect(area(next.points)).toBeGreaterThan(area(e.points));
  });
  it("сохраняет проёмы при наращивании вниз, отклоняет сжатие поверх двери и меняет толщину", () => {
    const wall = makeWall([
      { x: -4, y: 0 },
      { x: 4, y: 0 },
    ]);
    wall.openings = [
      {
        id: uid(),
        segmentId: wall.segmentIds[0],
        name: "Дверь",
        type: "door",
        offset: 1,
        width: 1,
        height: 2.1,
        sill: 0,
      },
    ];
    const next = resizeFromHandle(
      wall,
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 0, z: -1 },
    ) as Wall;
    expect(next.position.z).toBe(-1);
    expect(next.openings[0].sill).toBe(1);
    expect(() =>
      resizeFromHandle(wall, { x: 1, y: 0, z: 0 }, { x: -7, y: 0, z: 0 }),
    ).toThrow(/не помещается/);
    expect(() =>
      resizeFromHandle(wall, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0.5 }),
    ).toThrow();
    const thick = resizeFromHandle(
      wall,
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0.25, z: 0 },
    ) as Wall;
    expect(thick.thickness).toBeCloseTo(0.5);
  });
  it("не выворачивает объект и сохраняет квадратное сечение колонны", () => {
    const e = makeSolid("column"),
      old = resizeBounds(e);
    const next = resizeFromHandle(
      e,
      { x: 1, y: 1, z: 0 },
      { x: 1, y: 2, z: 0 },
    );
    if (next.type !== "column") throw Error("column");
    expect(next.width).toBeCloseTo(1.6);
    expect(next.depth).toBeCloseTo(1.6);
    expect(
      distance(
        toWorld(e, { x: old.minX, y: old.minY }),
        toWorld(next, { x: -next.width / 2, y: -next.depth / 2 }),
      ),
    ).toBeLessThan(1e-7);
    const small = resizeFromHandle(
      e,
      { x: 1, y: 0, z: 0 },
      { x: -99, y: 0, z: 0 },
    );
    if (small.type !== "column") throw Error("column");
    expect(small.width).toBeCloseTo(0.05);
  });
});
describe("квадратные колонны и диваны", () => {
  it("заменяет правые угловые растения одной редактируемой пальмой без повторного сброса", () => {
    const project = initialProject();
    const palm = project.entities.find((e) => e.type === "palm");
    expect(palm).toMatchObject({
      name: "Правая зелёная зона · большая пальма",
      height: 6.5,
      width: 5,
      position: { z: 0.22 },
    });
    expect(project.entities.filter((e) => e.type === "palm")).toHaveLength(1);
    expect(
      project.entities.filter(
        (e) =>
          e.type === "plant" &&
          e.name.startsWith("Правая зелёная зона · растение"),
      ),
    ).toHaveLength(0);
    expect(
      project.entities.filter(
        (e) =>
          e.type === "plant" &&
          e.name.startsWith("Левая зелёная зона · растение"),
      ),
    ).toHaveLength(0);
    const trees = project.entities.filter((e) => e.type === "spruce");
    expect(trees).toHaveLength(2);
    expect(trees.map((e) => e.height)).toEqual([5, 4]);
    trees[0].position.x += 0.7;
    trees[0].height = 4.6;
    expect(project.entities.some((e) => e.name === "Правая зелёная зона")).toBe(
      true,
    );
    if (!palm || palm.type !== "palm") throw new Error("palm");
    palm.height = 5.7;
    palm.position.x += 0.5;
    expect(applyGardenUpdates(project)).toBe(project);
    expect(parseProject(JSON.stringify(project))).toEqual(project);
    expect(
      applyGardenUpdates({ version: 1, name: "Другой проект", entities: [] })
        .entities,
    ).toEqual([]);
  });
  it("заменяет только северное озеленение, оставляет лестницы свободными и сохраняется в JSON", () => {
    const doc = initialProject();
    const sofas = doc.entities.filter((e) => e.type === "sofa");
    expect(sofas).toHaveLength(7);
    expect(
      doc.entities.some((e) =>
        /северное озеленение|северный бордюр|Северная полоса озеленения/.test(
          e.name,
        ),
      ),
    ).toBe(false);
    expect(doc.entities.some((e) => e.name === "Северная зона отдыха")).toBe(
      true,
    );
    expect(doc.entities.some((e) => e.name === "Левая зелёная зона")).toBe(
      true,
    );
    for (const e of doc.entities)
      if (e.type === "column") expect(e.depth).toBe(e.width);
    for (const sofa of sofas) {
      if (sofa.type !== "sofa") throw new Error("sofa");
      expect(sofa.color).toBe("#bc2637");
      for (const x of [-6, 6])
        expect(
          sofa.position.x + sofa.width / 2 <= x - 2.5 ||
            sofa.position.x - sofa.width / 2 >= x + 2.5,
        ).toBe(true);
    }
    expect(parseProject(JSON.stringify(doc))).toEqual(doc);
    expect(applyGardenUpdates(doc)).toBe(doc);
    const column = makeSolid("column");
    expect((resized(column, 1.2, 0.5) as typeof column).depth).toBe(1.2);
  });
});
describe("стены первого этажа и совместный вид", () => {
  it("исправляет старую сцену один раз и сохраняет отметку исправления в JSON", () => {
    const old = initialProject();
    delete old.appliedFixes;
    const wall = old.entities.find(
      (e) => e.name === "Стена главного входа",
    ) as Wall;
    wall.position.z = 1.6;
    wall.height = 3.2;
    wall.openings.forEach((o) => (o.sill -= 1.6));
    delete wall.floorGroup;
    const corrected = applyGardenPerimeterFix(old);
    expect(
      (corrected.entities.find((e) => e.id === wall.id) as Wall).position.z,
    ).toBe(0);
    expect(old.entities.find((e) => e.id === wall.id)?.position.z).toBe(1.6);
    const imported = parseProject(JSON.stringify(corrected));
    expect(imported.appliedFixes).toContain("ground-perimeter-v1");
    imported.entities.find((e) => e.id === wall.id)!.position.z = 0.2;
    expect(applyGardenPerimeterFix(imported)).toBe(imported);
    const empty: Project = { version: 1, name: "Мой проект", entities: [] };
    expect(applyGardenPerimeterFix(empty)).toBe(empty);
  });
  it("наращивает стены вниз, сохраняя верх, проёмы и группу этажа", () => {
    const wall = makeWall([
      { x: -4, y: 0 },
      { x: 4, y: 0 },
    ]);
    wall.position.z = 1.6;
    wall.height = 3.2;
    wall.openings = [
      {
        id: uid(),
        type: "door",
        name: "Дверь",
        segmentId: wall.segmentIds[0],
        offset: 1,
        width: 1,
        height: 2.1,
        sill: 0,
      },
    ];
    const railing = clone(wall);
    railing.id = uid();
    railing.segmentIds = [uid()];
    railing.height = 0.38;
    railing.openings = [];
    const balcony = clone(wall);
    balcony.id = uid();
    balcony.segmentIds = [uid()];
    balcony.position.z = 4.8;
    balcony.openings = [];
    const original: Project = {
      version: 1,
      name: "Стены",
      entities: [wall, railing, balcony],
    };
    const result = extendFirstFloorWalls(original),
      extended = result.entities[0] as Wall;
    expect(extended.position.z).toBe(0);
    expect(extended.height).toBeCloseTo(4.8);
    expect(extended.position.z + extended.height).toBeCloseTo(
      wall.position.z + wall.height,
    );
    expect(extended.openings[0].sill).toBe(1.6);
    expect(entityFloor(extended)).toBe("gallery");
    expect(entityFloors(extended)).toEqual(["ground", "gallery"]);
    expect(entityFloors(railing)).toEqual(["gallery"]);
    expect(result.entities.slice(1)).toEqual([railing, balcony]);
    expect(original.entities[0].position.z).toBe(1.6);
    expect(extendFirstFloorWalls(result)).toEqual(result);
    expect(parseProject(JSON.stringify(result))).toEqual(result);
  });
  it("совмещает только 0 м и +1,6 м", () => {
    expect(floorInView("lower", "ground")).toBe(true);
    expect(floorInView("lower", "gallery")).toBe(true);
    expect(floorInView("lower", "upper")).toBe(false);
    expect(floorInView("lower", "roof")).toBe(false);
  });
  it("замыкает весь наружный периметр первого этажа, сохраняя стену балкона", () => {
    const project = initialProject();
    const lower = project.entities.find((e) =>
      e.id.startsWith("lower-perimeter:"),
    ) as Wall;
    expect(lower.position.z).toBe(0);
    expect(lower.height).toBe(4.8);
    const upper = project.entities.find(
      (e) => e.name === "Наружная стена бокового балкона",
    ) as Wall;
    expect(upper.position.z).toBe(4.8);
    expect(upper.openings).toHaveLength(4);
    expect(lower.points.map((p) => toWorld(lower, p))).toEqual(
      upper.points.map((p) => toWorld(upper, p)),
    );
    const exterior = project.entities.filter(
      (e): e is Wall =>
        e.type === "wall" && e.position.z === 0 && e.height >= 4.8,
    );
    const covered = (p: { x: number; y: number }) =>
      exterior.some((w) =>
        w.points.slice(0, -1).some((_, i) => {
          const a = toWorld(w, w.points[i]),
            b = toWorld(w, w.points[i + 1]);
          return (
            Math.abs(distance(a, p) + distance(p, b) - distance(a, b)) < 1e-7
          );
        }),
      );
    for (let x = -20; x <= 20; x += 0.5) {
      expect(covered({ x, y: -17.5 })).toBe(true);
      expect(covered({ x, y: 12.5 })).toBe(true);
    }
    for (let y = -17.5; y <= 12.5; y += 0.5) {
      expect(covered({ x: -20, y })).toBe(true);
      expect(covered({ x: 20, y })).toBe(true);
    }
    expect(extendFirstFloorWalls(project)).toEqual(project);
  });
});
describe("стыки стен", () => {
  const panel = { left: 0, width: 4, bottom: 0, height: 3 };
  const worldOutline = (w: Wall, entities: Wall[], index = 0) => {
    const a = w.points[index],
      b = w.points[index + 1],
      len = distance(a, b);
    return wallPanelFootprint(w, index, panel, entities).map((p) =>
      toWorld(w, {
        x: a.x + (p.x * (b.x - a.x)) / len - (p.y * (b.y - a.y)) / len,
        y: a.y + (p.x * (b.y - a.y)) / len + (p.y * (b.x - a.x)) / len,
      }),
    );
  };
  it.each([30, 90, 135])(
    "соединяет обе грани отдельных стен под углом %s с разной толщиной",
    (angle) => {
      const first = makeWall([
        { x: -4, y: 0 },
        { x: 0, y: 0 },
      ]);
      const second = makeWall([
        { x: 0, y: 0 },
        {
          x: 4 * Math.cos((angle * Math.PI) / 180),
          y: 4 * Math.sin((angle * Math.PI) / 180),
        },
      ]);
      first.thickness = 0.4;
      second.thickness = 0.6;
      first.height = second.height = 3;
      const before = clone([first, second]);
      const one = worldOutline(first, [first, second]),
        two = worldOutline(second, [first, second]);
      for (const end of [one[1], one[2]])
        expect(two.some((p) => distance(p, end) < 1e-7)).toBe(true);
      expect([first, second]).toEqual(before);
    },
  );
  it("закрывает Т-стык, не соединяет разные этажи и не перекрывает проём", () => {
    const wall = makeWall([
      { x: -4, y: 0 },
      { x: 0, y: 0 },
    ]);
    const cross = makeWall([
      { x: 0, y: -4 },
      { x: 0, y: 4 },
    ]);
    wall.height = cross.height = 3;
    cross.thickness = 0.6;
    expect(wallPanelFootprint(wall, 0, panel, [wall, cross])[1].x).toBeCloseTo(
      4.3,
    );
    const middle = wallPanelFootprint(
      wall,
      0,
      { ...panel, left: 1, width: 2 },
      [wall, cross],
    );
    expect(Math.min(...middle.map((p) => p.x))).toBe(1);
    expect(Math.max(...middle.map((p) => p.x))).toBe(3);
    cross.position.z = 4.8;
    expect(wallPanelFootprint(wall, 0, panel, [wall, cross])[1].x).toBe(4);
  });
  it("стыкует сегменты ломаной после поворота", () => {
    const wall = makeWall([
      { x: -4, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 4 },
    ]);
    wall.height = 3;
    wall.rotation = 37;
    const one = worldOutline(wall, [wall]),
      two = worldOutline(wall, [wall], 1);
    expect(two.some((p) => distance(p, one[1]) < 1e-7)).toBe(true);
    expect(two.some((p) => distance(p, one[2]) < 1e-7)).toBe(true);
  });
});
describe("стенки под площадками +1,6 м", () => {
  const platform = (x1: number, x2: number, name: string) =>
    makeSurface(
      "floor",
      [
        { x: x1, y: -2 },
        { x: x2, y: -2 },
        { x: x2, y: 2 },
        { x: x1, y: 2 },
      ],
      name,
      1.6,
    );
  it("закрывает наружный контур без стены на стыке площадок и сохраняет группу после JSON", () => {
    const original: Project = {
        version: 1,
        name: "Площадки",
        entities: [platform(-4, 0, "Левая"), platform(0, 4, "Правая")],
      },
      result = encloseRaisedPlatforms(original);
    const walls = result.entities.filter((e) => e.type === "wall");
    expect(walls).toHaveLength(6);
    expect(
      walls.reduce(
        (sum, w) => sum + distance(w.points[0], w.points[1]) * w.height,
        0,
      ),
    ).toBeCloseTo(24 * 1.45);
    expect(
      walls.some((w) =>
        w.points.every((p) => Math.abs(toWorld(w, p).x) < 0.001),
      ),
    ).toBe(false);
    expect(
      walls.every(
        (w) =>
          entityFloor(w) === "gallery" &&
          w.position.z === 0 &&
          Math.abs(w.height - 1.45) < 1e-7,
      ),
    ).toBe(true);
    expect(original.entities).toHaveLength(2);
    expect(encloseRaisedPlatforms(result)).toEqual(result);
    expect(parseProject(JSON.stringify(result))).toEqual(result);
  });
  it("достраивает только незакрытую высоту над существующей стенкой", () => {
    const old = makeWall([
      { x: -2, y: -2 },
      { x: 2, y: -2 },
    ]);
    old.position.z = 0;
    old.height = 0.75;
    const result = encloseRaisedPlatforms({
      version: 1,
      name: "Площадка",
      entities: [platform(-2, 2, "Галерея"), old],
    });
    const walls = result.entities.filter(
      (e): e is Wall => e.type === "wall" && e.id !== old.id,
    );
    expect(
      walls.reduce(
        (sum, w) => sum + distance(w.points[0], w.points[1]) * w.height,
        0,
      ),
    ).toBeCloseTo(16 * 1.45 - 4 * 0.75);
    expect(result.entities.find((e) => e.id === old.id)).toEqual(old);
    const north = walls.find((w) => Math.abs(w.position.y + 2) < 1e-6)!;
    expect(north.position.z).toBe(0.75);
    expect(north.height).toBeCloseTo(0.7);
  });
});
describe("контуры и координаты", () => {
  it("сохраняет вогнутый контур, высоту и площадь после JSON", () => {
    const floor = makeSurface("floor", polygon, "Вогнутая площадка", 1.6),
      p: Project = { version: 1, name: "Тест", entities: [floor] };
    const restored = parseProject(JSON.stringify(p));
    expect(restored).toEqual(p);
    expect(area(floor.points)).toBe(20);
    expect(floor.points.map((p) => toWorld(floor, p))).toEqual(polygon);
  });
  it("отклоняет самопересечения, нулевую площадь, касания и совпадающие точки", () => {
    for (const points of [
      [
        { x: 0, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
        { x: 4, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 2, y: 0 },
        { x: 0, y: 4 },
      ],
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    ])
      expect(() => validateContour(points, true)).toThrow();
  });
  it("не допускает возврат по ребру открытой стены", () => {
    expect(() =>
      validateContour(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: -1, y: 0 },
        ],
        false,
      ),
    ).toThrow();
  });
  it("преобразует локальные координаты при переносе и повороте", () => {
    const e = makeSolid("box", 3, -5, 1.6);
    e.rotation = 37;
    const p = { x: 2, y: -4 },
      back = toLocal(e, toWorld(e, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });
});
function wallWithOpenings() {
  const wall = makeWall([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ]);
  wall.height = 4;
  wall.openings = [
    {
      id: uid(),
      name: "Дверь",
      type: "door",
      segmentId: wall.segmentIds[0],
      offset: 1,
      width: 2,
      height: 2.5,
      sill: 0,
    },
    {
      id: uid(),
      name: "Окно",
      type: "window",
      segmentId: wall.segmentIds[0],
      offset: 5,
      width: 3,
      height: 1.5,
      sill: 1,
    },
  ];
  return wall;
}
describe("стены с настоящими проёмами", () => {
  it("строит панели ровно вокруг проёмов", () => {
    const wall = wallWithOpenings(),
      panels = wallPanels(wall, 0);
    expect(panels.reduce((s, p) => s + p.width * p.height, 0)).toBeCloseTo(
      40 - 5 - 4.5,
    );
    for (const p of panels)
      for (const o of wall.openings) {
        const overlap =
          Math.max(
            0,
            Math.min(p.left + p.width, o.offset + o.width) -
              Math.max(p.left, o.offset),
          ) *
          Math.max(
            0,
            Math.min(p.bottom + p.height, o.sill + o.height) -
              Math.max(p.bottom, o.sill),
          );
        expect(overlap).toBe(0);
      }
  });
  it("не теряет привязку проёмов при переносе, повороте и дублировании", () => {
    const w = wallWithOpenings();
    w.position = { x: 10, y: 20, z: 1.6 };
    w.rotation = 90;
    const n = duplicate(w);
    expect(n.type).toBe("wall");
    if (n.type === "wall") {
      expect(n.openings.map((o) => o.segmentId)).toEqual([
        n.segmentIds[0],
        n.segmentIds[0],
      ]);
      expect(n.segmentIds[0]).not.toBe(w.segmentIds[0]);
      validateProject({ version: 1, name: "test", entities: [w, n] });
    }
  });
  it("отклоняет укорочение стены и изменение высоты, если проём не помещается", () => {
    const w = wallWithOpenings();
    expect(() =>
      validateProject({
        version: 1,
        name: "test",
        entities: [resized(w, 6, 0)],
      }),
    ).toThrow(/не помещается/);
    w.height = 2;
    expect(() =>
      validateProject({ version: 1, name: "test", entities: [w] }),
    ).toThrow(/не помещается/);
  });
  it("отклоняет перекрытие проёмов и отсутствующий сегмент", () => {
    const w = wallWithOpenings();
    w.openings[1].offset = 2;
    expect(() =>
      validateProject({ version: 1, name: "test", entities: [w] }),
    ).toThrow(/пересекаться/);
    w.openings[1].segmentId = "missing";
    expect(() =>
      validateProject({ version: 1, name: "test", entities: [w] }),
    ).toThrow(/сегмент/);
  });
});
describe("документ и история", () => {
  it("схема по референсу сохраняет размеры, пять лестниц и служебные зоны", () => {
    const p = initialProject();
    validateProject(p);
    const balcony = p.entities.find((e) => e.name === "Боковой балкон")!;
    const upper = p.entities.find((e) => e.name === "Холл")!;
    expect(upper.position.z).toBe(1.6);
    expect(balcony.position.z).toBe(4.8);
    expect(balcony.position.x).toBe(-17.5);
    const dimensions = (e: typeof balcony) =>
      "points" in e ? bounds(e.points) : { width: e.width, depth: e.depth };
    expect(dimensions(upper)).toMatchObject({ width: 40, depth: 5 });
    expect(dimensions(balcony)).toMatchObject({ width: 5, depth: 25 });
    expect(
      dimensions(p.entities.find((e) => e.name === "Основная площадка")!),
    ).toMatchObject({ width: 30, depth: 12 });
    expect(p.entities.filter((e) => e.type === "stairs")).toHaveLength(5);
    expect(
      p.entities.filter(
        (e) => e.type === "column" && e.name.startsWith("Колонна "),
      ),
    ).toHaveLength(15);
    expect(
      p.entities
        .filter((e) => e.name.startsWith("Колонна "))
        .every((e) => e.position.z === 1.6),
    ).toBe(true);
    for (const name of [
      "Левая зелёная зона",
      "Правая зелёная зона",
      "Организаторы",
      "Зона кейтеринга · стойка",
      "Главный вход",
      "Нижняя ступень подиума",
      "Подиум",
    ])
      expect(p.entities.some((e) => e.name === name)).toBe(true);
    expect(
      p.entities.filter(
        (e) =>
          e.name.startsWith("Верхний балкон · столик") &&
          e.name.endsWith("столешница"),
      ),
    ).toHaveLength(0);
    expect(
      p.entities.filter(
        (e) =>
          e.name.startsWith("Боковой балкон · столик") &&
          e.name.endsWith("столешница"),
      ),
    ).toHaveLength(3);
    expect(
      p.entities.filter(
        (e) =>
          e.type !== "wall" &&
          e.type !== "floor" &&
          e.type !== "roof" &&
          e.position.y >= -17.5 &&
          e.position.y <= -12.5 &&
          Math.abs(e.position.x) <= 20,
      ),
    ).toHaveLength(0);
  });
  it("поднимает балкон с содержимым и очищает холл, сохраняя остальные правки", () => {
    const balcony = makeSurface(
      "floor",
      [
        { x: -25, y: -12.5 },
        { x: -20, y: -12.5 },
        { x: -20, y: 12.5 },
        { x: -25, y: 12.5 },
      ],
      "Боковой балкон",
      1.6,
    );
    const chair = makeSolid("chair", -22.5, 0, 1.6),
      outside = makeSolid("table", 3, 2, 0),
      plant = makeSolid("plant", 0, -15, 1.6);
    const source: Project = {
        version: 1,
        name: "Мой проект",
        entities: [balcony, chair, outside, plant],
      },
      result = correctGardenLevels(source);
    expect(
      result.entities.find((e) => e.id === chair.id)?.position.z,
    ).toBeCloseTo(4.8);
    expect(result.entities.find((e) => e.id === outside.id)).toEqual(outside);
    expect(result.entities.some((e) => e.id === plant.id)).toBe(false);
    expect(source.entities[0].position.z).toBe(1.6);
    expect(correctGardenLevels(result)).toEqual(result);
  });
  it("совмещает балкон с галереей, сохраняя высоту и взаимное положение обстановки", () => {
    const base = initialProject(),
      shifted = clone(base);
    shifted.entities
      .filter((e) => entityFloor(e) === "upper")
      .forEach((e) => (e.position.x -= 5));
    const result = alignBalconyAboveGallery(shifted);
    expect(result).toEqual(base);
    expect(
      shifted.entities.find((e) => e.name === "Боковой балкон")?.position.x,
    ).toBe(-22.5);
    expect(alignBalconyAboveGallery(result)).toEqual(result);
    expect(entityFloor(makeSolid("plant", 0, 0, 0.48))).toBe("ground");
    expect(entityFloor(makeSolid("table", 0, 0, 2.27))).toBe("gallery");
    expect(entityFloor(makeSolid("chair", 0, 0, 4.8))).toBe("upper");
  });
  it("восстанавливает документ и связи без потерь", () => {
    const p = initialProject();
    expect(parseProject(JSON.stringify(p))).toEqual(p);
  });
  it("повреждённые файлы, дубликаты ID и бесконечные размеры отклоняются", () => {
    for (const raw of [
      "{",
      "null",
      "{}",
      '{"version":2,"entities":[]}',
      '{"version":1,"name":"x","entities":[{}]}',
    ])
      expect(() => parseProject(raw)).toThrow();
    const p = initialProject();
    p.entities[1].id = p.entities[0].id;
    expect(() => validateProject(p)).toThrow(/уникальны/);
    const e = makeSolid("box");
    e.height = NaN;
    expect(() =>
      validateProject({ version: 1, name: "x", entities: [e] }),
    ).toThrow();
  });
  it("отменяет весь жест одним действием, очищает повтор после нового изменения", () => {
    const p: Project = {
        version: 1,
        name: "x",
        entities: [makeSolid("stairs")],
      },
      h = new History(p);
    const next = clone(p);
    next.entities[0].position.x = 20;
    h.commit(next);
    expect(h.past).toHaveLength(1);
    expect(h.undo()).toEqual(p);
    expect(h.redo()).toEqual(next);
    h.undo();
    const alternate = clone(p);
    alternate.entities[0].rotation = 90;
    h.commit(alternate);
    expect(h.future).toHaveLength(0);
    expect(h.current).toEqual(alternate);
  });
  it("не записывает ошибку или неизменённый документ в историю", () => {
    const p = initialProject(),
      h = new History(p);
    h.commit(clone(p));
    expect(h.past).toHaveLength(0);
    const next = clone(p);
    next.entities[0].position.z = Infinity;
    expect(() => h.commit(next)).toThrow();
    expect(h.current).toEqual(p);
    expect(h.past).toHaveLength(0);
  });
});
