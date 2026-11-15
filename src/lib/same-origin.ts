/** Treat localhost and 127.0.0.1 as the same machine during local dev. */
export function allowsSameSite(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const local = (host: string) => {
    const name = host.split(":")[0];
    return name === "localhost" || name === "127.0.0.1";
  };
  const candidates = [request.headers.get("host") || "", new URL(request.url).host];
  return candidates.some(
    (host) =>
      host === originHost || (local(host) && local(originHost)),
  );
}
