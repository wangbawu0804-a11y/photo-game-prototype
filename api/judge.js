// 판정 서버 (Vercel Serverless Function)
// API 키는 Vercel 환경변수 ANTHROPIC_API_KEY 에서만 읽습니다. 코드에 직접 넣지 마세요.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST만 지원합니다" });
  }

  const { image, theme } = req.body || {};
  if (!image || !theme) {
    return res.status(400).json({ error: "image와 theme이 필요합니다" });
  }
  if (image.length > 3_000_000) {
    return res.status(413).json({ error: "이미지가 너무 큽니다" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "서버에 ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다" });
  }

  const prompt = `사진 챌린지 게임의 심판입니다. 주제: "${theme}"

이 사진이 주제에 부합하는지 판정하세요. 캐주얼 게임이므로 관대하게 판정합니다:
- 주제의 대상이 사진에 실제로 보이면 통과
- 포장된 제품, 봉지, 컵 형태 등도 그 대상이 맞으면 통과 (예: 주제가 "라면"이면 라면 봉지, 컵라면, 끓인 라면 모두 통과)
- 일부만 보이거나 화질이 나빠도 무엇인지 알아볼 수 있으면 통과
- 확신이 서지 않는 애매한 경우에는 통과 쪽으로 판정
- 단, 화면을 재촬영한 사진(모니터·다른 사진을 찍은 것)이 명백하면 탈락

반드시 아래 JSON만 출력하세요. 다른 텍스트, 마크다운 백틱 금지:
{"match": true 또는 false, "seen": "사진에서 본 것 한 문장", "comment": "게임 심판 말투의 짧은 한마디 (통과면 칭찬, 탈락이면 이유)"}`;

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
      return res.status(502).json({ error: `판정 결과 해석 실패: ${text.slice(0, 80)}` });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.match !== "boolean") {
      return res.status(502).json({ error: "판정 결과에 match 값이 없습니다" });
    }

    return res.status(200).json({
      match: parsed.match,
      seen: parsed.seen || "",
      comment: parsed.comment || "",
    });
  } catch (err) {
    return res.status(500).json({ error: `서버 오류: ${err.message}` });
  }
}
