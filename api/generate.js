// 문제 생성 서버 (Vercel Serverless Function)
// 주변 사진 한 장을 받아 그 환경에서 찾을 수 있는 사물 주제 10개를 생성합니다.
// API 키는 Vercel 환경변수 ANTHROPIC_API_KEY 에서만 읽습니다. 코드에 직접 넣지 마세요.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST만 지원합니다" });
  }

  const { image } = req.body || {};
  if (!image) {
    return res.status(400).json({ error: "image가 필요합니다" });
  }
  if (image.length > 3_000_000) {
    return res.status(413).json({ error: "이미지가 너무 큽니다" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "서버에 ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다" });
  }

  const prompt = `사진 챌린지 게임의 문제 출제자입니다. 이 사진은 플레이어의 주변 환경입니다.

먼저 사진에서 가장 핵심이 되는 "대주제"를 하나 파악하세요. 장소(예: 책상, 주방, 침실)일 수도 있고 대표 사물(예: 커피, 자동차)일 수도 있습니다. 짧은 한국어 명사구로.

그다음, 그 대주제와 어울리는(같은 공간·같은 맥락에서 플레이어가 실제로 찾아 찍을 수 있는) 사물 문제 10개를 만드세요.
- 대주제와 관련 있으면서 서로 다른 10개
- 누구나 알아볼 수 있는 구체적인 사물. 너무 추상적이거나 특정 지역에 가야만 있는 것은 제외
- 각 문제는 짧은 한국어 명사 (예: "머그컵", "안경", "충전 케이블")

반드시 아래 JSON만 출력하세요. 다른 텍스트, 마크다운 백틱 금지:
{"topic": "대주제 (짧은 명사구)", "themes": ["문제1", "문제2", "문제3", "문제4", "문제5", "문제6", "문제7", "문제8", "문제9", "문제10"]}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    const data = await r.json();

    if (data.error) {
      return res.status(502).json({ error: `Anthropic API 오류: ${data.error.message || data.error.type}` });
    }

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(502).json({ error: `생성 결과 해석 실패: ${text.slice(0, 80)}` });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const themes = Array.isArray(parsed.themes)
      ? parsed.themes.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim())
      : [];

    return res.status(200).json({
      topic: parsed.topic || "",
      themes,
    });
  } catch (err) {
    return res.status(500).json({ error: `서버 오류: ${err.message}` });
  }
}
