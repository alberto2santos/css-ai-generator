import { NextResponse } from "next/server";
import postcss from "postcss";

const GROQ_API_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `
Você é especialista em CSS. Retorne somente CSS puro para estilizar o preview. Nunca retorne HTML, JavaScript, Markdown ou explicações.

O preview contém uma div .preview-item vazia e seis faces filhas: .preview-face--front, .preview-face--back, .preview-face--left, .preview-face--right, .preview-face--top e .preview-face--bottom.

Regras:
- Preserve exatamente as palavras, a capitalização e os acentos pedidos. Para texto visível, use content em .preview-item::before ou .preview-item::after.
- Para um objeto 3D com várias faces, como um cubo, use as seis classes de face existentes dentro de .preview-item. Não presuma outros elementos HTML.
- Escreva seletores somente para .preview-item, seus pseudo-elementos e as faces existentes dentro de .preview-item. Em @media, mantenha essa mesma restrição. @keyframes é permitido.
- Não use seletores globais como html, body, *, :root ou elementos fora de .preview-item.
- Não use @import, URLs externas, scripts ou recursos externos.
- Ao receber CSS atual e um pedido de alteração, devolva o CSS completo atualizado e mantenha os comportamentos que não precisam mudar.

O CSS deve funcionar de forma isolada no preview.
`.trim();

type GroqResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
    finish_reason?: string | null;
  }>;
  error?: {
    message?: string;
  };
};

function isScopedCss(css: string) {
  try {
    const root = postcss.parse(css);
    let valid = true;
    const allowedAtRules = new Set([
      "keyframes",
      "-webkit-keyframes",
      "media",
      "supports",
    ]);

    root.walkAtRules((atRule) => {
      if (!allowedAtRules.has(atRule.name.toLowerCase())) valid = false;
    });

    root.walkRules((rule) => {
      const parent = rule.parent;
      const isKeyframe =
        parent?.type === "atrule" &&
        parent.name.toLowerCase().endsWith("keyframes");

      if (isKeyframe) return;

      const selectors = rule.selector
        .split(",")
        .map((selector) => selector.trim());
      const itemSelector =
        /^\.preview-item(?:(?::[a-zA-Z_-][\w-]*|::[a-zA-Z_-][\w-]*)|\[[^\]]+\]|\.[\w-]+)*$/;
      const faceSelector =
        /^\.preview-item(?:\s*>\s*|\s+)\.preview-face(?:--(?:front|back|left|right|top|bottom))?(?:(?::[a-zA-Z_-][\w-]*|::[a-zA-Z_-][\w-]*)|\[[^\]]+\]|\.[\w-]+)*$/;
      if (
        selectors.some(
          (selector) =>
            !itemSelector.test(selector) && !faceSelector.test(selector)
        )
      ) {
        valid = false;
      }
    });

    root.walkDecls((declaration) => {
      if (/url\s*\(/i.test(declaration.value)) valid = false;
    });

    return valid;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GROQ_API_KEY não configurada. Adicione a variável no arquivo .env.local.",
        },
        { status: 500 }
      );
    }

    let body: { prompt?: unknown; css?: unknown };

    try {
      const parsedBody: unknown = await request.json();

      if (
        !parsedBody ||
        typeof parsedBody !== "object" ||
        Array.isArray(parsedBody)
      ) {
        return NextResponse.json(
          { error: "O corpo da solicitação precisa ser um objeto JSON." },
          { status: 400 }
        );
      }

      body = parsedBody as { prompt?: unknown; css?: unknown };
    } catch {
      return NextResponse.json(
        { error: "O corpo da solicitação precisa ser um JSON válido." },
        { status: 400 }
      );
    }

    const prompt =
      typeof body?.prompt === "string"
        ? body.prompt.trim()
        : "";
    const currentCss = typeof body.css === "string" ? body.css.trim() : "";

    if (!prompt) {
      return NextResponse.json(
        {
          error: "O prompt é obrigatório.",
        },
        { status: 400 }
      );
    }

    if (prompt.length > 1000) {
      return NextResponse.json(
        {
          error: "O prompt deve ter no máximo 1000 caracteres.",
        },
        { status: 400 }
      );
    }

    if (currentCss.length > 20000) {
      return NextResponse.json(
        { error: "O CSS atual é grande demais para refinar." },
        { status: 400 }
      );
    }

    const groqResponse = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        reasoning_effort: "low",
        include_reasoning: false,
        temperature: 0.2,
        max_completion_tokens: 4096,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: currentCss
              ? `Pedido de refinamento: ${prompt}\n\nCSS atual:\n${currentCss}\n\nRetorne o CSS completo atualizado.`
              : prompt,
          },
        ],
      }),
    });

    let data: GroqResponse;

    try {
      data = (await groqResponse.json()) as GroqResponse;
    } catch {
      return NextResponse.json(
        { error: "A Groq retornou uma resposta em formato inesperado." },
        { status: 502 }
      );
    }

    if (!groqResponse.ok) {
      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            "A Groq retornou um erro ao gerar o CSS.",
        },
        { status: groqResponse.status }
      );
    }

    const choice = data?.choices?.[0];
    const rawCss = choice?.message?.content?.trim();

    if (!rawCss) {
      return NextResponse.json(
        {
          error:
            choice?.finish_reason === "length"
              ? "A resposta foi interrompida antes de concluir o CSS. Tente um pedido mais curto."
              : "A Groq respondeu sem conteúdo CSS. Tente novamente.",
        },
        { status: 502 }
      );
    }
    const css = rawCss
      .replace(/^```(?:css)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    if (!isScopedCss(css)) {
      return NextResponse.json(
        { error: "A IA retornou CSS fora do formato permitido. Tente novamente." },
        { status: 502 }
      );
    }

    return NextResponse.json({ css });
  } catch (error) {
    console.error("Erro em /api/generate:", error);

    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "A geração demorou demais. Tente novamente." },
        { status: 504 }
      );
    }

    if (error instanceof TypeError) {
      return NextResponse.json(
        {
          error:
            "Não foi possível conectar à Groq. Verifique a conexão e tente novamente.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        error: "Erro interno ao gerar o CSS.",
      },
      { status: 500 }
    );
  }
}
