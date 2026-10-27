import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSource from "pdfjs-dist/build/pdf.worker.min.mjs?raw";

export async function renderPDF(canvas: HTMLCanvasElement, target: string, signal: AbortSignal, file?: File, path?: string): Promise<void> {
  if (signal.aborted) return;
  const bytes = file ? await file.arrayBuffer()
    : path && window.worminal?.readFile ? await window.worminal.readFile(path, signal) : undefined;
  if (signal.aborted) return;
  if (path && !bytes) throw new Error("Update Worminal to enable PDF previews.");
  // Bundle the worker into the standalone HTML; never request a CDN or sibling asset.
  const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
  const port = new Worker(url, { type: "module" });
  GlobalWorkerOptions.workerPort = port;
  const loading = getDocument({ ...(bytes ? { data: new Uint8Array(bytes) } : { url: target }), isEvalSupported: false });
  GlobalWorkerOptions.workerPort = null;
  const cancel = () => { void loading.destroy().catch(() => {}); port.terminate(); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const document = await loading.promise;
    const page = await document.getPage(1);
    if (signal.aborted) return;
    const natural = page.getViewport({ scale: 1 });
    const scale = Math.min(720, innerWidth * 0.9) / natural.width;
    const viewport = page.getViewport({ scale: Math.min(scale, (innerHeight - 32) / natural.height) });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
  } finally {
    signal.removeEventListener("abort", cancel);
    try { await loading.destroy(); }
    finally { port.terminate(); URL.revokeObjectURL(url); }
  }
}
