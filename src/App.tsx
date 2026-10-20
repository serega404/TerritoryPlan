import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Columns3,
  Sofa,
  Scaling,
  Copy,
  DoorOpen,
  Eye,
  EyeOff,
  FilePlus2,
  Focus,
  Grid2X2,
  ImageDown,
  Leaf,
  ListTree,
  Magnet,
  MousePointer2,
  Move,
  Pentagon,
  Plus,
  Redo2,
  RotateCw,
  Settings2,
  Sprout,
  Square,
  SquareDashedMousePointer,
  Table2,
  Trash2,
  Undo2,
  X,
  ZoomOut,
  Layers3,
  Fence,
  Footprints,
  AppWindow,
  Info,
} from "lucide-react";
import {
  GardenScene,
  CAMERA_VIEWS,
  type CameraView,
  type SceneState,
  type Tool,
  type View,
} from "./scene";
import {
  History,
  applyGardenUpdates,
  area,
  bounds,
  clone,
  distance,
  duplicate,
  entityFloor,
  entityFloors,
  floorGroups,
  floorInView,
  initialProject,
  isSolid,
  isSurface,
  isWall,
  labels,
  makeSolid,
  makeSurface,
  makeWall,
  parseProject,
  resized,
  uid,
  type Entity,
  type FloorGroup,
  type FloorView,
  type Opening,
  type Point,
  type Project,
  type SolidKind,
  type Wall,
} from "./model";

const STORAGE = "winter-garden-project-v1";
let bootError = "";
let bootMigration = false;
function restore() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return initialProject();
    const stored = parseProject(raw);
    try {
      const corrected = applyGardenUpdates(stored);
      bootMigration = corrected !== stored;
      return corrected;
    } catch {
      bootError =
        "Не удалось автоматически обновить схему. Сохранённая сцена оставлена без изменений.";
      return stored;
    }
  } catch {
    bootError =
      "Автосохранение недоступно или повреждено. Открыта начальная схема; можно загрузить файл проекта.";
    return initialProject();
  }
}
function download(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}
function saveText(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  download(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fmt = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const typeIcons: Record<string, typeof Box> = {
  floor: Pentagon,
  roof: Layers3,
  wall: Fence,
  stairs: Footprints,
  column: Columns3,
  bed: Leaf,
  plant: Sprout,
  podium: Circle,
  table: Table2,
  chair: Box,
  sofa: Sofa,
  box: Square,
  cylinder: Circle,
};
function Button({
  children,
  title,
  onClick,
  active,
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`button ${active ? "active" : ""} ${className}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  unit = "м",
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 1000) / 1000));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setDraft(String(Math.round(value * 1000) / 1000)), [value]);
  const commit = () => {
    const n = Number(draft.replace(",", "."));
    if (
      draft.trim() &&
      Number.isFinite(n) &&
      (min === undefined || n >= min) &&
      (max === undefined || n <= max)
    ) {
      setInvalid(false);
      if (n !== value) onChange(n);
    } else setInvalid(true);
    setDraft(String(Math.round(value * 1000) / 1000));
  };
  return (
    <label className="field">
      <span>{label}</span>
      <div className="number-wrap">
        <input
          type="number"
          value={draft}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-label={label}
          aria-invalid={invalid}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(String(value));
              e.currentTarget.blur();
            }
          }}
        />
        <small>{unit}</small>
      </div>
      {invalid && (
        <span className="field-error" role="alert">
          {min !== undefined
            ? `Минимум ${min}${max !== undefined ? `, максимум ${max}` : ""}.`
            : "Введите число."}
        </span>
      )}
    </label>
  );
}
function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        value={draft}
        maxLength={160}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() && draft !== value) onChange(draft.trim());
          else setDraft(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}

function ColorField({
  value,
  preview,
  commit,
}: {
  value: string;
  preview: (color: string) => void;
  commit: (color: string) => void;
}) {
  const [draft, setDraft] = useState(value),
    latest = useRef(value);
  useEffect(() => {
    latest.current = value;
    setDraft(value);
  }, [value]);
  return (
    <label className="color-field">
      <span>Цвет объекта</span>
      <input
        type="color"
        aria-label="Цвет объекта"
        value={draft}
        onChange={(e) => {
          latest.current = e.target.value;
          setDraft(e.target.value);
          preview(e.target.value);
        }}
        onBlur={() => {
          if (latest.current !== value) commit(latest.current);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            latest.current = value;
            setDraft(value);
            preview(value);
            e.currentTarget.blur();
          }
        }}
      />
      <code>{draft.toUpperCase()}</code>
    </label>
  );
}

function Inspector({
  entity,
  opening,
  edit,
  editOpening,
  selectedVertex,
  setSelectedVertex,
  remove,
  copy,
  addOpening,
  previewColor,
}: {
  entity: Entity | null;
  opening: Opening | null;
  edit: (e: Entity) => void;
  editOpening: (o: Opening) => void;
  selectedVertex: number | null;
  setSelectedVertex: (n: number | null) => void;
  remove: () => void;
  copy: () => void;
  addOpening: (type: "door" | "window") => void;
  previewColor: (color: string) => void;
}) {
  if (!entity)
    return (
      <div className="empty-inspector">
        <SquareDashedMousePointer size={38} strokeWidth={1.2} />
        <h3>Выберите объект</h3>
        <p>
          Нажмите на схему или выберите объект в списке слева. Здесь появятся
          его размеры и свойства.
        </p>
        <div className="empty-tip">
          <MousePointer2 size={16} />
          <span>На плане объекты можно перетаскивать мышью.</span>
        </div>
      </div>
    );
  const update = (patch: Partial<Entity>) =>
    edit({ ...clone(entity), ...patch } as Entity);
  if (opening && isWall(entity))
    return (
      <>
        <div className="inspector-heading">
          <div className="object-badge">
            {opening.type === "door" ? (
              <DoorOpen size={18} />
            ) : (
              <AppWindow size={18} />
            )}
          </div>
          <div>
            <h3>
              {opening.type === "door" ? "Дверной проём" : "Оконный проём"}
            </h3>
            <span>В стене «{entity.name}»</span>
          </div>
        </div>
        <TextField
          label="Название проёма"
          value={opening.name}
          onChange={(name) => editOpening({ ...opening, name })}
        />
        <label className="field">
          <span>Сегмент стены</span>
          <select
            aria-label="Сегмент стены"
            value={opening.segmentId}
            onChange={(e) =>
              editOpening({ ...opening, segmentId: e.target.value })
            }
          >
            {entity.segmentIds.map((id, i) => (
              <option key={id} value={id}>
                Сегмент {i + 1} ·{" "}
                {fmt(distance(entity.points[i], entity.points[i + 1]))} м
              </option>
            ))}
          </select>
        </label>
        <div className="field-grid">
          <NumberField
            label="Ширина проёма"
            value={opening.width}
            min={0.05}
            onChange={(width) => editOpening({ ...opening, width })}
          />
          <NumberField
            label="Высота проёма"
            value={opening.height}
            min={0.05}
            onChange={(height) => editOpening({ ...opening, height })}
          />
        </div>
        <NumberField
          label="Отступ от начала сегмента"
          value={opening.offset}
          min={0}
          onChange={(offset) => editOpening({ ...opening, offset })}
        />
        <NumberField
          label={
            opening.type === "window" ? "Высота подоконника" : "Высота порога"
          }
          value={opening.sill}
          min={0}
          onChange={(sill) => editOpening({ ...opening, sill })}
        />
        <p className="inspector-note">
          Проём проходит сквозь стену. Отступ и высота отсчитываются от начала
          сегмента и основания стены.
        </p>
        <button className="danger-text" onClick={remove}>
          <Trash2 size={15} /> Удалить проём
        </button>
      </>
    );
  const b = isSolid(entity)
    ? {
        width: entity.width,
        depth: entity.type === "column" ? entity.width : entity.depth,
      }
    : bounds(entity.points);
  const Icon = typeIcons[entity.type];
  return (
    <>
      <div className="inspector-heading">
        <div className="object-badge">
          <Icon size={18} />
        </div>
        <div>
          <h3>{labels[entity.type]}</h3>
          <span>
            {isSurface(entity)
              ? `${fmt(area(entity.points))} м²`
              : "Редактируемый объект"}
          </span>
        </div>
      </div>
      <TextField
        label="Название"
        value={entity.name}
        onChange={(name) => update({ name })}
      />
      <h4>Положение</h4>
      <div className="field-grid">
        <NumberField
          label="X"
          value={entity.position.x}
          onChange={(x) => update({ position: { ...entity.position, x } })}
        />
        <NumberField
          label="Y"
          value={entity.position.y}
          onChange={(y) => update({ position: { ...entity.position, y } })}
        />
      </div>
      <NumberField
        label={isSurface(entity) ? "Отметка поверхности" : "Высота основания"}
        value={entity.position.z}
        onChange={(z) => update({ position: { ...entity.position, z } })}
      />
      <NumberField
        label="Поворот"
        unit="°"
        step={15}
        value={entity.rotation}
        onChange={(rotation) => update({ rotation })}
      />
      <h4>Размеры</h4>
      <div className="field-grid">
        <NumberField
          label="Ширина"
          value={b.width}
          min={0.05}
          disabled={b.width < 0.001}
          onChange={(w) => edit(resized(entity, w, b.depth))}
        />
        <NumberField
          label="Глубина"
          value={b.depth}
          min={0.05}
          disabled={entity.type === "column" || b.depth < 0.001}
          onChange={(d) => edit(resized(entity, b.width, d))}
        />
      </div>
      {(isWall(entity) || isSolid(entity)) && (
        <NumberField
          label="Высота"
          value={entity.height}
          min={0.05}
          onChange={(height) => update({ height })}
        />
      )}
      {(isWall(entity) || isSurface(entity)) && (
        <NumberField
          label="Толщина"
          value={entity.thickness}
          min={0.01}
          step={0.01}
          onChange={(thickness) => update({ thickness })}
        />
      )}
      {entity.type === "stairs" && (
        <NumberField
          label="Число ступеней"
          value={entity.steps}
          min={1}
          max={100}
          step={1}
          unit="шт."
          onChange={(steps) => update({ steps })}
        />
      )}
      <ColorField
        value={entity.color}
        preview={previewColor}
        commit={(color) => update({ color })}
      />
      {(isSurface(entity) || isWall(entity)) && (
        <>
          <h4>Контур · {entity.points.length} вершин</h4>
          <p className="inspector-note">
            Инструмент «Вершины» позволяет двигать точки на плане. Выберите
            вершину здесь для точного ввода.
          </p>
          <label className="field">
            <span>Вершина</span>
            <select
              aria-label="Вершина"
              value={selectedVertex ?? ""}
              onChange={(e) =>
                setSelectedVertex(
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            >
              <option value="">Выбрать точку</option>
              {entity.points.map((_, i) => (
                <option key={i} value={i}>
                  Точка {i + 1}
                </option>
              ))}
            </select>
          </label>
          {selectedVertex !== null && entity.points[selectedVertex] && (
            <>
              <div className="field-grid">
                <NumberField
                  label="X вершины"
                  value={entity.points[selectedVertex].x}
                  onChange={(x) => {
                    const next = clone(entity);
                    next.points[selectedVertex].x = x;
                    edit(next);
                  }}
                />
                <NumberField
                  label="Y вершины"
                  value={entity.points[selectedVertex].y}
                  onChange={(y) => {
                    const next = clone(entity);
                    next.points[selectedVertex].y = y;
                    edit(next);
                  }}
                />
              </div>
              <p className="inspector-note">
                Координаты относительно центра объекта, до поворота.
              </p>
              <div className="inline-actions">
                <button
                  onClick={() => {
                    const n = clone(entity),
                      i = selectedVertex,
                      j = (i + 1) % n.points.length;
                    if (isWall(n) && i === n.points.length - 1) {
                      n.points.push({ x: n.points[i].x + 1, y: n.points[i].y });
                      n.segmentIds.push(uid());
                    } else {
                      const a = n.points[i],
                        b = n.points[j];
                      n.points.splice(i + 1, 0, {
                        x: (a.x + b.x) / 2,
                        y: (a.y + b.y) / 2,
                      });
                      if (isWall(n)) {
                        const id = n.segmentIds[i],
                          half = distance(a, b) / 2;
                        if (
                          n.openings.some(
                            (o) =>
                              o.segmentId === id &&
                              o.offset < half &&
                              o.offset + o.width > half,
                          )
                        ) {
                          alert(
                            "Нельзя добавить вершину внутри проёма. Сначала переместите проём.",
                          );
                          return;
                        }
                        const newId = uid();
                        n.segmentIds.splice(i + 1, 0, newId);
                        n.openings = n.openings.map((o) =>
                          o.segmentId === id && o.offset >= half
                            ? {
                                ...o,
                                segmentId: newId,
                                offset: o.offset - half,
                              }
                            : o,
                        );
                      }
                    }
                    edit(n);
                  }}
                >
                  Вставить после
                </button>
                <button
                  onClick={() => {
                    const n = clone(entity),
                      i = selectedVertex;
                    if (isWall(n)) {
                      const affected = [
                        n.segmentIds[i - 1],
                        n.segmentIds[i],
                      ].filter(Boolean);
                      if (
                        n.openings.some((o) => affected.includes(o.segmentId))
                      ) {
                        alert(
                          "Сначала удалите или перенесите проёмы соседних сегментов.",
                        );
                        return;
                      }
                      n.segmentIds.splice(
                        i === n.points.length - 1 ? i - 1 : i,
                        1,
                      );
                    }
                    n.points.splice(i, 1);
                    edit(n);
                    setSelectedVertex(null);
                  }}
                >
                  Удалить точку
                </button>
              </div>
            </>
          )}
        </>
      )}
      {isWall(entity) && (
        <>
          <h4>Проёмы</h4>
          <div className="inline-actions">
            <button onClick={() => addOpening("door")}>
              <DoorOpen size={14} /> Дверь
            </button>
            <button onClick={() => addOpening("window")}>
              <AppWindow size={14} /> Окно
            </button>
          </div>
          {entity.openings.length === 0 && (
            <p className="inspector-note">
              Добавьте проём в первый подходящий сегмент или выберите инструмент
              и нажмите на стену.
            </p>
          )}
        </>
      )}
      <div className="inspector-footer">
        <button onClick={copy}>
          <Copy size={15} /> Дублировать
        </button>
        <button className="danger-text" onClick={remove}>
          <Trash2 size={15} /> Удалить
        </button>
      </div>
    </>
  );
}

export function App() {
  const [project, setProject] = useState<Project>(restore);
  const history = useRef<History | null>(null);
  const objectClipboard = useRef<{
    entity: Entity;
    opening?: Opening;
    pastes: number;
  } | null>(null);
  if (!history.current) history.current = new History(project);
  const [selected, setSelected] = useState<string | null>(null),
    [tool, setTool] = useState<Tool>("select"),
    [view, setView] = useState<View>("3d");
  const [snap, setSnap] = useState(true),
    [grid, setGrid] = useState(true),
    [hideRoof, setHideRoof] = useState(true),
    [showLabels, setShowLabels] = useState(true),
    [transform, setTransform] = useState<"translate" | "rotate">("translate");
  const [message, setMessage] = useState(bootError),
    [hint, setHint] = useState(""),
    [storageStatus, setStorageStatus] = useState("Локальный проект"),
    [savedSignature, setSavedSignature] = useState("");
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null),
    [catalog, setCatalog] = useState(false),
    [leftOpen, setLeftOpen] = useState(false),
    [rightOpen, setRightOpen] = useState(false),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set()),
    [help, setHelp] = useState(false),
    [sceneError, setSceneError] = useState("");
  const host = useRef<HTMLDivElement>(null),
    scene = useRef<GardenScene | null>(null),
    input = useRef<HTMLInputElement>(null);
  const [collapsedFloors, setCollapsedFloors] = useState<Set<FloorGroup>>(
    () => new Set(floorGroups.map((level) => level.id)),
  );
  const [hiddenFloors, setHiddenFloors] = useState<FloorGroup[]>([]);
  const [activeFloor, setActiveFloor] = useState<FloorView>("all");
  const [exporting3d, setExporting3d] = useState(false);
  const displayedHiddenFloors = floorGroups
    .filter(
      (level) =>
        hiddenFloors.includes(level.id) || !floorInView(activeFloor, level.id),
    )
    .map((level) => level.id);
  const inspectorPanel = useRef<HTMLDivElement>(null);
  const objectList = useRef<HTMLDivElement>(null);
  const objectRows = useRef(new Map<string, HTMLElement>());
  const [selectionRevision, setSelectionRevision] = useState(0);
  const entity =
    project.entities.find(
      (e) =>
        e.id === selected ||
        (isWall(e) && e.openings.some((o) => o.id === selected)),
    ) ?? null;
  const opening =
    entity && isWall(entity)
      ? (entity.openings.find((o) => o.id === selected) ?? null)
      : null;
  const selectedFloor = entity ? entityFloor(entity) : null;
  useEffect(() => {
    if (selectedFloor) {
      setRightOpen(true);
      setLeftOpen(false);
      setActiveFloor((old) =>
        entity && entityFloors(entity).some((floor) => floorInView(old, floor))
          ? old
          : selectedFloor,
      );
      setHiddenFloors((old) =>
        old.includes(selectedFloor)
          ? old.filter((id) => id !== selectedFloor)
          : old,
      );
      inspectorPanel.current?.scrollTo({ top: 0 });
      setCollapsedFloors((old) => {
        if (!old.has(selectedFloor)) return old;
        const next = new Set(old);
        next.delete(selectedFloor);
        return next;
      });
      if (opening && entity)
        setCollapsed((old) => {
          if (!old.has(entity.id)) return old;
          const next = new Set(old);
          next.delete(entity.id);
          return next;
        });
    }
  }, [selected, selectedFloor, selectionRevision]);
  useEffect(() => {
    const list = objectList.current,
      row = selected ? objectRows.current.get(selected) : null;
    if (!list || !row || !list.clientHeight) return;
    const area = list.getBoundingClientRect(),
      item = row.getBoundingClientRect();
    if (item.top < area.top) list.scrollTop += item.top - area.top;
    else if (item.bottom > area.bottom)
      list.scrollTop += item.bottom - area.bottom;
  }, [selected, collapsedFloors, collapsed, leftOpen, selectionRevision]);
  const showFloor = (floor: FloorView) => {
    setActiveFloor(floor);
    setHiddenFloors((old) => old.filter((id) => !floorInView(floor, id)));
    if (selectedFloor && !floorInView(floor, selectedFloor)) setSelected(null);
    if (floor === "roof") setHideRoof(false);
    scene.current?.cancelDrawing();
  };
  const onCurrentFloor = (e: Entity) => {
    if (activeFloor !== "all" && e.type !== "roof") {
      const floor = activeFloor === "lower" ? "ground" : activeFloor;
      e.position.z = { ground: 0, gallery: 1.6, upper: 4.8, roof: 9 }[floor];
      e.floorGroup = floor;
    }
    return e;
  };
  const dirty = JSON.stringify(project) !== savedSignature;
  const persist = (doc: Project) => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(doc));
      setStorageStatus("Сохранено в браузере");
    } catch {
      setStorageStatus("Автосохранение недоступно");
      setMessage(
        "Браузер не смог сохранить проект. Скачайте файл кнопкой «Сохранить».",
      );
    }
  };
  const commit = (next: Project) => {
    try {
      history.current!.commit(next);
      const doc = clone(history.current!.current);
      setProject(doc);
      setMessage("");
      persist(doc);
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось изменить проект.",
      );
      setProject(clone(history.current!.current));
      return false;
    }
  };
  useEffect(() => {
    try {
      const current = history.current!.current;
      const corrected = applyGardenUpdates(current);
      if (corrected !== current) commit(corrected);
      else if (bootMigration) persist(current);
    } catch {
      setMessage(
        "Не удалось автоматически обновить схему. Текущая сцена оставлена без изменений.",
      );
    }
    bootMigration = false;
  }, []);
  const edit = (next: Entity) => {
    const doc = clone(history.current!.current);
    const i = doc.entities.findIndex((e) => e.id === next.id);
    if (i >= 0) doc.entities[i] = next;
    return commit(doc);
  };
  const editOpening = (o: Opening) => {
    if (!entity || !isWall(entity)) return;
    const n = clone(entity);
    n.openings = n.openings.map((old) => (old.id === o.id ? o : old));
    edit(n);
  };
  const selectTool = (next: Tool) => {
    if (["floor", "wall", "roof", "vertex"].includes(next)) setView("plan");
    setTool(next);
    setCatalog(false);
    setHint("");
    setMessage("");
  };
  const addOpening = (
    wallId: string,
    segment: number,
    offset: number,
    type: "door" | "window",
  ) => {
    const wall = project.entities.find((e) => e.id === wallId);
    if (!wall || !isWall(wall)) return;
    const n = clone(wall),
      length = distance(n.points[segment], n.points[segment + 1]),
      width = type === "door" ? 1 : 1.5,
      height = type === "door" ? 2.1 : 1.2,
      sill = type === "door" ? 0 : 0.9;
    if (length < width || n.height < height + sill) {
      setMessage(
        "На выбранном сегменте недостаточно места для проёма стандартного размера.",
      );
      return;
    }
    const o: Opening = {
      id: uid(),
      name: type === "door" ? "Дверной проём" : "Оконный проём",
      type,
      segmentId: n.segmentIds[segment],
      offset:
        Math.round(
          Math.max(0, Math.min(length - width, offset - width / 2)) * 100,
        ) / 100,
      width,
      height,
      sill,
    };
    n.openings.push(o);
    if (edit(n)) {
      setSelected(o.id);
      setTool("select");
      setRightOpen(true);
    }
  };
  const addOpeningFirst = (type: "door" | "window") => {
    if (!entity || !isWall(entity)) return;
    const width = type === "door" ? 1 : 1.5;
    for (let i = 0; i < entity.segmentIds.length; i++) {
      const len = distance(entity.points[i], entity.points[i + 1]);
      for (let start = 0.1; start + width <= len + 0.001; start += 0.1) {
        if (
          !entity.openings.some(
            (o) =>
              o.segmentId === entity.segmentIds[i] &&
              start < o.offset + o.width &&
              start + width > o.offset,
          )
        ) {
          addOpening(entity.id, i, start + width / 2, type);
          return;
        }
      }
    }
    setMessage(
      "Нет свободного места. Увеличьте стену или переместите существующие проёмы.",
    );
  };
  const remove = () => {
    if (!entity) return;
    const doc = clone(project);
    if (opening) {
      const wall = doc.entities.find((e) => e.id === entity.id) as Wall;
      wall.openings = wall.openings.filter((o) => o.id !== opening.id);
    } else doc.entities = doc.entities.filter((e) => e.id !== entity.id);
    if (commit(doc)) {
      setSelected(opening ? entity.id : null);
      setSelectedVertex(null);
    }
  };
  const copy = () => {
    if (!entity) return;
    if (opening) {
      const n = clone(entity) as Wall,
        o = {
          ...opening,
          id: uid(),
          offset: opening.offset + opening.width + 0.2,
          name: opening.name + " (копия)",
        };
      n.openings.push(o);
      if (edit(n)) setSelected(o.id);
    } else {
      const n = duplicate(entity);
      if (commit({ ...clone(project), entities: [...project.entities, n] }))
        setSelected(n.id);
    }
  };
  const copyToClipboard = () => {
    if (!entity) return;
    objectClipboard.current = {
      entity: clone(entity),
      opening: opening ? clone(opening) : undefined,
      pastes: 0,
    };
    setMessage("Скопировано. Ctrl+V — вставить копию.");
  };
  const pasteFromClipboard = () => {
    const buffer = objectClipboard.current;
    if (!buffer) return;
    if (buffer.opening) {
      const target =
        entity && isWall(entity)
          ? entity
          : project.entities.find((e) => e.id === buffer.entity.id);
      if (!target || !isWall(target)) {
        setMessage("Выберите стену для вставки проёма.");
        return;
      }
      const wall = clone(target),
        source = buffer.opening;
      const segmentId = wall.segmentIds.includes(source.segmentId)
        ? source.segmentId
        : wall.segmentIds[0];
      const index = wall.segmentIds.indexOf(segmentId),
        length = distance(wall.points[index], wall.points[index + 1]);
      const offsets = [
        source.offset,
        0,
        ...wall.openings
          .filter((o) => o.segmentId === segmentId)
          .map((o) => o.offset + o.width + 0.2),
      ];
      const offset = offsets.find(
        (x) =>
          x + source.width <= length &&
          wall.openings.every(
            (o) =>
              o.segmentId !== segmentId ||
              x + source.width <= o.offset ||
              x >= o.offset + o.width,
          ),
      );
      if (offset === undefined) {
        setMessage("На стене нет места для копии проёма.");
        return;
      }
      const pasted = {
        ...clone(source),
        id: uid(),
        segmentId,
        offset,
        name: source.name + " (копия)",
      };
      wall.openings.push(pasted);
      if (edit(wall)) setSelected(pasted.id);
    } else {
      const pasted = duplicate(buffer.entity);
      pasted.position.x += buffer.pastes;
      pasted.position.y += buffer.pastes;
      if (
        commit({ ...clone(project), entities: [...project.entities, pasted] })
      ) {
        buffer.pastes++;
        setSelected(pasted.id);
        setSelectedVertex(null);
        selectTool("select");
      }
    }
  };
  const undo = () => {
    const doc = clone(history.current!.undo());
    setProject(doc);
    setSelectedVertex(null);
    persist(doc);
    setMessage("");
  };
  const redo = () => {
    const doc = clone(history.current!.redo());
    setProject(doc);
    setSelectedVertex(null);
    persist(doc);
    setMessage("");
  };
  const save = () => {
    saveText(
      JSON.stringify(project, null, 2),
      `${project.name.replace(/[<>:"/\\|?*]/g, "_")}.garden.json`,
    );
    setSavedSignature(JSON.stringify(project));
    setStorageStatus("Файл проекта скачан");
  };
  const replace = (doc: Project, fromFile = false) => {
    if (
      dirty &&
      !confirm(
        "В проекте есть изменения, не сохранённые в файл. Заменить текущий проект?",
      )
    )
      return;
    history.current = new History(doc);
    setProject(clone(doc));
    setSelected(null);
    setSelectedVertex(null);
    setTool("select");
    setSavedSignature(fromFile ? JSON.stringify(doc) : "");
    setMessage("");
    persist(doc);
    scene.current?.cancelDrawing();
    setTimeout(() => scene.current?.frame(), 50);
  };
  const readFile = async (file: File) => {
    try {
      if (file.size > 5_000_000)
        throw new Error("Файл слишком большой: максимум 5 МБ.");
      const raw = await file.text(),
        parsed = parseProject(raw);
      const doc = applyGardenUpdates(parsed);
      replace(doc, doc === parsed);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось открыть файл.",
      );
    }
  };
  const exportPNG = () => {
    try {
      const url = scene.current?.exportPNG();
      if (url) download(url, "Зимний сад.png");
      else setMessage("Сцена ещё не готова для экспорта.");
    } catch {
      setMessage("Не удалось экспортировать изображение. Попробуйте снова.");
    }
  };
  const exportGLB = async () => {
    if (!scene.current || exporting3d) return;
    setExporting3d(true);
    try {
      const data = await scene.current.exportGLB();
      const url = URL.createObjectURL(
        new Blob([data], { type: "model/gltf-binary" }),
      );
      download(url, `${project.name.replace(/[<>:"/\\|?*]/g, "_")}.glb`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStorageStatus("3D-модель GLB скачана · все этажи и крыша");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось экспортировать 3D-модель.",
      );
    } finally {
      setExporting3d(false);
    }
  };
  const callbacks = useRef({
    select: (id: string | null) => {
      setSelected(id);
      setSelectionRevision((n) => n + 1);
      setRightOpen(Boolean(id));
      if (id) setLeftOpen(false);
    },
    edit: (e: Entity) => {
      edit(e);
    },
    draw: (points: Point[], type: "floor" | "wall" | "roof") => {
      const e = onCurrentFloor(
        type === "wall"
          ? makeWall(points)
          : makeSurface(type, points, labels[type], type === "roof" ? 9 : 0),
      );
      if (commit({ ...clone(project), entities: [...project.entities, e] })) {
        setSelected(e.id);
        setTool("select");
        scene.current?.cancelDrawing();
      }
    },
    place: (point: Point, type: SolidKind) => {
      const e = onCurrentFloor(makeSolid(type, point.x, point.y));
      if (commit({ ...clone(project), entities: [...project.entities, e] })) {
        setSelected(e.id);
        setTool("select");
      }
    },
    opening: addOpening,
    error: setMessage,
    hint: setHint,
    vertex: setSelectedVertex,
  });
  callbacks.current = {
    select: (id) => {
      setSelected(id);
      setSelectionRevision((n) => n + 1);
      setRightOpen(Boolean(id));
      if (id) setLeftOpen(false);
    },
    edit: (e) => {
      edit(e);
    },
    draw: (points, type) => {
      try {
        const e = onCurrentFloor(
          type === "wall"
            ? makeWall(points)
            : makeSurface(type, points, labels[type], type === "roof" ? 9 : 0),
        );
        if (commit({ ...clone(project), entities: [...project.entities, e] })) {
          setSelected(e.id);
          setTool("select");
          scene.current?.cancelDrawing();
        }
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Не удалось построить контур.",
        );
      }
    },
    place: (point, type) => {
      const e = onCurrentFloor(makeSolid(type, point.x, point.y));
      if (commit({ ...clone(project), entities: [...project.entities, e] })) {
        setSelected(e.id);
        setTool("select");
      }
    },
    opening: addOpening,
    error: setMessage,
    hint: setHint,
    vertex: setSelectedVertex,
  };
  useEffect(() => {
    if (!host.current) return;
    try {
      scene.current = new GardenScene(host.current, {
        select: (id) => callbacks.current.select(id),
        edit: (e) => callbacks.current.edit(e),
        draw: (p, t) => callbacks.current.draw(p, t),
        place: (p, t) => callbacks.current.place(p, t),
        opening: (...args) => callbacks.current.opening(...args),
        error: (m) => callbacks.current.error(m),
        hint: (m) => callbacks.current.hint(m),
        vertex: (i) => callbacks.current.vertex(i),
      });
    } catch {
      setSceneError(
        "Браузер не смог запустить WebGL. Включите аппаратное ускорение или откройте редактор в браузере с поддержкой WebGL.",
      );
    }
    return () => {
      scene.current?.destroy();
      scene.current = null;
    };
  }, []);
  useEffect(() => {
    const state: SceneState = {
      project,
      selected,
      tool,
      view,
      snap,
      grid,
      hideRoof,
      labels: showLabels,
      transform,
      hiddenFloors: displayedHiddenFloors,
    };
    scene.current?.update(state);
  }, [
    project,
    selected,
    tool,
    view,
    snap,
    grid,
    hideRoof,
    showLabels,
    transform,
    hiddenFloors,
    activeFloor,
  ]);
  useEffect(() => {
    if (scene.current) {
      scene.current.vertexIndex = selectedVertex;
      scene.current.update({
        project,
        selected,
        tool,
        view,
        snap,
        grid,
        hideRoof,
        labels: showLabels,
        transform,
        hiddenFloors: displayedHiddenFloors,
      });
    }
  }, [selectedVertex]);
  useEffect(() => {
    if (selected && !entity) setSelected(null);
  }, [project, entity, selected]);
  const actions = useRef({
    undo,
    redo,
    save,
    remove,
    copy,
    copyToClipboard,
    pasteFromClipboard,
    selectTool,
    dirty,
  });
  actions.current = {
    undo,
    redo,
    save,
    remove,
    copy,
    copyToClipboard,
    pasteFromClipboard,
    selectTool,
    dirty,
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable]:not([contenteditable='false'])",
        )
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === "KeyC") {
        e.preventDefault();
        actions.current.copyToClipboard();
      } else if (mod && e.code === "KeyV") {
        e.preventDefault();
        actions.current.pasteFromClipboard();
      } else if (mod && e.code === "KeyS") {
        e.preventDefault();
        actions.current.save();
      } else if (mod && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) actions.current.redo();
        else actions.current.undo();
      } else if (mod && e.code === "KeyY") {
        e.preventDefault();
        actions.current.redo();
      } else if (mod && e.code === "KeyD") {
        e.preventDefault();
        actions.current.copy();
      } else if (e.key === "Delete") {
        e.preventDefault();
        actions.current.remove();
      } else if (!mod && e.code === "KeyR")
        actions.current.selectTool("resize");
      else if (e.code === "KeyV") actions.current.selectTool("select");
      else if (e.code === "KeyP") actions.current.selectTool("floor");
      else if (e.code === "KeyW") actions.current.selectTool("wall");
      else if (e.key === "Escape") {
        actions.current.selectTool("select");
        setCatalog(false);
        setHelp(false);
      } else if (e.code === "KeyF") scene.current?.frame();
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (actions.current.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", unload);
    };
  }, []);
  const modeHint =
    hint ||
    (
      {
        select:
          view === "plan"
            ? "Перетаскивание — двигать · ПКМ — обзор · колесо — масштаб"
            : "ЛКМ — вращать · ПКМ — обзор · колесо — масштаб",
        vertex: "Перетаскивайте вершины · точные координаты — в свойствах",
        resize: "Тяните стороны и углы · Shift — пропорции · Esc — отмена",
        floor:
          "Нажимайте, чтобы задать контур · Enter — завершить · Esc — отменить",
        roof: "Задайте контур крыши · Enter — завершить · Esc — отменить",
        wall: "Нажимайте, чтобы строить стену · Enter — завершить · Esc — отменить",
        door: "Нажмите на стену, чтобы добавить дверной проём",
        window: "Нажмите на стену, чтобы добавить оконный проём",
      } as Partial<Record<Tool, string>>
    )[tool] ||
    "Нажмите на схему, чтобы поставить объект";
  const totalArea = project.entities
    .filter((e) => e.type === "floor")
    .reduce((s, e) => s + area((e as { points: Point[] }).points), 0);
  const orientView = (axis: CameraView) => {
    scene.current?.cancelDrawing();
    if (["floor", "wall", "roof", "vertex"].includes(tool)) setTool("select");
    setView("3d");
    scene.current?.orientCamera(axis);
  };
  const toolButton = (
    id: Tool,
    label: string,
    Icon: typeof Box,
    shortcut?: string,
  ) => (
    <button
      key={id}
      className={`tool ${tool === id ? "selected" : ""}`}
      onClick={() => selectTool(id)}
      aria-label={shortcut ? `${label} (${shortcut})` : label}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      <Icon size={17} />
      <span>{label}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Sprout size={22} />
          </div>
          <div>
            <h1>Зимний сад</h1>
            <span>Редактор пространства</span>
          </div>
        </div>
        <div className="project-title">
          <span className="status-dot" />
          {project.name}
          <span className="project-local">На этом компьютере</span>
        </div>
        <div className="file-actions">
          <Button
            title="Новый проект"
            onClick={() =>
              replace({ version: 1, name: "Новый проект", entities: [] })
            }
          >
            <FilePlus2 size={17} />
            <span>Новый</span>
          </Button>
          <Button title="Открыть проект" onClick={() => input.current?.click()}>
            <ArrowUpFromLine size={17} />
            <span>Открыть</span>
          </Button>
          <Button title="Экспорт PNG" onClick={exportPNG}>
            <ImageDown size={17} />
            <span>PNG</span>
          </Button>
          <Button
            title="Экспорт GLB"
            onClick={() => void exportGLB()}
            disabled={exporting3d}
          >
            <Box size={17} />
            <span>{exporting3d ? "GLB…" : "GLB"}</span>
          </Button>
          <Button title="Сохранить проект" className="primary" onClick={save}>
            <ArrowDownToLine size={17} />
            <span>Сохранить</span>
          </Button>
        </div>
        <input
          ref={input}
          className="file-input"
          type="file"
          accept=".json,.garden.json,application/json"
          aria-label="Файл проекта"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
            e.target.value = "";
          }}
        />
      </header>
      <div className="workspace">
        <aside className={`tools-panel ${leftOpen ? "mobile-open" : ""}`}>
          <div className="panel-title">
            <h2>Инструменты</h2>
            <button
              className="mobile-close"
              aria-label="Закрыть инструменты"
              onClick={() => setLeftOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          <div className="tool-section">
            {toolButton("select", "Выбрать", MousePointer2, "V")}
            {toolButton("vertex", "Вершины", SquareDashedMousePointer)}
            {toolButton("resize", "Размер", Scaling, "R")}
            <div className="section-label">Построение</div>
            {toolButton("floor", "Площадка", Pentagon, "P")}
            {toolButton("wall", "Стена", Fence, "W")}
            {toolButton("door", "Дверь", DoorOpen)}
            {toolButton("window", "Окно", AppWindow)}
            {toolButton("roof", "Крыша", Layers3)}
            <button
              className={`catalog-trigger ${catalog ? "selected" : ""}`}
              onClick={() => setCatalog(!catalog)}
            >
              <Plus size={17} />
              <span>Добавить объект</span>
              <ChevronDown size={14} />
            </button>
          </div>
          {catalog && (
            <div className="catalog">
              <div className="section-label">Сад и обстановка</div>
              {(
                [
                  "stairs",
                  "column",
                  "bed",
                  "plant",
                  "podium",
                  "table",
                  "chair",
                  "sofa",
                  "box",
                  "cylinder",
                ] as SolidKind[]
              ).map((type) => {
                const Icon = typeIcons[type];
                return (
                  <button key={type} onClick={() => selectTool(type)}>
                    <Icon size={16} />
                    {labels[type]}
                  </button>
                );
              })}
            </div>
          )}
          <div className="objects-heading">
            <h2>Объекты</h2>
            <span>{project.entities.length}</span>
          </div>
          <div
            className="object-list"
            ref={objectList}
            aria-label="Список объектов"
          >
            {project.entities.length === 0 ? (
              <p className="list-empty">
                Схема пока пустая.
                <br />
                Начните с площадки или стены.
              </p>
            ) : (
              floorGroups.map((level) => {
                const members = project.entities.filter(
                  (e) => entityFloor(e) === level.id,
                );
                if (!members.length) return null;
                const closed = collapsedFloors.has(level.id),
                  hidden = displayedHiddenFloors.includes(level.id);
                return (
                  <section
                    key={level.id}
                    className={`floor-group ${hidden ? "floor-hidden" : ""}`}
                    data-floor={level.id}
                    aria-label={level.name}
                  >
                    <div className="floor-heading">
                      <button
                        className="floor-toggle"
                        aria-label={`Этаж: ${level.name}`}
                        aria-expanded={!closed}
                        onClick={() =>
                          setCollapsedFloors((old) => {
                            const next = new Set(old);
                            if (next.has(level.id)) next.delete(level.id);
                            else next.add(level.id);
                            return next;
                          })
                        }
                      >
                        {closed ? (
                          <ChevronRight size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                        <span>
                          {level.name}
                          <small>{level.height}</small>
                        </span>
                        <em>{members.length}</em>
                      </button>
                      <button
                        className="floor-visibility"
                        aria-label={`${hidden ? "Показать" : "Скрыть"} этаж: ${level.name}`}
                        title={hidden ? "Показать этаж" : "Скрыть этаж"}
                        onClick={() => {
                          if (!floorInView(activeFloor, level.id)) {
                            showFloor(level.id);
                            return;
                          }
                          setHiddenFloors((old) =>
                            old.includes(level.id)
                              ? old.filter((id) => id !== level.id)
                              : [...old, level.id],
                          );
                        }}
                      >
                        {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {!closed &&
                      members.map((e) => {
                        const Icon = typeIcons[e.type],
                          active =
                            selected === e.id ||
                            (isWall(e) &&
                              e.openings.some((o) => o.id === selected));
                        return (
                          <div key={e.id}>
                            <div
                              className={`object-row ${active ? "chosen" : ""} ${e.hidden ? "muted" : ""}`}
                              ref={(node) => {
                                if (node) objectRows.current.set(e.id, node);
                                else objectRows.current.delete(e.id);
                              }}
                            >
                              <button
                                className="object-select"
                                onClick={() => {
                                  setSelected(e.id);
                                  setRightOpen(true);
                                  setLeftOpen(false);
                                  setTool("select");
                                }}
                                title={e.name}
                              >
                                <Icon size={15} />
                                <span>{e.name}</span>
                              </button>
                              {isWall(e) && e.openings.length > 0 && (
                                <button
                                  className="row-action"
                                  title="Показать проёмы"
                                  aria-label={`Проёмы: ${e.name}`}
                                  onClick={() =>
                                    setCollapsed((s) => {
                                      const n = new Set(s);
                                      if (n.has(e.id)) n.delete(e.id);
                                      else n.add(e.id);
                                      return n;
                                    })
                                  }
                                >
                                  {collapsed.has(e.id) ? (
                                    <ChevronRight size={13} />
                                  ) : (
                                    <ChevronDown size={13} />
                                  )}
                                </button>
                              )}
                              <button
                                className="row-action visibility"
                                title={
                                  e.hidden ? "Показать объект" : "Скрыть объект"
                                }
                                aria-label={`${e.hidden ? "Показать" : "Скрыть"}: ${e.name}`}
                                onClick={() =>
                                  edit({ ...clone(e), hidden: !e.hidden })
                                }
                              >
                                {e.hidden ? (
                                  <EyeOff size={14} />
                                ) : (
                                  <Eye size={14} />
                                )}
                              </button>
                            </div>
                            {isWall(e) &&
                              !collapsed.has(e.id) &&
                              e.openings.map((o) => (
                                <button
                                  key={o.id}
                                  ref={(node) => {
                                    if (node)
                                      objectRows.current.set(o.id, node);
                                    else objectRows.current.delete(o.id);
                                  }}
                                  className={`opening-row ${selected === o.id ? "chosen" : ""}`}
                                  onClick={() => {
                                    setSelected(o.id);
                                    setTool("select");
                                    setRightOpen(true);
                                    setLeftOpen(false);
                                  }}
                                >
                                  {o.type === "door" ? (
                                    <DoorOpen size={13} />
                                  ) : (
                                    <AppWindow size={13} />
                                  )}
                                  <span>{o.name}</span>
                                </button>
                              ))}
                          </div>
                        );
                      })}
                  </section>
                );
              })
            )}
          </div>
          <div className="left-footer">
            <Info size={15} />
            <span>
              Приблизительная схема.
              <br />
              Размеры можно уточнить.
            </span>
          </div>
        </aside>
        <main className="scene-panel">
          <div className="scene-toolbar">
            <div className="toolbar-left">
              <Button
                title="Инструменты и объекты"
                className="mobile-toggle"
                onClick={() => {
                  setLeftOpen(!leftOpen);
                  setRightOpen(false);
                }}
              >
                <ListTree size={17} />
              </Button>
              <div className="view-switch">
                <button
                  className={view === "plan" ? "current" : ""}
                  onClick={() => {
                    setView("plan");
                    scene.current?.cancelDrawing();
                  }}
                >
                  <Grid2X2 size={15} />
                  План
                </button>
                <button
                  className={view === "3d" ? "current" : ""}
                  onClick={() => {
                    setView("3d");
                    if (["floor", "wall", "roof", "vertex"].includes(tool))
                      setTool("select");
                    scene.current?.cancelDrawing();
                  }}
                >
                  <Box size={15} />
                  3D
                </button>
              </div>
              <span className="toolbar-divider" />
              <Button
                title="Отменить"
                disabled={!history.current.past.length}
                onClick={undo}
              >
                <Undo2 size={17} />
              </Button>
              <Button
                title="Повторить"
                disabled={!history.current.future.length}
                onClick={redo}
              >
                <Redo2 size={17} />
              </Button>
            </div>
            <div className="view-options">
              <Button
                title="Сетка"
                active={grid}
                onClick={() => setGrid(!grid)}
              >
                <Grid2X2 size={16} />
              </Button>
              <Button
                title="Привязка 0,1 м"
                active={snap}
                onClick={() => setSnap(!snap)}
              >
                <Magnet size={16} />
              </Button>
              <Button
                title="Подписи площадок"
                active={showLabels}
                onClick={() => setShowLabels(!showLabels)}
              >
                <ListTree size={16} />
              </Button>
              <Button
                title="Показать крышу"
                active={!hideRoof}
                onClick={() => setHideRoof(!hideRoof)}
              >
                <Layers3 size={16} />
              </Button>
              <Button
                title="Свойства"
                className="mobile-toggle"
                onClick={() => {
                  setRightOpen(!rightOpen);
                  setLeftOpen(false);
                }}
              >
                <Settings2 size={17} />
              </Button>
            </div>
          </div>
          <div className="floor-view-bar">
            <label htmlFor="floor-view">
              <Layers3 size={16} />
              Этаж
            </label>
            <select
              id="floor-view"
              aria-label="Отображение по этажам"
              value={activeFloor}
              onChange={(e) => showFloor(e.target.value as FloorView)}
            >
              <option value="all">Все этажи</option>
              <option value="lower">0 м + 1,6 м</option>
              {floorGroups.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                  {level.height ? ` · ${level.height}` : ""}
                </option>
              ))}
            </select>
            <span>
              {activeFloor === "all" ? "Общий вид" : "Остальные этажи скрыты"}
            </span>
          </div>
          <div className="viewport" ref={host} data-testid="viewport">
            <div className="scene-heading">
              <span className="view-caption">
                {view === "3d" ? "Объёмная схема" : "План сверху"}
              </span>
              <span className="scale-caption">Все размеры в метрах</span>
            </div>
            <div
              className="view-cube"
              role="group"
              aria-label="Кубик ориентации"
            >
              <div className="view-cube-stage">
                <div className="view-cube-solid">
                  {CAMERA_VIEWS.map((axis) => (
                    <button
                      key={axis.id}
                      className={`cube-face cube-${axis.id}`}
                      aria-label={`Кубик: ${axis.label}`}
                      title={`Вид ${axis.label}`}
                      data-view-axis={axis.id}
                      aria-pressed={false}
                      onClick={() => orientView(axis.id)}
                    >
                      {axis.face}
                    </button>
                  ))}
                </div>
                <button
                  className="view-cube-home"
                  aria-label="Изометрия"
                  title="Общий объёмный вид"
                  onClick={() => orientView("iso")}
                >
                  <Box size={14} />
                </button>
              </div>
              <div className="view-cube-axes">
                {CAMERA_VIEWS.map((axis) => (
                  <button
                    key={axis.id}
                    aria-label={`Вид ${axis.label} (${axis.axis})`}
                    title={`Вид ${axis.label}`}
                    data-view-axis={axis.id}
                    aria-pressed={false}
                    onClick={() => orientView(axis.id)}
                  >
                    {axis.axis}
                  </button>
                ))}
              </div>
            </div>
            {entity && !opening && (view === "3d" || tool === "resize") && (
              <div className="transform-switch">
                <Button
                  title="Перемещение"
                  active={tool !== "resize" && transform === "translate"}
                  onClick={() => {
                    setTool("select");
                    setTransform("translate");
                  }}
                >
                  <Move size={16} />
                </Button>
                <Button
                  title="Поворот объекта"
                  active={tool !== "resize" && transform === "rotate"}
                  onClick={() => {
                    setTool("select");
                    setTransform("rotate");
                  }}
                >
                  <RotateCw size={16} />
                </Button>
                <Button
                  title="Размер объекта (R)"
                  active={tool === "resize"}
                  onClick={() => selectTool("resize")}
                >
                  <Scaling size={16} />
                </Button>
              </div>
            )}
            <div className="scene-navigation">
              <Button
                title="Показать всю схему"
                onClick={() => scene.current?.frame()}
              >
                <Focus size={19} />
              </Button>
              <span />
              <Button
                title="Приблизить"
                onClick={() => scene.current?.zoom(1.2)}
              >
                <Plus size={19} />
              </Button>
              <Button
                title="Отдалить"
                onClick={() => scene.current?.zoom(1 / 1.2)}
              >
                <ZoomOut size={18} />
              </Button>
            </div>
            {["floor", "wall", "roof"].includes(tool) && (
              <div className="draw-actions">
                <Button
                  title="Завершить контур"
                  onClick={() => scene.current?.finishDrawing()}
                >
                  <Check size={16} />
                  Завершить
                </Button>
                <Button
                  title="Отменить построение"
                  onClick={() => {
                    scene.current?.cancelDrawing();
                    setTool("select");
                  }}
                >
                  <X size={16} />
                </Button>
              </div>
            )}
            {sceneError && (
              <div className="scene-error" role="alert">
                <Box size={30} />
                <h3>Не удалось открыть 3D</h3>
                <p>{sceneError}</p>
              </div>
            )}
          </div>
          <div className="scene-status">
            <span className="interaction-hint">
              <MousePointer2 size={13} />
              {modeHint}
            </span>
            <span className="status-right">
              {snap ? "Шаг 0,1 м" : "Без привязки"}
              <span>·</span>
              {fmt(totalArea)} м²
            </span>
          </div>
        </main>
        <aside
          aria-label="Инспектор объекта"
          className={`properties-panel ${rightOpen ? "mobile-open" : ""}`}
        >
          <div className="panel-title">
            <h2>Свойства</h2>
            <button
              className="mobile-close"
              aria-label="Закрыть свойства"
              onClick={() => setRightOpen(false)}
            >
              <X size={17} />
            </button>
            <span className="property-unit">м / °</span>
          </div>
          <div
            className="inspector"
            ref={inspectorPanel}
            key={selected ?? "empty"}
          >
            <Inspector
              entity={entity}
              opening={opening}
              edit={edit}
              editOpening={editOpening}
              selectedVertex={selectedVertex}
              setSelectedVertex={setSelectedVertex}
              remove={remove}
              copy={copy}
              addOpening={addOpeningFirst}
              previewColor={(color) => {
                if (entity) scene.current?.previewColor(entity.id, color);
              }}
            />
          </div>
        </aside>
      </div>
      <footer className="app-footer">
        <span>
          <span className="status-dot" />
          {storageStatus}
        </span>
        <span className="footer-detail">
          {project.entities.length} объектов<span>·</span>Без облака
        </span>
        <button onClick={() => setHelp(!help)}>
          <Info size={14} />
          Как пользоваться
        </button>
      </footer>
      {message && (
        <div className="toast" role="alert">
          <Info size={18} />
          <p>{message}</p>
          <button aria-label="Закрыть сообщение" onClick={() => setMessage("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {help && (
        <div className="help-panel">
          <div>
            <h3>От плана к пространству</h3>
            <button aria-label="Закрыть справку" onClick={() => setHelp(false)}>
              <X size={18} />
            </button>
          </div>
          <p>
            Выберите «Площадка» или «Стена», поставьте точки на плане и нажмите
            Enter. Площадку также можно замкнуть нажатием на первую точку.
          </p>
          <p>
            В режиме «Выбрать» двигайте объекты мышью. Для изменения контура
            выберите объект, затем «Вершины». Точные значения доступны в
            свойствах.
          </p>
          <p>
            Двери и окна добавляются нажатием на стену. Лестницы поднимаются от
            заднего края к переднему; направление меняется поворотом.
          </p>
          <dl>
            <dt>Колесо</dt>
            <dd>Масштаб</dd>
            <dt>Правая кнопка</dt>
            <dd>Перемещение обзора</dd>
            <dt>R</dt>
            <dd>Размер за стороны и углы · Shift — пропорции</dd>
            <dt>Ctrl / ⌘ + Z</dt>
            <dd>Отмена</dd>
            <dt>Ctrl / ⌘ + Shift + Z</dt>
            <dd>Повтор</dd>
            <dt>Ctrl / ⌘ + D</dt>
            <dd>Копия объекта</dd>
            <dt>Ctrl / ⌘ + C / V</dt>
            <dd>Копировать / вставить объект</dd>
            <dt>Ctrl / ⌘ + S</dt>
            <dd>Сохранить файл</dd>
            <dt>F</dt>
            <dd>Вся схема</dd>
            <dt>Delete</dt>
            <dd>Удаление</dd>
          </dl>
          <p>
            Автосохранение хранится в этом браузере. Для переноса и резервной
            копии скачайте JSON кнопкой «Сохранить».
          </p>
          <button
            className="restore-example"
            onClick={() => {
              replace(initialProject());
              setHelp(false);
            }}
          >
            Открыть начальную схему сада
          </button>
        </div>
      )}
    </div>
  );
}
