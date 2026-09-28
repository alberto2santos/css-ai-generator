"use client";

import {
  FormEvent,
  KeyboardEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Check,
  Clipboard,
  Code2,
  Download,
  History as HistoryIcon,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  Wand2,
  Zap,
} from "lucide-react";
import { SiteFooter } from "./components/site-footer";
import {
  MAX_HISTORY_ITEMS,
  type SavedGeneration,
  getHistorySnapshot,
  getServerHistorySnapshot,
  parseHistorySnapshot,
  saveHistory,
  subscribeToHistory,
} from "./lib/history";

type PreviewBackground = "dark" | "light" | "checkerboard";

const PREVIEW_BACKGROUNDS = {
  dark: {
    label: "Escuro",
    background: "#09090b",
    foreground: "#f4f4f5",
    grid: "255, 255, 255",
  },
  light: {
    label: "Claro",
    background: "#f4f4f5",
    foreground: "#18181b",
    grid: "0, 0, 0",
  },
  checkerboard: {
    label: "Quadriculado",
    background:
      "conic-gradient(#d4d4d8 25%, #f4f4f5 0 50%, #d4d4d8 0 75%, #f4f4f5 0) 0 0 / 24px 24px",
    foreground: "#18181b",
    grid: "0, 0, 0",
  },
} satisfies Record<
  PreviewBackground,
  { label: string; background: string; foreground: string; grid: string }
>;

const EXAMPLE_PROMPTS = [
  "Uma bola vermelha quicando",
  "Um botão neon pulsando",
  "Uma nuvem flutuando suavemente",
  "Um cubo 3D girando",
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [generatedCss, setGeneratedCss] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const historySnapshot = useSyncExternalStore(
    subscribeToHistory,
    getHistorySnapshot,
    getServerHistorySnapshot
  );
  const history = useMemo(
    () => parseHistorySnapshot(historySnapshot),
    [historySnapshot]
  );
  const [previewBackground, setPreviewBackground] =
    useState<PreviewBackground>("dark");
  const [previewPaused, setPreviewPaused] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanPrompt = prompt.trim();

    if (!cleanPrompt) {
      setError("Escreva uma ideia ou uma alteração para continuar.");
      return;
    }

    setLoading(true);
    setError("");
    setCopied(false);

    try {
      const response = await fetch("/generate", {
        method: "POST",
        signal: AbortSignal.timeout(60000),
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: cleanPrompt,
          css: generatedCss || undefined,
        }),
      });

      const responseBody = await response.text();
      let data: { css?: unknown; error?: unknown } = {};

      if (responseBody) {
        try {
          data = JSON.parse(responseBody) as { css?: unknown; error?: unknown };
        } catch {
          throw new Error(
            `O servidor retornou uma resposta inesperada (${response.status}).`
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : `Não foi possível gerar o CSS (${response.status}).`
        );
      }

      if (typeof data.css !== "string" || !data.css.trim()) {
        throw new Error("A resposta não contém CSS válido. Tente novamente.");
      }

      const nextCss = data.css.trim();
      const savedGeneration: SavedGeneration = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        prompt: cleanPrompt,
        css: nextCss,
        createdAt: Date.now(),
      };

      setGeneratedCss(nextCss);
      saveHistory(
        [savedGeneration, ...history.filter((item) => item.css !== nextCss)].slice(
          0,
          MAX_HISTORY_ITEMS
        )
      );
      setPreviewPaused(false);
    } catch (err) {
      const message =
        err instanceof Error && err.name === "TimeoutError"
          ? "A geração demorou demais. Tente novamente."
          : err instanceof TypeError
            ? "Não foi possível conectar ao servidor. Confira se o Next.js está rodando."
            : err instanceof Error
              ? err.message
              : "Ocorreu um erro inesperado.";

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!generatedCss) return;

    try {
      await navigator.clipboard.writeText(generatedCss);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setError("Não foi possível copiar o código.");
    }
  }

  function handleDownload() {
    if (!generatedCss) return;

    const blob = new Blob([generatedCss], {
      type: "text/css;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "estilo-gerado.css";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleRestoreGeneration(item: SavedGeneration) {
    setGeneratedCss(item.css);
    setPrompt(item.prompt);
    setError("");
    setCopied(false);
    setPreviewPaused(false);
    setPreviewKey((key) => key + 1);
  }

  function handleStartNewDesign() {
    setGeneratedCss("");
    setPrompt("");
    setError("");
    setCopied(false);
    setPreviewPaused(false);
  }

  function updatePreviewPlayback(paused: boolean) {
    const pauseStyle = previewFrameRef.current?.contentDocument?.getElementById(
      "preview-pause-style"
    );

    if (pauseStyle) {
      pauseStyle.textContent = paused
        ? "*, *::before, *::after { animation-play-state: paused !important; }"
        : "";
    }
  }

  function handlePreviewLoad() {
    updatePreviewPlayback(previewPaused);
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();

      const form = event.currentTarget.form;

      if (form) {
        form.requestSubmit();
      }
    }
  }

  const activePreviewBackground = PREVIEW_BACKGROUNDS[previewBackground];

  const previewDocument = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />

        <style>
          * {
            box-sizing: border-box;
          }

          html,
          body {
            margin: 0;
            width: 100%;
            min-height: 100%;
          }

          body {
            min-height: 100vh;
            display: grid;
            place-items: center;
            overflow: hidden;
            background: ${activePreviewBackground.background};
            color: ${activePreviewBackground.foreground};
            font-family:
              Inter,
              ui-sans-serif,
              system-ui,
              -apple-system,
              BlinkMacSystemFont,
              "Segoe UI",
              sans-serif;
          }

          .preview-stage {
            width: 100%;
            min-height: 340px;
            padding: 32px;
            display: grid;
            place-items: center;
            position: relative;
          }

          .preview-stage::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image:
              linear-gradient(
                rgba(${activePreviewBackground.grid},0.06) 1px,
                transparent 1px
              ),
              linear-gradient(
                90deg,
                rgba(${activePreviewBackground.grid},0.06) 1px,
                transparent 1px
              );
            background-size: 32px 32px;
            mask-image: linear-gradient(
              to bottom,
              transparent,
              black 20%,
              black 80%,
              transparent
            );
            pointer-events: none;
          }

          .preview-item {
            position: relative;
            z-index: 1;
          }
        </style>

        <style>
          ${generatedCss
            .replace(/<\\\/style/gi, "")
            .replace(/<\/style/gi, "")
            .replace(/<script/gi, "")
            .replace(/<\/script/gi, "")}
        </style>

        <style id="preview-pause-style"></style>
      </head>

      <body>
        <main class="preview-stage">
          <div class="preview-item">
            <span aria-hidden="true" class="preview-face preview-face--front"></span>
            <span aria-hidden="true" class="preview-face preview-face--back"></span>
            <span aria-hidden="true" class="preview-face preview-face--left"></span>
            <span aria-hidden="true" class="preview-face preview-face--right"></span>
            <span aria-hidden="true" class="preview-face preview-face--top"></span>
            <span aria-hidden="true" class="preview-face preview-face--bottom"></span>
          </div>
        </main>
      </body>
    </html>
  `;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070708] text-zinc-100">
      {/* Efeitos de fundo */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-180px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-blue-500/15 blur-[120px]" />
        <div className="absolute bottom-[-160px] right-[-100px] h-[320px] w-[320px] rounded-full bg-violet-500/10 blur-[120px]" />

        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {/* Cabecalho */}
        <header className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] shadow-[0_0_30px_rgba(59,130,246,0.12)]">
              <Wand2 className="h-5 w-5 text-blue-400" />
            </div>

            <div>
              <p className="text-sm font-semibold tracking-tight text-white">
                CSS AI Generator
              </p>
              <p className="text-xs text-zinc-500">
                Animations & visual effects
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-zinc-400 sm:flex">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            Powered by Groq
          </div>
        </header>

        {/* Apresentacao */}
        <section className="mx-auto w-full max-w-4xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/15 bg-blue-400/[0.06] px-3 py-1.5 text-xs font-medium text-blue-300">
            <Sparkles className="h-3.5 w-3.5" />
            Transforme ideias em CSS
          </div>

          <h1 className="text-balance text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
            Descreva uma animação.
            <span className="block bg-gradient-to-r from-blue-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent">
              A IA cria o CSS.
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
            Escreva o efeito visual que você imagina e veja uma implementação
            CSS funcionando em tempo real.
          </p>
        </section>

        {/* Gerador */}
        <section className="mx-auto mt-10 w-full max-w-4xl">
          <form
            onSubmit={handleGenerate}
            className="rounded-3xl border border-white/10 bg-white/[0.035] p-3 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-4"
          >
            <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
              <label
                htmlFor="prompt"
                className="mb-3 block text-sm font-medium text-zinc-300"
              >
                {generatedCss
                  ? "O que você quer mudar no CSS?"
                  : "O que você quer criar?"}
              </label>

              <textarea
                id="prompt"
                name="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handlePromptKeyDown}
                maxLength={1000}
                rows={4}
                disabled={loading}
                placeholder={
                  generatedCss
                    ? "Ex: deixe o botão menor e troque a cor para azul..."
                    : "Ex: uma bola vermelha quicando com sombra suave e pequena deformação ao tocar o chão..."
                }
                className="w-full resize-none border-0 bg-transparent text-base leading-7 text-white outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
              />

              <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-zinc-600">
                  {generatedCss
                    ? "Ctrl + Enter para refinar"
                    : "Ctrl + Enter para gerar"}
                </p>

                <div className="flex items-center gap-2 self-end">
                  {generatedCss && (
                    <button
                      type="button"
                      onClick={handleStartNewDesign}
                      disabled={loading}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 px-4 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.06] disabled:opacity-40"
                    >
                      Novo design
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !prompt.trim()}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Gerando...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        {generatedCss ? "Refinar CSS" : "Gerar CSS"}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* Sugestoes */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  if (generatedCss) setGeneratedCss("");
                  setPreviewPaused(false);
                  setError("");
                  setPrompt(example);
                }}
                disabled={loading}
                className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-xs text-zinc-500 transition hover:border-white/15 hover:bg-white/[0.05] hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {example}
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-400/15 bg-red-400/[0.06] px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </section>

        {/* Resultados */}
        <section className="mx-auto mt-10 w-full max-w-7xl">
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Previa */}
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05]">
                    <Wand2 className="h-4 w-4 text-blue-400" />
                  </div>

                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      Preview
                    </h2>
                    <p className="text-xs text-zinc-600">
                      Resultado em tempo real
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <label className="sr-only" htmlFor="preview-background">
                    Fundo do preview
                  </label>
                  <select
                    id="preview-background"
                    value={previewBackground}
                    onChange={(event) =>
                      setPreviewBackground(event.target.value as PreviewBackground)
                    }
                    className="h-9 max-w-36 rounded-lg border border-white/[0.08] bg-[#111113] px-2 text-xs text-zinc-300 outline-none focus:border-blue-400/50"
                  >
                    {Object.entries(PREVIEW_BACKGROUNDS).map(
                      ([value, option]) => (
                        <option key={value} value={value}>
                          {option.label}
                        </option>
                      )
                    )}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      const nextPaused = !previewPaused;
                      setPreviewPaused(nextPaused);
                      updatePreviewPlayback(nextPaused);
                    }}
                    disabled={!generatedCss}
                    aria-label={
                      previewPaused ? "Reproduzir animação" : "Pausar animação"
                    }
                    title={
                      previewPaused ? "Reproduzir animação" : "Pausar animação"
                    }
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {previewPaused ? (
                      <Play className="h-3.5 w-3.5" />
                    ) : (
                      <Pause className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPreviewPaused(false);
                      setPreviewKey((key) => key + 1);
                    }}
                    disabled={!generatedCss}
                    aria-label="Reiniciar preview"
                    title="Reiniciar animação"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="min-h-[380px] p-2 sm:p-3">
                <iframe
                  key={previewKey}
                  ref={previewFrameRef}
                  onLoad={handlePreviewLoad}
                  title="Prévia do CSS gerado"
                  srcDoc={previewDocument}
                  sandbox="allow-same-origin"
                  className="h-[380px] w-full rounded-2xl border border-white/[0.06] bg-[#09090b]"
                />
              </div>
            </div>

            {/* Codigo */}
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05]">
                    <Code2 className="h-4 w-4 text-violet-400" />
                  </div>

                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      Código CSS
                    </h2>
                    <p className="text-xs text-zinc-600">
                      Pronto para copiar
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={!generatedCss}
                    aria-label="Baixar arquivo CSS"
                    title="Baixar CSS"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-400 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!generatedCss}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Clipboard className="h-3.5 w-3.5" />
                        Copiar
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="min-h-[380px] bg-[#050506]">
                {generatedCss ? (
                  <pre className="h-[380px] overflow-auto p-5 text-xs leading-6 text-zinc-300 sm:text-sm">
                    <code>{generatedCss}</code>
                  </pre>
                ) : (
                  <div className="flex h-[380px] flex-col items-center justify-center px-8 text-center">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.025]">
                      <Code2 className="h-5 w-5 text-zinc-700" />
                    </div>

                    <p className="text-sm font-medium text-zinc-500">
                      Seu CSS aparecerá aqui
                    </p>

                    <p className="mt-1 max-w-xs text-xs leading-5 text-zinc-700">
                      Descreva uma animação ou efeito visual para começar.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {history.length > 0 && (
          <section className="mx-auto mt-8 w-full max-w-7xl">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <HistoryIcon className="h-4 w-4 text-zinc-500" />
                <div>
                  <h2 className="text-sm font-semibold text-zinc-200">
                    Histórico recente
                  </h2>
                  <p className="text-xs text-zinc-600">
                    Salvo somente neste navegador
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => saveHistory([])}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpar histórico
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {history.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleRestoreGeneration(item)}
                  aria-pressed={generatedCss === item.css}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-left transition hover:border-white/15 hover:bg-white/[0.05] aria-pressed:border-blue-400/30"
                >
                  <span className="block truncate text-sm font-medium text-zinc-300">
                    {item.prompt}
                  </span>
                  <time
                    dateTime={new Date(item.createdAt).toISOString()}
                    className="mt-1 block text-[11px] text-zinc-600"
                  >
                    {new Date(item.createdAt).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </time>
                </button>
              ))}
            </div>
          </section>
        )}
        <SiteFooter />
      </div>
    </main>
  );
}
