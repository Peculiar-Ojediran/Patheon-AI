"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Atom,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  Compass,
  FileText,
  FlaskConical,
  FolderOpen,
  Layers3,
  Lightbulb,
  LoaderCircle,
  Maximize2,
  Menu,
  Orbit,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Modal from "./modal";
import { EXAMPLE_HYPOTHESES, PAPERS, PAPER_DOMAINS } from "@/lib/research";
import { ORBITALS } from "@/lib/physics";
import { isValidApiKey } from "@/lib/credentials";
import {
  DEFAULT_OPENAI_MODEL,
  OPENAI_MODELS,
  isSupportedModel,
  type OpenAIModelId,
} from "@/lib/models";
import {
  STORAGE_KEY,
  readWorkspace,
  redactCredentials,
  serializeWorkspace,
  type Workspace,
} from "@/lib/workspace";
import type {
  Hypothesis,
  Note,
  OrbitalId,
  ResearchResponse,
} from "@/lib/types";

const QuantumScene = dynamic(() => import("./quantum-scene"), {
  ssr: false,
  loading: () => (
    <div className="scene-loading">
      <LoaderCircle className="spin" size={22} /> Preparing your quantum world
    </div>
  ),
});
type View = "workspace" | "hypotheses" | "library" | "notebook";
type Dialog = "research" | "assistant" | "settings" | "guide" | "search" | null;
const navItems = [
  { id: "workspace", label: "Overview", icon: Compass },
  { id: "hypotheses", label: "Hypotheses", icon: Lightbulb },
  { id: "library", label: "Research library", icon: BookOpen },
  { id: "notebook", label: "Notebook", icon: FileText },
] as const;
const subscribe = () => () => {};

function hypothesisSourceLabel(source: Hypothesis["source"]) {
  if (source === "example") return "Starter example";
  if (source === "gemini") return "Gemini generated (legacy)";
  return "ChatGPT generated";
}

function download(filename: string, body: string, mime = "text/markdown") {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function timeLabel(date: string) {
  return new Date(date).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

export default function ResearchApp() {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <MotionConfig reducedMotion="user">
      {hydrated ? (
        <WorkspaceApp />
      ) : (
        <div className="app-loading">
          <Orbit size={35} />
          <span>
            patheon<span className="brand-ai">ai</span>
          </span>
        </div>
      )}
    </MotionConfig>
  );
}

function WorkspaceApp() {
  const [view, setView] = useState<View>("workspace");
  const [workspace, setWorkspace] = useState<Workspace>(readWorkspace);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [orbital, setOrbital] = useState<OrbitalId>("3d");
  const [playing, setPlaying] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [particleCount, setParticleCount] = useState(14000);
  const [resetKey, setResetKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [toast, setToast] = useState("");
  const [status, setStatus] = useState<{
    configured: boolean;
    model: string;
    requiresUserKey: boolean;
  } | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [selectedModel, setSelectedModel] = useState<OpenAIModelId | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [chat, setChat] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [activeHypothesis, setActiveHypothesis] = useState<Hypothesis | null>(
    null,
  );
  const [hypothesisFilter, setHypothesisFilter] = useState("All hypotheses");
  const [paperFilter, setPaperFilter] = useState("All fields");
  const [paperSearch, setPaperSearch] = useState("");
  const [savedPapersOnly, setSavedPapersOnly] = useState(false);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [noteDirty, setNoteDirty] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  const requestLock = useRef(false);
  // Credentials belong only to the current mounted page, never to workspace state.
  const apiKeyRef = useRef("");
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const researchControllerRef = useRef<AbortController | null>(null);
  const hypotheses = [...workspace.hypotheses, ...EXAMPLE_HYPOTHESES];
  const meta = ORBITALS[orbital];
  const activeModel =
    selectedModel ??
    (isSupportedModel(status?.model) ? status.model : DEFAULT_OPENAI_MODEL);
  const modelDetails = OPENAI_MODELS.find((model) => model.id === activeModel)!;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/status", { signal: controller.signal, cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setStatus)
      .catch((e) => {
        if (e.name !== "AbortError") setStatusError(true);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        serializeWorkspace(workspace, apiKeyRef.current),
      );
    } catch {
      const timer = setTimeout(
        () =>
          setToast(
            "Browser storage is full or unavailable. Export your work to keep it.",
          ),
        0,
      );
      return () => clearTimeout(timer);
    }
  }, [workspace]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setDialog((d) => (d === "search" ? null : "search"));
      }
      if (e.key === "Escape") {
        setExpanded(false);
        setMobileMenu(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat, busy]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (noteDirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [noteDirty]);
  useEffect(() => {
    const forgetKey = () => {
      apiKeyRef.current = "";
      if (apiKeyInputRef.current) apiKeyInputRef.current.value = "";
      researchControllerRef.current?.abort();
      setHasApiKey(false);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) forgetKey();
    };
    window.addEventListener("pagehide", forgetKey);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", forgetKey);
      window.removeEventListener("pageshow", onPageShow);
      apiKeyRef.current = "";
      researchControllerRef.current?.abort();
    };
  }, []);

  function enableVisitKey() {
    if (
      window.location.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "[::1]", "::1"].includes(
        window.location.hostname,
      )
    ) {
      if (apiKeyInputRef.current) apiKeyInputRef.current.value = "";
      setKeyError("Open this site over HTTPS before entering an API key.");
      return;
    }
    const input = apiKeyInputRef.current;
    if (!input) return;
    if (!isValidApiKey(input.value.trim())) {
      input.value = "";
      setKeyError("Enter a valid OpenAI API key beginning with sk-.");
      return;
    }
    researchControllerRef.current?.abort();
    apiKeyRef.current = input.value.trim();
    input.value = "";
    setHasApiKey(true);
    setKeyError("");
    setError("");
    setToast(
      "Key ready for this visit. Access is checked on your next request.",
    );
  }

  function clearKey() {
    apiKeyRef.current = "";
    if (apiKeyInputRef.current) apiKeyInputRef.current.value = "";
    researchControllerRef.current?.abort();
    setHasApiKey(false);
    setKeyError("");
    setError("");
    setToast("API key cleared. Your saved research is still here.");
  }

  function navigate(next: View) {
    setView(next);
    setMobileMenu(false);
    setSearch("");
  }
  function openResearch(value = "") {
    setPrompt(value);
    setError("");
    setDialog("research");
  }
  function openAssistant(value = "") {
    setPrompt(value);
    setError("");
    setDialog("assistant");
  }
  function toggleSaved(id: string) {
    setWorkspace((w) => ({
      ...w,
      saved: w.saved.includes(id)
        ? w.saved.filter((x) => x !== id)
        : [...w.saved, id],
    }));
  }
  function saveNote(note = activeNote) {
    if (!note || !note.title.trim()) {
      setToast("Give your note a title first.");
      return;
    }
    const updated = {
      ...note,
      title: redactCredentials(note.title.trim(), apiKeyRef.current),
      body: redactCredentials(note.body, apiKeyRef.current),
      updatedAt: new Date().toISOString(),
    };
    setWorkspace((w) => ({
      ...w,
      notes: [updated, ...w.notes.filter((n) => n.id !== updated.id)],
    }));
    setActiveNote(updated);
    setNoteDirty(false);
    setToast("Note saved to this browser.");
  }
  function selectNote(note: Note | null) {
    if (noteDirty && activeNote) {
      const updated = {
        ...activeNote,
        title: redactCredentials(
          activeNote.title.trim() || "Untitled note",
          apiKeyRef.current,
        ),
        body: redactCredentials(activeNote.body, apiKeyRef.current),
        updatedAt: new Date().toISOString(),
      };
      setWorkspace((w) => ({
        ...w,
        notes: [updated, ...w.notes.filter((n) => n.id !== updated.id)],
      }));
    }
    setActiveNote(note);
    setNoteDirty(false);
  }
  function newNote() {
    selectNote({
      id: crypto.randomUUID(),
      title: "Untitled note",
      body: "",
      updatedAt: new Date().toISOString(),
    });
    navigate("notebook");
  }
  function saveObservation() {
    const note: Note = {
      id: crypto.randomUUID(),
      title: `${meta.label} orbital observation`,
      body: `Model: hydrogen ${meta.name}\nQuantum numbers: n = ${meta.n}, l = ${meta.l}, m = ${meta.m}\nParticles displayed: ${particleCount.toLocaleString()}\n\n${meta.description}\n\nThe cloud shows samples from |ψ|². Colors distinguish wavefunction sign, not electric charge. This is an idealized hydrogen model, not a measured electron trajectory.\n\nMy observations:\n`,
      updatedAt: new Date().toISOString(),
    };
    setWorkspace((w) => ({ ...w, notes: [note, ...w.notes] }));
    setToast("Orbital observation saved to your notebook.");
  }
  async function runResearch(mode: "hypothesis" | "assistant") {
    if (!prompt.trim() || requestLock.current) return;
    if (!apiKeyRef.current) {
      setError(
        "Add your OpenAI API key in Connection settings to use ChatGPT for this visit.",
      );
      return;
    }
    requestLock.current = true;
    // Keep the displayed model aligned with this request if status arrives late.
    setSelectedModel(activeModel);
    setBusy(true);
    setError("");
    const input = redactCredentials(prompt.trim(), apiKeyRef.current);
    setPrompt(input);
    const controller = new AbortController();
    researchControllerRef.current = controller;
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKeyRef.current}`,
        },
        cache: "no-store",
        credentials: "omit",
        body: JSON.stringify({
          mode,
          model: activeModel,
          prompt: input,
          orbital,
          history:
            mode === "assistant"
              ? chat.slice(-4).map((message) => ({
                  ...message,
                  content: redactCredentials(
                    message.content,
                    apiKeyRef.current,
                  ).slice(0, 3000),
                }))
              : undefined,
        }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(65000),
        ]),
      });
      const data = (await response.json()) as ResearchResponse & {
        error?: string;
        code?: string;
      };
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (
          data.code === "invalid_api_key" ||
          data.code === "api_key_required"
        ) {
          apiKeyRef.current = "";
          setHasApiKey(false);
        }
        throw new Error(
          redactCredentials(
            data.error ||
              "The request could not be completed. Please try again.",
            apiKeyRef.current,
          ),
        );
      }
      if (mode === "hypothesis" && data.hypotheses?.length) {
        setWorkspace(
          (w) =>
            JSON.parse(
              serializeWorkspace(
                { ...w, hypotheses: [...data.hypotheses!, ...w.hypotheses] },
                apiKeyRef.current,
              ),
            ) as Workspace,
        );
        setHypothesisFilter("All hypotheses");
        navigate("hypotheses");
        setDialog(null);
        setToast("New hypotheses added. Review assumptions before testing.");
      } else if (mode === "assistant" && data.message) {
        setChat((c) => [
          ...c,
          { role: "user", content: input },
          {
            role: "assistant",
            content: redactCredentials(data.message!, apiKeyRef.current),
          },
        ]);
        setPrompt("");
      } else
        throw new Error(
          "The assistant returned an empty response. Please try again.",
        );
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(
        e instanceof Error && e.name === "TimeoutError"
          ? "The request timed out. Please try again."
          : e instanceof Error
            ? redactCredentials(e.message, apiKeyRef.current)
            : "Unable to reach the research assistant.",
      );
    } finally {
      setBusy(false);
      requestLock.current = false;
      if (researchControllerRef.current === controller)
        researchControllerRef.current = null;
    }
  }

  const visibleHypotheses = hypotheses
    .filter(
      (h) => hypothesisFilter !== "Saved" || workspace.saved.includes(h.id),
    )
    .filter(
      (h) => hypothesisFilter !== "AI generated" || h.source !== "example",
    );
  const visiblePapers = PAPERS.filter(
    (p) => paperFilter === "All fields" || p.domain === paperFilter,
  )
    .filter((p) => !savedPapersOnly || workspace.papers.includes(p.id))
    .filter((p) =>
      `${p.title} ${p.authors} ${p.domain}`
        .toLowerCase()
        .includes(paperSearch.toLowerCase()),
    );
  const searchResults = [
    ...hypotheses.map((h) => ({
      id: h.id,
      title: h.title,
      type: "Hypothesis",
      run: () => {
        setActiveHypothesis(h);
        setDialog(null);
      },
    })),
    ...PAPERS.map((p) => ({
      id: p.id,
      title: p.title,
      type: "Paper",
      run: () => {
        navigate("library");
        setPaperSearch(p.title);
        setPaperFilter("All fields");
        setSavedPapersOnly(false);
        setDialog(null);
      },
    })),
    ...workspace.notes.map((n) => ({
      id: n.id,
      title: n.title,
      type: "Note",
      run: () => {
        navigate("notebook");
        selectNote(n);
        setDialog(null);
      },
    })),
  ].filter((item) => item.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <button
          className="brand"
          onClick={() => navigate("workspace")}
          aria-label="Patheon AI home"
        >
          <span className="brand-symbol">
            <Orbit size={29} strokeWidth={1.6} />
          </span>
          <span>
            patheon<span className="brand-ai">ai</span>
            <small>A SPACE FOR DISCOVERY</small>
          </span>
        </button>
        <button
          className="workspace-switch"
          onClick={() => setDialog("settings")}
        >
          <span className="workspace-avatar">P</span>
          <span>
            Personal workspace<small>Independent researcher</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <button
          className="primary-button new-research"
          onClick={() => openResearch()}
        >
          <Plus size={17} /> New research <span>NEW</span>
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""}`}
              onClick={() => navigate(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={18} strokeWidth={1.65} />
              {label}
              {id === "hypotheses" && (
                <span className="nav-count">{hypotheses.length}</span>
              )}
              {id === "notebook" && workspace.notes.length > 0 && (
                <span className="nav-count">{workspace.notes.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label collections-label">
          COLLECTIONS{" "}
          <button
            className="tiny-button"
            aria-label="Add a research note"
            onClick={newNote}
          >
            <Plus size={14} />
          </button>
        </div>
        <button
          className="collection-item"
          onClick={() => {
            navigate("library");
            setPaperFilter("All fields");
            setSavedPapersOnly(true);
            setPaperSearch("");
          }}
        >
          <span className="collection-dot mint" />
          Saved papers<span>{workspace.papers.length}</span>
        </button>
        <button
          className="collection-item"
          onClick={() => {
            navigate("hypotheses");
            setHypothesisFilter("Saved");
          }}
        >
          <span className="collection-dot lavender" />
          Saved hypotheses<span>{workspace.saved.length}</span>
        </button>
        <div className="sidebar-bottom">
          <div className="discovery-card">
            <span className="mini-orbit">
              <Sparkles size={18} />
            </span>
            <h3>Big ideas start small.</h3>
            <p>
              A question. A connection.
              <br />A little room to explore.
            </p>
            <button onClick={() => setDialog("guide")}>
              Find your starting point <ArrowUpRight size={15} />
            </button>
          </div>
          <button className="nav-item" onClick={() => setDialog("guide")}>
            <CircleHelp size={17} />
            Quick start guide
            <ArrowUpRight className="push-right" size={13} />
          </button>
          <button className="profile" onClick={() => setDialog("settings")}>
            <span className="profile-avatar">R</span>
            <span>
              Researcher<small>Personal workspace</small>
            </span>
            <Settings2 size={17} />
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb-icon">
              <FlaskConical size={16} />
            </span>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{navItems.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="search-trigger"
              onClick={() => {
                setSearch("");
                setDialog("search");
              }}
            >
              <Search size={15} />
              <span>Search anything...</span>
              <kbd>
                <Command size={10} /> K
              </kbd>
            </button>
            <span className="topbar-divider" />
            <button
              className="connection-button"
              onClick={() => setDialog("settings")}
            >
              <span className={`status-dot ${hasApiKey ? "online" : ""}`} />
              {hasApiKey ? "Key ready for this visit" : "Local workspace"}
            </button>
            <button
              className="top-avatar"
              aria-label="Workspace settings"
              onClick={() => setDialog("settings")}
            >
              R
            </button>
          </div>
        </header>

        <main className="main-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.22 }}
            >
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span />
                    {view === "workspace"
                      ? "CURIOSITY, MEET POSSIBILITY"
                      : "YOUR RESEARCH, CONNECTED"}
                  </div>
                  <h1>
                    {view === "workspace" ? (
                      <>
                        Explore the <span>unseen.</span>
                      </>
                    ) : view === "hypotheses" ? (
                      <>
                        Ideas with <span>potential.</span>
                      </>
                    ) : view === "library" ? (
                      <>
                        Build on <span>brilliant minds.</span>
                      </>
                    ) : (
                      <>
                        Leave a trail of <span>thought.</span>
                      </>
                    )}
                  </h1>
                  <p>
                    {view === "workspace"
                      ? "A little curiosity can change everything. Where will yours take you?"
                      : view === "hypotheses"
                        ? "Turn a good question into a testable next step."
                        : view === "library"
                          ? "Foundational papers. New connections. Your next starting point."
                          : "Capture observations, connect ideas, and keep your discoveries close."}
                  </p>
                </div>
                <button
                  className="secondary-button heading-action"
                  onClick={view === "notebook" ? newNote : () => openResearch()}
                >
                  {view === "notebook" ? (
                    <Plus size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {view === "notebook" ? "New note" : "Generate hypothesis"}
                  <ArrowUpRight size={15} />
                </button>
              </div>

              {view === "workspace" && (
                <>
                  <div className="workspace-grid">
                    <section
                      className={`visualizer panel ${expanded ? "visualizer-expanded" : ""}`}
                      aria-label="Interactive orbital explorer"
                    >
                      <div className="panel-heading">
                        <div className="panel-title">
                          <span className="square-icon">
                            <Orbit size={18} />
                          </span>
                          <h2>Quantum playground</h2>
                          <span className="subtle-badge">3D EXPLORER</span>
                        </div>
                        <button
                          className="icon-button"
                          aria-label={
                            expanded
                              ? "Exit expanded view"
                              : "Expand visualization"
                          }
                          onClick={() => setExpanded(!expanded)}
                        >
                          {expanded ? <X size={17} /> : <Maximize2 size={16} />}
                        </button>
                      </div>
                      <div className="scene-area">
                        <QuantumScene
                          orbital={orbital}
                          playing={playing}
                          particleCount={particleCount}
                          resetKey={resetKey}
                        />
                        <div className="scene-top">
                          <span className="scene-caption">
                            <span className="live-dot" />
                            HYDROGEN ATOM{" "}
                            <span className="scene-caption-muted">
                              / {meta.label} ORBITAL
                            </span>
                          </span>
                          <button
                            className={`icon-button scene-settings ${showControls ? "selected" : ""}`}
                            aria-label="Visualization settings"
                            aria-expanded={showControls}
                            onClick={() => setShowControls(!showControls)}
                          >
                            <SlidersHorizontal size={16} />
                          </button>
                        </div>
                        {showControls && (
                          <div className="scene-controls">
                            <label htmlFor="particle-count">
                              Point cloud detail{" "}
                              <span>{particleCount.toLocaleString()}</span>
                            </label>
                            <input
                              id="particle-count"
                              type="range"
                              min="4000"
                              max="24000"
                              step="2000"
                              value={particleCount}
                              onChange={(e) =>
                                setParticleCount(Number(e.target.value))
                              }
                            />
                            <p>More samples reveal finer detail.</p>
                          </div>
                        )}
                        <div className="scene-coordinates">
                          <span>
                            n <b>{meta.n}</b>
                          </span>
                          <span>
                            ℓ <b>{meta.l}</b>
                          </span>
                          <span>
                            m <b>{meta.m}</b>
                          </span>
                        </div>
                        <div className="scene-equation">
                          {orbital === "3d"
                            ? "ψ₃₂₀"
                            : orbital === "2p"
                              ? "ψ₂₁₀"
                              : "ψ₁₀₀"}
                          <span>PROBABILITY DENSITY · |ψ|²</span>
                        </div>
                        <div className="scene-bottom">
                          <span className="drag-hint">
                            <span className="mouse-icon" />
                            Drag to rotate · Scroll to zoom
                          </span>
                          <div className="scene-tools">
                            <button
                              aria-label={
                                playing ? "Pause rotation" : "Play rotation"
                              }
                              onClick={() => setPlaying(!playing)}
                            >
                              {playing ? (
                                <Pause size={15} />
                              ) : (
                                <Play size={15} />
                              )}
                            </button>
                            <button
                              aria-label="Reset camera"
                              onClick={() => setResetKey((k) => k + 1)}
                            >
                              <RotateCcw size={15} />
                            </button>
                            <span />
                            <button
                              aria-label="Save orbital observation"
                              onClick={saveObservation}
                            >
                              <ArrowDownToLine size={15} />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="orbital-footer">
                        <div
                          className="orbital-selector"
                          role="group"
                          aria-label="Choose atomic orbital"
                        >
                          {(["1s", "2p", "3d"] as OrbitalId[]).map((id) => (
                            <button
                              key={id}
                              aria-pressed={orbital === id}
                              className={orbital === id ? "selected" : ""}
                              onClick={() => setOrbital(id)}
                            >
                              {id}
                              <span>
                                {id === "1s"
                                  ? "Spherical"
                                  : id === "2p"
                                    ? "Dumbbell"
                                    : "Axial + ring"}
                              </span>
                            </button>
                          ))}
                        </div>
                        <span className="phase-legend">
                          <i /> +ψ <i /> −ψ
                        </span>
                      </div>
                    </section>
                    <aside className="copilot-panel panel">
                      <div className="copilot-topline">
                        <span className="copilot-badge">
                          <Sparkles size={13} /> YOUR RESEARCH COPILOT
                        </span>
                        <span className="beta-badge">BETA</span>
                      </div>
                      <div className="copilot-art" aria-hidden="true">
                        <div className="art-orbit orbit-one" />
                        <div className="art-orbit orbit-two" />
                        <div className="art-orbit orbit-three" />
                        <div className="art-core">
                          <Sparkles size={26} strokeWidth={1.2} />
                        </div>
                        <span className="art-star star-one">+</span>
                        <span className="art-star star-two">+</span>
                        <span className="art-point" />
                      </div>
                      <h2>
                        What if
                        <br />
                        <span>became what’s next?</span>
                      </h2>
                      <p>
                        Connect the dots, question the familiar, and turn your
                        curiosity into a research direction.
                      </p>
                      <button
                        className="primary-button copilot-cta"
                        onClick={() => openResearch()}
                      >
                        <Sparkles size={16} />
                        Let’s explore an idea
                        <ArrowRight size={17} />
                      </button>
                      <div className="copilot-divider">
                        <span>OR START WITH A QUESTION</span>
                      </div>
                      <button
                        className="suggested-question"
                        onClick={() =>
                          openAssistant(
                            "Why do atomic orbitals have different shapes? Explain using the selected orbital and suggest an observation to make.",
                          )
                        }
                      >
                        Why do orbitals have different shapes?
                        <ArrowUpRight size={14} />
                      </button>
                      <button
                        className="suggested-question"
                        onClick={() =>
                          openResearch(
                            "How might a weak external electric field change the energy and symmetry of hydrogen atomic orbitals? Propose testable computational experiments.",
                          )
                        }
                      >
                        What happens in an electric field?
                        <ArrowUpRight size={14} />
                      </button>
                      <div className="copilot-status">
                        <span
                          className={`status-dot ${hasApiKey ? "online" : ""}`}
                        />
                        {hasApiKey
                          ? "ChatGPT key ready for this visit"
                          : "Connect ChatGPT to explore with AI"}
                      </div>
                    </aside>
                  </div>
                  <div className="model-insight">
                    <span className="insight-icon">
                      <Atom size={17} />
                    </span>
                    <p>
                      <strong>A cloud of possibilities.</strong> Each point
                      samples where an electron could be found. Colors show the
                      sign of ψ, not electric charge.
                    </p>
                    <button onClick={() => setDialog("guide")}>
                      Meet the model
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <div className="section-heading">
                    <div>
                      <h2>
                        A spark for your next study{" "}
                        <span className="count-badge">{hypotheses.length}</span>
                      </h2>
                      <p>Start with a question worth asking.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("hypotheses")}
                    >
                      All hypotheses
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="hypothesis-grid">
                    {hypotheses.slice(0, 3).map((h, i) => (
                      <HypothesisCard
                        key={h.id}
                        hypothesis={h}
                        index={i}
                        saved={workspace.saved.includes(h.id)}
                        onSave={() => toggleSaved(h.id)}
                        onOpen={() => setActiveHypothesis(h)}
                      />
                    ))}
                  </div>
                  <div className="workspace-footer">
                    <span>
                      <span className="status-dot online" />A space for
                      questions. A starting point for discovery.
                    </span>
                    <span>
                      Built for curious minds <Orbit size={13} />
                    </span>
                  </div>
                </>
              )}

              {view === "hypotheses" && (
                <>
                  <div className="view-toolbar">
                    <div className="tabs">
                      {["All hypotheses", "Saved", "AI generated"].map(
                        (tab) => (
                          <button
                            key={tab}
                            className={hypothesisFilter === tab ? "active" : ""}
                            onClick={() => setHypothesisFilter(tab)}
                          >
                            {tab}
                            {tab === "All hypotheses" && (
                              <span>{hypotheses.length}</span>
                            )}
                          </button>
                        ),
                      )}
                    </div>
                    <span className="muted small">
                      Proposals to investigate · not validated findings
                    </span>
                  </div>
                  {visibleHypotheses.length ? (
                    <div className="hypothesis-grid hypothesis-full">
                      {visibleHypotheses.map((h, i) => (
                        <HypothesisCard
                          key={h.id}
                          hypothesis={h}
                          index={i}
                          saved={workspace.saved.includes(h.id)}
                          onSave={() => toggleSaved(h.id)}
                          onOpen={() => setActiveHypothesis(h)}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Lightbulb size={28} />}
                      title={
                        hypothesisFilter === "Saved"
                          ? "Keep a promising idea close."
                          : "Your next hypothesis starts here."
                      }
                      description={
                        hypothesisFilter === "Saved"
                          ? "Bookmark a hypothesis to collect it in this space."
                          : "Describe a physics question and let ChatGPT help shape a testable proposal."
                      }
                      action={() =>
                        hypothesisFilter === "Saved"
                          ? setHypothesisFilter("All hypotheses")
                          : openResearch()
                      }
                      actionLabel={
                        hypothesisFilter === "Saved"
                          ? "Explore hypotheses"
                          : "Generate a hypothesis"
                      }
                    />
                  )}
                </>
              )}

              {view === "library" && (
                <>
                  <div className="library-banner">
                    <div className="library-banner-icon">
                      <BookOpen size={28} strokeWidth={1.3} />
                    </div>
                    <div>
                      <span className="eyebrow">
                        THE IDEAS THAT MOVED PHYSICS FORWARD
                      </span>
                      <h2>Every discovery is part of a conversation.</h2>
                      <p>
                        A curated reading collection, linked directly to
                        original publications.
                      </p>
                    </div>
                    <span className="library-banner-mark" aria-hidden="true">
                      ψ
                    </span>
                  </div>
                  <div className="view-toolbar library-toolbar">
                    <label className="field-search">
                      <Search size={16} />
                      <input
                        aria-label="Search papers"
                        placeholder="Search papers, authors, or topics..."
                        value={paperSearch}
                        onChange={(e) => setPaperSearch(e.target.value)}
                      />
                    </label>
                    <div className="filter-group">
                      <select
                        aria-label="Filter paper field"
                        value={paperFilter}
                        onChange={(e) => setPaperFilter(e.target.value)}
                      >
                        <option>All fields</option>
                        {PAPER_DOMAINS.filter((d) => d !== "All fields").map(
                          (d) => (
                            <option key={d}>{d}</option>
                          ),
                        )}
                      </select>
                      <button
                        className={`secondary-button ${savedPapersOnly ? "selected" : ""}`}
                        onClick={() => setSavedPapersOnly(!savedPapersOnly)}
                      >
                        <Bookmark size={15} />
                        {savedPapersOnly ? "Saved papers" : "All papers"}
                      </button>
                    </div>
                  </div>
                  <div className="paper-list">
                    {visiblePapers.map((p, i) => (
                      <article className="paper-card panel" key={p.id}>
                        <div className={`paper-icon color-${i % 3}`}>
                          <FileText size={24} strokeWidth={1.4} />
                        </div>
                        <div className="paper-content">
                          <div className="paper-meta">
                            <span className="domain-tag">{p.domain}</span>
                            <span>{p.year}</span>
                            <span>·</span>
                            <span>{p.journal}</span>
                          </div>
                          <h2>
                            <a href={p.url} target="_blank" rel="noreferrer">
                              {p.title}
                              <ArrowUpRight size={16} />
                            </a>
                          </h2>
                          <p className="paper-authors">{p.authors}</p>
                          <p>{p.description}</p>
                        </div>
                        <button
                          className={`icon-button bookmark-button ${workspace.papers.includes(p.id) ? "saved" : ""}`}
                          aria-label={`${workspace.papers.includes(p.id) ? "Unsave" : "Save"} paper: ${p.title}`}
                          onClick={() =>
                            setWorkspace((w) => ({
                              ...w,
                              papers: w.papers.includes(p.id)
                                ? w.papers.filter((id) => id !== p.id)
                                : [...w.papers, p.id],
                            }))
                          }
                        >
                          <Bookmark
                            size={18}
                            fill={
                              workspace.papers.includes(p.id)
                                ? "currentColor"
                                : "none"
                            }
                          />
                        </button>
                      </article>
                    ))}
                  </div>
                  {!visiblePapers.length && (
                    <EmptyState
                      icon={<Search size={28} />}
                      title="No papers in this view."
                      description="Try another search or field, or explore the full collection."
                      action={() => {
                        setPaperSearch("");
                        setPaperFilter("All fields");
                        setSavedPapersOnly(false);
                      }}
                      actionLabel="Show all papers"
                    />
                  )}
                </>
              )}

              {view === "notebook" && (
                <div className="notebook-layout">
                  <section className="notes-sidebar panel">
                    <div className="panel-heading">
                      <h2>
                        Your notes{" "}
                        <span className="count-badge">
                          {workspace.notes.length}
                        </span>
                      </h2>
                      <button
                        className="icon-button"
                        aria-label="Create a note"
                        onClick={newNote}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    {workspace.notes.length ? (
                      workspace.notes.map((n) => (
                        <button
                          className={`note-list-item ${activeNote?.id === n.id ? "active" : ""}`}
                          key={n.id}
                          onClick={() => selectNote(n)}
                        >
                          <FileText size={16} />
                          <span>
                            <strong>{n.title}</strong>
                            <small>
                              {timeLabel(n.updatedAt)} ·{" "}
                              {n.body.length
                                ? n.body.slice(0, 45)
                                : "An idea waiting to happen"}
                            </small>
                          </span>
                          <ChevronRight size={13} />
                        </button>
                      ))
                    ) : (
                      <div className="notes-empty">
                        <FolderOpen size={30} />
                        <p>A fresh page for your ideas.</p>
                        <button className="text-button" onClick={newNote}>
                          Write your first note <Plus size={14} />
                        </button>
                      </div>
                    )}
                    <div className="local-storage-note">
                      Notes are saved in this browser.
                      <br />
                      Export a copy to keep them with you.
                    </div>
                  </section>
                  <section className="note-editor panel">
                    {activeNote ? (
                      <>
                        <div className="note-toolbar">
                          <span className="muted small">
                            {noteDirty
                              ? "Unsaved changes"
                              : workspace.notes.some(
                                    (n) => n.id === activeNote.id,
                                  )
                                ? "Saved in this browser"
                                : "New note"}
                          </span>
                          <div>
                            <button
                              className="icon-button"
                              aria-label="Export note as Markdown"
                              onClick={() =>
                                download(
                                  `${redactCredentials(activeNote.title, apiKeyRef.current).replace(/[^a-z0-9]+/gi, "-") || "note"}.md`,
                                  redactCredentials(
                                    `# ${activeNote.title}\n\n${activeNote.body}`,
                                    apiKeyRef.current,
                                  ),
                                )
                              }
                            >
                              <ArrowDownToLine size={16} />
                            </button>
                            <button
                              className="icon-button delete-button"
                              aria-label="Delete current note"
                              onClick={() => {
                                setWorkspace((w) => ({
                                  ...w,
                                  notes: w.notes.filter(
                                    (n) => n.id !== activeNote.id,
                                  ),
                                }));
                                setActiveNote(null);
                                setNoteDirty(false);
                                setToast("Note deleted from this browser.");
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                            <button
                              className="primary-button compact"
                              onClick={() => saveNote()}
                            >
                              <Check size={15} />
                              Save note
                            </button>
                          </div>
                        </div>
                        <input
                          className="note-title"
                          aria-label="Note title"
                          placeholder="Give your idea a name"
                          maxLength={160}
                          value={activeNote.title}
                          onChange={(e) => {
                            setActiveNote({
                              ...activeNote,
                              title: e.target.value,
                            });
                            setNoteDirty(true);
                          }}
                        />
                        <textarea
                          className="note-body"
                          aria-label="Note content"
                          placeholder="A question, an observation, a connection...\n\nStart anywhere. This is your space to think."
                          maxLength={100000}
                          value={activeNote.body}
                          onChange={(e) => {
                            setActiveNote({
                              ...activeNote,
                              body: e.target.value,
                            });
                            setNoteDirty(true);
                          }}
                        />
                        <div className="editor-footer">
                          <span>Plain text · Markdown welcome</span>
                          <span>
                            {activeNote.body.trim()
                              ? activeNote.body.trim().split(/\s+/).length
                              : 0}{" "}
                            words
                          </span>
                        </div>
                      </>
                    ) : (
                      <EmptyState
                        icon={<FileText size={32} />}
                        title="Give your thoughts a home."
                        description="Choose a note or start a new one. You can also save an observation straight from the orbital explorer."
                        action={newNote}
                        actionLabel="Create a note"
                      />
                    )}
                  </section>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <Check size={17} />
            {toast}
            <button
              aria-label="Dismiss notification"
              onClick={() => setToast("")}
            >
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {dialog === "research" && (
        <Modal
          title="Make your next connection."
          onClose={() => setDialog(null)}
        >
          <div className="dialog-intro">
            <span className="dialog-art-icon">
              <Sparkles size={25} />
            </span>
            <p>
              Start with a physics question. Your research copilot will propose
              hypotheses, explain the reasoning, and suggest ways to test them.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runResearch("hypothesis");
            }}
          >
            <label className="input-label" htmlFor="research-prompt">
              What are you curious about?
            </label>
            <textarea
              id="research-prompt"
              className="prompt-input"
              placeholder="e.g. How does an external electric field affect the symmetry of a hydrogen atom’s orbitals?"
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              minLength={10}
              maxLength={4000}
              required
            />
            <div className="prompt-context">
              <Atom size={14} />
              Context: hydrogen {meta.label} orbital
              <span>{prompt.length}/4,000</span>
            </div>
            <div className="research-model-context">
              <span>AI model: {modelDetails.label}</span>
              <button
                type="button"
                className="text-button"
                onClick={() => setDialog("settings")}
                disabled={busy}
              >
                Change model
              </button>
            </div>
            <div className="prompt-chips">
              <button
                type="button"
                onClick={() =>
                  setPrompt(
                    "How can the radial probability distribution of hydrogen orbitals be used to test numerical sampling methods?",
                  )
                }
              >
                Orbital probability
              </button>
              <button
                type="button"
                onClick={() =>
                  setPrompt(
                    "How does a weak electric field perturb the energy and symmetry of hydrogen atomic orbitals?",
                  )
                }
              >
                Stark effect
              </button>
              <button
                type="button"
                onClick={() =>
                  setPrompt(
                    "How do quantum selection rules predict which transitions between hydrogen atomic orbitals are allowed?",
                  )
                }
              >
                Quantum transitions
              </button>
            </div>
            {!hasApiKey && (
              <div className="configuration-notice">
                <Sparkles size={17} />
                <div>
                  <strong>
                    {statusError
                      ? "Connection status unavailable"
                      : "Connect ChatGPT to generate new ideas"}
                  </strong>
                  <p>
                    Add your API key for this visit to enable live research.
                    Your key is never saved with your work.
                  </p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setDialog("settings")}
                  >
                    Connection settings
                    <ArrowUpRight size={13} />
                  </button>
                </div>
              </div>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-footer">
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setHypothesisFilter("All hypotheses");
                  navigate("hypotheses");
                  setDialog(null);
                }}
              >
                Explore examples
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={busy || prompt.trim().length < 10}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                {busy ? "Exploring possibilities..." : "Generate hypotheses"}
              </button>
            </div>
          </form>
          <p className="fine-print">
            AI proposals are starting points for investigation. Check claims,
            assumptions, and feasibility.
          </p>
        </Modal>
      )}

      {dialog === "assistant" && (
        <Modal
          title="Think it through, together."
          onClose={() => setDialog(null)}
        >
          <div className="assistant-context">
            <span className="copilot-badge">
              <Sparkles size={13} /> RESEARCH COPILOT
            </span>
            <span>{meta.label} orbital context</span>
          </div>
          <div className="research-model-context">
            <span>AI model: {modelDetails.label}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => setDialog("settings")}
              disabled={busy}
            >
              Change model
            </button>
          </div>
          <div className="chat-messages" aria-live="polite">
            {!chat.length && (
              <div className="chat-welcome">
                <Orbit size={40} strokeWidth={1} />
                <h3>A second perspective on your next question.</h3>
                <p>
                  Explore the physics behind the model, unpack an equation, or
                  plan an experiment.
                  {!hasApiKey &&
                    " Connect ChatGPT in workspace settings to start a conversation."}
                </p>
              </div>
            )}
            {chat.map((message, i) => (
              <div key={i} className={`chat-message ${message.role}`}>
                <span>
                  {message.role === "user" ? "YOU" : "PATHEON · CHATGPT"}
                </span>
                <p>{message.content}</p>
              </div>
            ))}
            {busy && (
              <div className="chat-thinking">
                <LoaderCircle className="spin" size={15} />
                Connecting the dots...
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              void runResearch("assistant");
            }}
          >
            <textarea
              aria-label="Message the research assistant"
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask a physics question..."
              minLength={10}
              maxLength={4000}
              required
            />
            <button
              className="primary-button"
              disabled={busy || prompt.trim().length < 10}
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </form>
          <div className="chat-footer">
            <span>
              AI responses may contain errors. Verify scientific claims.
            </span>
            <button
              className="text-button"
              onClick={() => setDialog("settings")}
            >
              Connection settings
            </button>
          </div>
        </Modal>
      )}

      {dialog === "settings" && (
        <Modal title="Your space. Your setup." onClose={() => setDialog(null)}>
          <div className="settings-section">
            <h3>
              <Sparkles size={18} /> Research copilot
            </h3>
            <div className="connection-status">
              <span className={`status-dot ${hasApiKey ? "online" : ""}`} />
              <strong>
                {hasApiKey
                  ? "Key ready for this visit"
                  : "Add your key to use ChatGPT"}
              </strong>
            </div>
            <p>
              Your key stays in this page’s memory and is sent to our server
              only to authorize your OpenAI request. It is never saved. Clear it
              here or reload or leave the page to remove it.
            </p>
            <div className="model-picker">
              <label className="input-label" htmlFor="openai-model">
                AI model
              </label>
              <select
                id="openai-model"
                className="model-select"
                value={activeModel}
                disabled={busy}
                aria-describedby="ai-model-description ai-model-visit"
                onChange={(event) => {
                  if (isSupportedModel(event.target.value)) {
                    setSelectedModel(event.target.value);
                  }
                }}
              >
                {OPENAI_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
              <p id="ai-model-description">{modelDetails.description}</p>
              <p id="ai-model-visit" className="small muted">
                Used for hypotheses and chat during this visit. Available models
                and usage charges depend on your OpenAI account. Reloading resets
                your selection to the server default.
              </p>
            </div>
            <form
              className="api-key-form"
              autoComplete="off"
              onSubmit={(event) => {
                event.preventDefault();
                enableVisitKey();
              }}
            >
              <label className="input-label" htmlFor="openai-api-key">
                OpenAI API key
              </label>
              <input
                ref={apiKeyInputRef}
                id="openai-api-key"
                className="api-key-input"
                type="password"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                placeholder={hasApiKey ? "Enter a replacement key" : "sk-…"}
                maxLength={512}
                aria-describedby="api-key-privacy"
                aria-invalid={Boolean(keyError)}
              />
              <p id="api-key-privacy" className="small muted">
                The field clears when you use the key. Provider access is
                checked when you send a research request.
              </p>
              {keyError && (
                <p className="form-error" role="alert">
                  {keyError}
                </p>
              )}
              <div className="api-key-actions">
                <button className="primary-button" type="submit">
                  <Sparkles size={16} /> Use for this visit
                </button>
                {hasApiKey && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={clearKey}
                  >
                    <X size={16} /> Clear key
                  </button>
                )}
              </div>
            </form>
            <p className="small muted">
              Create a key in{" "}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
              >
                OpenAI Platform <ArrowUpRight size={12} />
              </a>
              . OpenAI API billing is separate from a ChatGPT subscription.
              {statusError &&
                " The server default is unavailable; your selected model will be used."}
            </p>
          </div>
          <div className="settings-section">
            <h3>
              <FolderOpen size={18} /> Your research data
            </h3>
            <p>
              Notes, bookmarks, and generated hypotheses are stored locally in
              this browser. No account is required. Export your workspace before
              clearing browser data or switching devices.
            </p>
            <button
              className="secondary-button"
              onClick={() => {
                download(
                  "patheon-workspace.json",
                  serializeWorkspace(workspace, apiKeyRef.current),
                  "application/json",
                );
                setToast("Workspace exported.");
              }}
            >
              <ArrowDownToLine size={16} />
              Export workspace
            </button>
          </div>
          <div className="settings-section">
            <h3>
              <Atom size={18} /> About this workspace
            </h3>
            <p>
              Patheon AI is a personal physics research workbench. Its orbital
              explorer uses an idealized, nonrelativistic hydrogen model.
              Example hypotheses are written starting points, not experimental
              findings.
            </p>
          </div>
        </Modal>
      )}

      {dialog === "guide" && (
        <Modal title="Follow your curiosity." onClose={() => setDialog(null)}>
          <p className="modal-description">
            Three small steps toward your next big idea.
          </p>
          <div className="guide-step">
            <span>01</span>
            <div>
              <h3>See the physics.</h3>
              <p>
                Choose 1s, 2p, or 3d to explore hydrogen orbitals. Drag the
                cloud to rotate; scroll to zoom. The points sample |ψ|², and the
                two colors represent positive and negative wavefunction sign.
              </p>
            </div>
          </div>
          <div className="guide-step">
            <span>02</span>
            <div>
              <h3>Ask a better question.</h3>
              <p>
                Open a starter hypothesis to see its rationale, a proposed
                method, and limitations. Connect ChatGPT to investigate your own
                questions. All AI-generated hypotheses require independent
                verification.
              </p>
            </div>
          </div>
          <div className="guide-step">
            <span>03</span>
            <div>
              <h3>Keep the useful connections.</h3>
              <p>
                Bookmark promising hypotheses and papers, or save orbital
                observations to your notebook. Your work stays in this browser;
                export notes or your workspace for a portable copy.
              </p>
            </div>
          </div>
          <div className="model-note">
            <strong>About the visualization</strong>
            <p>
              Stationary 1s, 2p<sub>z</sub>, and 3d<sub>z²</sub> hydrogen
              states, with no external field or electron interactions. Cloud
              rotation changes the camera view; it does not depict electron
              motion. Distances use the Bohr radius a₀. Clouds are framed
              independently and omit a small probability tail.
            </p>
            <a
              href="https://openstax.org/books/university-physics-volume-3/pages/8-1-the-hydrogen-atom"
              target="_blank"
              rel="noreferrer"
            >
              Read about the hydrogen model
              <ArrowUpRight size={13} />
            </a>
          </div>
          <button
            className="primary-button full-width"
            onClick={() => {
              navigate("workspace");
              setDialog(null);
            }}
          >
            Enter the playground
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}

      {dialog === "search" && (
        <Modal title="Find a connection." onClose={() => setDialog(null)}>
          <label className="global-search">
            <Search size={20} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search hypotheses, papers, and notes..."
              aria-label="Search workspace"
            />
          </label>
          <div className="search-results">
            {searchResults.slice(0, 12).map((item) => (
              <button key={item.id} onClick={item.run}>
                <span>
                  {item.type === "Paper" ? (
                    <BookOpen size={17} />
                  ) : item.type === "Note" ? (
                    <FileText size={17} />
                  ) : (
                    <Lightbulb size={17} />
                  )}
                </span>
                <div>
                  <small>{item.type}</small>
                  <strong>{item.title}</strong>
                </div>
                <ArrowUpRight size={15} />
              </button>
            ))}
            {!searchResults.length && (
              <p className="search-empty">
                No matches yet. Try “hydrogen”, “quantum”, or a note title.
              </p>
            )}
          </div>
        </Modal>
      )}

      {activeHypothesis && (
        <Modal
          title="A closer look at the idea."
          onClose={() => setActiveHypothesis(null)}
          wide
        >
          <div className="detail-tags">
            <span className="domain-tag">{activeHypothesis.domain}</span>
            <span className="example-tag">
              {hypothesisSourceLabel(activeHypothesis.source)} · unvalidated
            </span>
          </div>
          <h2 className="hypothesis-detail-title">{activeHypothesis.title}</h2>
          <p className="detail-summary">{activeHypothesis.summary}</p>
          <div className="detail-section">
            <h3>
              <Lightbulb size={17} />
              The reasoning
            </h3>
            <p>{activeHypothesis.rationale}</p>
          </div>
          <div className="detail-section">
            <h3>
              <FlaskConical size={17} />A way to test it
            </h3>
            <ol>
              {activeHypothesis.methodology.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
          <div className="model-note">
            <strong>Keep in mind</strong>
            <p>{activeHypothesis.limitations}</p>
          </div>
          <div className="modal-footer">
            <button
              className="secondary-button"
              onClick={() => {
                const h = activeHypothesis;
                const n: Note = {
                  id: crypto.randomUUID(),
                  title: h.title,
                  body: `${h.summary}\n\n## Rationale\n${h.rationale}\n\n## Method\n${h.methodology.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n## Limitations\n${h.limitations}\n\nSource: ${hypothesisSourceLabel(h.source)}; unvalidated research proposal.\n\n## My observations\n`,
                  updatedAt: new Date().toISOString(),
                };
                setWorkspace((w) => ({ ...w, notes: [n, ...w.notes] }));
                setToast("Research plan added to your notebook.");
              }}
            >
              <FileText size={15} />
              Add to notebook
            </button>
            <button
              className="primary-button"
              onClick={() => toggleSaved(activeHypothesis.id)}
            >
              <Bookmark
                size={15}
                fill={
                  workspace.saved.includes(activeHypothesis.id)
                    ? "currentColor"
                    : "none"
                }
              />
              {workspace.saved.includes(activeHypothesis.id)
                ? "Saved hypothesis"
                : "Save hypothesis"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function HypothesisCard({
  hypothesis: h,
  index,
  saved,
  onSave,
  onOpen,
}: {
  hypothesis: Hypothesis;
  index: number;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
}) {
  const Icon = [Atom, Layers3, Orbit][index % 3];
  return (
    <article className={`hypothesis-card panel color-${index % 3}`}>
      <div className="hypothesis-card-top">
        <span className="hypothesis-icon">
          <Icon size={21} strokeWidth={1.5} />
        </span>
        <span className="domain-tag">{h.domain}</span>
        <button
          className={`icon-button bookmark-button ${saved ? "saved" : ""}`}
          aria-label={`${saved ? "Unsave" : "Save"} hypothesis: ${h.title}`}
          onClick={onSave}
        >
          <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <button className="hypothesis-card-body" onClick={onOpen}>
        <h3>{h.title}</h3>
        <p>{h.summary}</p>
      </button>
      <div className="hypothesis-card-footer">
        <span>
          <span className="small-dot" />
          {h.source === "example"
            ? "Starter hypothesis"
            : hypothesisSourceLabel(h.source)}
        </span>
        <button
          className="tiny-button"
          aria-label={`Explore hypothesis: ${h.title}`}
          onClick={onOpen}
        >
          <ArrowUpRight size={17} />
        </button>
      </div>
    </article>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
  actionLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: () => void;
  actionLabel: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      <button className="secondary-button" onClick={action}>
        {actionLabel}
        <ArrowRight size={15} />
      </button>
    </div>
  );
}
