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

이 환경에서 플레이어가 "주변을 둘러보며 직접 찾아서 사진 찍을 수 있는" 사물 주제 10개를 만드세요.
- 사진에 이미 보이는 것뿐 아니라, 같은 공간에 함께 있을 가능성이 높은 사물도 포함하세요 (예: 책상이면 펜, 컵, 충전기 등)
- 누구나 알아볼 수 있는 구체적인 사물로. 너무 추상적이거나 특정 지역에 가야만 있는 것은 제외
- 각 주제는 짧은 한국어 명사 (예: "머그컵", "안경", "충전 케이블")
- 10개 모두 서로 다르게

반드시 아래 JSON만 출력하세요. 다른 텍스트, 마크다운 백틱 금지:
{"seen": "사진 속 환경을 한 문장으로", "themes": ["주제1", "주제2", "주제3", "주제4", "주제5", "주제6", "주제7", "주제8", "주제9", "주제10"]}`;

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
      seen: parsed.seen || "",
      themes,
    });
  } catch (err) {
    return res.status(500).json({ error: `서버 오류: ${err.message}` });
  }
}
