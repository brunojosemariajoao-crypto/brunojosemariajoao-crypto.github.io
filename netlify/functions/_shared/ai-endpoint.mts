// Netlify injects the provider URL and key at runtime; they need not appear
// in the project's manually configured environment variables.
export function responsesEndpoint(baseUrl?: string | null): string {
  const base = String(baseUrl || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
  const url = new URL(base);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("OPENAI_BASE_URL inválido: é necessário um endereço HTTPS sem credenciais ou parâmetros");
  }
  return `${base.replace(/\/v1$/, "")}/v1/responses`;
}
