import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  clone,
  entityFloor,
  entityFloors,
  floorGroups,
  distance,
  isSurface,
  isWall,
  toLocal,
  toWorld,
  wallPanels,
  wallPanelFootprint,
  doorSwing,
  moveOpening,
  resizeBounds,
  resizeFromHandle,
  type ResizeHandle,
  type Entity,
  type FloorGroup,
  type Point,
  type Project,
  type Solid,
  type Wall,
} from "./model";

export type Tool =
  | "select"
  | "vertex"
  | "resize"
  | "floor"
  | "wall"
  | "roof"
  | "door"
  | "window"
  | Solid["type"];
export type View = "plan" | "3d";
export const CAMERA_VIEWS = [
  {
    id: "right",
    label: "справа",
    face: "Право",
    axis: "+X",
    direction: [1, 0, 0],
  },
  {
    id: "left",
    label: "слева",
    face: "Лево",
    axis: "−X",
    direction: [-1, 0, 0],
  },
  {
    id: "front",
    label: "спереди",
    face: "Перед",
    axis: "+Y",
    direction: [0, 0, 1],
  },
  {
    id: "back",
    label: "сзади",
    face: "Зад",
    axis: "−Y",
    direction: [0, 0, -1],
  },
  {
    id: "top",
    label: "сверху",
    face: "Верх",
    axis: "+Z",
    direction: [0, 1, 0],
  },
  {
    id: "bottom",
    label: "снизу",
    face: "Низ",
    axis: "−Z",
    direction: [0, -1, 0],
  },
] as const;
export type CameraView = (typeof CAMERA_VIEWS)[number]["id"] | "iso";
export type SceneState = {
  project: Project;
  selected: string | null;
  tool: Tool;
  view: View;
  snap: boolean;
  grid: boolean;
  hideRoof: boolean;
  labels: boolean;
  transform: "translate" | "rotate";
  hiddenFloors?: FloorGroup[];
};
type Callbacks = {
  select: (id: string | null) => void;
  edit: (e: Entity) => void;
  draw: (points: Point[], type: "floor" | "wall" | "roof") => void;
  place: (point: Point, type: Solid["type"]) => void;
  opening: (
    wallId: string,
    segment: number,
    offset: number,
    type: "door" | "window",
  ) => void;
  error: (message: string) => void;
  hint: (message: string) => void;
  vertex: (index: number | null) => void;
};
type Hit = { entity: Entity; opening?: string; point: THREE.Vector3 };
const v3 = (p: Point, z = 0) => new THREE.Vector3(p.x, z, p.y);

export class GardenScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  model = new THREE.Group();
  overlay = new THREE.Group();
  grid: THREE.GridHelper;
  perspective = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
  ortho = new THREE.OrthographicCamera(-32, 32, 22, -22, 0.1, 2000);
  camera: THREE.Camera;
  orbit: OrbitControls;
  transform: TransformControls;
  state: SceneState | null = null;
  roots = new Map<string, THREE.Group>();
  ray = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  resizeObserver: ResizeObserver;
  animation = 0;
  disposed = false;
  labelNodes: { element: HTMLDivElement; point: THREE.Vector3 }[] = [];
  draft: Point[] = [];
  hoverPoint: Point | null = null;
  draftElevation = 0;
  vertexIndex: number | null = null;
  drag: null | {
    kind: "entity" | "vertex";
    id: string;
    index?: number;
    start: Point;
    original: Entity;
    preview: Entity;
    root: THREE.Group;
    pointer: number;
  } = null;
  down: { x: number; y: number } | null = null;
  private moving = false;
  private lastView: View = "3d";
  private transformOriginal: Entity | null = null;
  private box: THREE.BoxHelper | null = null;
  private resizeDrag: null | {
    original: Entity;
    preview: Entity;
    handle: ResizeHandle;
    plane: THREE.Plane;
    start: THREE.Vector3;
    root: THREE.Group;
    previewRoot: THREE.Group | null;
    pointer: number;
    error: string;
    changed: boolean;
  } = null;
  private suppressClick = false;
  private pendingOrientation: CameraView | null = null;
  private openingDrag: null | {
    original: Wall;
    preview: Wall;
    openingId: string;
    axis: THREE.Vector3;
    plane: THREE.Plane;
    start: THREE.Vector3;
    pointer: number;
    previewRoot: THREE.Group | null;
    error: string;
    changed: boolean;
  } = null;
  private savedPlan = {
    position: new THREE.Vector3(0, 100, 0),
    target: new THREE.Vector3(0, 0, 0),
    zoom: 1,
  };
  private saved3d = {
    position: new THREE.Vector3(48, 46, 55),
    target: new THREE.Vector3(-2, 1, -4),
  };
  constructor(
    private host: HTMLDivElement,
    private callbacks: Callbacks,
  ) {
    this.scene.background = new THREE.Color("#edf0e8");
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Рабочая область схемы",
    );
    this.renderer.domElement.setAttribute("role", "application");
    this.renderer.domElement.tabIndex = 0;
    host.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9c83, 1.7));
    const light = new THREE.DirectionalLight(0xffffff, 1.6);
    light.position.set(10, 40, 20);
    this.scene.add(light);
    this.grid = new THREE.GridHelper(200, 200, 0x9eaea0, 0xd6ded1);
    this.grid.position.y = -0.2;
    this.scene.add(this.grid);
    this.scene.add(this.model, this.overlay);
    this.perspective.position.copy(this.saved3d.position);
    this.ortho.position.copy(this.savedPlan.position);
    this.ortho.up.set(0, 0, -1);
    this.ortho.lookAt(0, 0, 0);
    this.camera = this.perspective;
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.target.copy(this.saved3d.target);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.15;
    this.orbit.maxPolarAngle = Math.PI;
    this.orbit.minDistance = 2;
    this.orbit.maxDistance = 400;
    this.orbit.update();
    this.transform = new TransformControls(
      this.camera,
      this.renderer.domElement,
    );
    this.transform.setSize(0.8);
    this.transform.setSpace("world");
    this.scene.add(this.transform.getHelper());
    this.transform.addEventListener("dragging-changed", (event) => {
      this.moving = Boolean(event.value);
      this.orbit.enabled = !this.moving;
      if (this.moving) {
        const e = this.selectedEntity();
        this.transformOriginal = e ? clone(e) : null;
        this.suppressClick = true;
      } else if (this.transformOriginal) {
        const root = this.roots.get(this.transformOriginal.id);
        if (root) {
          const next = clone(this.transformOriginal);
          next.position = {
            x: root.position.x,
            y: root.position.z,
            z: root.position.y,
          };
          next.rotation = -THREE.MathUtils.radToDeg(root.rotation.y);
          this.callbacks.edit(next);
        }
        this.transformOriginal = null;
      }
    });
    this.transform.addEventListener("objectChange", () => {
      this.box?.update();
    });
    this.renderer.domElement.addEventListener("pointerdown", this.onDown);
    this.renderer.domElement.addEventListener("pointermove", this.onMove);
    this.renderer.domElement.addEventListener("pointerup", this.onUp);
    this.renderer.domElement.addEventListener("pointercancel", this.onCancel);
    this.renderer.domElement.addEventListener("dblclick", this.onDouble);
    this.renderer.domElement.addEventListener("contextmenu", this.onContext);
    window.addEventListener("keydown", this.onKey);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.animate();
  }
  private selectedEntity() {
    const id = this.state?.selected;
    return this.state?.project.entities.find(
      (e) => e.id === id || (isWall(e) && e.openings.some((o) => o.id === id)),
    );
  }
  private animate = () => {
    if (this.disposed) return;
    this.animation = requestAnimationFrame(this.animate);
    this.orbit.update();
    if (this.state?.tool === "resize")
      this.overlay.traverse((o) => {
        if (!(o instanceof THREE.Sprite) || !o.userData.resizeHandle) return;
        const size =
          this.state?.view === "plan"
            ? (48 / this.ortho.zoom / this.host.clientHeight) * 8
            : ((this.camera.position.distanceTo(
                o.getWorldPosition(new THREE.Vector3()),
              ) *
                Math.tan(THREE.MathUtils.degToRad(this.perspective.fov / 2)) *
                2) /
                this.host.clientHeight) *
              8;
        o.scale.set(size, size, 1);
      });
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
    this.updateViewCube();
  };
  resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    const previousAspect = this.perspective.aspect;
    this.renderer.setSize(w, h);
    this.perspective.aspect = w / h;
    this.perspective.updateProjectionMatrix();
    const half = 24;
    this.ortho.left = (-half * w) / h;
    this.ortho.right = (half * w) / h;
    this.ortho.top = half;
    this.ortho.bottom = -half;
    this.ortho.updateProjectionMatrix();
    if (this.state && Math.abs(previousAspect - w / h) > 0.15) this.frame();
  }
  update(state: SceneState) {
    const prev = this.state;
    if (
      this.openingDrag &&
      (prev?.project !== state.project ||
        state.selected !== this.openingDrag.openingId ||
        prev?.view !== state.view ||
        prev?.tool !== state.tool)
    )
      this.finishOpeningDrag(false);
    if (
      this.resizeDrag &&
      (prev?.project !== state.project ||
        prev?.selected !== state.selected ||
        prev?.tool !== state.tool ||
        prev?.view !== state.view)
    )
      this.finishResize(false);
    this.state = state;
    if (state.view !== this.lastView) {
      this.switchView(state.view);
      this.lastView = state.view;
    }
    this.grid.visible = state.grid;
    if (prev?.tool !== state.tool) {
      this.cancelDrawing();
      this.vertexIndex = null;
      this.callbacks.vertex(null);
    }
    if (prev?.selected !== state.selected) {
      this.vertexIndex = null;
      this.callbacks.vertex(null);
    }
    if (
      prev?.project !== state.project ||
      prev?.view !== state.view ||
      prev?.hideRoof !== state.hideRoof ||
      prev?.labels !== state.labels ||
      prev?.hiddenFloors !== state.hiddenFloors ||
      (prev?.selected !== state.selected &&
        state.project.entities.some(
          (e) =>
            e.type === "roof" &&
            (e.id === state.selected || e.id === prev?.selected),
        ))
    )
      this.rebuild();
    this.orbit.enableRotate = state.view === "3d";
    this.orbit.mouseButtons.LEFT =
      state.view === "plan" ? undefined : THREE.MOUSE.ROTATE;
    this.orbit.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    this.orbit.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    if (!this.moving)
      this.orbit.enabled = !this.openingDrag && !this.resizeDrag;
    this.transform.detach();
    const e = this.selectedEntity(),
      root = e ? this.roots.get(e.id) : null;
    if (
      root &&
      state.view === "3d" &&
      state.tool === "select" &&
      !e?.hidden &&
      e?.id === state.selected
    ) {
      this.transform.setMode(state.transform);
      this.transform.showX = state.transform === "translate";
      this.transform.showZ = state.transform === "translate";
      this.transform.showY = true;
      this.transform.setTranslationSnap(state.snap ? 0.1 : null);
      this.transform.setRotationSnap(state.snap ? Math.PI / 12 : null);
      this.transform.attach(root);
    }
    this.drawSelection();
    if (state.view === "3d" && this.pendingOrientation) {
      const direction = this.pendingOrientation;
      this.pendingOrientation = null;
      this.orientCamera(direction);
    }
  }
  private updateViewCube() {
    const cube = this.host.querySelector<HTMLElement>(".view-cube-solid");
    if (!cube) return;
    const matrix = new THREE.Matrix4().makeRotationFromQuaternion(
      this.camera.quaternion.clone().invert(),
    );
    for (const index of [1, 4, 6, 9]) matrix.elements[index] *= -1;
    const transform = `matrix3d(${matrix.elements.map((n) => n.toFixed(6)).join(",")})`;
    if (cube.style.transform !== transform) cube.style.transform = transform;
    const direction = this.camera.position
      .clone()
      .sub(this.orbit.target)
      .normalize();
    const active = CAMERA_VIEWS.find(
      (view) => direction.dot(new THREE.Vector3(...view.direction)) > 0.9999,
    )?.id;
    for (const button of this.host.querySelectorAll<HTMLElement>(
      "[data-view-axis]",
    )) {
      const pressed = String(button.dataset.viewAxis === active);
      if (button.getAttribute("aria-pressed") !== pressed)
        button.setAttribute("aria-pressed", pressed);
    }
  }
  orientCamera(view: CameraView) {
    this.finishOpeningDrag(false);
    if (this.state?.view !== "3d") {
      this.pendingOrientation = view;
      return;
    }
    this.finishResize(false);
    const damping = this.orbit.enableDamping;
    this.orbit.enableDamping = false;
    this.orbit.update();
    const box = new THREE.Box3();
    for (const child of this.model.children)
      if (child.visible) box.expandByObject(child);
    if (box.isEmpty())
      box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 5, 5));
    const center = box.getCenter(new THREE.Vector3());
    const direction =
      view === "iso"
        ? new THREE.Vector3(1, 0.85, 1)
        : new THREE.Vector3(
            ...CAMERA_VIEWS.find((v) => v.id === view)!.direction,
          );
    direction.normalize();
    const up =
      Math.abs(direction.y) > 0.99
        ? new THREE.Vector3(0, 0, direction.y > 0 ? -1 : 1)
        : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, direction).normalize(),
      screenUp = new THREE.Vector3().crossVectors(direction, right);
    const tan = Math.tan(THREE.MathUtils.degToRad(this.perspective.fov / 2));
    let distance = 2;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const p = new THREE.Vector3(x, y, z).sub(center);
          distance = Math.max(
            distance,
            p.dot(direction) +
              Math.max(
                Math.abs(p.dot(right)) / (tan * this.perspective.aspect),
                Math.abs(p.dot(screenUp)) / tan,
              ),
          );
        }
    this.orbit.target.copy(center);
    this.perspective.position
      .copy(center)
      .addScaledVector(direction, distance * 1.15);
    this.perspective.lookAt(center);
    this.orbit.update();
    this.orbit.enableDamping = damping;
    this.updateViewCube();
  }
  private switchView(view: View) {
    this.orbit.update();
    if (view === "plan") {
      this.saved3d = {
        position: this.perspective.position.clone(),
        target: this.orbit.target.clone(),
      };
      this.camera = this.ortho;
      this.ortho.position.copy(this.savedPlan.position);
      this.ortho.zoom = this.savedPlan.zoom;
      this.ortho.updateProjectionMatrix();
      this.orbit.object = this.camera;
      this.orbit.target.copy(this.savedPlan.target);
    } else {
      this.savedPlan = {
        position: this.ortho.position.clone(),
        target: this.orbit.target.clone(),
        zoom: this.ortho.zoom,
      };
      this.camera = this.perspective;
      this.perspective.position.copy(this.saved3d.position);
      this.orbit.object = this.camera;
      this.orbit.target.copy(this.saved3d.target);
    }
    this.orbit.enableRotate = view === "3d";
    this.transform.camera = this.camera;
    this.orbit.update();
  }
  private disposeGroup(group: THREE.Group) {
    group.traverse((o) => {
      if (o instanceof THREE.Sprite) o.material.dispose();
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
    group.clear();
  }
  private mesh(geometry: THREE.BufferGeometry, color: string, opacity = 1) {
    return new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.82,
        metalness: 0,
        transparent: opacity < 1,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: opacity === 1,
      }),
    );
  }
  private cube(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    opacity = 1,
  ) {
    const m = this.mesh(new THREE.BoxGeometry(w, h, d), color, opacity);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  private cylinder(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) {
    const m = this.mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 32), color);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  private buildWall(root: THREE.Group, e: Wall, entities: Entity[]) {
    e.segmentIds.forEach((segmentId, i) => {
      const a = e.points[i],
        b = e.points[i + 1],
        group = new THREE.Group();
      group.position.set(a.x, 0, a.y);
      group.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
      root.add(group);
      for (const p of wallPanels(e, i, entities)) {
        const outline = wallPanelFootprint(e, i, p, entities);
        if (outline.length < 3) continue;
        const shape = new THREE.Shape(
          outline.map((q) => new THREE.Vector2(q.x, -q.y)),
        );
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: p.height,
          bevelEnabled: false,
          steps: 1,
        });
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(0, p.bottom, 0);
        group.add(this.mesh(geometry, e.color));
      }
      for (const o of e.openings.filter((o) => o.segmentId === segmentId)) {
        const frame = new THREE.Group();
        frame.userData.opening = o.id;
        group.add(frame);
        const color = o.type === "window" ? "#688f95" : "#9b805e",
          t = 0.045;
        this.cube(
          frame,
          o.offset + t / 2,
          o.sill + o.height / 2,
          0,
          t,
          o.height,
          e.thickness + 0.025,
          color,
        );
        this.cube(
          frame,
          o.offset + o.width - t / 2,
          o.sill + o.height / 2,
          0,
          t,
          o.height,
          e.thickness + 0.025,
          color,
        );
        this.cube(
          frame,
          o.offset + o.width / 2,
          o.sill + o.height - t / 2,
          0,
          o.width,
          t,
          e.thickness + 0.025,
          color,
        );
        if (o.type === "window") {
          this.cube(
            frame,
            o.offset + o.width / 2,
            o.sill + t / 2,
            0,
            o.width,
            t,
            e.thickness + 0.025,
            color,
          );
          this.cube(
            frame,
            o.offset + o.width / 2,
            o.sill + o.height / 2,
            0,
            o.width - 0.09,
            o.height - 0.09,
            0.015,
            "#aacdd1",
            0.14,
          );
        } else {
          const swing = doorSwing(o);
          this.cube(
            frame,
            o.offset + o.width / 2,
            o.sill + o.height / 2,
            0,
            Math.max(0.01, o.width - 2 * t),
            o.height - 0.02,
            0.025,
            "#aacdd1",
            0.24,
          );
          // The closed glass leaf stays in the wall plane; the handle marks its latch side.
          this.cube(
            frame,
            o.offset + (swing.along === 1 ? o.width * 0.85 : o.width * 0.15),
            o.sill + Math.min(1, o.height / 2),
            swing.side * (e.thickness / 2 + 0.025),
            Math.min(0.12, o.width * 0.2),
            Math.min(0.035, o.height * 0.1),
            0.035,
            "#688f95",
          );
        }
        if (this.state?.view === "plan") {
          this.cube(
            frame,
            o.offset + o.width / 2,
            e.height + 0.035,
            0,
            o.width,
            0.07,
            Math.max(e.thickness, 0.35),
            "#7fadb2",
          );
        }
      }
    });
  }
  private buildSolid(root: THREE.Group, e: Solid) {
    const { width: w, depth: d, height: h, color: c } = e;
    switch (e.type) {
      case "stairs":
        for (let i = 0; i < e.steps; i++) {
          const sh = (h * (i + 1)) / e.steps;
          this.cube(
            root,
            0,
            sh / 2,
            -d / 2 + (d * (i + 0.5)) / e.steps,
            w,
            sh,
            d / e.steps,
            c,
          );
          const z = -d / 2 + (d * i) / e.steps;
          root.add(
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-w / 2, sh + 0.012, z),
                new THREE.Vector3(w / 2, sh + 0.012, z),
              ]),
              new THREE.LineBasicMaterial({ color: "#8c887a" }),
            ),
          );
        }
        if (this.state?.view === "plan")
          root.add(
            new THREE.ArrowHelper(
              new THREE.Vector3(0, h, d).normalize(),
              new THREE.Vector3(0, 0.03, -d * 0.4),
              Math.hypot(h, d) * 0.8,
              0x606c68,
              0.35,
              0.25,
            ),
          );
        break;
      case "column":
        this.cube(root, 0, h / 2, 0, w, h, w, c);
        break;
      case "sofa":
        this.cube(root, 0, h * 0.25, 0, w * 0.94, h * 0.22, d * 0.9, c);
        for (const side of [-1, 1]) {
          this.cube(
            root,
            side * w * 0.225,
            h * 0.46,
            d * 0.07,
            w * 0.43,
            h * 0.16,
            d * 0.7,
            c,
          );
          this.cube(
            root,
            side * w * 0.225,
            h * 0.76,
            -d * 0.36,
            w * 0.43,
            h * 0.48,
            d * 0.19,
            c,
          );
          this.cube(
            root,
            side * w * 0.46,
            h * 0.46,
            0,
            w * 0.08,
            h * 0.38,
            d * 0.95,
            c,
          );
          for (const end of [-1, 1])
            this.cube(
              root,
              side * w * 0.4,
              h * 0.11,
              end * d * 0.34,
              w * 0.045,
              h * 0.22,
              d * 0.08,
              "#383d3a",
            );
        }
        break;
      case "cylinder":
      case "podium":
        this.cylinder(root, 0, h / 2, 0, w, h, d, c);
        break;
      case "bed":
        this.cylinder(root, 0, h * 0.42, 0, w, h * 0.84, d, "#b5b99d");
        this.cylinder(root, 0, h * 0.91, 0, w * 0.94, h * 0.18, d * 0.94, c);
        break;
      case "palm": {
        const trunk = new THREE.CatmullRomCurve3([
          new THREE.Vector3(),
          new THREE.Vector3(-w * 0.025, h * 0.25, -d * 0.035),
          new THREE.Vector3(w * 0.02, h * 0.5, -d * 0.015),
          new THREE.Vector3(w * 0.06, h * 0.7, d * 0.025),
        ]);
        root.add(
          this.mesh(
            new THREE.TubeGeometry(trunk, 28, Math.min(w, d) * 0.03, 10, false),
            "#927454",
          ),
        );
        for (let i = 1; i < 17; i++) {
          const ring = this.mesh(
            new THREE.TorusGeometry(
              Math.min(w, d) * 0.031,
              Math.min(w, d) * 0.003,
              4,
              10,
            ),
            "#7d6348",
          );
          ring.position.copy(trunk.getPoint(i / 18));
          ring.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            trunk.getTangent(i / 18),
          );
          root.add(ring);
        }
        // Deterministic variation keeps foliage irregular without changing it on rebuild/export.
        for (let leaf = 0; leaf < 31; leaf++) {
          const variation = (Math.sin(leaf * 17.31 + 4) + 1) / 2,
            angle = leaf * 2.399963 + Math.sin(leaf * 3.7) * 0.22,
            upright = leaf % 5 === 0,
            reach = upright ? 0.18 + variation * 0.1 : 0.32 + variation * 0.11,
            vertices: number[] = [],
            indices: number[] = [],
            centres: THREE.Vector3[] = [];
          for (let i = 0; i <= 32; i++) {
            const t = i / 32,
              radius = reach * t,
              twist = angle + Math.sin(t * Math.PI) * (variation - 0.5) * 0.5,
              y =
                h *
                (0.7 +
                  (upright ? 0.3 : 0.15 + variation * 0.1) *
                    Math.sin(t * Math.PI * 0.8) -
                  (upright ? 0 : 0.1 + (1 - variation) * 0.14) * t * t),
              x = w * 0.06 + Math.cos(twist) * w * radius,
              z = d * 0.025 + Math.sin(twist) * d * radius,
              spread =
                Math.sin(Math.PI * t) *
                (i % 2 ? 0.085 : 0.018) *
                (0.85 + variation * 0.2);
            centres.push(new THREE.Vector3(x, y, z));
            for (const side of [-1, 1])
              vertices.push(
                x - Math.sin(angle) * w * spread * side,
                y - h * spread * 0.25,
                z + Math.cos(angle) * d * spread * side,
              );
            if (i < 32) {
              const k = i * 2;
              indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
            }
          }
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(vertices, 3),
          );
          geometry.setIndex(indices);
          geometry.computeVertexNormals();
          const foliage = this.mesh(geometry, c);
          foliage.material.color.offsetHSL(
            (variation - 0.5) * 0.025,
            0,
            (variation - 0.5) * 0.09,
          );
          root.add(foliage);
          root.add(
            this.mesh(
              new THREE.TubeGeometry(
                new THREE.CatmullRomCurve3(centres),
                24,
                Math.min(w, d) * 0.003,
                4,
                false,
              ),
              "#77934b",
            ),
          );
        }
        break;
      }
      case "spruce": {
        this.cylinder(
          root,
          0,
          h * 0.4,
          0,
          w * 0.09,
          h * 0.8,
          d * 0.09,
          "#806447",
        );
        for (let tier = 0; tier < 8; tier++) {
          const geometry = new THREE.ConeGeometry(1, 1, 18, 2),
            positions = geometry.getAttribute("position"),
            bottom = h * (0.15 + tier * 0.092),
            height = h * (tier === 7 ? 0.206 : 0.32),
            radius = 0.5 * (1 - tier / 8.5);
          for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i),
              z = positions.getZ(i),
              y = positions.getY(i),
              angle = Math.atan2(z, x),
              variation = 0.88 + 0.1 * Math.sin(angle * 7 + tier * 1.9);
            positions.setXYZ(
              i,
              x * w * radius * variation,
              bottom +
                (y + 0.5) * height +
                (y < 0.4 ? Math.sin(angle * 9 + tier) * h * 0.012 : 0),
              z * d * radius * variation,
            );
          }
          geometry.computeVertexNormals();
          const foliage = this.mesh(geometry, c);
          foliage.material.color.offsetHSL(0, 0, tier % 2 ? 0.025 : -0.015);
          root.add(foliage);
        }
        break;
      }
      case "plant":
        this.cylinder(
          root,
          0,
          h * 0.15,
          0,
          w * 0.48,
          h * 0.3,
          d * 0.48,
          "#c2aa87",
        );
        this.cylinder(
          root,
          0,
          h * 0.45,
          0,
          w * 0.1,
          h * 0.5,
          d * 0.1,
          "#866d4f",
        );
        {
          const leaves = this.mesh(new THREE.IcosahedronGeometry(1, 1), c);
          leaves.scale.set(w / 2, h * 0.36, d / 2);
          leaves.position.y = h * 0.64;
          root.add(leaves);
        }
        break;
      case "table":
        this.cube(root, 0, h - 0.04, 0, w, 0.08, d, c);
        for (const x of [-1, 1])
          for (const z of [-1, 1])
            this.cube(
              root,
              x * w * 0.4,
              (h - 0.08) / 2,
              z * d * 0.35,
              0.07,
              h - 0.08,
              0.07,
              "#657468",
            );
        break;
      case "chair":
        this.cube(root, 0, h * 0.48, 0, w, 0.06, d, c);
        this.cube(root, 0, h * 0.75, -d * 0.45, w, h * 0.5, 0.06, c);
        for (const x of [-1, 1])
          for (const z of [-1, 1])
            this.cube(
              root,
              x * w * 0.4,
              h * 0.22,
              z * d * 0.35,
              0.05,
              h * 0.44,
              0.05,
              "#657468",
            );
        break;
      default:
        this.cube(root, 0, h / 2, 0, w, h, d, c);
    }
  }
  private createEntityRoot(
    e: Entity,
    entities: Entity[],
    contours = true,
    contourOnly = false,
  ) {
    const root = new THREE.Group();
    root.name = e.name;
    root.userData.floorGroup = entityFloor(e);
    root.userData.id = e.id;
    root.position.set(e.position.x, e.position.z, e.position.y);
    root.rotation.y = -THREE.MathUtils.degToRad(e.rotation);
    if (isSurface(e)) {
      if (!contourOnly) {
        const shape = new THREE.Shape(
          e.points.map((p) => new THREE.Vector2(p.x, -p.y)),
        );
        const geom = new THREE.ExtrudeGeometry(shape, {
          depth: e.thickness,
          bevelEnabled: false,
          steps: 1,
        });
        geom.rotateX(-Math.PI / 2);
        geom.translate(0, -e.thickness, 0);
        root.add(this.mesh(geom, e.color, e.type === "roof" ? 0.22 : 1));
      }
      if (contours) {
        const line = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(
            e.points.map((p) => v3(p, 0.012)),
          ),
          new THREE.LineBasicMaterial({
            color: e.type === "roof" ? "#83a5a7" : "#a2af99",
          }),
        );
        root.add(line);
      }
    } else if (isWall(e)) this.buildWall(root, e, entities);
    else this.buildSolid(root, e);
    const entityColor = new THREE.Color(e.color);
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials)
          if (
            material instanceof THREE.MeshStandardMaterial &&
            material.color.equals(entityColor)
          )
            material.userData.entityColor = true;
      }
    });
    return root;
  }
  private rebuild() {
    this.transform.detach();
    this.disposeGroup(this.model);
    this.roots.clear();
    this.labelNodes.forEach((l) => l.element.remove());
    this.labelNodes = [];
    for (const e of this.state!.project.entities) {
      if (
        e.hidden ||
        entityFloors(e).every((floor) =>
          this.state!.hiddenFloors?.includes(floor),
        ) ||
        (e.type === "roof" &&
          (this.state!.view === "plan"
            ? e.id !== this.state!.selected
            : this.state!.hideRoof))
      )
        continue;
      const root = this.createEntityRoot(
        e,
        this.state!.project.entities,
        true,
        e.type === "roof" && this.state!.view === "plan",
      );
      this.model.add(root);
      this.roots.set(e.id, root);
      if (this.state!.labels && e.type === "floor") {
        const el = document.createElement("div");
        el.className = "scene-label";
        el.textContent = e.name;
        const sub = document.createElement("span");
        sub.textContent = `${e.position.z > 0 ? "+" : ""}${e.position.z.toLocaleString("ru-RU")} м`;
        el.appendChild(sub);
        this.host.appendChild(el);
        this.labelNodes.push({
          element: el,
          point: new THREE.Vector3(
            e.position.x,
            e.position.z + 0.15,
            e.position.y,
          ),
        });
      }
    }
    this.model.updateMatrixWorld(true);
  }
  private updateLabels() {
    if (!this.state) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    const occupied: { x: number; y: number; w: number; h: number }[] = [];
    for (const l of this.labelNodes) {
      const p = l.point.clone().project(this.camera),
        x = ((p.x + 1) * w) / 2,
        y = ((1 - p.y) * h) / 2;
      const lw = l.element.offsetWidth || 140,
        lh = l.element.offsetHeight || 28;
      const overlap = occupied.some(
        (b) =>
          Math.abs(b.x - x) < (b.w + lw) / 2 + 5 &&
          Math.abs(b.y - y) < (b.h + lh) / 2 + 5,
      );
      const hidden =
        p.z > 1 || p.z < -1 || x < 0 || x > w || y < 0 || y > h || overlap;
      l.element.style.transform = `translate(-50%, -50%) translate(${x}px,${y}px)`;
      l.element.style.visibility = hidden ? "hidden" : "visible";
      if (!hidden) occupied.push({ x, y, w: lw, h: lh });
    }
  }
  private beginOpeningDrag(
    event: PointerEvent,
    wall: Wall,
    openingId: string,
    hit: THREE.Vector3,
  ) {
    const o = wall.openings.find((o) => o.id === openingId);
    if (!o) return;
    const index = wall.segmentIds.indexOf(o.segmentId),
      a = toWorld(wall, wall.points[index]),
      b = toWorld(wall, wall.points[index + 1]);
    const axis = new THREE.Vector3(b.x - a.x, 0, b.y - a.y).normalize();
    const normal = this.camera.getWorldDirection(new THREE.Vector3());
    normal.addScaledVector(axis, -normal.dot(axis));
    if (normal.lengthSq() < 1e-6) return;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        normal.normalize(),
        hit,
      ),
      start = new THREE.Vector3();
    this.setRay(event);
    if (!this.ray.ray.intersectPlane(plane, start)) return;
    this.openingDrag = {
      original: clone(wall),
      preview: clone(wall),
      openingId,
      axis,
      plane,
      start,
      pointer: event.pointerId,
      previewRoot: null,
      error: "",
      changed: false,
    };
    this.orbit.enabled = false;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.renderer.domElement.style.cursor = "grabbing";
  }
  private moveOpeningDrag(event: PointerEvent) {
    const d = this.openingDrag!,
      point = new THREE.Vector3();
    this.setRay(event);
    if (!this.ray.ray.intersectPlane(d.plane, point)) return;
    const delta = point.sub(d.start).dot(d.axis),
      original = d.original.openings.find((o) => o.id === d.openingId)!;
    const offset = this.state?.snap
      ? Math.round((original.offset + delta) * 10) / 10
      : original.offset + delta;
    d.changed ||= Math.abs(delta) > 0.001;
    try {
      const next = moveOpening(d.original, d.openingId, offset);
      if (d.previewRoot) {
        this.model.remove(d.previewRoot);
        this.disposeGroup(d.previewRoot);
      }
      const root = this.roots.get(next.id);
      if (root) root.visible = false;
      d.previewRoot = this.createEntityRoot(
        next,
        this.state!.project.entities.map((e) => (e.id === next.id ? next : e)),
      );
      this.model.add(d.previewRoot);
      this.model.updateMatrixWorld(true);
      this.disposeGroup(this.overlay);
      let target: THREE.Object3D = d.previewRoot;
      d.previewRoot.traverse((node) => {
        if (node.userData.opening === d.openingId) target = node;
      });
      this.box = new THREE.BoxHelper(target, 0x286548);
      this.overlay.add(this.box);
      d.preview = next;
      d.error = "";
      this.callbacks.hint(
        `Отступ проёма: ${next.openings.find((o) => o.id === d.openingId)!.offset.toFixed(2)} м · Esc — отмена`,
      );
    } catch (error) {
      d.error =
        error instanceof Error ? error.message : "Проём не помещается в стене.";
    }
  }
  private finishOpeningDrag(commit: boolean) {
    const d = this.openingDrag;
    if (!d) return;
    this.openingDrag = null;
    if (d.previewRoot) {
      this.model.remove(d.previewRoot);
      this.disposeGroup(d.previewRoot);
    }
    const root = this.roots.get(d.original.id);
    if (root) root.visible = true;
    if (this.renderer.domElement.hasPointerCapture(d.pointer))
      this.renderer.domElement.releasePointerCapture(d.pointer);
    this.orbit.enabled = true;
    this.renderer.domElement.style.cursor = "default";
    this.callbacks.hint("");
    this.drawSelection();
    if (commit && d.changed) {
      if (d.error) this.callbacks.error(d.error);
      else this.callbacks.edit(d.preview);
    }
  }
  private drawResizeHandles(e: Entity) {
    this.disposeGroup(this.overlay);
    this.box = null;
    const b = resizeBounds(e),
      group = new THREE.Group();
    group.position.set(e.position.x, e.position.z, e.position.y);
    group.rotation.y = -THREE.MathUtils.degToRad(e.rotation);
    const outline = new THREE.Box3Helper(
      new THREE.Box3(
        new THREE.Vector3(b.minX, b.minZ, b.minY),
        new THREE.Vector3(b.maxX, b.maxZ, b.maxY),
      ),
      0x286548,
    );
    const outlineMaterial = outline.material as THREE.LineBasicMaterial;
    outlineMaterial.depthTest = false;
    outlineMaterial.depthWrite = false;
    outline.renderOrder = 1000;
    group.add(outline);
    const distance = this.camera.position.distanceTo(group.position);
    const size =
      this.state?.view === "plan"
        ? (48 / this.ortho.zoom / this.host.clientHeight) * 10
        : ((distance *
            Math.tan(THREE.MathUtils.degToRad(this.perspective.fov / 2)) *
            2) /
            this.host.clientHeight) *
          10;
    for (const x of [-1, 0, 1])
      for (const y of [-1, 0, 1])
        for (const z of this.state?.view === "plan" ? [0] : [-1, 0, 1]) {
          if (!x && !y && !z) continue;
          if (
            this.state?.view === "3d" &&
            [x, y, z].filter(Boolean).length === 2
          )
            continue;
          const handle = new THREE.Sprite(
            new THREE.SpriteMaterial({
              color: 0x286548,
              depthTest: false,
              depthWrite: false,
            }),
          );
          handle.scale.set(size, size, 1);
          handle.position.set(
            x < 0 ? b.minX : x > 0 ? b.maxX : (b.minX + b.maxX) / 2,
            this.state?.view === "plan"
              ? b.maxZ + 0.04
              : z < 0
                ? b.minZ
                : z > 0
                  ? b.maxZ
                  : (b.minZ + b.maxZ) / 2,
            y < 0 ? b.minY : y > 0 ? b.maxY : (b.minY + b.maxY) / 2,
          );
          handle.userData.resizeHandle = { x, y, z };
          handle.renderOrder = 1002;
          const face = new THREE.Sprite(
            new THREE.SpriteMaterial({
              color: 0xfafcf8,
              depthTest: false,
              depthWrite: false,
            }),
          );
          face.scale.set(0.7, 0.7, 1);
          face.renderOrder = 1003;
          handle.add(face);
          group.add(handle);
        }
    this.overlay.add(group);
    this.overlay.updateMatrixWorld(true);
  }
  private beginResize(
    event: PointerEvent,
    e: Entity,
    handle: ResizeHandle,
    point: THREE.Vector3,
  ) {
    const root = this.roots.get(e.id);
    if (!root) return;
    const r = THREE.MathUtils.degToRad(e.rotation);
    const axes = [
      handle.x ? new THREE.Vector3(Math.cos(r), 0, Math.sin(r)) : null,
      handle.y ? new THREE.Vector3(-Math.sin(r), 0, Math.cos(r)) : null,
      handle.z ? new THREE.Vector3(0, 1, 0) : null,
    ].filter((v): v is THREE.Vector3 => v !== null);
    const normal = this.camera.getWorldDirection(new THREE.Vector3());
    if (axes.length === 1)
      normal.addScaledVector(axes[0], -normal.dot(axes[0]));
    else if (axes.length === 2) {
      const candidate = new THREE.Vector3().crossVectors(axes[0], axes[1]);
      if (Math.abs(candidate.dot(normal)) > 0.08) normal.copy(candidate);
    }
    if (normal.lengthSq() < 1e-8)
      normal.copy(this.camera.getWorldDirection(new THREE.Vector3()));
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        normal.normalize(),
        point,
      ),
      start = new THREE.Vector3();
    this.setRay(event);
    if (!this.ray.ray.intersectPlane(plane, start)) return;
    this.resizeDrag = {
      original: clone(e),
      preview: clone(e),
      handle,
      plane,
      start,
      root,
      previewRoot: null,
      pointer: event.pointerId,
      error: "",
      changed: false,
    };
    this.orbit.enabled = false;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.renderer.domElement.style.cursor = "grabbing";
  }
  private moveResize(event: PointerEvent) {
    const d = this.resizeDrag!;
    this.setRay(event);
    const point = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(d.plane, point)) return;
    const change = point.sub(d.start),
      r = THREE.MathUtils.degToRad(d.original.rotation);
    const snap = (n: number) =>
      this.state?.snap ? Math.round(n * 10) / 10 : n;
    let delta = {
      x: snap(change.x * Math.cos(r) + change.z * Math.sin(r)),
      y: snap(-change.x * Math.sin(r) + change.z * Math.cos(r)),
      z: snap(change.y),
    };
    if (event.shiftKey) {
      const b = resizeBounds(d.original),
        sizes = { x: b.maxX - b.minX, y: b.maxY - b.minY, z: b.maxZ - b.minZ };
      const axes = (["x", "y", "z"] as const).filter((axis) => d.handle[axis]);
      const factor =
        axes
          .map((axis) => (delta[axis] * d.handle[axis]) / sizes[axis])
          .sort((a, b) => Math.abs(b) - Math.abs(a))[0] ?? 0;
      delta = {
        x: factor * sizes.x * d.handle.x,
        y: factor * sizes.y * d.handle.y,
        z: factor * sizes.z * d.handle.z,
      };
    }
    d.changed ||= change.length() > 0.001;
    try {
      const next = resizeFromHandle(d.original, d.handle, delta);
      if (d.previewRoot) {
        this.model.remove(d.previewRoot);
        this.disposeGroup(d.previewRoot);
      }
      d.root.visible = false;
      d.previewRoot = this.createEntityRoot(
        next,
        this.state!.project.entities.map((e) => (e.id === next.id ? next : e)),
        false,
      );
      this.model.add(d.previewRoot);
      this.model.updateMatrixWorld(true);
      d.preview = next;
      d.error = "";
      this.drawResizeHandles(next);
      const b = resizeBounds(next);
      this.callbacks.hint(
        `Размер: ${(b.maxX - b.minX).toFixed(2)} × ${(b.maxY - b.minY).toFixed(2)} × ${(b.maxZ - b.minZ).toFixed(2)} м · Esc — отмена`,
      );
    } catch (error) {
      d.error = error instanceof Error ? error.message : "Недопустимый размер.";
    }
  }
  private finishResize(commit: boolean) {
    const d = this.resizeDrag;
    if (!d) return;
    this.resizeDrag = null;
    d.root.visible = true;
    if (d.previewRoot) {
      this.model.remove(d.previewRoot);
      this.disposeGroup(d.previewRoot);
    }
    if (this.renderer.domElement.hasPointerCapture(d.pointer))
      this.renderer.domElement.releasePointerCapture(d.pointer);
    this.orbit.enabled = true;
    this.renderer.domElement.style.cursor = "default";
    this.callbacks.hint("");
    this.drawSelection();
    if (commit && d.changed) {
      if (d.error) this.callbacks.error(d.error);
      else this.callbacks.edit(d.preview);
    }
  }
  private drawSelection() {
    this.disposeGroup(this.overlay);
    this.box = null;
    const e = this.selectedEntity(),
      root = e ? this.roots.get(e.id) : null;
    if (e && root) {
      if (this.state?.tool === "resize" && this.state.selected === e.id) {
        this.drawResizeHandles(e);
        return;
      }
      let target: THREE.Object3D = root;
      if (this.state?.selected !== e.id)
        root.traverse((o) => {
          if (o.userData.opening === this.state?.selected) target = o;
        });
      this.box = new THREE.BoxHelper(target, 0x286548);
      this.overlay.add(this.box);
      if (
        this.state?.view === "plan" &&
        this.state.tool === "vertex" &&
        (isSurface(e) || isWall(e))
      ) {
        e.points.forEach((p, i) => {
          const world = toWorld(e, p),
            m = this.mesh(
              new THREE.SphereGeometry(0.18, 16, 12),
              this.vertexIndex === i ? "#d28d37" : "#286548",
            );
          m.position.copy(
            v3(world, e.position.z + (isWall(e) ? e.height : 0.02) + 0.15),
          );
          m.userData.vertex = i;
          this.overlay.add(m);
        });
      }
    }
    if (this.draft.length) {
      const points = [...this.draft];
      if (this.hoverPoint) points.push(this.hoverPoint);
      const y = this.draftElevation + 0.08;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points.map((p) => v3(p, y))),
        new THREE.LineBasicMaterial({ color: 0x286548, depthTest: false }),
      );
      line.renderOrder = 99;
      this.overlay.add(line);
      for (const p of this.draft) {
        const m = this.mesh(new THREE.SphereGeometry(0.13, 12, 8), "#286548");
        m.position.copy(v3(p, y));
        this.overlay.add(m);
      }
    }
  }
  private setRay(event: PointerEvent | MouseEvent) {
    const b = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - b.left) / b.width) * 2 - 1,
      (-(event.clientY - b.top) / b.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.pointer, this.camera);
  }
  private point(event: PointerEvent | MouseEvent, height = 0, snap = true) {
    this.setRay(event);
    const p = new THREE.Vector3();
    if (
      !this.ray.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -height),
        p,
      )
    )
      return null;
    const s = this.state?.snap && snap ? 10 : 10000;
    return { x: Math.round(p.x * s) / s, y: Math.round(p.z * s) / s };
  }
  private hit(event: PointerEvent | MouseEvent): Hit | null {
    this.setRay(event);
    const hits = this.ray.intersectObjects(this.model.children, true);
    for (const h of hits) {
      let node: THREE.Object3D | null = h.object,
        opening: string | undefined;
      while (node && !node.userData.id) {
        opening ??= node.userData.opening;
        node = node.parent;
      }
      const entity = this.state?.project.entities.find(
        (e) => e.id === node?.userData.id,
      );
      if (entity) return { entity, opening, point: h.point };
    }
    return null;
  }
  private onDown = (event: PointerEvent) => {
    this.down = { x: event.clientX, y: event.clientY };
    if (event.button !== 0 || !this.state || this.moving || this.transform.axis)
      return;
    this.renderer.domElement.focus({ preventScroll: true });
    if (this.state.tool === "resize") {
      this.setRay(event);
      const picked = this.ray
        .intersectObjects(this.overlay.children, true)
        .find((h) => h.object.userData.resizeHandle);
      const e = this.selectedEntity();
      if (picked && e && this.state.selected === e.id)
        this.beginResize(
          event,
          e,
          picked.object.userData.resizeHandle,
          picked.object.getWorldPosition(new THREE.Vector3()),
        );
      else {
        const hit = this.hit(event);
        this.callbacks.select(hit?.entity.id ?? null);
      }
      return;
    }
    if (this.state.view === "plan" && this.state.tool === "vertex") {
      const e = this.selectedEntity();
      if (!e || (!isSurface(e) && !isWall(e))) return;
      this.setRay(event);
      const hits = this.ray.intersectObjects(this.overlay.children, true);
      const handle = hits.find((h) => h.object.userData.vertex !== undefined);
      if (handle) {
        const index = handle.object.userData.vertex as number;
        this.vertexIndex = index;
        this.callbacks.vertex(index);
        this.startDrag(event, e, "vertex", index);
        this.drawSelection();
        return;
      }
    }
    if (this.state.tool === "select") {
      const hit = this.hit(event);
      if (hit?.opening && isWall(hit.entity)) {
        this.callbacks.select(hit.opening);
        this.beginOpeningDrag(event, hit.entity, hit.opening, hit.point);
        return;
      }
      if (this.state.view !== "plan") return;
      if (hit) {
        this.callbacks.select(hit.opening ?? hit.entity.id);
        if (!hit.opening) this.startDrag(event, hit.entity, "entity");
      } else this.callbacks.select(null);
    }
  };
  private startDrag(
    event: PointerEvent,
    e: Entity,
    kind: "entity" | "vertex",
    index?: number,
  ) {
    const start = this.point(event, e.position.z);
    const root = this.roots.get(e.id);
    if (!start || !root) return;
    this.drag = {
      kind,
      id: e.id,
      index,
      start,
      original: clone(e),
      preview: clone(e),
      root,
      pointer: event.pointerId,
    };
    this.orbit.enabled = false;
    this.renderer.domElement.setPointerCapture(event.pointerId);
  }
  private onMove = (event: PointerEvent) => {
    if (this.openingDrag) {
      this.moveOpeningDrag(event);
      return;
    }
    if (this.resizeDrag) {
      this.moveResize(event);
      return;
    }
    if (this.drag) {
      const d = this.drag,
        p = this.point(event, d.original.position.z);
      if (!p) return;
      const next = clone(d.original);
      if (d.kind === "entity") {
        next.position.x += p.x - d.start.x;
        next.position.y += p.y - d.start.y;
        d.root.position.x = next.position.x;
        d.root.position.z = next.position.y;
      } else if ((isSurface(next) || isWall(next)) && d.index !== undefined) {
        next.points[d.index] = toLocal(next, p);
        const handle = this.overlay.children.find(
          (o) => o.userData.vertex === d.index,
        );
        if (handle) {
          handle.position.x = p.x;
          handle.position.z = p.y;
        }
        const previous = this.overlay.getObjectByName("vertex-preview");
        if (previous) {
          this.overlay.remove(previous);
          (previous as THREE.Line).geometry.dispose();
          ((previous as THREE.Line).material as THREE.Material).dispose();
        }
        const points = next.points.map((p) =>
          v3(
            toWorld(next, p),
            next.position.z + (isWall(next) ? next.height : 0.02) + 0.1,
          ),
        );
        if (isSurface(next)) points.push(points[0]);
        const preview = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: 0x286548, depthTest: false }),
        );
        preview.name = "vertex-preview";
        this.overlay.add(preview);
      }
      d.preview = next;
      this.box?.update();
      return;
    }
    if (this.draft.length) {
      this.hoverPoint = this.point(event, this.draftElevation);
      this.drawSelection();
    }
  };
  private onUp = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (this.openingDrag) {
      this.finishOpeningDrag(true);
      return;
    }
    if (this.resizeDrag) {
      this.finishResize(true);
      return;
    }
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      this.orbit.enabled = true;
      if (this.renderer.domElement.hasPointerCapture(event.pointerId))
        this.renderer.domElement.releasePointerCapture(event.pointerId);
      this.callbacks.edit(d.preview);
      return;
    }
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    if (
      !this.state ||
      !this.down ||
      Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 5
    )
      return;
    const { tool, view } = this.state;
    if (tool === "resize") return;
    if (tool === "select") {
      if (view === "3d") {
        const h = this.hit(event);
        this.callbacks.select(h?.opening ?? h?.entity.id ?? null);
      }
      return;
    }
    if (tool === "vertex") {
      const h = this.hit(event);
      if (h && !this.selectedEntity()) this.callbacks.select(h.entity.id);
      return;
    }
    if (tool === "door" || tool === "window") {
      const h = this.hit(event);
      if (!h || !isWall(h.entity)) {
        this.callbacks.error("Выберите точку на стене для нового проёма.");
        return;
      }
      const local = toLocal(h.entity, { x: h.point.x, y: h.point.z });
      let best = Infinity,
        segment = 0,
        offset = 0;
      h.entity.segmentIds.forEach((_, i) => {
        const a = h.entity.type === "wall" ? h.entity.points[i] : local,
          b = (h.entity as Wall).points[i + 1],
          len = distance(a, b),
          t = Math.max(
            0,
            Math.min(
              1,
              ((local.x - a.x) * (b.x - a.x) + (local.y - a.y) * (b.y - a.y)) /
                (len * len),
            ),
          ),
          p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
          d = distance(local, p);
        if (d < best) {
          best = d;
          segment = i;
          offset = t * len;
        }
      });
      this.callbacks.opening(h.entity.id, segment, offset, tool);
      return;
    }
    if (tool === "floor" || tool === "wall" || tool === "roof") {
      if (view !== "plan") return;
      const p = this.point(event, this.draftElevation);
      if (!p) return;
      if (
        tool !== "wall" &&
        this.draft.length >= 3 &&
        distance(p, this.draft[0]) < 0.45
      ) {
        this.finishDrawing();
        return;
      }
      if (
        !this.draft.length ||
        distance(p, this.draft[this.draft.length - 1]) > 0.02
      )
        this.draft.push(p);
      this.hoverPoint = p;
      this.callbacks.hint(
        `${this.draft.length} точек · Enter — завершить · Esc — отменить`,
      );
      this.drawSelection();
      return;
    }
    const p = this.point(event);
    if (p) this.callbacks.place(p, tool);
  };
  private onCancel = () => {
    this.finishOpeningDrag(false);
    if (this.resizeDrag) this.finishResize(false);
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      d.root.position.set(
        d.original.position.x,
        d.original.position.z,
        d.original.position.y,
      );
      this.orbit.enabled = true;
      this.drawSelection();
    }
  };
  private onDouble = (event: MouseEvent) => {
    event.preventDefault();
    if (this.draft.length) this.finishDrawing();
  };
  private onContext = (event: MouseEvent) => event.preventDefault();
  private onKey = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("input,textarea,select")) return;
    if (event.key === "Enter" && this.draft.length) {
      event.preventDefault();
      this.finishDrawing();
    }
    if (event.key === "Escape") {
      if (this.moving) this.transform.reset();
      this.cancelDrawing();
      this.onCancel();
    }
    if (event.key === "Backspace" && this.draft.length) {
      event.preventDefault();
      this.draft.pop();
      this.drawSelection();
    }
  };
  finishDrawing() {
    const tool = this.state?.tool;
    if (tool !== "floor" && tool !== "roof" && tool !== "wall") return;
    const points = this.draft.map((p) => ({ ...p }));
    if (points.length > 2 && distance(points[0], points.at(-1)!) < 0.01)
      points.pop();
    this.callbacks.draw(points, tool);
  }
  cancelDrawing() {
    this.draft = [];
    this.hoverPoint = null;
    this.callbacks.hint("");
    this.drawSelection();
  }
  frame() {
    const box = new THREE.Box3();
    this.model.children.forEach((o) => {
      if (
        this.state?.project.entities.find((e) => e.id === o.userData.id)
          ?.type !== "roof"
      )
        box.expandByObject(o);
    });
    if (box.isEmpty()) {
      box.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 5, 10));
    }
    const center = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3());
    this.orbit.target.copy(center);
    if (this.state?.view === "plan") {
      this.ortho.position.set(center.x, center.y + 100, center.z);
      this.ortho.zoom = Math.min(
        (this.ortho.right - this.ortho.left) / (size.x + 8),
        48 / (size.z + 8),
      );
      this.ortho.updateProjectionMatrix();
    } else {
      const extent = Math.max(size.x, size.z, 12);
      this.perspective.position
        .copy(center)
        .add(new THREE.Vector3(extent * 0.85, extent * 0.85, extent));
    }
    this.orbit.update();
  }
  zoom(factor: number) {
    if (this.state?.view === "plan") {
      this.ortho.zoom = THREE.MathUtils.clamp(
        this.ortho.zoom * factor,
        0.08,
        25,
      );
      this.ortho.updateProjectionMatrix();
    } else {
      this.perspective.position
        .sub(this.orbit.target)
        .multiplyScalar(1 / factor)
        .add(this.orbit.target);
    }
    this.orbit.update();
  }
  exportPNG() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }
  async exportGLB() {
    if (!this.state) throw new Error("Сцена ещё не готова для экспорта.");
    const project = clone(this.state.project);
    if (!project.entities.length)
      throw new Error("Добавьте объекты перед экспортом 3D-модели.");
    // Build independent meshes: view filters, selection and color previews do not affect the file.
    const entities = project.entities.map((e) => ({ ...e, hidden: false }));
    const model = new THREE.Group();
    model.name = project.name;
    model.userData = { projectVersion: project.version, units: "meters" };
    try {
      for (const floor of floorGroups) {
        const members = entities.filter((e) => entityFloor(e) === floor.id);
        if (!members.length) continue;
        const group = new THREE.Group();
        group.name = floor.name;
        group.userData.floorGroup = floor.id;
        model.add(group);
        for (const e of members)
          group.add(this.createEntityRoot(e, entities, false));
      }
      model.updateMatrixWorld(true);
      const { GLTFExporter } =
        await import("three/addons/exporters/GLTFExporter.js");
      const data = await new GLTFExporter().parseAsync(model, { binary: true });
      if (!(data instanceof ArrayBuffer))
        throw new Error("Не удалось сформировать GLB.");
      return data;
    } finally {
      this.disposeGroup(model);
    }
  }
  previewColor(id: string, color: string) {
    this.roots.get(id)?.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials)
          if (
            material instanceof THREE.MeshStandardMaterial &&
            material.userData.entityColor
          )
            material.color.set(color);
      }
    });
  }
  destroy() {
    this.finishOpeningDrag(false);
    this.finishResize(false);
    this.disposed = true;
    cancelAnimationFrame(this.animation);
    this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.onKey);
    this.renderer.domElement.removeEventListener("pointerdown", this.onDown);
    this.renderer.domElement.removeEventListener("pointermove", this.onMove);
    this.renderer.domElement.removeEventListener("pointerup", this.onUp);
    this.renderer.domElement.removeEventListener(
      "pointercancel",
      this.onCancel,
    );
    this.renderer.domElement.removeEventListener("dblclick", this.onDouble);
    this.renderer.domElement.removeEventListener("contextmenu", this.onContext);
    this.transform.dispose();
    this.orbit.dispose();
    this.disposeGroup(this.model);
    this.disposeGroup(this.overlay);
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelNodes.forEach((l) => l.element.remove());
  }
}
