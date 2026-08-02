// Client-side reader for the streaming chat routes. Calls onUpdate with the
// accumulated text as chunks arrive; resolves with the full text.
export async function readTextStream(
  res: Response,
  onUpdate: (text: string) => void
): Promise<string> {
  if (!res.ok || !res.body) {
    let detail = "";
    try {
      detail = (await res.json()).error || "";
    } catch {}
    throw new Error(detail || `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onUpdate(text);
  }
  text += decoder.decode();
  return text;
}
