import { test, expect, type Page } from "@playwright/test";
const key = "winter-garden-project-v1";
test("большая пальма заменяет растения правой зелёной зоны и редактируется", async ({
  page,
}) => {
  await page.goto("/");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByLabel("Файл проекта")
    .setInputFiles("examples/winter-garden.garden.json");
  await expect.poll(() => document(page)).not.toBeNull();
  const before = await document(page);
  expect(
    before.entities.filter((e: { type: string }) => e.type === "palm"),
  ).toHaveLength(1);
  expect(
    before.entities.filter((e: { type: string }) => e.type === "spruce"),
  ).toHaveLength(2);
  expect(
    before.entities.some((e: { name: string }) =>
      e.name.startsWith("Правая зелёная зона · растение"),
    ),
  ).toBe(false);
  await expandFloors(page);
  await page
    .getByRole("button", {
      name: "Правая зелёная зона · большая пальма",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Высота", { exact: true })).toHaveValue("6.5");
  await page.getByLabel("Высота", { exact: true }).fill("7");
  await page.getByLabel("Высота", { exact: true }).press("Enter");
  expect(
    (await document(page)).entities.find(
      (e: { type: string }) => e.type === "palm",
    ).height,
  ).toBe(7);
  await page.locator("canvas").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("Control+z");
  expect(
    (await document(page)).entities.find(
      (e: { type: string }) => e.type === "palm",
    ).height,
  ).toBe(6.5);
  await page
    .getByRole("button", {
      name: "Левая зелёная зона · большая ель",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Высота", { exact: true })).toHaveValue("5");
  await page
    .getByRole("button", {
      name: "Левая зелёная зона · малая ель",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Высота", { exact: true })).toHaveValue("4");
  await page.locator("canvas").click({ position: { x: 20, y: 20 } });
  for (let i = 0; i < 1; i++)
    await page.getByRole("button", { name: "Приблизить", exact: true }).click();
  await page.screenshot({ path: ".impeccable/review/right-zone-palm.png" });
  await page.screenshot({ path: ".impeccable/review/palm-and-spruces.png" });
  await page
    .getByRole("button", { name: "Вид сверху (+Z)", exact: true })
    .click();
  await page.screenshot({
    path: ".impeccable/review/palm-and-spruces-top.png",
  });
});
test("дверь двигается вдоль стены в плане и 3D, открывание меняется и сохраняется", async ({
  page,
}) => {
  await empty(page);
  await draw(page, "Стена (W)", [
    [-8, 0],
    [8, 0],
  ]);
  await page
    .locator(".properties-panel")
    .getByRole("button", { name: "Дверь", exact: true })
    .click();
  const offset = page.getByLabel("Отступ от начала сегмента", { exact: true });
  await offset.fill("3");
  await offset.press("Enter");
  const before = await document(page);
  await page.getByRole("button", { name: "Стена", exact: true }).click();
  const drag = async (
    start: { x: number; y: number },
    end: { x: number; y: number },
    cancel = false,
  ) => {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
  };
  await drag(await point(page, -4.5, 0), await point(page, -2.5, 0));
  await expect(offset).toHaveValue("5");
  expect((await document(page)).entities[0].points).toEqual(
    before.entities[0].points,
  );
  await page.keyboard.press("Control+z");
  await expect(offset).toHaveValue("3");
  await page.keyboard.press("Control+Shift+z");
  await expect(offset).toHaveValue("5");
  await drag(await point(page, -2.5, 0), await point(page, -0.5, 0), true);
  await expect(offset).toHaveValue("5");
  await page
    .getByRole("button", { name: "Развернуть открывание", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Сменить петли", exact: true })
    .click();
  expect((await document(page)).entities[0].openings[0]).toMatchObject({
    hinge: "right",
    swing: -1,
  });
  await page.screenshot({ path: ".impeccable/review/door-editing-plan.png" });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Приблизить", exact: true }).click();
  const THREE = await import("three"),
    b = (await page.locator("canvas").boundingBox())!,
    camera = new THREE.PerspectiveCamera(42, b.width / b.height, 0.1, 2000),
    target = new THREE.Vector3(-2, 1, -4);
  camera.position
    .set(48, 46, 55)
    .sub(target)
    .multiplyScalar(1 / 1.2 ** 3)
    .add(target);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const screen = (x: number) => {
    const p = new THREE.Vector3(x, 2.0775, 0.1).project(camera);
    return {
      x: b.x + ((p.x + 1) * b.width) / 2,
      y: b.y + ((1 - p.y) * b.height) / 2,
    };
  };
  await drag(screen(-2.5), screen(-0.5));
  await expect(offset).toHaveValue("7");
  await page.screenshot({ path: ".impeccable/review/door-editing-3d.png" });
  await page.keyboard.press("Control+z");
  await expect(offset).toHaveValue("5");
});
test("кубик ориентации центрирует виды по шести осям и следует за камерой", async ({
  page,
}) => {
  await page.goto("/");
  const doc = await document(page);
  await page.getByLabel("Отображение по этажам").selectOption("lower");
  const cube = page.getByRole("group", {
    name: "Кубик ориентации",
    exact: true,
  });
  await expect(cube).toBeVisible();
  for (const name of [
    "Вид справа (+X)",
    "Вид слева (−X)",
    "Вид спереди (+Y)",
    "Вид сзади (−Y)",
    "Вид сверху (+Z)",
    "Вид снизу (−Z)",
  ]) {
    const button = page.getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Отображение по этажам")).toHaveValue("lower");
  }
  await page.getByRole("button", { name: "Изометрия", exact: true }).click();
  await expect(
    cube.locator(".view-cube-axes [aria-pressed='true']"),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Кубик: спереди", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Вид спереди (+Y)", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const before = await page.locator(".view-cube-solid").getAttribute("style");
  const b = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.25, b.y + b.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.35, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(() => page.locator(".view-cube-solid").getAttribute("style"))
    .not.toBe(before);
  await expect(
    cube.locator(".view-cube-axes [aria-pressed='true']"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "План", exact: true }).click();
  await page
    .getByRole("button", { name: "Вид справа (+X)", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "3D", exact: true }),
  ).toHaveClass("current");
  await expect(
    page.getByRole("button", { name: "Вид справа (+X)", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await document(page)).toEqual(doc);
  await page.getByRole("button", { name: "Изометрия", exact: true }).click();
  await page.screenshot({ path: ".impeccable/review/view-cube-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(cube).toBeVisible();
  await page
    .getByRole("button", { name: "Вид сверху (+Z)", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Вид сверху (+Z)", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: ".impeccable/review/view-cube-mobile.png" });
});
test("ручки размера на плане: сторона, угол, одна отмена и Esc", async ({
  page,
}) => {
  await empty(page);
  await page
    .getByRole("button", { name: "Добавить объект", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Прямоугольник", exact: true })
    .click();
  const center = await point(page, 0, 0);
  await page.mouse.click(center.x, center.y);
  await page.keyboard.press("KeyR");
  const drag = async (a: [number, number], b: [number, number]) => {
    const start = await point(page, ...a),
      end = await point(page, ...b);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
  };
  await drag([1, 0], [3, 0]);
  let e = (await document(page)).entities[0];
  expect(e.width).toBeCloseTo(4, 1);
  expect(e.position.x).toBeCloseTo(1, 1);
  expect(e.depth).toBe(2);
  await page.keyboard.press("Control+z");
  expect((await document(page)).entities[0].width).toBe(2);
  await page.keyboard.press("Control+Shift+z");
  await drag([3, 1], [4, 2]);
  e = (await document(page)).entities[0];
  expect(e.width).toBeCloseTo(5, 1);
  expect(e.depth).toBeCloseTo(3, 1);
  const before = await document(page),
    start = await point(page, 4, 2),
    end = await point(page, 7, 4);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await document(page)).toEqual(before);
  await page.keyboard.press("KeyR");
  await page.screenshot({ path: ".impeccable/review/resize-plan.png" });
});
test("ручка верхней грани меняет высоту в 3D и отменяется одним действием", async ({
  page,
}) => {
  await empty(page);
  await page
    .getByRole("button", { name: "Добавить объект", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Прямоугольник", exact: true })
    .click();
  const center = await point(page, 0, 0);
  await page.mouse.click(center.x, center.y);
  await page.getByLabel("Высота", { exact: true }).fill("3");
  await page.getByLabel("Высота", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.getByRole("button", { name: "Размер (R)", exact: true }).click();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Приблизить", exact: true }).click();
  const THREE = await import("three"),
    b = (await page.locator("canvas").boundingBox())!,
    camera = new THREE.PerspectiveCamera(42, b.width / b.height, 0.1, 2000),
    target = new THREE.Vector3(-2, 1, -4);
  camera.position
    .set(48, 46, 55)
    .sub(target)
    .multiplyScalar(1 / 1.2 ** 3)
    .add(target);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const screen = (height: number) => {
    const p = new THREE.Vector3(0, height, 0).project(camera);
    return {
      x: b.x + ((p.x + 1) * b.width) / 2,
      y: b.y + ((1 - p.y) * b.height) / 2,
    };
  };
  const start = screen(3),
    end = screen(5);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
  const e = (await document(page)).entities[0];
  expect(e.height).toBeCloseTo(5, 1);
  expect(e.position.z).toBe(0);
  expect(e.width).toBe(2);
  await page.screenshot({ path: ".impeccable/review/resize-3d.png" });
  await page.keyboard.press("Control+z");
  expect((await document(page)).entities[0].height).toBe(3);
});
test("размер стены не обрезает дверь и не создаёт запись истории при ошибке", async ({
  page,
}) => {
  await empty(page);
  await draw(page, "Стена (W)", [
    [-4, 0],
    [4, 0],
  ]);
  await page
    .locator(".properties-panel")
    .getByRole("button", { name: "Дверь", exact: true })
    .click();
  await page.getByRole("button", { name: "Стена", exact: true }).click();
  await page.getByRole("button", { name: "Размер (R)", exact: true }).click();
  const before = await document(page),
    start = await point(page, 4, 0),
    end = await point(page, -3, 0);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("alert")).toContainText("не помещается");
  expect(await document(page)).toEqual(before);
  await page.keyboard.press("Control+z");
  expect((await document(page)).entities[0].openings).toHaveLength(0);
});
test("квадратные колонны и красные двухместные диваны редактируются и экспортируются", async ({
  page,
}) => {
  await page.goto("/");
  await expandFloors(page);
  await page
    .getByRole("button", { name: "Красный двухместный диван 4", exact: true })
    .click();
  await expect(page.getByLabel("Название", { exact: true })).toHaveValue(
    "Красный двухместный диван 4",
  );
  await expect(page.getByLabel("Ширина", { exact: true })).toHaveValue("1.65");
  await page.getByRole("button", { name: "Колонна 1", exact: true }).click();
  await expect(page.getByLabel("Глубина", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Ширина", { exact: true })).toHaveValue("0.72");
  await page
    .getByRole("button", { name: "Добавить объект", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Двухместный диван", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  // A blank viewport click removes the selection for the review image.
  await page.mouse.click(1000, 260);
  await page.screenshot({ path: ".impeccable/review/north-sofas.png" });
});
test("старая сохранённая сцена автоматически получает стены до пола без сброса правок", async ({
  page,
}) => {
  const fs = await import("node:fs/promises");
  const old = JSON.parse(
    await fs.readFile("examples/winter-garden.garden.json", "utf8"),
  );
  delete old.appliedFixes;
  old.entities = old.entities.filter(
    (e: { id: string }) => !e.id.startsWith("lower-perimeter:"),
  );
  for (const e of old.entities)
    if (
      e.type === "wall" &&
      e.position.z === 0 &&
      e.height >= 2 &&
      e.floorGroup === "gallery"
    ) {
      e.position.z = 1.6;
      e.height -= 1.6;
      e.openings.forEach((o: { sill: number }) => (o.sill -= 1.6));
      delete e.floorGroup;
    }
  const custom = old.entities.find((e: { type: string }) => e.type === "plant");
  custom.name = "Моё растение";
  custom.color = "#123456";
  custom.position.x += 0.3;
  await page.addInitScript(
    ({ key, old }) => {
      if (!sessionStorage.getItem("perimeter-seeded")) {
        localStorage.setItem(key, JSON.stringify(old));
        sessionStorage.setItem("perimeter-seeded", "yes");
      }
    },
    { key, old },
  );
  await page.goto("/");
  await expect
    .poll(async () => (await document(page))?.appliedFixes)
    .toContain("ground-perimeter-v1");
  const migrated = await document(page);
  expect(
    migrated.entities.find((e: { id: string }) => e.id === custom.id),
  ).toEqual(custom);
  const wall = migrated.entities.find(
    (e: { name: string }) => e.name === "Стена главного входа",
  );
  expect(wall.position.z).toBe(0);
  expect(wall.height).toBeCloseTo(4.8);
  expect(
    migrated.entities.some((e: { id: string }) =>
      e.id.startsWith("lower-perimeter:"),
    ),
  ).toBe(true);
  await page.getByLabel("Отображение по этажам").selectOption("lower");
  await expandFloors(page);
  await page
    .getByRole("button", { name: "Стена главного входа", exact: true })
    .click();
  await expect(
    page.getByLabel("Высота основания", { exact: true }),
  ).toHaveValue("0");
  await page.screenshot({ path: ".impeccable/review/perimeter-migrated.png" });
  await page.getByLabel("Высота основания", { exact: true }).fill("0.2");
  await page.getByLabel("Высота основания", { exact: true }).press("Enter");
  await page.reload();
  expect(
    (await document(page)).entities.find(
      (e: { id: string }) => e.id === wall.id,
    ).position.z,
  ).toBe(0.2);
});
test("наращённая стена видна и выбирается на 0 м и на +1,6 м", async ({
  page,
}) => {
  const doc = {
    version: 1,
    name: "Проверка стены",
    entities: [
      {
        id: "wall",
        type: "wall",
        name: "Стена до пола",
        color: "#7d8b8d",
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        hidden: false,
        floorGroup: "gallery",
        points: [
          { x: -6, y: 0 },
          { x: 6, y: 0 },
        ],
        segmentIds: ["segment"],
        height: 4.8,
        thickness: 0.3,
        openings: [],
      },
    ],
  };
  await page.addInitScript(
    ({ key, doc }) => localStorage.setItem(key, JSON.stringify(doc)),
    { key, doc },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "План", exact: true }).click();
  for (const floor of ["ground", "gallery", "lower"]) {
    await page.getByLabel("Отображение по этажам").selectOption(floor);
    const p = await point(page, 0, 0);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByLabel("Название", { exact: true })).toHaveValue(
      "Стена до пола",
    );
    await expect(
      page.getByLabel("Высота основания", { exact: true }),
    ).toHaveValue("0");
    await expect(page.getByLabel("Отображение по этажам")).toHaveValue(floor);
  }
});
test("вид 0 м + 1,6 м сохраняется при выборе объектов обоих уровней", async ({
  page,
}) => {
  await page.goto("/");
  const floors = page.getByLabel("Отображение по этажам");
  await floors.selectOption("lower");
  for (const name of ["Основная площадка", "Левая галерея"])
    await expect(
      page.locator(".scene-label").filter({ hasText: name }),
    ).toHaveCount(1);
  await expect(
    page.locator(".scene-label").filter({ hasText: "Боковой балкон" }),
  ).toHaveCount(0);
  await expandFloors(page);
  for (const name of ["Основная площадка", "Левая галерея"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(floors).toHaveValue("lower");
  }
  await page
    .getByRole("button", { name: "Восточная наружная стена", exact: true })
    .click();
  await expect(
    page.getByLabel("Высота основания", { exact: true }),
  ).toHaveValue("0");
  await expect(page.getByLabel("Высота", { exact: true })).toHaveValue("4.8");
  await page
    .getByRole("button", {
      name: "Наружная стена под боковым балконом",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Высота основания", { exact: true }),
  ).toHaveValue("0");
  await expect(page.getByLabel("Высота", { exact: true })).toHaveValue("4.8");
  await page.getByRole("button", { name: "План", exact: true }).click();
  await expect(floors).toHaveValue("lower");
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.screenshot({ path: ".impeccable/review/combined-floors.png" });
});
test("экспорт GLB сохраняет все этажи, материалы и метры независимо от вида", async ({
  page,
}) => {
  const fs = await import("node:fs/promises");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByLabel("Файл проекта")
    .setInputFiles("examples/winter-garden.garden.json");
  const before = await document(page);
  await page.getByLabel("Отображение по этажам").selectOption("upper");
  await page.getByRole("button", { name: "План", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт GLB", exact: true }).click();
  const downloaded = await pending;
  expect(downloaded.suggestedFilename()).toMatch(/\.glb$/);
  const bytes = await fs.readFile((await downloaded.path())!);
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
  const gltf = JSON.parse(
    bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"),
  );
  expect(gltf.asset.version).toBe("2.0");
  expect(
    gltf.nodes.filter((node: { extras?: { id?: string } }) => node.extras?.id),
  ).toHaveLength(before.entities.length);
  for (const name of ["1 этаж", "Галереи и холл", "2 этаж · балкон", "Крыша"])
    expect(
      gltf.nodes.some((node: { name?: string }) => node.name === name),
    ).toBe(true);
  expect(
    gltf.materials.some(
      (material: { alphaMode?: string }) => material.alphaMode === "BLEND",
    ),
  ).toBe(true);
  expect(gltf.cameras).toBeUndefined();
  expect(gltf.buffers[0].uri).toBeUndefined();
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const { Box3, Vector3 } = await import("three");
  const imported = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  imported.scene.updateMatrixWorld(true);
  const balcony = before.entities.find(
    (e: { name: string }) => e.name === "Боковой балкон",
  );
  const main = before.entities.find(
    (e: { name: string }) => e.name === "Основная площадка",
  );
  let checkedMain = false,
    checkedBalcony = false;
  imported.scene.traverse((node) => {
    if (node.userData.id === balcony.id) {
      expect(node.getWorldPosition(new Vector3()).y).toBeCloseTo(4.8);
      checkedBalcony = true;
    }
    if (node.userData.id === main.id) {
      const size = new Box3().setFromObject(node).getSize(new Vector3());
      expect(size.x).toBeCloseTo(30);
      expect(size.z).toBeCloseTo(12);
      checkedMain = true;
    }
  });
  expect(checkedMain && checkedBalcony).toBe(true);
  expect(await document(page)).toEqual(before);
  await expect(page.getByLabel("Отображение по этажам")).toHaveValue("upper");
  await expect(
    page.getByRole("button", { name: "Экспорт GLB", exact: true }),
  ).toBeEnabled();
  await fs.writeFile(".impeccable/review/winter-garden.glb", bytes);
  expect(errors).toEqual([]);
});
async function expandFloors(page: Page) {
  for (const button of await page
    .getByRole("button", { name: /^Этаж: / })
    .all())
    if ((await button.getAttribute("aria-expanded")) === "false")
      await button.click();
}
async function empty(page: Page) {
  await page.addInitScript(
    (k) =>
      localStorage.setItem(
        k,
        JSON.stringify({ version: 1, name: "Проверка", entities: [] }),
      ),
    key,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "План", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible();
}
async function document(page: Page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key);
}
async function point(page: Page, x: number, y: number) {
  const b = (await page.locator("canvas").boundingBox())!;
  return {
    x: b.x + b.width / 2 + (x * b.height) / 48,
    y: b.y + b.height / 2 + (y * b.height) / 48,
  };
}
async function draw(page: Page, tool: string, points: [number, number][]) {
  await page.getByRole("button", { name: tool, exact: true }).click();
  for (const [x, y] of points) {
    const p = await point(page, x, y);
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.press("Enter");
}
test("вогнутый план, редактирование вершин, перенос и история, 3D и JSON", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await empty(page);
  await draw(page, "Площадка (P)", [
    [-8, -5],
    [4, -5],
    [4, -1],
    [-2, -1],
    [-2, 6],
    [-8, 6],
  ]);
  await expect(page.getByLabel("Название", { exact: true })).toHaveValue(
    "Площадка",
  );
  let doc = await document(page);
  expect(doc.entities).toHaveLength(1);
  expect(doc.entities[0].points).toHaveLength(6);
  await page.getByLabel("Отметка поверхности").fill("1.6");
  await page.getByLabel("Отметка поверхности").press("Enter");
  await page.getByLabel("Вершина", { exact: true }).selectOption("0");
  await page.getByLabel("X вершины").fill("-7");
  await page.getByLabel("X вершины").press("Enter");
  await page.getByRole("button", { name: "Вершины", exact: true }).click();
  const vertexStart = await point(page, -9, -5),
    vertexEnd = await point(page, -10, -6);
  await page.mouse.move(vertexStart.x, vertexStart.y);
  await page.mouse.down();
  await page.mouse.move(vertexEnd.x, vertexEnd.y, { steps: 5 });
  await page.mouse.up();
  expect((await document(page)).entities[0].points[0].x).toBeCloseTo(-8, 1);
  await page.getByRole("button", { name: "Выбрать (V)", exact: true }).click();
  doc = await document(page);
  const before = doc.entities[0].position.x;
  const p = await point(page, -6, -3),
    q = await point(page, -4, -1);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, { steps: 8 });
  await page.mouse.up();
  expect((await document(page)).entities[0].position.x).toBeCloseTo(
    before + 2,
    1,
  );
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  expect((await document(page)).entities[0].position.x).toBeCloseTo(before);
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.getByText("Объёмная схема", { exact: true })).toBeVisible();
  const saved = await document(page);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Сохранить проект", exact: true })
    .click();
  const download = await downloadPromise;
  const fs = await import("node:fs/promises");
  const content = await fs.readFile((await download.path())!, "utf8");
  expect(JSON.parse(content)).toEqual(saved);
  // Restore the exported file through the actual file input.
  await page.getByLabel("Файл проекта").setInputFiles({
    name: "test.garden.json",
    mimeType: "application/json",
    buffer: Buffer.from(content),
  });
  expect(await document(page)).toEqual(saved);
  const pngPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт PNG", exact: true }).click();
  const png = await pngPromise;
  expect((await fs.stat((await png.path())!)).size).toBeGreaterThan(5000);
  expect(errors).toEqual([]);
});
test("стена, проёмы, отклонение неверного размера, перенос и удаление", async ({
  page,
}) => {
  await empty(page);
  await draw(page, "Стена (W)", [
    [-8, 0],
    [8, 0],
  ]);
  await page
    .locator(".properties-panel")
    .getByRole("button", { name: "Дверь", exact: true })
    .click();
  await expect(page.getByLabel("Название проёма")).toHaveValue("Дверной проём");
  await page.getByRole("button", { name: "Стена", exact: true }).click();
  await page
    .locator(".properties-panel")
    .getByRole("button", { name: "Окно", exact: true })
    .click();
  let doc = await document(page);
  expect(doc.entities[0].openings).toHaveLength(2);
  await page.getByRole("button", { name: "Стена", exact: true }).click();
  await page.getByLabel("Ширина", { exact: true }).fill(".5");
  await page.getByLabel("Ширина", { exact: true }).press("Enter");
  await expect(page.getByRole("alert")).toContainText("не помещается");
  expect((await document(page)).entities[0].points).toEqual(
    doc.entities[0].points,
  );
  await page.getByLabel("X", { exact: true }).fill("3");
  await page.getByLabel("X", { exact: true }).press("Enter");
  doc = await document(page);
  expect(doc.entities[0].position.x).toBe(3);
  expect(doc.entities[0].openings).toHaveLength(2);
  await page
    .getByRole("button", { name: "Дверной проём", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Удалить проём", exact: true })
    .click();
  expect((await document(page)).entities[0].openings).toHaveLength(1);
});
test("каталог, дублирование, неверный JSON и восстановление черновика", async ({
  page,
}) => {
  await empty(page);
  await page
    .getByRole("button", { name: "Добавить объект", exact: true })
    .click();
  await page.getByRole("button", { name: "Лестница", exact: true }).click();
  const p = await point(page, 0, 0);
  await page.mouse.click(p.x, p.y);
  await page.getByRole("button", { name: "Дублировать", exact: true }).click();
  expect((await document(page)).entities).toHaveLength(2);
  const before = await document(page);
  await page.getByLabel("Файл проекта").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{wrong"),
  });
  await expect(page.getByRole("alert")).toContainText("JSON");
  expect(await document(page)).toEqual(before);
  // addInitScript only seeds once in this test context, so use a separate unseeded page for reload verification.
  const restored = await page.context().newPage();
  await restored.goto("/");
  await expandFloors(restored);
  await expect(
    restored.getByRole("button", { name: "Лестница", exact: true }),
  ).toBeVisible();
  await expect(
    restored.getByRole("button", { name: "Лестница (копия)", exact: true }),
  ).toBeVisible();
  await restored.close();
});
test("неверный контур не меняет проект", async ({ page }) => {
  await empty(page);
  await draw(page, "Площадка (P)", [
    [-5, -5],
    [5, 5],
    [-5, 5],
    [5, -5],
  ]);
  await expect(page.getByRole("alert")).toContainText("пересекать");
  expect((await document(page)).entities).toHaveLength(0);
});
test("Ctrl+C/V копирует снимок стены с проёмами, повторная вставка и история", async ({
  page,
}) => {
  await empty(page);
  await draw(page, "Стена (W)", [
    [-8, 0],
    [8, 0],
  ]);
  await page
    .locator(".properties-panel")
    .getByRole("button", { name: "Дверь", exact: true })
    .click();
  // Select the wall rather than its newly added opening.
  await page.getByRole("button", { name: "Стена", exact: true }).click();
  const original = (await document(page)).entities[0];
  await page.locator("canvas").focus();
  await page.keyboard.press("Control+c");
  expect((await document(page)).entities).toHaveLength(1);
  await page
    .getByLabel("Название", { exact: true })
    .fill("Изменено после копирования");
  await page.getByLabel("Название", { exact: true }).press("Enter");
  await page.locator("canvas").focus();
  await page.keyboard.press("Control+v");
  let doc = await document(page);
  expect(doc.entities).toHaveLength(2);
  const pasted = doc.entities[1];
  expect(pasted.name).toBe("Стена (копия)");
  expect(pasted.id).not.toBe(original.id);
  expect(pasted.segmentIds[0]).not.toBe(original.segmentIds[0]);
  expect(pasted.openings[0].segmentId).toBe(pasted.segmentIds[0]);
  expect(pasted.openings[0].id).not.toBe(original.openings[0].id);
  expect(pasted.position.x).toBe(original.position.x + 1);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.keyboard.press("Control+v");
  doc = await document(page);
  expect(doc.entities).toHaveLength(3);
  expect(doc.entities[2].position.x).toBe(original.position.x + 2);
  await page.keyboard.press("Control+z");
  expect((await document(page)).entities).toHaveLength(2);
  await page.keyboard.press("Control+Shift+z");
  expect((await document(page)).entities).toHaveLength(3);
  // Text editing keeps the browser's normal clipboard behavior.
  await page
    .getByRole("button", { name: "Стена (копия)", exact: true })
    .last()
    .click();
  await page.getByLabel("Название", { exact: true }).focus();
  await page.keyboard.press("Control+v");
  expect((await document(page)).entities).toHaveLength(3);
});
test("замена проекта требует подтверждения, отмена сохраняет документ", async ({
  page,
}) => {
  await empty(page);
  await draw(page, "Площадка (P)", [
    [-5, -5],
    [5, -5],
    [5, 5],
    [-5, 5],
  ]);
  const before = await document(page);
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Новый проект", exact: true }).click();
  expect(await document(page)).toEqual(before);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Новый проект", exact: true }).click();
  expect((await document(page)).entities).toHaveLength(0);
});
test("манипулятор 3D перемещает объект одним действием", async ({ page }) => {
  await empty(page);
  await page
    .getByRole("button", { name: "Добавить объект", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Прямоугольник", exact: true })
    .click();
  const center = await point(page, 0, 0);
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const THREE = await import("three");
  const b = (await page.locator("canvas").boundingBox())!,
    camera = new THREE.PerspectiveCamera(42, b.width / b.height, 0.1, 2000);
  camera.position.set(48, 46, 55);
  camera.lookAt(-2, 1, -4);
  camera.updateMatrixWorld();
  const projected = (x: number) => {
    const p = new THREE.Vector3(x, 0, 0).project(camera);
    return {
      x: b.x + ((p.x + 1) * b.width) / 2,
      y: b.y + ((1 - p.y) * b.height) / 2,
    };
  };
  const start = projected(4),
    end = projected(7);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
  expect((await document(page)).entities[0].position.x).toBeGreaterThan(2);
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  expect((await document(page)).entities[0].position.x).toBe(0);
  expect((await document(page)).entities).toHaveLength(1);
});
test("крыша, скрытие объекта и просмотр на узком экране", async ({ page }) => {
  await page.goto("/");
  await expandFloors(page);
  const total = await page.locator(".object-row").count();
  await page
    .getByRole("button", { name: "Показать крышу", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Показать крышу", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Скрыть: Основная площадка", exact: true })
    .click();
  expect((await document(page)).entities[0].hidden).toBe(true);
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  expect((await document(page)).entities[0].hidden).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Инструменты и объекты", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Инструменты и объекты", exact: true })
    .click();
  expect(await page.locator(".object-row").count()).toBe(total);
  await expect(page.locator(".tools-panel")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("контур крыши редактируется на плане, не закрывая помещение", async ({
  page,
}) => {
  await page.goto("/");
  await expandFloors(page);
  await page
    .getByRole("button", { name: "Стеклянная крыша", exact: true })
    .click();
  await page.getByRole("button", { name: "Вершины", exact: true }).click();
  const before = await page.getByLabel("X вершины").count();
  expect(before).toBe(0);
  const a = await point(page, -20, -12.5),
    b = await point(page, -21, -13.5);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  const roof = (await document(page)).entities.find(
    (e: { type: string }) => e.type === "roof",
  );
  expect(roof.points[0].x).toBeCloseTo(-21, 1);
  expect(roof.points[0].y).toBeCloseTo(-13.5, 1);
});

test("при блокировке автосохранения проект можно скачать", async ({ page }) => {
  await empty(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage unavailable", "QuotaExceededError");
    };
  });
  await draw(page, "Площадка (P)", [
    [-4, -4],
    [4, -4],
    [4, 4],
    [-4, 4],
  ]);
  await expect(page.getByRole("alert")).toContainText("не смог сохранить");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Сохранить проект", exact: true })
    .click();
  const download = await downloadPromise;
  const fs = await import("node:fs/promises");
  const data = JSON.parse(await fs.readFile((await download.path())!, "utf8"));
  expect(data.entities).toHaveLength(1);
});

test("изменение цвета с несколькими промежуточными значениями отменяется одним действием", async ({
  page,
}) => {
  await empty(page);
  await draw(page, "Площадка (P)", [
    [-4, -4],
    [4, -4],
    [4, 4],
    [-4, 4],
  ]);
  const original = (await document(page)).entities[0].color,
    color = page.getByLabel("Цвет объекта");
  await color.focus();
  for (const value of ["#aabbcc", "#667788", "#446688"]) {
    await color.evaluate((element, value) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  }
  await expect(color).toHaveValue("#446688");
  expect((await document(page)).entities[0].color).toBe(original);
  await page.getByRole("button", { name: "План", exact: true }).click();
  expect((await document(page)).entities[0].color).toBe("#446688");
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  expect((await document(page)).entities[0].color).toBe(original);
  expect((await document(page)).entities).toHaveLength(1);
});

test("схема по изображению загружается из файла и остаётся редактируемой", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByLabel("Файл проекта")
    .setInputFiles("examples/winter-garden.garden.json");
  const fs = await import("node:fs/promises");
  const example = JSON.parse(
    await fs.readFile("examples/winter-garden.garden.json", "utf8"),
  );
  await expect(page.locator(".objects-heading")).toContainText(
    String(example.entities.length),
  );
  await expandFloors(page);
  await page.getByRole("button", { name: "План", exact: true }).click();
  await page
    .getByRole("button", { name: "Показать всю схему", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Основная площадка", exact: true })
    .click();
  await expect(page.getByLabel("Ширина", { exact: true })).toHaveValue("30");
  await expect(page.getByLabel("Глубина", { exact: true })).toHaveValue("12");
  await page.getByRole("button", { name: "Холл", exact: true }).click();
  await expect(page.getByLabel("Ширина", { exact: true })).toHaveValue("40");
  await expect(page.getByLabel("Глубина", { exact: true })).toHaveValue("5");
  await page
    .getByRole("button", { name: "Боковой балкон", exact: true })
    .click();
  await expect(
    page.getByLabel("Отметка поверхности", { exact: true }),
  ).toHaveValue("4.8");
  await page
    .getByRole("button", { name: "Центральная лестница", exact: true })
    .click();
  await expect(page.getByLabel("Ширина", { exact: true })).toHaveValue("8");
  // Deselect via empty canvas so the captures show the whole reference layout.
  const b = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(b.x + 20, b.y + b.height - 20);
  for (const button of await page
    .getByRole("button", { name: /^Этаж: / })
    .all())
    if ((await button.getAttribute("aria-expanded")) === "true")
      await button.click();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.screenshot({ path: ".impeccable/review/reference-plan.png" });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page
    .getByRole("button", { name: "Показать всю схему", exact: true })
    .click();
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.screenshot({ path: ".impeccable/review/reference-3d.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "План", exact: true }).click();
  await page
    .getByRole("button", { name: "Показать всю схему", exact: true })
    .click();
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.screenshot({ path: ".impeccable/review/reference-mobile.png" });
  expect(errors).toEqual([]);
});

test("этажи сворачиваются и скрываются независимо от отдельных объектов", async ({
  page,
}) => {
  await page.goto("/");
  const ground = page.getByRole("button", {
    name: "Этаж: 1 этаж",
    exact: true,
  });
  const upper = page.getByRole("button", {
    name: "Этаж: 2 этаж · балкон",
    exact: true,
  });
  await expect(ground).toHaveAttribute("aria-expanded", "false");
  await expect(upper).toHaveAttribute("aria-expanded", "false");
  await upper.click();
  await page
    .getByRole("button", { name: "Боковой балкон", exact: true })
    .click();
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("-17.5");
  await expect(
    page.getByLabel("Отметка поверхности", { exact: true }),
  ).toHaveValue("4.8");
  await page
    .getByRole("button", { name: "Скрыть этаж: 1 этаж", exact: true })
    .click();
  await expect(
    page.locator(".scene-label").filter({ hasText: "Основная площадка" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".scene-label").filter({ hasText: "Боковой балкон" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Показать этаж: 1 этаж", exact: true })
    .click();
  await expect(
    page.locator(".scene-label").filter({ hasText: "Основная площадка" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Этаж: 2 этаж · балкон", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Боковой балкон", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".scene-label").filter({ hasText: "Боковой балкон" }),
  ).toHaveCount(1);
});
test("отображение одного этажа и свойства справа", async ({ page }) => {
  await page.goto("/");
  const before = await document(page);
  const floors = page.getByLabel("Отображение по этажам");
  await floors.selectOption("upper");
  await expect(
    page.locator(".scene-label").filter({ hasText: "Основная площадка" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".scene-label").filter({ hasText: "Боковой балкон" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "План", exact: true }).click();
  await expect(floors).toHaveValue("upper");
  await expect(
    page.locator(".scene-label").filter({ hasText: "Основная площадка" }),
  ).toHaveCount(0);
  await expandFloors(page);
  await page
    .getByRole("button", { name: "Основная площадка", exact: true })
    .click();
  await expect(floors).toHaveValue("ground");
  await expect(page.getByLabel("Название", { exact: true })).toHaveValue(
    "Основная площадка",
  );
  const inspector = (await page.locator(".properties-panel").boundingBox())!;
  const viewport = (await page.locator("canvas").boundingBox())!;
  expect(inspector.x).toBeGreaterThanOrEqual(viewport.x + viewport.width - 1);
  await floors.selectOption("all");
  await expect(
    page.locator(".scene-label").filter({ hasText: "Боковой балкон" }),
  ).toHaveCount(1);
  expect(await document(page)).toEqual(before);
  await floors.selectOption("roof");
  await expect(
    page.getByRole("button", { name: "Показать крышу", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("выбор мышью открывает свойства, новый объект на выбранном этаже и мобильный инспектор", async ({
  page,
}) => {
  await empty(page);
  await page.getByLabel("Отображение по этажам").selectOption("upper");
  await page
    .getByRole("button", { name: "Добавить объект", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Прямоугольник", exact: true })
    .click();
  const center = await point(page, 0, 0);
  await page.mouse.click(center.x, center.y);
  await expect(page.getByLabel("Название", { exact: true })).toHaveValue(
    "Прямоугольник",
  );
  expect((await document(page)).entities[0].position.z).toBe(4.8);
  const outside = await point(page, 10, 10);
  await page.mouse.click(outside.x, outside.y);
  await expect(page.getByLabel("Название", { exact: true })).toHaveCount(0);
  await page.mouse.click(center.x, center.y);
  await expect(page.getByLabel("Название", { exact: true })).toHaveValue(
    "Прямоугольник",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Инструменты и объекты", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Прямоугольник", exact: true })
    .click();
  await expect(page.locator(".properties-panel")).toBeVisible();
  await expect(page.getByLabel("Название", { exact: true })).toHaveValue(
    "Прямоугольник",
  );
  await expect(page.locator(".tools-panel")).not.toBeVisible();
  await page.screenshot({ path: ".impeccable/review/floors-mobile.png" });
});
test("выбор на схеме раскрывает этаж и прокручивает список к объекту и проёму", async ({
  page,
}) => {
  const entities = Array.from({ length: 81 }, (_, i) => ({
    id: `box-${i}`,
    name: `Объект ${i}`,
    type: "box",
    color: "#a1b8ac",
    hidden: false,
    position: { x: i === 80 ? 0 : -10, y: -4, z: 0 },
    rotation: 0,
    width: 2,
    depth: 2,
    height: 1,
    steps: 5,
  }));
  const wall = {
    id: "last-wall",
    name: "Последняя стена",
    type: "wall",
    color: "#a1b8ac",
    hidden: false,
    position: { x: 0, y: 4, z: 0 },
    rotation: 0,
    points: [
      { x: -6, y: 0 },
      { x: 6, y: 0 },
    ],
    segmentIds: ["segment"],
    thickness: 0.3,
    height: 3,
    openings: [],
  };
  await page.addInitScript(
    ({ key, entities }) =>
      localStorage.setItem(
        key,
        JSON.stringify({ version: 1, name: "Проверка прокрутки", entities }),
      ),
    { key, entities: [...entities, wall] },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "План", exact: true }).click();
  const targetPoint = await point(page, 0, -4);
  const assertInList = async (row: ReturnType<Page["locator"]>) => {
    const list = (await page.locator(".object-list").boundingBox())!,
      target = (await row.boundingBox())!;
    expect(target.y).toBeGreaterThanOrEqual(list.y - 1);
    expect(target.y + target.height).toBeLessThanOrEqual(
      list.y + list.height + 1,
    );
  };
  await page.mouse.click(targetPoint.x, targetPoint.y);
  const chosen = page.locator(".object-row.chosen");
  await expect(chosen).toContainText("Объект 80");
  await assertInList(chosen);
  const tools = (await page.locator(".tools-panel").boundingBox())!,
    viewport = (await page.locator("canvas").boundingBox())!;
  expect(tools.x + tools.width).toBeLessThanOrEqual(viewport.x + 1);
  // Clicking an already-selected object must reveal it again after collapsing its floor.
  await page.getByRole("button", { name: "Этаж: 1 этаж", exact: true }).click();
  await page.mouse.click(targetPoint.x, targetPoint.y);
  await expect(chosen).toContainText("Объект 80");
  await assertInList(chosen);
  const wallPoint = await point(page, -4, 4);
  await page.mouse.click(wallPoint.x, wallPoint.y);
  await expect(chosen).toContainText("Последняя стена");
  await page
    .locator(".properties-panel")
    .getByRole("button", { name: "Дверь", exact: true })
    .click();
  const opening = page.locator(".opening-row.chosen");
  await expect(opening).toContainText("Дверной проём");
  await assertInList(opening);
  await page
    .getByRole("button", { name: "Последняя стена", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Проёмы: Последняя стена", exact: true })
    .click();
  await page
    .locator(".properties-panel")
    .getByRole("button", { name: "Окно", exact: true })
    .click();
  await expect(opening).toContainText("Оконный проём");
  await assertInList(opening);
  await page.screenshot({ path: ".impeccable/review/object-autoscroll.png" });
});
