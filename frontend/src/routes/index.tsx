import {
  CropIcon,
  FileExportIcon,
  GeometricShapes02Icon,
  Image01Icon,
  TextBoldIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  motion,
  useInView,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { usePostHog } from "posthog-js/react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import doodleSvgRaw from "../assets/doodle.svg?raw";
import NewCanvasDialog from "../components/new-canvas-dialog";
import { idbListDocuments } from "../lib/auxweave-editor-idb";

export const Route = createFileRoute("/")({ component: Landing });

type Sticker = {
  id: string;
  src: string;
  label: string;
  rotation: number;
  size: string;
  desktop: {
    x: number;
    y: number;
  };
  mobile: {
    x: number;
    y: number;
  };
};

const initialStickers: Sticker[] = [
  {
    id: "sunflower",
    src: "/stickers/sunflower-badge.webp",
    label: "Sunflower sticker",
    rotation: 6,
    size: "clamp(5.6rem, 10.8vw, 8.8rem)",
    desktop: { x: 74, y: 12 },
    mobile: { x: 37, y: 15 },
  },
  {
    id: "star",
    src: "/stickers/shooting-star-badge.webp",
    label: "Shooting star sticker",
    rotation: -7,
    size: "clamp(4.4rem, 8.8vw, 7.4rem)",
    desktop: { x: 9, y: 12 },
    mobile: { x: 7, y: 16 },
  },
  {
    id: "pineapple",
    src: "/stickers/pineapple.webp",
    label: "Pineapple sticker",
    rotation: 7,
    size: "clamp(5.4rem, 11.2vw, 9.1rem)",
    desktop: { x: 77, y: 70 },
    mobile: { x: 68, y: 74 },
  },
  {
    id: "donut",
    src: "/stickers/donut.webp",
    label: "Donut sticker",
    rotation: -8,
    size: "clamp(4.9rem, 9.6vw, 8rem)",
    desktop: { x: 16, y: 73 },
    mobile: { x: 8, y: 76 },
  },
  {
    id: "lollipop",
    src: "/stickers/lollipop.webp",
    label: "Lollipop sticker",
    rotation: 12,
    size: "clamp(4.1rem, 8vw, 6.5rem)",
    desktop: { x: 80, y: 45 },
    mobile: { x: 72, y: 15 },
  },
  {
    id: "leaf",
    src: "/stickers/leaf.webp",
    label: "Leaf sticker",
    rotation: -11,
    size: "clamp(4rem, 7.8vw, 6.2rem)",
    desktop: { x: 11, y: 47 },
    mobile: { x: 40, y: 77 },
  },
];

type EssentialTool = {
  name: string;
  note: string;
  icon: IconSvgElement;
  accent: string;
  accentSoft: string;
};

const essentialTools: EssentialTool[] = [
  {
    name: "Text",
    note: "Type, hierarchy, and alignment.",
    icon: TextBoldIcon,
    accent: "#ef8b74",
    accentSoft: "rgba(239, 139, 116, 0.22)",
  },
  {
    name: "Shapes",
    note: "Clean primitives for quick composition.",
    icon: GeometricShapes02Icon,
    accent: "#f0a74b",
    accentSoft: "rgba(240, 167, 75, 0.22)",
  },
  {
    name: "Images",
    note: "Drop in assets and build around them.",
    icon: Image01Icon,
    accent: "#89a36f",
    accentSoft: "rgba(137, 163, 111, 0.2)",
  },
  {
    name: "Crop",
    note: "Trim the frame without losing the energy.",
    icon: CropIcon,
    accent: "#5d9bc7",
    accentSoft: "rgba(93, 155, 199, 0.2)",
  },
  {
    name: "Export",
    note: "Push the final image out when it lands.",
    icon: FileExportIcon,
    accent: "#f17f8f",
    accentSoft: "rgba(241, 127, 143, 0.18)",
  },
];


type DragState = {
  mode: "drag" | "rotate";
  id: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startLeft: number;
  startTop: number;
  startRotation: number;
  centerX: number;
  centerY: number;
  startPointerAngle: number;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function useCompactHeroStickerLayout() {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 640px)").matches
      : false,
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return compact;
}

function Landing() {
  const navigate = Route.useNavigate();
  const [newCanvasOpen, setNewCanvasOpen] = useState(false);
  const [savedFileCount, setSavedFileCount] = useState<number | null>(null);
  const [stickers, setStickers] = useState(initialStickers);
  const [activeStickerId, setActiveStickerId] = useState<string | null>(null);
  const [activeToolIndex, setActiveToolIndex] = useState(0);
  const posthog = usePostHog();
  const stickerLayerRef = useRef<HTMLDivElement | null>(null);
  const toolsSectionRef = useRef<HTMLDivElement | null>(null);
  const vectorsSectionRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const activeToolIndexRef = useRef(0);
  const compactHeroStickerLayout = useCompactHeroStickerLayout();
  const vectorsInView = useInView(vectorsSectionRef, {
    once: true,
    amount: 0.35,
  });
  const { scrollYProgress } = useScroll({
    target: toolsSectionRef,
    offset: ["start start", "end end"],
  });
  const smoothToolsProgress = useSpring(scrollYProgress, {
    stiffness: 210,
    damping: 32,
    mass: 0.22,
  });
  const trackX = useTransform(
    smoothToolsProgress,
    [0, 1],
    ["0%", `-${((essentialTools.length - 1) * 100) / essentialTools.length}%`],
  );

  useEffect(() => {
    let cancelled = false;
    void idbListDocuments()
      .then((docs) => {
        if (!cancelled) setSavedFileCount(docs.length);
      })
      .catch(() => {
        if (!cancelled) setSavedFileCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useMotionValueEvent(smoothToolsProgress, "change", (latest) => {
    const nextIndex = Math.min(
      essentialTools.length - 1,
      Math.max(
        0,
        Math.round(latest * Math.max(essentialTools.length - 1, 1)),
      ),
    );
    const previousIndex = activeToolIndexRef.current;
    if (nextIndex === previousIndex) {
      return;
    }
    activeToolIndexRef.current = nextIndex;
    setActiveToolIndex(nextIndex);
  });

  const updateStickerPosition = useCallback((
    stickerId: string,
    clientX: number,
    clientY: number,
  ) => {
    const layer = stickerLayerRef.current;
    const dragState = dragStateRef.current;
    if (!layer || !dragState || dragState.id !== stickerId) {
      return;
    }

    if (dragState.mode === "rotate") {
      const pointerAngle = Math.atan2(
        clientY - dragState.centerY,
        clientX - dragState.centerX,
      );
      const rotation =
        dragState.startRotation +
        radiansToDegrees(pointerAngle - dragState.startPointerAngle);

      setStickers((current) =>
        current.map((sticker) =>
          sticker.id === stickerId ? { ...sticker, rotation } : sticker,
        ),
      );
      return;
    }

    const layerRect = layer.getBoundingClientRect();
    const positionKey = compactHeroStickerLayout ? "mobile" : "desktop";
    const nextLeft = clamp(
      dragState.startLeft + (clientX - dragState.startClientX),
      0,
      Math.max(layerRect.width - dragState.width, 0),
    );
    const nextTop = clamp(
      dragState.startTop + (clientY - dragState.startClientY),
      0,
      Math.max(layerRect.height - dragState.height, 0),
    );

    setStickers((current) =>
      current.map((sticker) =>
        sticker.id === stickerId
          ? {
              ...sticker,
              [positionKey]: {
                x: (nextLeft / Math.max(layerRect.width, 1)) * 100,
                y: (nextTop / Math.max(layerRect.height, 1)) * 100,
              },
            }
          : sticker,
      ),
    );
  }, [compactHeroStickerLayout]);

  const endDrag = (pointerId: number, target: EventTarget | null) => {
    if (dragStateRef.current?.pointerId !== pointerId) {
      return;
    }

    if (target instanceof HTMLElement && target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }

    dragStateRef.current = null;
    setActiveStickerId(null);
  };

  const openEditor = useCallback(() => {
    void (async () => {
      try {
        const docs = await idbListDocuments();
        setSavedFileCount(docs.length);
        const destination = docs.length > 0 ? "/files" : "/create";
        posthog.capture("editor_opened", {
          source: "landing_hero",
          destination,
          existing_file_count: docs.length,
        });
        if (docs.length > 0) {
          await navigate({ to: "/files" });
          return;
        }
      } catch (err) {
        posthog.captureException(err);
      }
      setNewCanvasOpen(true);
    })();
  }, [navigate, posthog]);

  const hasSavedFiles = (savedFileCount ?? 0) > 0;
  const primaryCtaLabel = hasSavedFiles ? "Open files" : "Open editor";
  const activeTool = essentialTools[activeToolIndex];
  const activeToolCount = String(activeToolIndex + 1).padStart(2, "0");
  const totalToolCount = String(essentialTools.length).padStart(2, "0");
  const toolsShellStyle = {
    "--tool-count": essentialTools.length,
    "--tool-accent": activeTool.accent,
    "--tool-accent-soft": activeTool.accentSoft,
    minHeight: `${essentialTools.length * 68}vh`,
  } as CSSProperties;
  const doodleMarkup = useMemo(() => {
    let pathIndex = 0;

    return doodleSvgRaw
      .replace(/<\?xml[\s\S]*?\?>\s*/g, "")
      .replace(/<svg\b([^>]*)>/, (_match, attrs) => {
        const cleanAttrs = attrs
          .replace(/\swidth="[^"]*"/g, "")
          .replace(/\sheight="[^"]*"/g, "");
        const withViewBox = /viewBox=/.test(cleanAttrs)
          ? cleanAttrs
          : `${cleanAttrs} viewBox="0 0 1000 1000"`;

        return `<svg${withViewBox}>`;
      })
      .replace(
        /<path\b([^>]*?)fill="([^"]+)"([^>]*)\/>/g,
        (_match, before, fill, after) => {
          const nextIndex = pathIndex++;

          return `<path${before}fill="${fill}"${after} pathLength="1" style="--path-index:${nextIndex}; --path-fill:${fill};" />`;
        },
      );
  }, []);

  return (
    <main className="landing-page">
      <section className="hero-page relative flex min-h-[100dvh] flex-col justify-center overflow-hidden px-5 py-16 sm:px-10 sm:py-20 lg:px-16 lg:py-24">
        <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-6 sm:px-10 lg:px-16">
          <div className="flex items-center gap-2.5">
            <span className="display-title text-2xl font-bold tracking-tight text-[var(--text)]">Auxweave</span>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-emerald-700 uppercase">W3C WebMCP</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/sponsor"
              className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] transition no-underline"
            >
              Sponsor
            </Link>
            <a
              href="https://github.com/N-lia/AuxWeave"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-black/10 bg-white/70 px-4 py-1.5 text-xs font-medium text-[var(--text)] no-underline backdrop-blur-sm hover:bg-white hover:border-black/20 transition"
            >
              GitHub ↗
            </a>
          </div>
        </header>
        <div className="hero-bg-orb hero-bg-orb-a" aria-hidden="true" />
        <div className="hero-bg-orb hero-bg-orb-b" aria-hidden="true" />
        <div className="hero-grid" aria-hidden="true" />
        <div ref={stickerLayerRef} className="hero-sticker-layer" aria-hidden="true">
          {stickers.map((sticker) => (
            (() => {
              const pos = compactHeroStickerLayout
                ? sticker.mobile
                : sticker.desktop;

              return (
                <div
                  key={sticker.id}
                  className={`hero-sticker-frame ${activeStickerId === sticker.id ? "is-active" : ""}`}
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    width: sticker.size,
                    transform: `rotate(${sticker.rotation}deg)`,
                    zIndex: activeStickerId === sticker.id ? 3 : 1,
                  }}
                  onPointerDown={(e) => {
                    const layer = stickerLayerRef.current;
                    if (!layer) {
                      return;
                    }

                    const layerRect = layer.getBoundingClientRect();
                    const stickerLeft =
                      (pos.x / 100) * Math.max(layerRect.width, 1);
                    const stickerTop =
                      (pos.y / 100) * Math.max(layerRect.height, 1);

                    dragStateRef.current = {
                      mode: "drag",
                      id: sticker.id,
                      pointerId: e.pointerId,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      startLeft: stickerLeft,
                      startTop: stickerTop,
                      startRotation: sticker.rotation,
                      centerX:
                        e.currentTarget.getBoundingClientRect().left +
                        e.currentTarget.offsetWidth / 2,
                      centerY:
                        e.currentTarget.getBoundingClientRect().top +
                        e.currentTarget.offsetHeight / 2,
                      startPointerAngle: 0,
                      width: e.currentTarget.offsetWidth,
                      height: e.currentTarget.offsetHeight,
                    };
                    setActiveStickerId(sticker.id);
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    updateStickerPosition(sticker.id, e.clientX, e.clientY);
                  }}
                  onPointerUp={(e) => {
                    endDrag(e.pointerId, e.target);
                  }}
                  onPointerCancel={(e) => {
                    endDrag(e.pointerId, e.target);
                  }}
                >
                  <span className="hero-sticker-selection" />
                  <span className="hero-sticker-handle hero-sticker-handle-nw" />
                  <span
                    className="hero-sticker-rotation-arm"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const frame = e.currentTarget.parentElement;
                      if (!frame) {
                        return;
                      }

                      const frameRect = frame.getBoundingClientRect();
                      const centerX = frameRect.left + frameRect.width / 2;
                      const centerY = frameRect.top + frameRect.height / 2;

                      dragStateRef.current = {
                        mode: "rotate",
                        id: sticker.id,
                        pointerId: e.pointerId,
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        startLeft: 0,
                        startTop: 0,
                        startRotation: sticker.rotation,
                        centerX,
                        centerY,
                        startPointerAngle: Math.atan2(
                          e.clientY - centerY,
                          e.clientX - centerX,
                        ),
                        width: frameRect.width,
                        height: frameRect.height,
                      };
                      setActiveStickerId(sticker.id);
                      frame.setPointerCapture(e.pointerId);
                    }}
                  >
                    <span className="hero-sticker-rotation-handle" />
                  </span>
                  <span className="hero-sticker-handle hero-sticker-handle-ne" />
                  <span className="hero-sticker-handle hero-sticker-handle-e" />
                  <span className="hero-sticker-handle hero-sticker-handle-se" />
                  <span className="hero-sticker-handle hero-sticker-handle-s" />
                  <span className="hero-sticker-handle hero-sticker-handle-sw" />
                  <span className="hero-sticker-handle hero-sticker-handle-w" />
                  <img
                    src={sticker.src}
                    alt={sticker.label}
                    className="hero-sticker-image"
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                </div>
              );
            })()
          ))}
        </div>
        <div className="relative z-[1] mx-auto w-full max-w-3xl">
          <div className="rise-in text-left pt-12 sm:pt-0">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-black/[0.1] bg-white/85 px-4 py-1.5 text-xs font-semibold tracking-wide uppercase text-[var(--text)] shadow-xs backdrop-blur-sm sm:text-sm">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              W3C WebMCP Standard Canvas
            </div>
            <h1 className="display-title hero-headline mb-6 font-medium text-balance text-[var(--text)] sm:mb-8 lg:mb-10">
              A web-native creative canvas,
              <br />
              where AI agents design with humans.
            </h1>
            <p className="mb-10 max-w-xl text-base leading-relaxed text-[var(--text-muted)] sm:mb-12 sm:text-lg sm:leading-relaxed lg:text-xl">
              Direct spatial manipulation meets autonomous multi-turn vector editing on a live artboard powered by W3C WebMCP.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                className="bg-black text-white inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full border-0 px-10 py-3.5 text-base font-medium shadow-lg shadow-black/10 transition-all hover:bg-neutral-800 hover:scale-[1.02] active:scale-[0.98] sm:min-h-14 sm:px-12 sm:py-4 sm:text-[1.0625rem]"
                onClick={openEditor}
              >
                {primaryCtaLabel}
              </button>
              <a
                href="https://github.com/N-lia/AuxWeave"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-black/[0.14] bg-white/85 px-8 py-3.5 text-base font-medium text-[var(--text)] no-underline backdrop-blur-sm transition-all hover:border-black/[0.25] hover:bg-white hover:scale-[1.02] active:scale-[0.98] sm:min-h-14 sm:px-10 sm:py-4 sm:text-[1.0625rem]"
              >
                GitHub
              </a>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[var(--text-muted)]">
              <span>Want to back the project?</span>
              <Link
                to="/sponsor"
                className="inline-flex items-center rounded-full border border-black/[0.1] bg-white/70 px-4 py-2 font-medium text-[var(--text)] no-underline backdrop-blur-sm hover:border-black/[0.18] hover:bg-white"
              >
                Sponsor Auxweave
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-container">
          <motion.div
            ref={toolsSectionRef}
            className="landing-tools-shell"
            style={toolsShellStyle}
          >
            <div className="landing-tools-sticky">
              <div className="landing-tools-header">
                <div className="landing-tools-headline">
                  <h2 className="display-title landing-tools-title">
                    All the essential tools.
                  </h2>
                </div>

                <div className="landing-tools-meter" aria-hidden="true">
                  <span>{activeToolCount}</span>
                  <div className="landing-tools-meter-bar">
                    <motion.span
                      className="landing-tools-meter-fill"
                      style={{ scaleX: smoothToolsProgress }}
                    />
                  </div>
                  <span>{totalToolCount}</span>
                </div>
              </div>

              <div className="landing-tools-reel-frame" aria-live="polite">
                <motion.div
                  className="landing-tools-reel-track"
                  style={{
                    width: `${essentialTools.length * 100}%`,
                    x: trackX,
                  }}
                >
                  {essentialTools.map((tool, index) => {
                    const isActive = index === activeToolIndex;

                    return (
                      <article
                        key={tool.name}
                        className={`landing-tools-panel ${isActive ? "is-active" : ""}`}
                        style={
                          {
                            "--panel-accent": tool.accent,
                          } as CSSProperties
                        }
                      >
                        <div className="landing-tools-panel-grid">
                          <div className="landing-tools-panel-copy">
                            <span className="landing-tools-panel-count">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <h3 className="display-title">{tool.name}</h3>
                            <p>{tool.note}</p>
                          </div>

                          <motion.div
                            className="landing-tools-panel-icon-wrap"
                            animate={{
                              scale: isActive ? 1 : 0.88,
                              rotate: isActive ? 0 : index % 2 === 0 ? -8 : 8,
                              y: isActive ? 0 : 20,
                              opacity: isActive ? 1 : 0.7,
                            }}
                            transition={{
                              type: "spring",
                              stiffness: 360,
                              damping: 28,
                            }}
                          >
                            <HugeiconsIcon
                              icon={tool.icon}
                              size={310}
                              strokeWidth={1.7}
                              className="landing-tools-panel-icon"
                              style={{ color: tool.accent }}
                            />
                          </motion.div>
                        </div>
                      </article>
                    );
                  })}
                </motion.div>
              </div>

              <div className="landing-tools-strip" aria-hidden="true">
                {essentialTools.map((tool, index) => (
                  <span
                    key={tool.name}
                    className={`landing-tools-strip-item ${index === activeToolIndex ? "is-active" : ""}`}
                  >
                    {tool.name}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section
        ref={vectorsSectionRef}
        className="landing-section landing-vectors-section"
      >
        <div className="landing-container">
          <div className="landing-vectors-shell">
            <div className="landing-vectors-header">
              <h2 className="display-title landing-vectors-title">
                Vectors
              </h2>
              <p className="landing-vectors-copy">
                Every curve stays sharp, editable, and clean as the drawing
                comes to life.
              </p>
            </div>

            <div
              className={`landing-vectors-stage ${vectorsInView ? "is-visible" : ""}`}
            >
              <div className="landing-vectors-paper">
                <div className="landing-vectors-paper-clip" aria-hidden="true" />
                <div
                  className="landing-vectors-doodle"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: doodleMarkup }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-container">
          <div className="relative overflow-hidden rounded-[2.4rem] border border-black/[0.08] bg-white/75 p-6 shadow-xl backdrop-blur-md sm:p-10 lg:p-14">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-black/[0.1] bg-white px-3.5 py-1 text-xs font-semibold tracking-wider uppercase text-[var(--text-subtle)]">
                <span className="inline-block h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                Web Model Context Protocol
              </div>
              <h2 className="display-title mb-4 text-3xl font-medium tracking-tight text-[var(--text)] sm:text-4xl lg:text-5xl">
                AI agents designing on your live canvas.
              </h2>
              <p className="text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
                Instead of static bitmaps or coordinate hallucinations, Auxweave exposes 17 live vector tools to agents via <code className="rounded bg-black/[0.06] px-1.5 py-0.5 font-mono text-sm text-[var(--text)]">document.modelContext</code>. Humans direct, drag, and fine-tune while AI models construct structured auto-layouts, type hierarchies, and color harmonies in real time.
              </p>
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-black/[0.06] bg-white/90 p-6 shadow-xs transition hover:shadow-md">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-mono text-sm font-bold">
                  &lt;/&gt;
                </div>
                <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">Web-Native Layout Primitives</h3>
                <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                  Flex containers, directional flow, alignment, and auto-gap solving. Agents reason with structural layout primitives instead of guessing absolute pixel coordinates.
                </p>
              </div>

              <div className="rounded-2xl border border-black/[0.06] bg-white/90 p-6 shadow-xs transition hover:shadow-md">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 font-mono text-sm font-bold">
                  MCP
                </div>
                <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">W3C WebMCP Standard</h3>
                <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                  Built on the official WebMCP browser specification. Direct integration via the Chrome DevTools WebMCP panel or the embedded multi-model AI designer panel.
                </p>
              </div>

              <div className="rounded-2xl border border-black/[0.06] bg-white/90 p-6 shadow-xs transition hover:shadow-md sm:col-span-2 lg:col-span-1">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 font-mono text-sm font-bold">
                  ⚡
                </div>
                <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">Real-Time Co-Design</h3>
                <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                  Zero export friction. Every element created by an agent is an editable vector object that humans can select, recolor, and transform instantly.
                </p>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-black/[0.08] bg-neutral-900 p-5 text-neutral-200 shadow-inner sm:p-6">
              <div className="mb-3 flex items-center justify-between text-xs text-neutral-400">
                <span className="font-mono uppercase tracking-widest text-emerald-400">Live Agent Tool Call</span>
                <span className="font-mono">document.modelContext</span>
              </div>
              <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-neutral-300 sm:text-sm">
                <code>{`document.modelContext.registerTool({
  name: "create_flex_container",
  description: "Create a flexbox auto-layout container on the artboard",
  parameters: { direction: "vertical", gap: 24, justify: "center" },
  execute: async (args) => { /* manipulates live vector canvas in real-time */ }
});`}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-last">
        <div className="landing-container">
          <div className="landing-cta-band landing-cta-band-only">
            <div>
              <h2 className="display-title landing-cta-title">
                Start making something.
              </h2>
            </div>

            <div className="landing-cta-actions">
              <button
                type="button"
                className="landing-primary-button inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full border-0 px-10 py-3.5 text-base font-medium sm:min-h-14 sm:px-12 sm:py-4 sm:text-[1.0625rem]"
                onClick={openEditor}
              >
                Open editor
              </button>
              <a
                href="https://github.com/N-lia/AuxWeave"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-black/[0.14] bg-white/72 px-8 py-3.5 text-base font-medium text-[var(--text)] no-underline backdrop-blur-sm hover:border-black/[0.22] hover:bg-white sm:min-h-14 sm:px-10 sm:py-4 sm:text-[1.0625rem]"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

      <NewCanvasDialog
        open={newCanvasOpen}
        onClose={() => setNewCanvasOpen(false)}
      />
    </main>
  );
}
