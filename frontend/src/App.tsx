import { ChangeEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { Bookmark, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, FileUp, Highlighter, KeyRound, Library, LoaderCircle, Menu, MessageSquareText, NotebookPen, Pencil, Play, Plus, Search, Settings, ShieldCheck, StickyNote, Tags, Trash2, Volume2, X } from "lucide-react";
import { API_ORIGIN, api, type AskThread, type Book, type Chapter, type ModelSettings, type Note, type RagStatus, type Tag, type TocEntry, type TtsSegment } from "./api/client";

type NavigationTarget = { key: string; title: string; chapter: Chapter; anchor: string | null; depth: number };
type SelectionDraft = { selected_text: string; start_offset: number; end_offset: number; left: number; top: number };

type DialogOptions = { title: string; description?: string; confirmLabel?: string; danger?: boolean; input?: { label: string; initialValue?: string; placeholder?: string; multiline?: boolean } };

function AppDialog({ options, onClose }: { options: DialogOptions; onClose: (value: boolean | string | null) => void }) {
  const [value, setValue] = useState(options.input?.initialValue || "");
  const submit = () => onClose(options.input ? value : true);
  return <div className="fixed inset-0 z-[20030] grid place-items-center bg-[#14251e]/35 p-5" role="presentation" onMouseDown={() => onClose(null)}><section role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" className="w-full max-w-md rounded-2xl border border-[#e1e4dd] bg-[#fffdf8] p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><h2 id="app-dialog-title" className="font-serif text-xl font-semibold text-[#263b33]">{options.title}</h2>{options.description && <p className="mt-2 text-sm leading-6 text-[#68736c]">{options.description}</p>}{options.input && <label className="mt-5 block"><span className="text-xs font-medium text-[#637168]">{options.input.label}</span>{options.input.multiline ? <textarea autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={options.input.placeholder} className="mt-2 min-h-36 w-full resize-y rounded-lg border border-[#d9dfd8] bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#658270]"/> : <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} placeholder={options.input.placeholder} className="mt-2 w-full rounded-lg border border-[#d9dfd8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#658270]"/>}</label>}<div className="mt-6 flex justify-end gap-2"><button onClick={() => onClose(null)} className="rounded-lg px-3.5 py-2 text-sm text-[#68736c] hover:bg-[#eef1ed]">取消</button><button onClick={submit} className={`rounded-lg px-3.5 py-2 text-sm font-medium text-white ${options.danger ? "bg-[#a95247] hover:bg-[#91443b]" : "bg-[#40584d] hover:bg-[#33483f]"}`}>{options.confirmLabel || "确认"}</button></div></section></div>;
}

function showAppDialog(options: DialogOptions): Promise<boolean | string | null> {
  return new Promise((resolve) => {
    const container = document.createElement("div"); document.body.appendChild(container);
    const root = createRoot(container);
    const close = (value: boolean | string | null) => { root.unmount(); container.remove(); resolve(value); };
    root.render(<AppDialog options={options} onClose={close}/>);
    if (options.title === "重命名标签") window.requestAnimationFrame(() => container.querySelector("input")?.setAttribute("maxlength", "15"));
  });
}

const confirmAppDialog = async (title: string, description: string, danger = false) => (await showAppDialog({title, description, confirmLabel: danger ? "确认删除" : "确认", danger})) === true;
const promptAppDialog = async (title: string, label: string, initialValue = "", placeholder = "", multiline = false) => {
  const result = await showAppDialog({title, input: {label, initialValue, placeholder, multiline}, confirmLabel: "保存"});
  return typeof result === "string" ? result : null;
};

function ModelSettingsLauncher() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<ModelSettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com/v1");
  const [model, setModel] = useState("deepseek-chat");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true); setError("");
    try { const value = await api.modelSettings(); setSettings(value); setBaseUrl(value.base_url); setModel(value.model); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "无法读取模型设置"); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (open) void load(); }, [open]);
  const save = async () => {
    if (!baseUrl.trim() || !model.trim()) return;
    setLoading(true); setError("");
    try { const value = await api.saveModelSettings({ ...(apiKey.trim() ? {api_key: apiKey.trim()} : {}), base_url: baseUrl.trim(), model: model.trim() }); setSettings(value); window.dispatchEvent(new CustomEvent("dudu:model-settings-updated", { detail: value })); setApiKey(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "保存失败"); }
    finally { setLoading(false); }
  };
  const clearKey = async () => {
    setLoading(true); setError("");
    try { const value = await api.saveModelSettings({ clear_api_key: true, base_url: baseUrl.trim(), model: model.trim() }); setSettings(value); window.dispatchEvent(new CustomEvent("dudu:model-settings-updated", { detail: value })); setApiKey(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "清除失败"); }
    finally { setLoading(false); }
  };
  return <>{createPortal(<button aria-label="模型设置" title="模型设置" onClick={() => setOpen(true)} className="fixed bottom-6 left-3 z-[9997] grid size-10 place-items-center rounded-xl text-[#dce4d6] transition hover:bg-[#43574e]"><Settings size={19}/></button>, document.body)}{open && createPortal(<div className="fixed inset-0 z-[20020] grid place-items-center bg-[#14251e]/40 p-5"><section role="dialog" aria-modal="true" aria-labelledby="model-settings-title" className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#dfe4dc] bg-[#fffdf8] shadow-2xl"><header className="flex items-start justify-between border-b border-[#e7e9e3] px-6 py-5"><div><p className="text-xs text-[#718076]">本地模型配置</p><h2 id="model-settings-title" className="mt-1 font-serif text-xl font-semibold text-[#263b33]">AI 模型设置</h2></div><button aria-label="关闭模型设置" onClick={() => setOpen(false)} className="rounded-md p-2 text-[#68736c] hover:bg-[#eef1ed]"><X size={18}/></button></header><div className="min-h-0 flex-1 overflow-y-auto px-6 py-5"><section className="rounded-xl border border-[#dfe7de] bg-[#f5f8f4] p-4"><div className="flex items-center gap-2 text-[#365342]"><ShieldCheck size={17}/><strong className="text-sm">密钥保护</strong></div><p className="mt-2 text-xs leading-5 text-[#5f6f64]">密钥只以密码字段输入；保存后前端只显示脱敏尾号，后端以加密密文保存且不会在接口中回传完整值。生产部署请启用 HTTPS，并设置 APP_ENCRYPTION_KEY。</p></section><div className="mt-5 grid gap-4"><label><span className="text-xs font-medium text-[#637168]">DeepSeek API Key</span><div className="mt-2 flex gap-2"><div className="relative min-w-0 flex-1"><KeyRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#879289]" size={15}/><input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings?.api_key_masked ? `已保存 ${settings.api_key_masked}；输入新密钥才会替换` : "sk-..."} className="w-full rounded-lg border border-[#d9dfd8] bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#658270]"/></div>{settings?.has_api_key && settings.key_source === "database" && <button onClick={() => void clearKey()} disabled={loading} className="rounded-lg border border-[#e1c9c3] px-3 text-xs text-[#9b584c] hover:bg-[#fff2ef] disabled:opacity-50">清除</button>}</div><p className="mt-1.5 text-[10px] text-[#8b958d]">当前：{settings?.has_api_key ? `${settings.key_source === "environment" ? "环境变量" : "本地加密保存"} ${settings.api_key_masked || ""}` : "未配置"}</p></label><label><span className="text-xs font-medium text-[#637168]">API 地址</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} className="mt-2 w-full rounded-lg border border-[#d9dfd8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#658270]"/></label><label><span className="text-xs font-medium text-[#637168]">模型名称</span><input value={model} onChange={(event) => setModel(event.target.value)} className="mt-2 w-full rounded-lg border border-[#d9dfd8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#658270]"/></label></div><section className="mt-6"><div className="flex items-center gap-2"><h3 className="text-xs font-semibold tracking-wide text-[#617168]">问书链路</h3><span className="text-[10px] text-[#98a099]">书籍与密钥的边界</span></div><div className="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center text-[10px] leading-4"><div className="rounded-lg border border-[#e1e7df] bg-white p-2.5 text-[#53645a]">EPUB 正文<br/><b className="font-medium text-[#385241]">本地 RAG 索引</b></div><span className="text-[#91a095]">→</span><div className="rounded-lg border border-[#e1e7df] bg-white p-2.5 text-[#53645a]">笃笃后端<br/><b className="font-medium text-[#385241]">检索 / 拼接上下文</b></div><span className="text-[#91a095]">→</span><div className="rounded-lg border border-[#e1e7df] bg-white p-2.5 text-[#53645a]">DeepSeek API<br/><b className="font-medium text-[#385241]">生成回答</b></div></div><p className="mt-3 text-[10px] leading-5 text-[#89938b]">API Key 仅由笃笃后端用于调用模型；RAG 索引、问答记录与书籍文件保留在本地数据库和本地存储中。</p></section>{error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}</div><footer className="flex items-center justify-between border-t border-[#e7e9e3] px-6 py-4"><span className="text-[10px] text-[#8a958c]">{settings?.encryption_mode === "app_secret" ? "已使用独立应用加密密钥" : "本地模式：建议为生产环境设置 APP_ENCRYPTION_KEY"}</span><button onClick={() => void save()} disabled={loading} className="rounded-lg bg-[#40584d] px-4 py-2 text-sm font-medium text-white hover:bg-[#33483f] disabled:opacity-50">{loading ? "保存中…" : "保存设置"}</button></footer></section></div>, document.body)}</>;
}
const entryKey = (entry: TocEntry) => `${entry.chapter_id || "group"}:${entry.anchor || "top"}:${entry.title}`;

const markdownPreviewText = (value: string) => value.replace(/```[\s\S]*?```/g, "").replace(/^\s{0,3}#{1,6}\s+/gm, "").replace(/^\s*>\s?/gm, "").replace(/^\s*[-*+]\s+/gm, "").replace(/^\s*\d+[.)]\s+/gm, "").replace(/(\*\*|__|`|~~)/g, "").replace(/\s+/g, " ").trim();

function appendMarkdownInline(parent: HTMLElement, text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|~~[^~]+~~)/g);
  parts.forEach((part) => {
    if (!part) return;
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) { const strong = document.createElement("strong"); strong.textContent = part.slice(2, -2); parent.append(strong); return; }
    if (part.startsWith("`") && part.endsWith("`")) { const code = document.createElement("code"); code.className = "rounded bg-[#edf1ed] px-1 py-0.5 font-mono text-[.88em] text-[#40584d]"; code.textContent = part.slice(1, -1); parent.append(code); return; }
    if (part.startsWith("~~") && part.endsWith("~~")) { const strike = document.createElement("s"); strike.textContent = part.slice(2, -2); parent.append(strike); return; }
    parent.append(document.createTextNode(part));
  });
}

function renderMarkdownAnswer(element: HTMLElement, source: string) {
  element.replaceChildren();
  let inCode = false;
  for (const rawLine of source.split(/\r?\n/)) {
    if (rawLine.trim().startsWith("```")) { inCode = !inCode; continue; }
    const line = document.createElement("span"); line.className = "markdown-answer-line";
    if (inCode) { line.classList.add("markdown-answer-code"); line.textContent = rawLine; }
    else if (!rawLine.trim()) line.classList.add("markdown-answer-blank");
    else if (/^\s*#{1,3}\s+/.test(rawLine)) { line.classList.add("markdown-answer-heading"); appendMarkdownInline(line, rawLine.replace(/^\s*#{1,3}\s+/, "")); }
    else if (/^\s*>\s?/.test(rawLine)) { line.classList.add("markdown-answer-quote"); appendMarkdownInline(line, rawLine.replace(/^\s*>\s?/, "")); }
    else if (/^\s*[-*+]\s+/.test(rawLine)) { line.classList.add("markdown-answer-list"); appendMarkdownInline(line, rawLine.replace(/^\s*[-*+]\s+/, "")); }
    else if (/^\s*\d+[.)]\s+/.test(rawLine)) { line.classList.add("markdown-answer-list"); appendMarkdownInline(line, rawLine); }
    else appendMarkdownInline(line, rawLine);
    element.append(line);
  }
}

function BookExhibitionLauncher() {
  const [open, setOpen] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const pageRef = useRef<HTMLElement>(null);
  const easterClickCountRef = useRef(0);
  const easterClickTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const easterVisibleTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setPaused(false);
    void api.books().then((items) => { if (!cancelled) setBooks(items); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);
  useEffect(() => () => { if (easterClickTimerRef.current) window.clearTimeout(easterClickTimerRef.current); if (easterVisibleTimerRef.current) window.clearTimeout(easterVisibleTimerRef.current); }, []);
  const ordered = [...books].sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
  const latest = ordered.filter((book) => book.progress?.last_read_at).sort((left, right) => new Date(right.progress?.last_read_at || 0).getTime() - new Date(left.progress?.last_read_at || 0).getTime())[0];
  const arranged = latest ? [latest, ...ordered.filter((book) => book.id !== latest.id)] : ordered;
  const padded = arranged.length ? Array.from({ length: Math.max(8, arranged.length) }, (_, index) => arranged[index % arranged.length]) : [];
  const rowOne = padded.filter((_, index) => index % 2 === 0);
  const rowTwo = padded.filter((_, index) => index % 2 === 1);
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const canvas = document.createElement("canvas"); canvas.width = 1800; canvas.height = 1125;
      const context = canvas.getContext("2d"); if (!context) throw new Error("截图画布不可用");
      const rounded = (x: number, y: number, width: number, height: number, radius: number) => { context.beginPath(); context.moveTo(x + radius, y); context.arcTo(x + width, y, x + width, y + height, radius); context.arcTo(x + width, y + height, x, y + height, radius); context.arcTo(x, y + height, x, y, radius); context.arcTo(x, y, x + width, y, radius); context.closePath(); };
      const background = context.createLinearGradient(0, 0, canvas.width, canvas.height); background.addColorStop(0, "#fffdf4"); background.addColorStop(.62, "#f7f8f2"); background.addColorStop(1, "#e8efe8"); context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#819087"; context.font = "600 20px sans-serif"; context.letterSpacing = "4px"; context.fillText("DUDU BOOK EXHIBITION", 72, 86); context.letterSpacing = "0px";
      context.font = "600 58px serif"; context.fillStyle = "#263b33"; context.fillText("图书", 72, 160); context.fillStyle = "#78a99d"; context.fillText("展览", 206, 160);
      context.fillStyle = "#758178"; context.font = "24px serif"; context.fillText("最新阅读置顶，其余按书名排序。", 72, 205);
      const shareBooks = [...rowOne.slice(0, 5), ...(rowTwo.length ? rowTwo : rowOne).slice(0, 5)];
      const loadedCovers = await Promise.all(shareBooks.map(async (book) => {
        if (!book.cover_url) return null;
        try { const response = await fetch(`${API_ORIGIN}${book.cover_url}`, { mode: "cors" }); if (!response.ok) return null; const blob = await response.blob(); const url = URL.createObjectURL(blob); const image = new Image(); image.src = url; await image.decode(); return { image, url }; } catch { return null; }
      }));
      const drawBook = (book: Book, cover: { image: HTMLImageElement; url: string } | null, index: number, row: number) => {
        const cardWidth = 190, cardHeight = 292, startX = 88, gap = 52, y = row === 0 ? 290 : 652, x = startX + index * (cardWidth + gap);
        context.save(); context.shadowColor = "rgba(48,70,55,.14)"; context.shadowBlur = 22; context.shadowOffsetY = 10; rounded(x, y, cardWidth, cardHeight, 12); context.fillStyle = "#fffef9"; context.fill(); context.restore();
        const coverX = x + 17, coverY = y + 16, coverWidth = 156, coverHeight = 260; context.save(); rounded(coverX, coverY, coverWidth, coverHeight, 5); context.clip();
        if (cover) { const ratio = Math.max(coverWidth / cover.image.naturalWidth, coverHeight / cover.image.naturalHeight); const width = cover.image.naturalWidth * ratio, height = cover.image.naturalHeight * ratio; context.drawImage(cover.image, coverX + (coverWidth - width) / 2, coverY + (coverHeight - height) / 2, width, height); }
        else { context.fillStyle = "#a9b9a5"; context.fillRect(coverX, coverY, coverWidth, coverHeight); context.fillStyle = "#fffdf4"; context.font = "600 28px serif"; context.fillText(book.title.slice(0, 4), coverX + 16, coverY + 48); }
        context.restore();
      };
      shareBooks.slice(0, 5).forEach((book, index) => drawBook(book, loadedCovers[index], index, 0));
      shareBooks.slice(5).forEach((book, index) => drawBook(book, loadedCovers[index + 5], index, 1));
      loadedCovers.forEach((cover) => cover && URL.revokeObjectURL(cover.url));
      context.fillStyle = "#99a39b"; context.font = "18px sans-serif"; context.fillText("笃笃 · 只为阅读而陈列", 72, 1060);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("截图生成失败");
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `笃笃图书展览-${new Date().toISOString().slice(0, 10)}.png`; anchor.click(); URL.revokeObjectURL(url);
    } catch { await showAppDialog({ title: "截图未生成", description: "请等待封面加载完成后重试。", confirmLabel: "知道了" }); }
    finally { setSharing(false); }
  };
  const shareDom = async () => {
    if (!pageRef.current || sharing) return;
    setSharing(true);
    try {
      await document.fonts?.ready;
      await Promise.all(Array.from(pageRef.current.querySelectorAll("img")).map((image) => image.decode?.().catch(() => undefined)));
      const canvas = await html2canvas(pageRef.current, {
        backgroundColor: "#f5f6ef",
        scale: 2,
        useCORS: true,
        ignoreElements: (element: Element) => element.hasAttribute("data-exhibition-share"),
        onclone: (documentClone) => documentClone.querySelectorAll<HTMLElement>(".exhibition-track").forEach((track) => { track.style.animationPlayState = "paused"; }),
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("截图生成失败");
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `笃笃图书展览-${new Date().toISOString().slice(0, 10)}.png`; anchor.click(); URL.revokeObjectURL(url);
    } catch { await showAppDialog({ title: "截图未生成", description: "请等待封面加载完成后重试。", confirmLabel: "知道了" }); }
    finally { setSharing(false); }
  };
  const revealEasterEgg = () => {
    if (easterClickTimerRef.current) window.clearTimeout(easterClickTimerRef.current);
    easterClickCountRef.current += 1;
    if (easterClickCountRef.current < 10) { easterClickTimerRef.current = window.setTimeout(() => { easterClickCountRef.current = 0; }, 1600); return; }
    easterClickCountRef.current = 0;
    setShowEasterEgg(true);
    if (easterVisibleTimerRef.current) window.clearTimeout(easterVisibleTimerRef.current);
    easterVisibleTimerRef.current = window.setTimeout(() => setShowEasterEgg(false), 5000);
  };
  const track = (items: Book[], direction: "left" | "right") => <div className={`exhibition-track exhibition-track--${direction} ${paused ? "is-paused" : ""}`}>{[...items, ...items].map((book, index) => <article key={`${book.id}-${index}`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="exhibition-book" title={`${book.title}${book.author ? ` - ${book.author}` : ""}`}><BookCover book={book}/></article>)}</div>;
  return <>{createPortal(<button aria-label={open ? "返回书库" : "打开图书展览"} title={open ? "返回书库" : "图书展览"} onClick={() => setOpen((value) => !value)} className={`fixed left-3 top-[11.5rem] z-[20040] grid size-10 place-items-center rounded-xl text-[#dce4d6] transition ${open ? "bg-[#d9b94d] text-[#31483c]" : "hover:bg-[#43574e]"}`}>{open ? <X size={19}/> : <BookOpen size={19}/>}</button>, document.body)}{open && createPortal(<section ref={pageRef} className="dudu-exhibition-page fixed inset-y-0 left-16 right-0 z-[20000] overflow-hidden bg-[#f5f6ef] px-10 py-10"><header className="flex items-start justify-between"><div><p className="text-xs tracking-[.2em] text-[#87948a]">DUDU BOOK EXHIBITION</p><h1 className="mt-2 font-serif text-4xl font-semibold tracking-[.08em] text-[#263b33]">图书<span>展览</span></h1><p className="mt-3 text-sm text-[#758178]">最新阅读置顶，其余按书名排序。悬停任意一本书可暂停展览。</p></div><button data-exhibition-share onClick={() => void shareDom()} disabled={sharing || !books.length} className="exhibition-share-button"><span>{sharing ? "生成中…" : "分享展览"}</span><span aria-hidden="true">↗</span></button></header>{loading ? <div className="grid h-[70vh] place-items-center text-sm text-[#7d8980]">正在布展…</div> : !arranged.length ? <div className="grid h-[70vh] place-items-center"><div className="text-center text-[#7d8980]"><BookOpen className="mx-auto mb-4" size={36}/><p className="font-serif text-xl">书架还没有书</p><p className="mt-2 text-sm">导入 EPUB 后，展览会从这里开始。</p></div></div> : <main className="mt-10 grid gap-5"><section className="exhibition-row">{track(rowOne, "right")}</section><section className="exhibition-row">{track(rowTwo.length ? rowTwo : rowOne, "left")}</section></main>}{showEasterEgg && <img className="dudu-easter-egg" src="/dudu-easter-egg.png" alt="笃笃彩蛋"/>}<footer className="absolute bottom-8 left-10 text-xs tracking-[.18em] text-[#99a39b]"><button type="button" onClick={revealEasterEgg} className="dudu-easter-trigger">笃笃</button><span> · 只为阅读而陈列</span></footer></section>, document.body)}</>;
}

function navigationTargets(entries: TocEntry[], chapters: Chapter[]): NavigationTarget[] {
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const targets: NavigationTarget[] = [];
  const walk = (items: TocEntry[], depth = 0) => items.forEach((entry) => {
    const chapter = entry.chapter_id ? byId.get(entry.chapter_id) : undefined;
    if (chapter) targets.push({ key: entryKey(entry), title: entry.title || chapter.display_title, chapter, anchor: entry.anchor || null, depth });
    walk(entry.children || [], depth + 1);
  });
  walk(entries);
  if (targets.length) return targets;
  return chapters.map((chapter) => ({ key: `${chapter.id}:top`, title: chapter.display_title, chapter, anchor: null, depth: 0 }));
}

function renderNoteHighlights(content: HTMLElement, notes: Note[]) {
  content.querySelectorAll("mark[data-annotation-id]").forEach((mark) => mark.replaceWith(...Array.from(mark.childNodes)));
  content.normalize();
  for (const note of [...notes].sort((a, b) => b.start_offset - a.start_offset)) {
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const segments: { node: Text; start: number; end: number }[] = [];
    let cursor = 0; let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent || ""; const nodeEnd = cursor + text.length;
      let start = Math.max(note.start_offset, cursor); let end = Math.min(note.end_offset, nodeEnd);
      while (start < end && /\s/.test(text[start - cursor])) start += 1;
      while (end > start && /\s/.test(text[end - cursor - 1])) end -= 1;
      if (start < end) segments.push({ node: node as Text, start: start - cursor, end: end - cursor });
      cursor = nodeEnd;
    }
    for (const segment of segments.reverse()) {
      const range = document.createRange(); range.setStart(segment.node, segment.start); range.setEnd(segment.node, segment.end);
      const mark = document.createElement("mark"); mark.dataset.annotationId = note.id; mark.dataset.annotation = "true"; mark.style.backgroundColor = note.color; mark.style.borderRadius = "2px"; mark.style.padding = "0 1px";
      range.surroundContents(mark);
    }
  }
}

function renderTtsHighlight(content: HTMLElement, text: string | null) {
  content.querySelectorAll("mark[data-tts-highlight]").forEach((mark) => mark.replaceWith(...Array.from(mark.childNodes)));
  content.normalize();
  if (!text) return null;
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT); const nodes: { node: Text; start: number; end: number }[] = []; let node: Node | null; let cursor = 0;
  while ((node = walker.nextNode())) { const value = node.textContent || ""; nodes.push({node: node as Text, start: cursor, end: cursor + value.length}); cursor += value.length; }
  const whole = nodes.map((item) => item.node.textContent || "").join(""); const compact = whole.replace(/\s/g, ""); const wanted = text.replace(/\s/g, "");
  const compactIndex = compact.indexOf(wanted.slice(0, Math.min(80, wanted.length))); if (compactIndex < 0) return null;
  const rawOffsets = Array.from(whole).reduce<number[]>((offsets, char, index) => { if (!/\s/.test(char)) offsets.push(index); return offsets; }, []);
  const start = rawOffsets[compactIndex]; const end = rawOffsets[Math.min(rawOffsets.length - 1, compactIndex + wanted.length - 1)] + 1; let first: HTMLElement | null = null;
  for (const item of [...nodes].reverse()) { let from = Math.max(start, item.start); let to = Math.min(end, item.end); const value = item.node.textContent || ""; while (from < to && /\s/.test(value[from - item.start])) from += 1; while (to > from && /\s/.test(value[to - item.start - 1])) to -= 1; if (from >= to) continue; const range = document.createRange(); range.setStart(item.node, from - item.start); range.setEnd(item.node, to - item.start); const mark = document.createElement("mark"); mark.dataset.ttsHighlight = "true"; range.surroundContents(mark); first = mark; }
  return first;
}

export function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagFilter, setTagFilter] = useState("");
  const [active, setActive] = useState<Book | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [html, setHtml] = useState("");
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [restoreScroll, setRestoreScroll] = useState(0);
  const [locationTitle, setLocationTitle] = useState("");
  const [locationKey, setLocationKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const modelSettingsLauncherRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const exhibitionLauncherRef = useRef<ReturnType<typeof createRoot> | null>(null);

  const refreshBooks = async (filter = tagFilter) => {
    try { setBooks(await api.books(filter || undefined)); }
    catch { setError("无法连接后端。请运行 Docker Compose 后重试。"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refreshBooks(""); void api.tags().then(setTags); }, []);
  useEffect(() => { void refreshBooks(tagFilter); }, [tagFilter]);
  useEffect(() => () => { if (progressTimerRef.current) window.clearTimeout(progressTimerRef.current); }, []);
  useEffect(() => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    modelSettingsLauncherRef.current = createRoot(container);
    modelSettingsLauncherRef.current.render(<ModelSettingsLauncher/>);
    return () => { modelSettingsLauncherRef.current?.unmount(); modelSettingsLauncherRef.current = null; container.remove(); };
  }, []);
  useEffect(() => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    exhibitionLauncherRef.current = createRoot(container);
    exhibitionLauncherRef.current.render(<BookExhibitionLauncher/>);
    return () => { exhibitionLauncherRef.current?.unmount(); exhibitionLauncherRef.current = null; container.remove(); };
  }, []);

  const openChapter = async (book: Book, next: Chapter, anchor: string | null = null, title?: string, key?: string, scrollPosition = 0) => {
    setPendingAnchor(anchor);
    setRestoreScroll(scrollPosition);
    setLocationTitle(title || next.display_title);
    setLocationKey(key || `${next.id}:top`);
    setChapter(next);
    const result = await api.chapter(book.id, next.id);
    // EPUB 资源由后端以 /media 暴露；阅读器本身运行在 Vite 的端口上，
    // 因此需要把相对地址指向 API 服务，避免图片被错误地请求到前端。
    setHtml(result.raw_html.replace(/src="\/media\//g, `src="${API_ORIGIN}/media/`));
  };

  const selectBook = async (book: Book) => {
    setError("");
    try {
      const detail = await api.book(book.id);
      setActive(detail);
      setNotes(await api.notes(book.id));
      setFocusedNoteId(null);
      const targets = navigationTargets(detail.toc || [], detail.chapters || []);
      const savedChapter = detail.progress?.current_chapter_id ? detail.chapters?.find((item) => item.id === detail.progress?.current_chapter_id) : undefined;
      const savedTarget = savedChapter ? targets.find((item) => item.chapter.id === savedChapter.id) : undefined;
      if (savedChapter) await openChapter(detail, savedChapter, null, savedTarget?.title || savedChapter.display_title, savedTarget?.key, detail.progress?.scroll_position || 0);
      else {
        const first = targets[0];
        if (first) await openChapter(detail, first.chapter, first.anchor, first.title, first.key);
      }
    } catch { setError("无法加载书籍章节，请稍后重试。"); }
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const book = await api.upload(file);
      await refreshBooks();
      await selectBook(book);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导入失败：请确认文件为可读取、无 DRM 的 EPUB。");
      setLoading(false);
    } finally { event.target.value = ""; }
  };

  const deleteBook = async (book: Book) => {
    if (!await confirmAppDialog("删除这本书？", `《${book.title}》及其阅读位置、笔记和标签关联将一并删除。此操作无法撤销。`, true)) return;
    try {
      await api.deleteBook(book.id);
      setBooks((current) => current.filter((item) => item.id !== book.id));
      if (active?.id === book.id) { setActive(null); setChapter(null); setHtml(""); setLocationTitle(""); setLocationKey(""); }
    } catch { setError("删除失败，请稍后重试。"); }
  };

  const saveReadingPosition = (chapterId: string, scrollPosition: number) => {
    if (!active) return;
    if (progressTimerRef.current) window.clearTimeout(progressTimerRef.current);
    const bookId = active.id;
    progressTimerRef.current = window.setTimeout(() => { void api.saveProgress(bookId, { current_chapter_id: chapterId, scroll_position: Math.round(scrollPosition) }); }, 650);
  };

  const createNote = async (selection: { selected_text: string; start_offset: number; end_offset: number }, userNote?: string | null) => {
    if (!active || !chapter) return;
    const created = await api.createNote({ book_id: active.id, chapter_id: chapter.id, ...selection, user_note: userNote || null, color: "#F6D86B" });
    setNotes((current) => [created, ...current]);
  };
  const updateNote = async (noteId: string, changes: { user_note?: string | null; color?: string; tag_ids?: string[] }) => {
    const updated = await api.updateNote(noteId, changes);
    setNotes((current) => current.map((item) => item.id === noteId ? updated : item));
  };
  const deleteNote = async (noteId: string) => { await api.deleteNote(noteId); setNotes((current) => current.filter((item) => item.id !== noteId)); };
  const jumpToNote = async (note: Note) => {
    if (!active) return;
    const target = active.chapters?.find((item) => item.id === note.chapter_id);
    if (!target) return;
    setFocusedNoteId(note.id);
    await openChapter(active, target, null, target.display_title, `${target.id}:top`);
  };

  return <main className="h-screen overflow-hidden bg-[#f4f4ef] text-ink">
    <aside className="fixed inset-y-0 left-0 flex w-16 flex-col items-center bg-[#24352f] py-6 text-[#dce4d6]"><img src="/assets/dudu-hoopoe-icon.png" alt="笃笃" className="size-9 object-contain"/><nav className="mt-16 grid gap-3"><button className="rounded-xl bg-[#43574e] p-3"><Library size={19}/></button><button className="p-3"><NotebookPen size={19}/></button><button className="p-3"><Tags size={19}/></button></nav></aside>
    <section className="ml-16 grid h-screen grid-cols-[18rem_minmax(0,1fr)_19rem]"><LibraryPane books={books} tags={tags} tagFilter={tagFilter} active={active} loading={loading} error={error} onTagFilter={setTagFilter} onSelect={selectBook} onDelete={deleteBook} onUpload={upload}/><ReaderPane book={active} chapter={chapter} html={html} notes={notes.filter((note) => note.chapter_id === chapter?.id)} focusedNoteId={focusedNoteId} pendingAnchor={pendingAnchor} restoreScroll={restoreScroll} locationTitle={locationTitle} locationKey={locationKey} onCreateNote={createNote} onReadingPositionChange={saveReadingPosition} onSelectChapter={(value, anchor, title, key, scrollPosition) => active && openChapter(active, value, anchor, title, key, scrollPosition)}/><NotesPane book={active} notes={notes} tags={tags} onTagsChange={setTags} onBookChange={(book) => { setActive(book); setBooks((current) => current.map((item) => item.id === book.id ? {...item, tags: book.tags} : item)); }} onJump={jumpToNote} onUpdate={updateNote} onDelete={deleteNote}/></section>
  </main>;
}

function LibraryPane({ books, tags, tagFilter, active, loading, error, onTagFilter, onSelect, onDelete, onUpload }: { books: Book[]; tags: Tag[]; tagFilter: string; active: Book | null; loading: boolean; error: string; onTagFilter: (tagId: string) => void; onSelect: (book: Book) => void; onDelete: (book: Book) => void; onUpload: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const [query, setQuery] = useState("");
  const visibleBooks = books.filter((book) => `${book.title} ${book.author || ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <aside className="overflow-y-auto border-r border-[#e9e7df] bg-[#f8f8f4] p-6"><label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-moss px-3 py-3 text-sm font-semibold text-white"><FileUp size={16}/>导入 EPUB<input className="hidden" type="file" accept=".epub,application/epub+zip" onChange={onUpload}/></label><div className="mt-5 flex items-center gap-2 border-b border-[#d9d9d1] pb-2 text-[#9b9b91]"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="搜索书名、作者"/></div><div className="mt-3 flex h-8 items-center gap-2"><Tags size={14} className="shrink-0 text-[#89938b]"/><select aria-label="按标签筛选书籍" value={tagFilter} onChange={(event) => onTagFilter(event.target.value)} className="h-full min-w-0 flex-1 rounded border border-[#dce1da] bg-white px-2 text-xs text-[#617068] outline-none"><option value="">全部书籍</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></div><div className="mt-4 space-y-1">{loading && <p className="flex items-center gap-2 text-sm text-[#85877e]"><LoaderCircle className="animate-spin" size={15}/>加载书库…</p>}{error && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}{!loading && !visibleBooks.length && <p className="pt-8 text-center text-sm leading-6 text-[#85877e]">{tagFilter ? "此标签下暂无书籍。" : query ? "没有匹配的书籍。" : "导入第一本 EPUB，开始建立你的私人书房。"}</p>}{visibleBooks.map((book) => <div key={book.id} className={`group flex gap-3 rounded-lg p-2 ${active?.id === book.id ? "bg-[#e8ede5]" : "hover:bg-[#eff1ed]"}`}><button onClick={() => void onSelect(book)} className="flex min-w-0 flex-1 gap-3 text-left"><BookCover book={book}/><span className="min-w-0"><BookTooltip text={book.title}><strong className="block truncate font-serif text-sm">{book.title}</strong></BookTooltip><BookTooltip text={book.author || "未知作者"}><small className="block truncate text-xs text-[#85877e]">{book.author || "未知作者"}</small></BookTooltip><span className="mt-0.5 flex items-center gap-1"><small className="text-[10px] text-[#85877e]">{book.total_chapters} 节</small>{book.tags?.length ? <BookTooltip text={book.tags.map((tag) => tag.name).join(" · ")}><span className="flex gap-1">{book.tags.slice(0, 3).map((tag) => <i key={tag.id} className="block size-1.5 rounded-full" style={{backgroundColor: tag.color}}/>)}</span></BookTooltip> : null}</span></span></button><button aria-label={`删除 ${book.title}`} onClick={() => void onDelete(book)} className="self-center rounded p-1 text-[#a4a69c] opacity-60 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"><Trash2 size={15}/></button></div>)}</div></aside>;
}

function BookTooltip({ text, children }: { text: string; children: ReactNode }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  return <span className="block" onMouseEnter={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setPosition({ left: rect.left, top: rect.bottom + 7 }); }} onMouseLeave={() => setPosition(null)}>{children}{position && createPortal(<span role="tooltip" className="pointer-events-none fixed z-[9999] w-max max-w-72 rounded-md bg-[#263b33] px-2 py-1.5 text-left text-xs font-normal leading-5 text-white shadow-xl" style={{ left: position.left, top: position.top }}>{text}</span>, document.body)}</span>;
}

function BookCover({ book }: { book: Book }) { return book.cover_url ? <img crossOrigin="anonymous" src={book.cover_url.startsWith("/") ? book.cover_url : `${API_ORIGIN}${book.cover_url}`} alt="" className="h-16 w-11 shrink-0 rounded-sm object-cover shadow-sm"/> : <span className="flex h-16 w-11 shrink-0 flex-col justify-between overflow-hidden rounded-sm bg-[#a95949] p-1.5 text-left text-white shadow-sm"><b className="font-serif text-[12px] leading-[1.1]">{book.title.slice(0, 4)}</b><i className="text-[7px] not-italic opacity-75">EPUB</i></span>; }

function LegacyFloatingTtsPlayer({ getBoundary }: { getBoundary: () => HTMLElement | null }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [segments, setSegments] = useState<TtsSegment[]>([]);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [pendingOffset, setPendingOffset] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loadingTts, setLoadingTts] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState("");
  const sessionRef = useRef<{ bookId: string; chapterId: string; resumeIndex: number; resumeOffset: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const saveAtRef = useRef(0);
  const drag = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const expandedWidth = 248; const expandedHeight = 98; const collapsedSize = 46;
  const reset = () => { const rect = getBoundary()?.getBoundingClientRect(); if (!rect) return; setCollapsed(false); setPosition({x: rect.right - expandedWidth - 20, y: rect.bottom - expandedHeight - 20}); setOpen(true); };
  const expandAtCurrentPosition = () => { const rect = getBoundary()?.getBoundingClientRect(); if (!rect || !position) return; const isRightEdge = position.x + collapsedSize / 2 > rect.left + rect.width / 2; const x = isRightEdge ? position.x + collapsedSize - expandedWidth : position.x; const y = Math.max(rect.top + 8, Math.min(rect.bottom - expandedHeight - 8, position.y)); setPosition({x: Math.max(rect.left + 8, Math.min(rect.right - expandedWidth - 8, x)), y}); setCollapsed(false); };
  const saveTtsPosition = (index: number, offset: number) => { const session = sessionRef.current; if (!session) return; void api.saveTtsProgress(session.bookId, {tts_chapter_id: session.chapterId, tts_paragraph_index: index, tts_char_offset: offset, tts_speed: speed}); };
  const playSegment = (items: TtsSegment[], index: number, offset = 0) => {
    const session = sessionRef.current; const item = items[index]; if (!session || !item) return;
    audioRef.current?.pause(); const audio = new Audio(`${API_ORIGIN}${item.audio_url}`); audio.playbackRate = speed; audioRef.current = audio;
    audio.onloadedmetadata = () => { if (offset && Number.isFinite(audio.duration)) audio.currentTime = audio.duration * Math.min(1, offset / Math.max(1, item.text.length)); };
    audio.onplay = () => setPlaying(true); audio.onpause = () => setPlaying(false);
    audio.ontimeupdate = () => { const now = Date.now(); if (now - saveAtRef.current > 4000 && Number.isFinite(audio.duration)) { saveAtRef.current = now; saveTtsPosition(index, Math.round(item.text.length * audio.currentTime / audio.duration)); } };
    document.dispatchEvent(new CustomEvent("epub-tts-segment", {detail: item.text}));
    audio.onended = () => { const next = index + 1; if (items[next]) { setSegmentIndex(next); setPendingOffset(0); playSegment(items, next); void audioRef.current?.play().catch(() => setPlaying(false)); } else { setPlaying(false); saveTtsPosition(index, item.text.length); } };
    audio.onerror = () => { setPlaying(false); setError("音频加载失败，请重试。") }; setSegmentIndex(index); setError("");
  };
  const togglePlayback = () => { const audio = audioRef.current; if (!audio) { if (segments.length) { playSegment(segments, segmentIndex, pendingOffset); const created = audioRef.current; if (created) void created.play().then(() => setPlaying(true)).catch(() => setError("请再次点击播放开始朗读。")); } return; } if (audio.paused) { void audio.play().then(() => setPlaying(true)).catch(() => setError("请再次点击播放开始朗读。")); } else { audio.pause(); setPlaying(false); } };
  useEffect(() => { const openListener = async (event: Event) => { reset(); const detail = (event as CustomEvent<{bookId?: string; chapterId?: string; resumeIndex?: number; resumeOffset?: number}>).detail; if (!detail?.bookId || !detail.chapterId) return; sessionRef.current = {bookId: detail.bookId, chapterId: detail.chapterId, resumeIndex: detail.resumeIndex || 0, resumeOffset: detail.resumeOffset || 0}; setLoadingTts(true); setError(""); try { const result = await api.tts(detail.bookId, detail.chapterId, speed === 1 ? "+0%" : speed > 1 ? `+${Math.round((speed - 1) * 100)}%` : `${Math.round((speed - 1) * 100)}%`); const index = Math.min(detail.resumeIndex || 0, Math.max(0, result.segments.length - 1)); setSegments(result.segments); setSegmentIndex(index); setPendingOffset(detail.resumeOffset || 0); audioRef.current?.pause(); audioRef.current = null; setPlaying(false); } catch (caught) { setError(caught instanceof Error ? caught.message : "朗读生成失败"); } finally { setLoadingTts(false); } }; const closeListener = () => { audioRef.current?.pause(); document.dispatchEvent(new CustomEvent("epub-tts-segment", {detail: null})); setPlaying(false); setOpen(false); }; document.addEventListener("epub-tts-open", openListener); document.addEventListener("epub-tts-close", closeListener); return () => { document.removeEventListener("epub-tts-open", openListener); document.removeEventListener("epub-tts-close", closeListener); audioRef.current?.pause(); }; });
  useEffect(() => { document.dispatchEvent(new CustomEvent("epub-tts-state", {detail: open})); }, [open]);
  useEffect(() => {
    if (!open || collapsed) return;
    const timer = window.setTimeout(() => {
      const player = document.querySelector<HTMLElement>('div[class*="z-[9998]"]'); const buttons = player?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons || buttons.length < 3) return;
      const close = buttons[0]; const play = buttons[1]; const rate = buttons[2];
      const onClose = () => { audioRef.current?.pause(); setPlaying(false); };
      const onRate = () => { const next = speed >= 1.5 ? 0.8 : speed === 1 ? 1.25 : speed === 1.25 ? 1.5 : 1; setSpeed(next); if (audioRef.current) audioRef.current.playbackRate = next; rate.textContent = `${next}×`; };
      close.onclick = onClose; play.onclick = null; rate.onclick = onRate;
      const status = player?.querySelectorAll<HTMLParagraphElement>("p")[0];
      if (status) { status.textContent = loadingTts ? "正在生成本章语音…" : error || (playing ? `正在朗读第 ${segmentIndex + 1} 段` : segments.length ? `可播放 · 第 ${segmentIndex + 1} 段` : "准备朗读当前章节"); const fullText = status.textContent || ""; status.onmouseenter = () => { if (status.scrollWidth <= status.clientWidth && fullText.length < 24) return; const rect = status.getBoundingClientRect(); const tip = document.createElement("div"); tip.id = "tts-status-tooltip"; tip.textContent = fullText; tip.className = "pointer-events-none fixed z-[10002] max-w-80 rounded-md bg-[#263b33] px-2.5 py-2 text-xs leading-5 text-white shadow-xl"; tip.style.left = `${rect.left}px`; tip.style.top = `${rect.top - 8}px`; tip.style.transform = "translateY(-100%)"; document.body.appendChild(tip); }; status.onmouseleave = () => document.getElementById("tts-status-tooltip")?.remove(); }
      play.setAttribute("aria-label", playing ? "暂停朗读" : "开始朗读"); play.textContent = playing ? "Ⅱ" : "▶"; play.className = "grid size-8 place-items-center rounded-full bg-[#40584d] text-sm font-semibold text-white"; rate.textContent = `${speed}×`;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, collapsed, segments, segmentIndex, playing, speed, loadingTts, error]);
  useEffect(() => {
    const capturePlayClick = (event: MouseEvent) => { const player = document.querySelector<HTMLElement>('div[class*="z-[9998]"]'); const target = event.target instanceof Element ? event.target.closest("button") : null; const buttons = player?.querySelectorAll<HTMLButtonElement>("button"); if (!target || !buttons || target !== buttons[1]) return; event.preventDefault(); event.stopPropagation(); togglePlayback(); };
    document.addEventListener("click", capturePlayClick, true); return () => document.removeEventListener("click", capturePlayClick, true);
  }, [open, collapsed, segments, segmentIndex, pendingOffset, playing]);
  useEffect(() => {
    const move = (event: PointerEvent) => { if (!drag.current) return; const rect = getBoundary()?.getBoundingClientRect(); if (!rect) return; const width = collapsed ? collapsedSize : expandedWidth; const height = collapsed ? collapsedSize : expandedHeight; const x = Math.max(rect.left + 8, Math.min(rect.right - width - 8, event.clientX - drag.current.offsetX)); const y = Math.max(rect.top + 8, Math.min(rect.bottom - height - 8, event.clientY - drag.current.offsetY)); setPosition({x, y}); };
    const stop = () => { if (!drag.current || !position) { drag.current = null; return; } const rect = getBoundary()?.getBoundingClientRect(); drag.current = null; if (!rect) return; const width = collapsed ? collapsedSize : expandedWidth; const nearLeft = position.x - rect.left < 28; const nearRight = rect.right - (position.x + width) < 28; if (nearLeft || nearRight) { setCollapsed(true); setPosition({x: nearLeft ? rect.left + 8 : rect.right - collapsedSize - 8, y: Math.max(rect.top + 8, Math.min(rect.bottom - collapsedSize - 8, position.y))}); } };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
  }, [collapsed, position]);
  if (!open || !position) return null;
  return createPortal(<div className={`fixed z-[9998] select-none rounded-xl border border-[#d8dfd8] bg-[#fffdf8] shadow-xl transition-[width,height,transform] duration-150 ${collapsed ? "grid place-items-center" : "w-[248px] p-3"}`} style={{left: position.x, top: position.y, width: collapsed ? collapsedSize : undefined, height: collapsed ? collapsedSize : undefined}}>{collapsed ? <button aria-label="展开朗读控制" onClick={expandAtCurrentPosition} className="grid size-full place-items-center rounded-xl text-[#40584d] hover:bg-[#edf1ec]"><Volume2 size={19}/></button> : <><div onPointerDown={(event) => { drag.current = {offsetX: event.clientX - position.x, offsetY: event.clientY - position.y}; }} className="flex cursor-grab items-center justify-between border-b border-[#ecece6] pb-2 active:cursor-grabbing"><span className="text-xs font-semibold text-[#40584d]">朗读本章</span><button aria-label="收起朗读控制" onClick={() => setOpen(false)} className="rounded p-0.5 text-[#7f8881] hover:bg-[#eef1ed]"><X size={15}/></button></div><div className="mt-3 flex items-center gap-2"><button className="grid size-8 place-items-center rounded-full bg-[#40584d] text-white"><Play size={14} fill="currentColor"/></button><div className="min-w-0 flex-1"><p className="truncate text-xs text-[#46534b]">准备朗读当前章节</p><p className="mt-0.5 text-[10px] text-[#929a92]">将自动略过图片内容</p></div><button className="rounded-md border border-[#dde2dc] px-2 py-1 text-[10px] text-[#5d6c63]">1×</button></div></>}</div>, document.body);
}

function FloatingTtsPlayer({ getBoundary, sessionKey, onOpenChange }: { getBoundary: () => HTMLElement | null; sessionKey: string; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [segments, setSegments] = useState<TtsSegment[]>([]);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [resumeOffset, setResumeOffset] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [rateOpen, setRateOpen] = useState(false);
  const [message, setMessage] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // onended 属于创建音频当时的回调；用 ref 读取最新倍速，避免换段后回到旧速度。
  const speedRef = useRef(1);
  const sessionRef = useRef<{ bookId: string; chapterId: string } | null>(null);
  const lastProgressRef = useRef<{ bookId: string; chapterId: string; index: number; offset: number; speed: number } | null>(null);
  const ttsCacheRef = useRef(new Map<string, TtsSegment[]>());
  const requestTokenRef = useRef(0);
  const saveAtRef = useRef(0);
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const rateMenuRef = useRef<HTMLDivElement>(null);
  const width = 292; const height = 98; const collapsedSize = 46;

  const persist = (index: number, offset: number) => {
    const session = sessionRef.current;
    if (!session) return;
    lastProgressRef.current = { ...session, index, offset, speed: speedRef.current };
    void api.saveTtsProgress(session.bookId, { tts_chapter_id: session.chapterId, tts_paragraph_index: index, tts_char_offset: offset, tts_speed: speedRef.current });
  };
  const resetPosition = () => {
    const rect = getBoundary()?.getBoundingClientRect();
    if (!rect) return;
    const stored = window.localStorage.getItem("epub-reader:tts-position");
    const saved = stored ? JSON.parse(stored) as { x?: number; y?: number; collapsed?: boolean } : null;
    const isCollapsed = Boolean(saved?.collapsed);
    const playerWidth = isCollapsed ? collapsedSize : width; const playerHeight = isCollapsed ? collapsedSize : height;
    setPosition({ x: Math.max(rect.left + 8, Math.min(rect.right - playerWidth - 8, saved?.x ?? rect.right - width - 20)), y: Math.max(rect.top + 8, Math.min(rect.bottom - playerHeight - 8, saved?.y ?? rect.bottom - height - 20)) });
    setCollapsed(isCollapsed);
  };
  const playSegment = (items: TtsSegment[], index: number, offset = 0) => {
    const item = items[index];
    if (!item) return null;
    audioRef.current?.pause();
    const audio = new Audio(`${API_ORIGIN}${item.audio_url}`);
    audio.preload = "auto";
    audio.playbackRate = speedRef.current;
    audioRef.current = audio;
    setSegmentIndex(index);
    setResumeOffset(offset);
    audio.onloadedmetadata = () => {
      if (offset && Number.isFinite(audio.duration)) audio.currentTime = audio.duration * Math.min(1, offset / Math.max(1, item.text.length));
    };
    audio.onplay = () => {
      setPlaying(true);
      setMessage("");
      document.dispatchEvent(new CustomEvent("epub-tts-segment", { detail: item.text }));
    };
    audio.onpause = () => setPlaying(false);
    audio.ontimeupdate = () => {
      if (!Number.isFinite(audio.duration)) return;
      const offsetNow = Math.round(item.text.length * audio.currentTime / audio.duration);
      setResumeOffset(offsetNow);
      if (Date.now() - saveAtRef.current > 3500) { saveAtRef.current = Date.now(); persist(index, offsetNow); }
    };
    audio.onerror = () => { setPlaying(false); setMessage("音频加载失败，请点击播放重试。"); };
    audio.onended = () => {
      persist(index, item.text.length);
      const next = index + 1;
      if (!items[next]) { setPlaying(false); return; }
      const nextAudio = playSegment(items, next, 0);
      if (nextAudio) void nextAudio.play().catch(() => setMessage("下一段等待播放，请点击开始继续。"));
    };
    return audio;
  };
  const togglePlayback = () => {
    if (!segments.length || loading) return;
    const audio = audioRef.current;
    if (!audio) {
      const created = playSegment(segments, segmentIndex, resumeOffset);
      if (created) void created.play().catch(() => setMessage("浏览器阻止了播放，请再次点击开始朗读。"));
      return;
    }
    if (audio.paused) void audio.play().catch(() => setMessage("浏览器阻止了播放，请再次点击开始朗读。"));
    else { audio.pause(); persist(segmentIndex, resumeOffset); }
  };
  const switchSegment = (delta: -1 | 1) => {
    const nextIndex = segmentIndex + delta;
    if (loading || nextIndex < 0 || nextIndex >= segments.length) return;
    const wasPlaying = Boolean(audioRef.current && !audioRef.current.paused);
    persist(segmentIndex, resumeOffset);
    const nextAudio = playSegment(segments, nextIndex, 0);
    document.dispatchEvent(new CustomEvent("epub-tts-segment", { detail: segments[nextIndex].text }));
    if (wasPlaying && nextAudio) void nextAudio.play().catch(() => setMessage("切换成功，请点击开始继续朗读。"));
  };
  const setPlaybackRate = (next: number) => {
    const rate = Math.max(0.5, Math.min(2, Math.round(next * 10) / 10));
    speedRef.current = rate; setSpeed(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
    persist(segmentIndex, resumeOffset);
  };
  const close = () => {
    requestTokenRef.current += 1;
    audioRef.current?.pause();
    persist(segmentIndex, resumeOffset);
    document.dispatchEvent(new CustomEvent("epub-tts-segment", { detail: null }));
    setPlaying(false);
    setOpen(false);
  };

  useEffect(() => {
    const openListener = async (event: Event) => {
      const detail = (event as CustomEvent<{ bookId?: string; chapterId?: string; resumeIndex?: number; resumeOffset?: number; resumeSpeed?: number }>).detail;
      if (!detail?.bookId || !detail.chapterId) return;
      audioRef.current?.pause(); audioRef.current = null;
      const requestToken = ++requestTokenRef.current;
      const inMemory = lastProgressRef.current?.bookId === detail.bookId && lastProgressRef.current?.chapterId === detail.chapterId ? lastProgressRef.current : null;
      sessionRef.current = { bookId: detail.bookId, chapterId: detail.chapterId };
      const restoredSpeed = inMemory?.speed || (detail.resumeSpeed && detail.resumeSpeed >= 0.5 && detail.resumeSpeed <= 2 ? detail.resumeSpeed : 1);
      speedRef.current = restoredSpeed; setSpeed(restoredSpeed);
      resetPosition(); setOpen(true); setLoading(true); setPlaying(false); setMessage(""); setSegments([]);
      try {
        const rate = speedRef.current === 1 ? "+0%" : speedRef.current > 1 ? `+${Math.round((speedRef.current - 1) * 100)}%` : `${Math.round((speedRef.current - 1) * 100)}%`;
        const cacheKey = `${detail.bookId}:${detail.chapterId}:${rate}`;
        const cached = ttsCacheRef.current.get(cacheKey);
        const result = cached ? { segments: cached } : await api.tts(detail.bookId, detail.chapterId, rate);
        if (requestToken !== requestTokenRef.current) return;
        if (!cached) ttsCacheRef.current.set(cacheKey, result.segments);
        const nextIndex = Math.min(inMemory?.index ?? detail.resumeIndex ?? 0, Math.max(0, result.segments.length - 1));
        setSegments(result.segments); setSegmentIndex(nextIndex); setResumeOffset(inMemory?.offset ?? detail.resumeOffset ?? 0);
        if (!result.segments.length) setMessage("本章没有可朗读的正文。");
      } catch (caught) { if (requestToken === requestTokenRef.current) setMessage(caught instanceof Error ? caught.message : "朗读生成失败，请重试。"); }
      finally { if (requestToken === requestTokenRef.current) setLoading(false); }
    };
    document.addEventListener("epub-tts-open", openListener);
    document.addEventListener("epub-tts-close", close);
    return () => { document.removeEventListener("epub-tts-open", openListener); document.removeEventListener("epub-tts-close", close); audioRef.current?.pause(); };
  }, []);
  useEffect(() => { document.dispatchEvent(new CustomEvent("epub-tts-state", { detail: open })); onOpenChange?.(open); }, [open, onOpenChange]);
  useEffect(() => {
    if (!rateOpen) return;
    const rateRoot = rateMenuRef.current || document.querySelector<HTMLButtonElement>('[aria-label="调节朗读倍速"]')?.parentElement;
    const closeOnOutsidePointer = (event: MouseEvent) => { if (!rateRoot?.contains(event.target as Node)) setRateOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setRateOpen(false); };
    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", closeOnOutsidePointer); document.removeEventListener("keydown", closeOnEscape); };
  }, [rateOpen]);
  // 书籍或章节切换时由主 React 树统一停止播放器，避免嵌套 root 在渲染中卸载。
  useEffect(() => {
    requestTokenRef.current += 1;
    audioRef.current?.pause(); audioRef.current = null;
    document.dispatchEvent(new CustomEvent("epub-tts-segment", { detail: null }));
    setPlaying(false); setOpen(false); setRateOpen(false); setSegments([]); setMessage("");
  }, [sessionKey]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragRef.current) return;
      const rect = getBoundary()?.getBoundingClientRect(); if (!rect) return;
      const playerWidth = collapsed ? collapsedSize : width; const playerHeight = collapsed ? collapsedSize : height;
      setPosition({ x: Math.max(rect.left + 8, Math.min(rect.right - playerWidth - 8, event.clientX - dragRef.current.offsetX)), y: Math.max(rect.top + 8, Math.min(rect.bottom - playerHeight - 8, event.clientY - dragRef.current.offsetY)) });
    };
    const stop = () => {
      if (!dragRef.current || !position) { dragRef.current = null; return; }
      dragRef.current = null;
      const rect = getBoundary()?.getBoundingClientRect(); if (!rect) return;
      const playerWidth = collapsed ? collapsedSize : width;
      const nearLeft = position.x - rect.left < 28; const nearRight = rect.right - (position.x + playerWidth) < 28;
      const nextCollapsed = nearLeft || nearRight;
      const next = nextCollapsed ? { x: nearLeft ? rect.left + 8 : rect.right - collapsedSize - 8, y: Math.max(rect.top + 8, Math.min(rect.bottom - collapsedSize - 8, position.y)) } : position;
      setCollapsed(nextCollapsed); setPosition(next); window.localStorage.setItem("epub-reader:tts-position", JSON.stringify({ ...next, collapsed: nextCollapsed }));
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
  }, [collapsed, position]);
  if (!open || !position) return null;
  const status = loading ? "正在生成本章语音…" : message || (playing ? `正在朗读第 ${segmentIndex + 1} 段` : segments.length ? `可播放 · 第 ${segmentIndex + 1} 段` : "准备朗读当前章节");
  return createPortal(<div className={`fixed z-[9998] select-none rounded-xl border border-[#d8dfd8] bg-[#fffdf8] shadow-xl ${collapsed ? "grid place-items-center" : "w-[292px] p-3"}`} style={{ left: position.x, top: position.y, width: collapsed ? collapsedSize : undefined, height: collapsed ? collapsedSize : undefined }}>
    {collapsed ? <button aria-label="展开朗读控制" onClick={() => { setCollapsed(false); const rect = getBoundary()?.getBoundingClientRect(); if (!rect) return; const x = position.x + collapsedSize / 2 > rect.left + rect.width / 2 ? position.x + collapsedSize - width : position.x; const next = { x: Math.max(rect.left + 8, Math.min(rect.right - width - 8, x)), y: Math.max(rect.top + 8, Math.min(rect.bottom - height - 8, position.y)) }; setPosition(next); window.localStorage.setItem("epub-reader:tts-position", JSON.stringify({ ...next, collapsed: false })); }} className="grid size-full place-items-center rounded-xl text-[#40584d] hover:bg-[#edf1ec]"><Volume2 size={19}/></button> : <><div onPointerDown={(event) => { dragRef.current = { offsetX: event.clientX - position.x, offsetY: event.clientY - position.y }; }} className="flex cursor-grab items-center justify-between border-b border-[#ecece6] pb-2 active:cursor-grabbing"><span className="text-xs font-semibold text-[#40584d]">朗读本章</span><button aria-label="关闭朗读控制" onClick={close} className="rounded p-0.5 text-[#7f8881] hover:bg-[#eef1ed]"><X size={15}/></button></div>
    <div className="mt-3 flex items-center gap-1.5"><button aria-label="上一段" title="上一段" onClick={() => switchSegment(-1)} disabled={loading || segmentIndex === 0} className="grid size-6 shrink-0 place-items-center rounded text-sm text-[#526158] hover:bg-[#edf1ec] disabled:opacity-35">‹</button><button aria-label={playing ? "暂停朗读" : "开始朗读"} onClick={togglePlayback} disabled={loading || !segments.length} className="grid size-8 shrink-0 place-items-center rounded-full bg-[#40584d] text-sm font-semibold text-white disabled:opacity-45">{playing ? "Ⅱ" : "▶"}</button><button aria-label="下一段" title="下一段" onClick={() => switchSegment(1)} disabled={loading || segmentIndex >= segments.length - 1} className="grid size-6 shrink-0 place-items-center rounded text-sm text-[#526158] hover:bg-[#edf1ec] disabled:opacity-35">›</button><div className="min-w-0 flex-1"><p title={status} className="truncate text-xs text-[#46534b]">{status}</p><p className="mt-0.5 text-[10px] text-[#929a92]">将自动略过图片内容</p></div><div className="relative"><button aria-label="调节朗读倍速" onClick={() => setRateOpen((value) => !value)} className={`rounded-md border px-2 py-1 text-[10px] ${rateOpen ? "border-[#7a9785] bg-[#edf3ed] text-[#365342]" : "border-[#dde2dc] text-[#5d6c63]"}`}>{speed.toFixed(1)}×</button>{rateOpen && <div className="absolute bottom-[calc(100%+8px)] right-0 z-10 w-56 rounded-xl border border-[#d9e1d9] bg-[#fffdf8] p-3 shadow-xl"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-[#40584d]">朗读倍速</span><strong className="text-sm text-[#2f4e3c]">{speed.toFixed(1)}×</strong></div><input aria-label="朗读倍速滑杆" type="range" min="0.5" max="2" step="0.1" value={speed} onChange={(event) => setPlaybackRate(Number(event.target.value))} className="h-1.5 w-full cursor-pointer accent-[#4c705c]"/><div className="mt-1 flex justify-between text-[10px] text-[#91998f]"><span>0.5×</span><span>1.0×</span><span>1.5×</span><span>2.0×</span></div><div className="mt-3 grid grid-cols-4 gap-1">{[0.8, 1, 1.2, 1.5].map((rate) => <button key={rate} onClick={() => setPlaybackRate(rate)} className={`rounded py-1 text-[10px] ${speed === rate ? "bg-[#40584d] text-white" : "bg-[#f0f3ef] text-[#5f6d64] hover:bg-[#e3eae3]"}`}>{rate.toFixed(1)}×</button>)}</div></div>}</div></div></>}
  </div>, document.body);
}

function ReaderPane({ book, chapter, html, notes, focusedNoteId, pendingAnchor, restoreScroll, locationTitle, locationKey, onCreateNote, onReadingPositionChange, onSelectChapter }: { book: Book | null; chapter: Chapter | null; html: string; notes: Note[]; focusedNoteId: string | null; pendingAnchor: string | null; restoreScroll: number; locationTitle: string; locationKey: string; onCreateNote: (selection: { selected_text: string; start_offset: number; end_offset: number }, userNote?: string | null) => Promise<void>; onReadingPositionChange: (chapterId: string, scrollPosition: number) => void; onSelectChapter: (chapter: Chapter, anchor?: string | null, title?: string, key?: string, scrollPosition?: number) => void }) {
  const readerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isPagingRef = useRef(false);
  const jumpMenuRef = useRef<HTMLDivElement>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [ttsOpen, setTtsOpen] = useState(false);
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [returnBookmark, setReturnBookmark] = useState<{ chapter: Chapter; title: string; key: string; scrollTop: number; savedAt: Date } | null>(null);
  const [returnBookmarkExpanded, setReturnBookmarkExpanded] = useState(true);
  const returnBookmarkTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const returnBookmarkRootRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const returnBookmarkHostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => { void api.modelSettings().then((value) => { if (!cancelled) setModelReady(value.has_api_key); }).catch(() => { if (!cancelled) setModelReady(false); }); };
    const onModelSettingsUpdated = (event: Event) => { if (!cancelled) setModelReady(Boolean((event as CustomEvent<ModelSettings>).detail?.has_api_key)); };
    refresh();
    window.addEventListener("dudu:model-settings-updated", onModelSettingsUpdated);
    return () => { cancelled = true; window.removeEventListener("dudu:model-settings-updated", onModelSettingsUpdated); };
  }, []);
  const resetReturnBookmarkTimer = () => {
    if (returnBookmarkTimerRef.current) window.clearTimeout(returnBookmarkTimerRef.current);
    returnBookmarkTimerRef.current = window.setTimeout(() => setReturnBookmarkExpanded(false), 5000);
  };
  const toggleReturnBookmark = () => {
    const reader = readerRef.current;
    if (!chapter || !reader) return;
    setReturnBookmarkExpanded(true);
    resetReturnBookmarkTimer();
    if (returnBookmark) {
      const destination = returnBookmark;
      setReturnBookmark(null);
      onSelectChapter(destination.chapter, null, destination.title, destination.key, destination.scrollTop);
      return;
    }
    setReturnBookmark({ chapter, title: locationTitle || chapter.display_title, key: locationKey || `${chapter.id}:top`, scrollTop: reader.scrollTop, savedAt: new Date() });
  };
  useEffect(() => {
    setReturnBookmark(null);
    setReturnBookmarkExpanded(true);
  }, [book?.id]);
  useEffect(() => {
    if (returnBookmarkExpanded) resetReturnBookmarkTimer();
    return () => { if (returnBookmarkTimerRef.current) window.clearTimeout(returnBookmarkTimerRef.current); };
  }, [returnBookmarkExpanded, returnBookmark]);
  useEffect(() => {
    const host = readerRef.current?.parentElement;
    if (!host || !book) return;
    const container = document.createElement("div");
    container.className = "reader-return-sticky-host";
    host.appendChild(container);
    returnBookmarkHostRef.current = container;
    returnBookmarkRootRef.current = createRoot(container);
    return () => {
      returnBookmarkRootRef.current?.unmount();
      returnBookmarkRootRef.current = null;
      returnBookmarkHostRef.current = null;
      container.remove();
    };
  }, [book?.id]);
  useEffect(() => {
    const root = returnBookmarkRootRef.current;
    if (!root || !book) return;
    const savedAt = returnBookmark?.savedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    root.render(<div className={`reader-return-sticky ${returnBookmarkExpanded ? "reader-return-sticky--expanded" : "reader-return-sticky--collapsed"}`}>
      {returnBookmarkExpanded ? <button type="button" onClick={toggleReturnBookmark} className={`reader-return-sticky__note ${returnBookmark ? "reader-return-sticky__note--saved" : ""}`} title={returnBookmark ? "返回刚才暂存的阅读位置（使用后自动清除）" : "暂存当前阅读位置，之后可一键返回"}>
        <Bookmark size={15} strokeWidth={2.2}/><span className="reader-return-sticky__copy"><small>{returnBookmark ? `已暂存 · ${savedAt}` : "一次性回位"}</small><strong>{returnBookmark ? "返回暂存位置" : "保存当前位置"}</strong></span>
      </button> : <button type="button" aria-label={returnBookmark ? "展开一次性回位：已有暂存位置" : "展开一次性回位"} title={returnBookmark ? "已暂存位置，点击展开后返回" : "展开一次性回位"} onClick={() => { setReturnBookmarkExpanded(true); resetReturnBookmarkTimer(); }} className={`reader-return-sticky__icon ${returnBookmark ? "reader-return-sticky__icon--saved" : ""}`}><Bookmark size={15}/></button>}
    </div>);
  }, [book?.id, returnBookmark, returnBookmarkExpanded, chapter?.id, locationKey]);
  const clearPageTurnHighlight = () => contentRef.current?.querySelectorAll("mark[data-page-turn-anchor]").forEach((mark) => mark.replaceWith(...Array.from(mark.childNodes)));
  const capturePageTurnAnchor = (direction: 1 | -1) => {
    const reader = readerRef.current; const content = contentRef.current; if (!reader || !content) return;
    const readerRect = reader.getBoundingClientRect(); let node: Node | null;
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const isVisible = (textNode: Text, start: number, end: number) => { const range = document.createRange(); range.setStart(textNode, start); range.setEnd(textNode, end); const rect = range.getBoundingClientRect(); return rect.bottom > readerRect.top + 24 && rect.top < readerRect.bottom - 24; };
    const nodes: Text[] = []; while ((node = walker.nextNode())) if (!node.parentElement?.closest("mark[data-page-turn-anchor]") && node.textContent?.trim()) nodes.push(node as Text);
    // 向后翻：取离开视口的最后一个可见字；向前翻：取离开视口的第一个可见字。
    for (const textNode of direction === 1 ? [...nodes].reverse() : nodes) { const text = textNode.textContent || ""; const offsets = Array.from({ length: text.length }, (_, index) => index); if (direction === 1) offsets.reverse(); for (const offset of offsets) { if (/\s/.test(text[offset]) || !isVisible(textNode, offset, offset + 1)) continue; const range = document.createRange(); const start = direction === 1 ? Math.max(0, offset - 2) : offset; const end = direction === 1 ? offset + 1 : Math.min(text.length, offset + 3); range.setStart(textNode, start); range.setEnd(textNode, end); return range; } }
  };
  const turnPage = (direction: 1 | -1) => { const reader = readerRef.current; if (!reader) return; isPagingRef.current = true; clearPageTurnHighlight(); const anchor = capturePageTurnAnchor(direction); reader.scrollBy({ top: reader.clientHeight * direction * 0.86, behavior: "smooth" }); let previous = reader.scrollTop; let stableFrames = 0; const wait = () => { const current = reader.scrollTop; stableFrames = Math.abs(current - previous) < .5 ? stableFrames + 1 : 0; previous = current; if (stableFrames < 3) return window.requestAnimationFrame(wait); if (anchor) { const marker = document.createElement("mark"); marker.dataset.pageTurnAnchor = "true"; try { anchor.surroundContents(marker); } catch { /* 页面内容已更新时不显示定位提示 */ } } isPagingRef.current = false; }; window.requestAnimationFrame(wait); };
  useEffect(() => { if (contentRef.current) renderNoteHighlights(contentRef.current, notes); }, [html, notes]);
  useEffect(() => { const listener = (event: Event) => { const content = contentRef.current; if (!content) return; const mark = renderTtsHighlight(content, (event as CustomEvent<string | null>).detail); const reader = readerRef.current; if (mark && reader) reader.scrollTo({top: mark.getBoundingClientRect().top - reader.getBoundingClientRect().top + reader.scrollTop - reader.clientHeight * .38, behavior: "smooth"}); }; document.addEventListener("epub-tts-segment", listener); return () => document.removeEventListener("epub-tts-segment", listener); }, [html]);
  useEffect(() => {
    if (!focusedNoteId || !readerRef.current || !contentRef.current) return;
    const mark = contentRef.current.querySelector<HTMLElement>(`mark[data-annotation-id="${window.CSS.escape(focusedNoteId)}"]`);
    if (mark) readerRef.current.scrollTo({ top: mark.getBoundingClientRect().top - readerRef.current.getBoundingClientRect().top + readerRef.current.scrollTop - 80, behavior: "smooth" });
  }, [focusedNoteId, html, notes]);
  useEffect(() => {
    const reader = readerRef.current; const content = contentRef.current; if (!reader || !content) return;
    clearPageTurnHighlight();
    const escaped = pendingAnchor && window.CSS?.escape ? window.CSS.escape(pendingAnchor) : pendingAnchor;
    const target = escaped ? content.querySelector<HTMLElement>(`#${escaped}, [name="${escaped}"]`) : null;
    if (target) reader.scrollTo({ top: target.getBoundingClientRect().top - reader.getBoundingClientRect().top + reader.scrollTop - 18, behavior: "smooth" });
    else reader.scrollTo({ top: restoreScroll });
  }, [chapter?.id, html, pendingAnchor, locationKey, restoreScroll]);
  useEffect(() => {
    if (!jumpOpen) return;
    const closeOnOutsidePointer = (event: MouseEvent) => { if (!jumpMenuRef.current?.contains(event.target as Node)) setJumpOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setJumpOpen(false); };
    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", closeOnOutsidePointer); document.removeEventListener("keydown", closeOnEscape); };
  }, [jumpOpen]);
  useEffect(() => {
    const reader = readerRef.current;
    const header = reader?.previousElementSibling as HTMLElement | null;
    const speaker = header?.querySelectorAll<HTMLButtonElement>("div:last-child > button")[2];
    const legacyToolbar = reader?.querySelector<HTMLElement>(".mb-4");
    if (legacyToolbar) legacyToolbar.style.display = "none";
    if (!speaker) return;
    const click = () => toggleTts();
    speaker.setAttribute("aria-label", ttsOpen ? "关闭朗读功能" : "开启朗读功能");
    speaker.setAttribute("title", ttsOpen ? "关闭朗读功能" : "开启朗读功能");
    speaker.classList.toggle("bg-[#eaf0e9]", ttsOpen);
    speaker.classList.toggle("text-[#2f5940]", ttsOpen);
    speaker.addEventListener("click", click);
    return () => speaker.removeEventListener("click", click);
  }, [book?.id, chapter?.id, ttsOpen]);
  if (!book) return <><section className="grid place-items-center bg-paper"><div className="text-center text-[#85877e]"><BookOpen className="mx-auto mb-4" size={34}/><p className="font-serif text-lg">从书架选择一本书开始阅读</p></div></section><FloatingTtsPlayer getBoundary={() => readerRef.current} sessionKey="empty"/></>;
  const targets = navigationTargets(book.toc || [], book.chapters || []);
  const title = locationTitle || chapter?.display_title || "选择章节";
  const ttsProgress = book.progress;
  const selectTarget = (target: NavigationTarget) => onSelectChapter(target.chapter, target.anchor, target.title, target.key);
  const toggleTts = () => {
    if (ttsOpen) { document.dispatchEvent(new Event("epub-tts-close")); return; }
    document.dispatchEvent(new CustomEvent("epub-tts-open", { detail: { bookId: book.id, chapterId: chapter?.id, resumeIndex: ttsProgress && ttsProgress.tts_chapter_id === chapter?.id ? ttsProgress.tts_paragraph_index : 0, resumeOffset: ttsProgress && ttsProgress.tts_chapter_id === chapter?.id ? ttsProgress.tts_char_offset : 0, resumeSpeed: ttsProgress?.tts_speed } }));
  };
  const captureSelection = () => {
    const selection = window.getSelection(); const content = contentRef.current;
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !content) { setSelectionDraft(null); return; }
    const range = selection.getRangeAt(0);
    if (!content.contains(range.commonAncestorContainer)) { setSelectionDraft(null); return; }
    const raw = range.toString(); const text = raw.trim(); if (!text) { setSelectionDraft(null); return; }
    const prefix = document.createRange(); prefix.selectNodeContents(content); prefix.setEnd(range.startContainer, range.startOffset);
    const leading = raw.length - raw.trimStart().length; const start = prefix.toString().length + leading;
    const rect = range.getBoundingClientRect();
    setSelectionDraft({ selected_text: text, start_offset: start, end_offset: start + text.length, left: Math.max(12, Math.min(window.innerWidth - 190, rect.left + rect.width / 2 - 90)), top: Math.max(12, rect.top - 48) });
  };
  const commitSelection = async (withNote: boolean) => {
    if (!selectionDraft) return;
    const userNote = withNote ? await promptAppDialog("添加备注", "你的备注", "", "写下你的理解、问题或行动项…") : null;
    if (withNote && userNote === null) return;
    await onCreateNote(selectionDraft, userNote);
    window.getSelection()?.removeAllRanges(); setSelectionDraft(null);
  };
  const askSelection = async (scope: "selection" | "book") => {
    if (!selectionDraft || !book || !chapter) return;
    if (!modelReady) { await showAppDialog({title: "请先配置 DeepSeek", description: "尚未检测到 DeepSeek API Key。请点击左下角设置图标，填写并保存密钥后再发起 AI 追问。", confirmLabel: "知道了"}); return; }
    if (scope === "book") {
      const status = await api.ragStatus(book.id);
      if (status.status !== "digested") { await showAppDialog({title: "请先投喂本书", description: "AI 全书追问需要先完成全书索引。", confirmLabel: "知道了"}); return; }
    }
    const question = (await promptAppDialog(scope === "book" ? "AI 全书追问" : "AI 追问", "你的问题（最多 1,000 字）", "", "例如：作者在这段话中想说明什么？", true))?.trim();
    if (!question) return;
    if (question.length > 1000) { await showAppDialog({title: "问题过长", description: "一次 AI 追问最多支持 1,000 个字。", confirmLabel: "知道了"}); return; }
    const selectedText = selectionDraft.selected_text.slice(0, 2000);
    await api.ask(book.id, {question, chapter_id: chapter.id, selected_text: selectedText, scope});
    window.dispatchEvent(new CustomEvent("dudu:questions-updated", {detail: {bookId: book.id}}));
    await showAppDialog({title: "问题已保存", description: "本次将使用最多 2,000 字选文、约 4,000 字全书上下文；模型回答最多 800 Token。问答记录已按时间保存。", confirmLabel: "知道了"});
    window.getSelection()?.removeAllRanges(); setSelectionDraft(null);
  };
  return <><section className="relative grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden"><header className="flex min-w-0 items-start gap-3 border-b border-[#f0eee8] bg-paper px-7 py-2.5"><button aria-label="打开目录" onClick={() => setTocOpen(true)} className="mt-0.5 shrink-0 rounded-md p-2 hover:bg-[#f2f1ec]"><Menu size={18}/></button><div className="min-w-0 flex-1"><p title={`${book.title} - ${book.author || "未知作者"}`} className="truncate text-base font-semibold leading-6">{book.title} - {book.author || "未知作者"}</p><div className="flex items-start gap-2"><span className="mt-0.5 shrink-0 text-xs text-[#92968d]">当前章节</span><strong title={title} className="whitespace-normal break-words font-serif text-sm font-medium leading-5">{title}</strong></div></div><div className="mt-0.5 flex shrink-0 gap-1"><button aria-label="上一页" onClick={() => turnPage(-1)} className="rounded-md p-2 hover:bg-[#f2f1ec]"><ChevronLeft size={18}/></button><button aria-label="下一页" onClick={() => turnPage(1)} className="rounded-md p-2 hover:bg-[#f2f1ec]"><ChevronRight size={18}/></button><button className="rounded-md p-2 hover:bg-[#f2f1ec]"><Volume2 size={18}/></button></div></header><article ref={readerRef} onMouseUp={() => window.setTimeout(captureSelection, 0)} onScroll={(event) => { if (!isPagingRef.current) clearPageTurnHighlight(); if (chapter) onReadingPositionChange(chapter.id, event.currentTarget.scrollTop); }} className="min-h-0 overflow-y-auto overscroll-contain bg-paper px-14 py-7"><div className="mx-auto w-full max-w-3xl"><div className="mb-4 flex items-center justify-end gap-3"><button onClick={toggleTts} className="rounded border border-[#cfd9d0] bg-[#f8fbf7] px-3 py-1.5 text-xs font-medium text-[#40584d] hover:bg-[#eaf0e9]">朗读功能：{ttsOpen ? "开" : "关"}</button><div ref={jumpMenuRef} className="relative shrink-0"><button aria-label="切换章节" aria-expanded={jumpOpen} onClick={() => targets.length > 1 && setJumpOpen((open) => !open)} className={`flex items-center gap-2 rounded border border-[#e5e4dc] bg-white px-3 py-1.5 text-xs ${targets.length > 1 ? "hover:border-[#b7c2b8]" : "cursor-default text-[#747a72]"}`}><span>选择章节</span>{targets.length > 1 && <ChevronDown size={14}/>}</button>{jumpOpen && <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-30 max-h-72 w-80 overflow-y-auto rounded-lg border border-[#dfe4dc] bg-white p-1 shadow-xl">{targets.map((target) => <button key={target.key} role="menuitem" onClick={() => { selectTarget(target); setJumpOpen(false); }} className={`block w-full truncate rounded-md py-2 pr-3 text-left text-xs ${target.key === locationKey ? "bg-[#e8eee6] font-medium text-[#294137]" : "text-[#45534b] hover:bg-[#f0f3ef]"}`} style={{ paddingLeft: `${12 + Math.max(0, target.depth - 1) * 14}px` }}>{target.title}</button>)}</div>}</div></div><div ref={contentRef} className="epub-content" dangerouslySetInnerHTML={{ __html: html }}/></div></article>{selectionDraft && createPortal(<div className="fixed z-[10000] flex items-center gap-1 rounded-lg bg-[#263b33] p-1 text-white shadow-xl" style={{left: selectionDraft.left, top: selectionDraft.top}} onMouseDown={(event) => event.preventDefault()}><button onClick={() => void commitSelection(false)} className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs hover:bg-white/10"><Highlighter size={14}/>高亮</button><button onClick={() => void commitSelection(true)} className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs hover:bg-white/10"><StickyNote size={14}/>写备注</button><button disabled={!modelReady} title={modelReady ? "" : "请先在左下角模型设置中配置 DeepSeek API Key"} onClick={() => void askSelection("selection")} className="rounded-md px-2.5 py-1.5 text-xs hover:bg-white/10 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40">AI 追问</button><button disabled={!modelReady} title={modelReady ? "" : "请先在左下角模型设置中配置 DeepSeek API Key"} onClick={() => void askSelection("book")} className="rounded-md px-2.5 py-1.5 text-xs hover:bg-white/10 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40">AI 全书追问</button></div>, document.body)}{tocOpen && <TocDrawer entries={book.toc || []} activeKey={locationKey} onClose={() => setTocOpen(false)} onSelect={(entry) => { const target = targets.find((item) => item.key === entryKey(entry)); if (target) { selectTarget(target); setTocOpen(false); } }}/>}</section><FloatingTtsPlayer getBoundary={() => readerRef.current} sessionKey={`${book.id}:${chapter?.id || ""}`} onOpenChange={setTtsOpen}/></>;
}

function TocDrawer({ entries, activeKey, onClose, onSelect }: { entries: TocEntry[]; activeKey: string; onClose: () => void; onSelect: (entry: TocEntry) => void }) {
  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const centerCurrent = () => drawerRef.current?.querySelector<HTMLElement>('[data-toc-active="true"]')?.scrollIntoView({ block: "center" });
    const frame = window.requestAnimationFrame(centerCurrent);
    const closeOnOutside = (event: MouseEvent) => { if (!drawerRef.current?.contains(event.target as Node)) onClose(); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("mousedown", closeOnOutside); document.addEventListener("keydown", closeOnEscape);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener("mousedown", closeOnOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [activeKey, onClose]);
  return <aside ref={drawerRef} className="absolute inset-y-[4.5rem] left-0 z-20 w-80 overflow-y-auto border-r border-[#e4e4dc] bg-[#fffdf8] p-5 shadow-xl"><header className="mb-4 flex items-center justify-between"><div><p className="text-xs text-[#8e9188]">本书导航</p><h2 className="mt-1 font-serif text-xl font-semibold">目录</h2></div><button aria-label="关闭目录" onClick={onClose} className="rounded-md p-2 text-[#74776e] hover:bg-[#efefe9]"><X size={18}/></button></header>{entries.length ? <TocTree entries={entries} activeKey={activeKey} onSelect={onSelect}/> : <p className="pt-8 text-center text-sm text-[#8c8f86]">此 EPUB 未提供可用目录。</p>}</aside>;
}

function TocTree({ entries, activeKey, onSelect, depth = 0 }: { entries: TocEntry[]; activeKey: string; onSelect: (entry: TocEntry) => void; depth?: number }) { return <div className="grid gap-1">{entries.map((entry, index) => { const isGroup = depth === 0 && !entry.chapter_id; const clickable = Boolean(entry.chapter_id); const active = entryKey(entry) === activeKey; return <div key={`${entryKey(entry)}-${index}`}><button data-toc-active={active || undefined} disabled={!clickable} onClick={() => clickable && onSelect(entry)} style={{ paddingLeft: `${depth * 14 + 8}px` }} className={`w-full rounded-md py-2 pr-2 text-left leading-5 ${isGroup ? "mt-3 border-b border-[#e6e7df] text-xs font-semibold tracking-[.12em] text-[#85938a] first:mt-0" : clickable ? active ? "bg-[#e6eee6] text-sm font-medium text-[#294137]" : "text-sm text-[#37443d] hover:bg-[#e8eee6]" : "cursor-default text-sm font-medium text-[#6e766e]"}`}>{entry.title}</button>{entry.children.length > 0 && <TocTree entries={entry.children} activeKey={activeKey} onSelect={onSelect} depth={depth + 1}/>}</div>; })}</div>; }

/* Legacy combined notes/tags panel retained only for context.
function NotesPane({ book, notes, tags, onTagsChange, onBookChange, onJump, onUpdate, onDelete }: { book: Book | null; notes: Note[]; tags: Tag[]; onTagsChange: (tags: Tag[]) => void; onBookChange: (book: Book) => void; onJump: (note: Note) => void; onUpdate: (noteId: string, changes: { user_note?: string | null; color?: string; tag_ids?: string[] }) => Promise<void>; onDelete: (noteId: string) => Promise<void> }) {
  const [tab, setTab] = useState<"notes" | "ask">("notes");
  const [query, setQuery] = useState("");
  const [newTag, setNewTag] = useState("");
  const visibleNotes = notes.filter((note) => `${note.selected_text} ${note.user_note || ""}`.toLowerCase().includes(query.toLowerCase()));
  const addTag = async () => { const name = newTag.trim(); if (!name) return; if (name.length > 15) { await showAppDialog({title: "标签最多 15 个字", description: "请缩短标签名称后再保存。", confirmLabel: "知道了"}); return; } const created = await api.createTag(name, "#5B7C6C"); onTagsChange([...tags, created]); setNewTag(""); };
  const toggleBookTag = async (tag: Tag) => { if (!book) return; const attached = !book.tags?.some((item) => item.id === tag.id); if (attached && (book.tags?.length || 0) >= 5) { await showAppDialog({title: "最多绑定 5 个标签", description: "请先移除一个已有标签后再添加。", confirmLabel: "知道了"}); return; } await api.setBookTag(book.id, tag.id, attached); onBookChange({...book, tags: attached ? [...(book.tags || []), tag] : (book.tags || []).filter((item) => item.id !== tag.id)}); };
  const renameTag = async (tag: Tag) => { const name = window.prompt("重命名标签", tag.name)?.trim(); if (!name || name === tag.name) return; const updated = await api.updateTag(tag.id, {name}); onTagsChange(tags.map((item) => item.id === tag.id ? updated : item)); };
  const removeTag = async (tag: Tag) => { if (!window.confirm(`删除标签“${tag.name}”？`)) return; await api.deleteTag(tag.id); onTagsChange(tags.filter((item) => item.id !== tag.id)); };
  return <aside className="min-h-0 overflow-y-auto border-l border-[#e9e7df] bg-[#fafaf7] p-5"><div className="flex gap-5 border-b border-[#e9e9e4]"><button onClick={() => setTab("notes")} className={`pb-3 text-sm ${tab === "notes" ? "border-b-2 border-[#435c4e] font-medium text-[#263d34]" : "text-[#92938a]"}`}>笔记 {notes.length || ""}</button><button onClick={() => setTab("ask")} className={`pb-3 text-sm ${tab === "ask" ? "border-b-2 border-[#435c4e] font-medium text-[#263d34]" : "text-[#92938a]"}`}>问书</button></div>{tab === "ask" ? <div className="pt-7"><MessageSquareText className="text-[#d8694f]" size={22}/><h2 className="mt-3 font-serif text-xl font-semibold">和这本书聊聊</h2><p className="mt-2 text-xs leading-5 text-[#85877e]">AI 问答将在 Phase 4 接入；Phase 2 的笔记可直接作为未来提问上下文。</p></div> : <><section className="mt-5"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold tracking-wide text-[#617168]">书籍标签</h3><span className="text-[10px] text-[#9a9f98]">点击绑定</span></div><div className="mt-2 flex flex-wrap gap-1.5">{tags.map((tag) => { const active = book?.tags?.some((item) => item.id === tag.id); return <button key={tag.id} onClick={() => void toggleBookTag(tag)} className={`rounded-full px-2 py-1 text-[10px] ${active ? "text-white" : "bg-white text-[#68736d]"}`} style={active ? {backgroundColor: tag.color} : {border: `1px solid ${tag.color}55`}}>{active && <Check className="mr-1 inline" size={10}/>} {tag.name}</button>; })}</div><div className="mt-3 flex gap-1"><input value={newTag} onChange={(event) => setNewTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addTag(); }} className="min-w-0 flex-1 rounded border border-[#dde1da] bg-white px-2 py-1.5 text-xs outline-none" placeholder="新标签"/><button onClick={() => void addTag()} className="rounded bg-[#40584d] p-1.5 text-white"><Plus size={14}/></button></div>{tags.length > 0 && <div className="mt-2 grid gap-1">{tags.map((tag) => <div key={tag.id} className="flex items-center gap-2 text-[10px] text-[#7b837d]"><i className="size-2 rounded-full" style={{backgroundColor: tag.color}}/><span className="min-w-0 flex-1 truncate">{tag.name}</span><button aria-label={`重命名 ${tag.name}`} onClick={() => void renameTag(tag)}><Pencil size={11}/></button><button aria-label={`删除标签 ${tag.name}`} onClick={() => void removeTag(tag)}><X size={11}/></button></div>)}</div>}</section><div className="mt-5 flex items-center gap-2 border-b border-[#e2e4de] pb-2"><Search size={13} className="text-[#9ca39d]"/><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-xs outline-none" placeholder="搜索选文或备注"/></div><div className="mt-4 grid gap-3">{!book && <p className="py-8 text-center text-xs text-[#91978f]">选择一本书后查看笔记。</p>}{book && !visibleNotes.length && <p className="py-8 text-center text-xs leading-5 text-[#91978f]">拖选正文文字，创建第一条高亮或备注。</p>}{visibleNotes.map((note) => <article key={note.id} className="rounded-lg border border-[#e3e5df] bg-white p-3 shadow-sm"><button onClick={() => void onJump(note)} className="block w-full text-left"><p className="line-clamp-3 border-l-2 pl-2 text-xs leading-5 text-[#556159]" style={{borderColor: note.color}}>“{note.selected_text}”</p>{note.user_note && <p className="mt-2 text-xs leading-5 text-[#283b32]">{note.user_note}</p>}</button><div className="mt-2 flex flex-wrap gap-1">{note.tags.map((tag) => <span key={tag.id} className="rounded-full px-1.5 py-0.5 text-[9px] text-white" style={{backgroundColor: tag.color}}>{tag.name}</span>)}</div><div className="mt-2 flex items-center justify-end gap-2 text-[#8b928c]"><button aria-label="编辑备注" onClick={() => { const value = window.prompt("编辑备注", note.user_note || ""); if (value !== null) void onUpdate(note.id, {user_note: value || null}); }}><Pencil size={13}/></button><button aria-label="设置笔记标签" onClick={() => { const names = window.prompt(`输入标签名（逗号分隔）\n可选：${tags.map((tag) => tag.name).join("、")}`, note.tags.map((tag) => tag.name).join(",")); if (names === null) return; const selected = names.split(/[,，]/).map((name) => name.trim()).filter(Boolean); void onUpdate(note.id, {tag_ids: tags.filter((tag) => selected.includes(tag.name)).map((tag) => tag.id)}); }}><Tags size={13}/></button><button aria-label="删除笔记" onClick={() => { if (window.confirm("删除这条笔记？")) void onDelete(note.id); }}><Trash2 size={13}/></button></div></article>)}</div></>}</aside>;
}
*/

function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", {dateStyle: "medium", timeStyle: "short"}).format(new Date(value)); }

const ragCopy: Record<RagStatus["status"], { label: string; bubble: string; frame: number }> = {
  unfed: { label: "未投喂", bubble: "把整本书交给我吧", frame: 0 },
  feeding: { label: "投喂中", bubble: "正在收下这本书…", frame: 1 },
  digesting: { label: "消化中", bubble: "正在整理全书脉络…", frame: 2 },
  digested: { label: "已消化", bubble: "我已经读完整本书了", frame: 3 },
  too_large: { label: "书籍过长", bubble: "这本书太长了，暂不支持全书索引", frame: 0 },
  failed: { label: "投喂失败", bubble: "这次没吃下，试一次吧", frame: 0 },
};

/* Legacy one-line RAG panel retained during the multi-line rewrite.
function RagFeedPanel({ book }: { book: Book | null }) {
  const [rag, setRag] = useState<RagStatus>({ status: "unfed", chunk_count: 0, estimated_seconds: 0 });
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const active = rag.status === "feeding" || rag.status === "digesting";
  const copy = ragCopy[rag.status];
  const refresh = async () => { if (book) setRag(await api.ragStatus(book.id)); };
  useEffect(() => { setElapsed(0); if (book) void refresh(); else setRag({ status: "unfed", chunk_count: 0, estimated_seconds: 0 }); }, [book?.id]);
  useEffect(() => {
    if (!active) return;
    const elapsedTimer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    const poll = window.setInterval(() => void refresh(), 900);
    return () => { window.clearInterval(elapsedTimer); window.clearInterval(poll); };
  }, [active, book?.id]);
  const start = async () => { if (!book || loading || active) return; setLoading(true); try { setRag(await api.ingestRag(book.id)); setElapsed(0); } finally { setLoading(false); } };
  const showPanda = !active || elapsed >= 2;
  return <div className="pt-5"><div className="flex items-center gap-2"><MessageSquareText className="text-[#d8694f]" size={20}/><h2 className="font-serif text-xl font-semibold">和这本书聊聊</h2></div><p className="mt-2 text-xs leading-5 text-[#85877e]">先投喂整本书，完成后即可基于全书内容提问与追问。</p>{!book ? <p className="py-10 text-center text-xs text-[#91978f]">选择一本书后开始投喂。</p> : <section className="relative mt-6 overflow-hidden rounded-xl border border-[#dfe5dc] bg-[#fffdf8] p-4"><div className="flex items-start gap-3">{showPanda ? <button aria-label="投喂本书" onClick={() => void start()} disabled={active || loading} className={`rag-panda rag-panda-${copy.frame} shrink-0 ${active ? "rag-panda-breathe" : ""}`} style={{backgroundImage: "url(/assets/rag-red-panda-states.png)"}}/> : <span className="mt-2 size-9 shrink-0 rounded-full border-2 border-[#7a9785] border-t-transparent animate-spin"/>}<div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-[#344b3e]">{copy.label}</strong>{rag.status === "digested" && <span className="rounded-full bg-[#e5f0e6] px-2 py-0.5 text-[10px] text-[#41634c]">{rag.chunk_count} 个书摘</span>}</div><p className="mt-1 text-xs leading-5 text-[#647168]">{copy.bubble}</p>{active && <p className="mt-1 text-[10px] text-[#929a92]">{elapsed < 2 ? "正在准备…" : `已用 ${elapsed} 秒 · 预计约 ${rag.estimated_seconds || 1} 秒`}</p>}{rag.status === "failed" && <p className="mt-1 text-[10px] text-[#a45548]">{rag.error_message || "请稍后重试"}</p>}</div></div>{rag.status === "unfed" || rag.status === "failed" ? <button onClick={() => void start()} disabled={loading} className="mt-4 w-full rounded-lg bg-[#40584d] px-3 py-2 text-xs font-medium text-white hover:bg-[#33483f] disabled:opacity-50">{loading ? "开始投喂…" : "投喂本书"}</button> : rag.status === "digested" ? <p className="mt-4 rounded-lg bg-[#edf3ed] px-3 py-2 text-xs leading-5 text-[#54705c]">索引已保存。问答模型接入后，可直接依据全书引用回答。</p> : null}</section></div>;
}

*/
function RagStatusPanda({ copy, compact, active, disabled, onClick }: { copy: (typeof ragCopy)[keyof typeof ragCopy]; compact: boolean; active: boolean; disabled: boolean; onClick?: () => void }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  return <div className="relative shrink-0" onMouseEnter={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setPosition({ left: Math.max(12, rect.left - 14), top: Math.max(12, rect.top - 44) }); }} onMouseLeave={() => setPosition(null)}><button aria-label={disabled ? copy.label : "投喂本书"} onClick={onClick} disabled={disabled} className={`rag-panda rag-panda-${copy.frame} ${compact ? "rag-panda--compact" : ""} ${active ? "rag-panda-breathe" : ""}`} style={{backgroundImage: "url(/assets/rag-red-panda-states.png)"}}/>{position && createPortal(<span role="tooltip" className="pointer-events-none fixed z-[20050] w-max max-w-52 rounded-lg border border-[#dce5dd] bg-[#294238] px-2.5 py-2 text-xs leading-5 text-[#fffdf8] shadow-2xl" style={position}>{copy.bubble}</span>, document.body)}</div>;
}

function RagFeedPanel({ book }: { book: Book | null }) {
  const [rag, setRag] = useState<RagStatus>({ status: "unfed", chunk_count: 0, estimated_seconds: 0 });
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const active = rag.status === "feeding" || rag.status === "digesting";
  const copy = ragCopy[rag.status];
  const refresh = async () => { if (book) setRag(await api.ragStatus(book.id)); };
  useEffect(() => { setElapsed(0); if (book) void refresh(); else setRag({ status: "unfed", chunk_count: 0, estimated_seconds: 0 }); }, [book?.id]);
  useEffect(() => {
    if (!active) return;
    const elapsedTimer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    const poll = window.setInterval(() => void refresh(), 900);
    return () => { window.clearInterval(elapsedTimer); window.clearInterval(poll); };
  }, [active, book?.id]);
  const start = async () => { if (!book || loading || active) return; setLoading(true); try { setRag(await api.ingestRag(book.id)); setElapsed(0); } finally { setLoading(false); } };
  const showPanda = !active || elapsed >= 2;
  const canStart = rag.status === "unfed" || rag.status === "failed";
  const panda = (compact = false) => <RagStatusPanda copy={copy} compact={compact} active={active} disabled={!canStart || active || loading} onClick={canStart ? () => void start() : undefined}/>;
  return <div className="pt-5">
    <div className="flex items-center gap-2"><MessageSquareText className="text-[#d8694f]" size={20}/><h2 className="font-serif text-xl font-semibold">和这本书聊聊</h2></div>
    <p className="mt-2 text-xs leading-5 text-[#85877e]">先投喂整本书，完成后即可基于全书内容提问与追问。</p>
    {!book ? <p className="py-10 text-center text-xs text-[#91978f]">选择一本书后开始投喂。</p> : <section className={`rag-feed-card rag-feed-card--${rag.status} ${collapsed ? "rag-feed-card--collapsed" : ""} relative mt-6 overflow-visible rounded-xl border border-[#dfe5dc] bg-[#fffdf8]`}>
      <button aria-label={collapsed ? "展开投喂卡片" : "收起投喂卡片"} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)} className="absolute right-3 top-3 z-10 grid size-7 place-items-center rounded-md text-[#708078] hover:bg-[#edf1eb]"><ChevronDown size={16} className={collapsed ? "-rotate-90" : "rotate-90"}/></button>
      <div className={`rag-feed-main flex ${collapsed ? "items-center" : "items-center"} gap-3`}>
        {showPanda ? panda(collapsed) : <span className="size-9 shrink-0 rounded-full border-2 border-[#7a9785] border-t-transparent animate-spin"/>}
        {collapsed && <div className="min-w-0 flex-1 pr-7"><p className="font-serif text-base font-semibold tracking-wide text-[#40584d]">{copy.label}</p>{rag.status === "digested" && <p className="mt-0.5 text-[10px] text-[#8a968d]">全书索引已就绪</p>}</div>}
        {!collapsed && <div className="min-w-0 flex-1 pr-7">{rag.status === "digested" && <><div className="flex items-center gap-1.5"><strong className="font-serif text-base font-semibold text-[#40584d]">已消化</strong><span className="rounded-full bg-[#e5f0e6] px-1.5 py-0.5 text-[10px] text-[#41634c]">{rag.chunk_count} 片段</span></div><p className="mt-2 text-xs leading-5 text-[#65756a]">全书索引已就绪，可据书中内容继续追问。</p></>}{active && <p className="text-[10px] text-[#929a92]">{elapsed < 2 ? "正在准备…" : `已用 ${elapsed} 秒 · 预计约 ${rag.estimated_seconds || 1} 秒`}</p>}{rag.status === "failed" && <p className="text-[10px] text-[#a45548]">{rag.error_message || "请稍后重试"}</p>}</div>}
      </div>
      {!collapsed && <>{(rag.status === "unfed" || rag.status === "failed") && <button onClick={() => void start()} disabled={loading} className="mt-3 w-full rounded-lg bg-[#40584d] px-3 py-2 text-xs font-medium text-white hover:bg-[#33483f] disabled:opacity-50">{loading ? "开始投喂…" : "投喂本书"}</button>}{rag.status === "too_large" && <p className="mt-3 rounded-lg bg-[#fff4df] px-3 py-2 text-xs leading-5 text-[#87652b]">{rag.error_message || "本书超过全书索引上限。"} 你仍可对选中文本发起 AI 追问。</p>}</>}
    </section>}
  </div>;
}

function FollowupDialog({ thread, modelReady = true, onClose, onSubmit }: { thread: AskThread; modelReady?: boolean; onClose: () => void; onSubmit: (question: string) => Promise<void> }) {
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const askedCount = thread.messages.filter((message) => message.role === "user").length;
  const waiting = thread.status === "answering";
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const dialog = document.querySelector<HTMLElement>('[aria-labelledby="followup-title"]');
      dialog?.querySelectorAll<HTMLElement>("article").forEach((article) => {
        if (!article.className.includes("bg-white")) return;
        const content = article.querySelectorAll<HTMLElement>("p")[1];
        if (!content) return;
        const raw = content.dataset.markdownSource || content.textContent || "";
        content.dataset.markdownSource = raw;
        renderMarkdownAnswer(content, raw);
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [thread]);
  const submit = async () => {
    const value = question.trim();
    if (!value || waiting || submitting) return;
    if (value.length > 1000) { await showAppDialog({title: "问题过长", description: "一次追问最多支持 1,000 个字。", confirmLabel: "知道了"}); return; }
    setSubmitting(true);
    try { await onSubmit(value); setQuestion(""); } finally { setSubmitting(false); }
  };
  return createPortal(<div className="fixed inset-0 z-[20010] grid place-items-center bg-[#14251e]/35 p-5"><section role="dialog" aria-modal="true" aria-labelledby="followup-title" className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#e1e4dd] bg-[#fffdf8] shadow-2xl"><header className="flex items-start justify-between border-b border-[#e9e9e3] px-6 py-5"><div><p className="text-xs text-[#7e8a80]">同一主题最多 8 轮 · 当前第 {askedCount} 轮</p><h2 id="followup-title" className="mt-1 font-serif text-xl font-semibold text-[#263b33]">继续和这本书聊</h2></div><button aria-label="关闭追问窗口" onClick={onClose} className="rounded-md p-2 text-[#68736c] hover:bg-[#eef1ed]"><X size={18}/></button></header><div className="min-h-0 flex-1 overflow-y-auto px-6 py-5"><div className="grid gap-4">{thread.selected_text && <section className="rounded-xl border border-[#eadf9e] bg-[#fffbee] p-4"><p className="text-[10px] font-medium tracking-wide text-[#8a7333]">书籍引用</p><blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-[#eed16d] pl-3 font-serif text-sm leading-7 text-[#55513e]">“{thread.selected_text}”</blockquote></section>}{thread.messages.map((message) => <article key={message.id} className={`rounded-xl p-4 ${message.role === "user" ? "ml-10 bg-[#edf3ed] text-[#334c3e]" : "mr-10 border border-[#e4e7e0] bg-white text-[#435149]"}`}><p className="mb-2 text-[10px] font-medium tracking-wide text-[#7f8d82]">{message.role === "user" ? "你的问题" : "笃笃回答"}</p><p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p><time className="mt-3 block text-[10px] text-[#9aa29b]">{message.created_at ? formatDate(message.created_at) : ""}</time></article>)}{waiting && <p className="text-center text-xs text-[#78877c]">正在生成上一轮回答，完成后可继续追问。</p>}</div></div><footer className="border-t border-[#e9e9e3] px-6 py-5"><label className="block text-xs font-medium text-[#637168]">继续追问（最多 1,000 字）</label>{!modelReady && <p className="mt-2 rounded-md bg-[#f5f1ed] px-3 py-2 text-xs leading-5 text-[#8b7464]">未配置 DeepSeek API Key，暂不能继续追问。请前往左下角模型设置完成配置。</p>}<textarea value={question} disabled={!modelReady || waiting || askedCount >= 8} onChange={(event) => setQuestion(event.target.value)} placeholder={!modelReady ? "请先配置 DeepSeek API Key" : waiting ? "请等待上一轮回答完成…" : askedCount >= 8 ? "已达到本主题 8 轮上限，请新建问题。" : "继续追问、要求举例或对比书中观点…"} className="mt-2 min-h-32 w-full resize-y rounded-lg border border-[#d9dfd8] bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#658270] disabled:bg-[#f3f4f0]"/><div className="mt-3 flex items-center justify-between"><span className="text-[10px] text-[#929a92]">{question.length}/1,000</span><button onClick={() => void submit()} disabled={!modelReady || !question.trim() || waiting || submitting || askedCount >= 8} className="rounded-lg bg-[#40584d] px-4 py-2 text-sm font-medium text-white hover:bg-[#33483f] disabled:cursor-not-allowed disabled:opacity-45">{!modelReady ? "未配置密钥" : waiting || submitting ? "等待回答中…" : askedCount >= 8 ? "已达 8 轮" : "发送追问"}</button></div></footer></section></div>, document.body);
}

function AskBookPanel({ book }: { book: Book | null }) {
  const [threads, setThreads] = useState<AskThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [activeThread, setActiveThread] = useState<AskThread | null>(null);
  const loadedBookRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => { void api.modelSettings().then((value) => { if (!cancelled) setModelReady(value.has_api_key); }).catch(() => { if (!cancelled) setModelReady(false); }); };
    const onModelSettingsUpdated = (event: Event) => { if (!cancelled) setModelReady(Boolean((event as CustomEvent<ModelSettings>).detail?.has_api_key)); };
    refresh();
    window.addEventListener("dudu:model-settings-updated", onModelSettingsUpdated);
    return () => { cancelled = true; window.removeEventListener("dudu:model-settings-updated", onModelSettingsUpdated); };
  }, []);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>('p[class~="line-clamp-4"][class~="bg-[#f1f6f0]"]').forEach((preview) => {
        const raw = preview.dataset.answerPreview || preview.textContent || "";
        preview.dataset.answerPreview = raw;
        preview.removeAttribute("data-preview-split");
        const plain = markdownPreviewText(raw);
        preview.textContent = plain.length > 50 ? `${plain.slice(0, 50).trimEnd()}…` : plain;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [threads]);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (!book) { setThreads([]); loadedBookRef.current = null; return; }
      const firstLoad = loadedBookRef.current !== book.id;
      if (firstLoad) setLoading(true);
      try {
        const items = await api.questions(book.id);
        if (!cancelled) {
          // Polling should only repaint when an answer/status has genuinely changed.
          setThreads((current) => JSON.stringify(current) === JSON.stringify(items) ? current : items);
          setActiveThread((current) => current ? items.find((item) => item.id === current.id) || null : null);
          loadedBookRef.current = book.id;
        }
      } finally {
        if (!cancelled && firstLoad) setLoading(false);
      }
    };
    const onQuestionsUpdated = (event: Event) => { const changedBookId = (event as CustomEvent<{bookId?: string}>).detail?.bookId; if (changedBookId === book?.id) void refresh(); };
    void refresh();
    const poll = window.setInterval(() => void refresh(), 2500);
    window.addEventListener("dudu:questions-updated", onQuestionsUpdated);
    return () => { cancelled = true; window.clearInterval(poll); window.removeEventListener("dudu:questions-updated", onQuestionsUpdated); };
  }, [book?.id]);
  const submitFollowup = async (thread: AskThread, question: string) => {
    if (!book) return;
    if (!modelReady) { await showAppDialog({title: "请先配置 DeepSeek", description: "尚未检测到 DeepSeek API Key。请点击左下角设置图标完成配置。", confirmLabel: "知道了"}); return; }
    const updated = await api.ask(book.id, {question, chapter_id: thread.chapter_id, selected_text: thread.selected_text, scope: thread.scope, thread_id: thread.id});
    setThreads((current) => current.map((item) => item.id === updated.id ? updated : item));
    setActiveThread(updated);
    window.dispatchEvent(new CustomEvent("dudu:questions-updated", {detail: {bookId: book.id}}));
  };
  return <><RagFeedPanel book={book}/><section className="mt-6 border-t border-[#e4e7e1] pt-4"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold tracking-wide text-[#617168]">问答记录</h3><span className="text-[10px] text-[#98a099]">最近在前</span></div>{loading && <p className="py-5 text-center text-xs text-[#929a92]">正在读取记录…</p>}{!loading && book && !threads.length && <p className="py-5 text-center text-xs leading-5 text-[#929a92]">选中正文后发起 AI 追问，记录会保存在这里。</p>}<div className="mt-3 grid gap-2">{threads.map((thread) => { const answer = thread.messages.filter((message) => message.role === "assistant").slice(-1)[0]; const turns = thread.messages.filter((message) => message.role === "user").length; const canFollow = thread.status !== "answering" && turns < 8; return <article key={thread.id} className="rounded-lg border border-[#e2e6df] bg-white p-3"><div className="flex items-center justify-between gap-2"><span className="rounded-full bg-[#edf3ed] px-1.5 py-0.5 text-[9px] text-[#54705c]">{thread.scope === "book" ? "全书追问" : "AI 追问"}</span><time className="text-[10px] text-[#929a92]">{thread.updated_at ? formatDate(thread.updated_at) : ""}</time></div>{thread.selected_text && <p className="mt-2 line-clamp-2 border-l-2 border-[#eed16d] pl-2 text-[11px] leading-5 text-[#667069]">“{thread.selected_text}”</p>}{thread.messages.filter((message) => message.role === "user").slice(-1).map((message) => <p key={message.id} className="mt-2 text-xs leading-5 text-[#34453c]">{message.content}</p>)}{answer && <><p className="mt-2 line-clamp-4 rounded bg-[#f1f6f0] p-2 text-xs leading-5 text-[#45604d]">{answer.content}</p><p className="mt-1 text-right text-[10px] text-[#8b958d]">回答已折叠，进入继续追问查看完整内容</p></>}<div className="mt-3 flex items-center justify-between gap-2"><p className="text-[10px] text-[#929a92]">{thread.status === "waiting_for_model" ? "已保存，等待模型接入" : thread.status === "answering" ? "正在生成回答…" : thread.status === "answered" ? `已回答 · ${turns}/8 轮` : thread.status === "failed" ? "回答失败，可继续追问" : thread.status}</p><button onClick={() => setActiveThread(thread)} disabled={!canFollow} className="rounded-md border border-[#d6ded5] px-2 py-1 text-[10px] text-[#45604d] hover:bg-[#eef3ed] disabled:cursor-not-allowed disabled:opacity-45">{turns >= 8 ? "已达 8 轮" : thread.status === "answering" ? "回答中" : "继续追问"}</button></div></article>; })}</div></section>{activeThread && <FollowupDialog thread={activeThread} onClose={() => setActiveThread(null)} onSubmit={(question) => submitFollowup(activeThread, question)}/>}</>;
}

function NotesPane({ book, notes, tags, onTagsChange, onBookChange, onJump, onUpdate, onDelete }: { book: Book | null; notes: Note[]; tags: Tag[]; onTagsChange: (tags: Tag[]) => void; onBookChange: (book: Book) => void; onJump: (note: Note) => void; onUpdate: (noteId: string, changes: { user_note?: string | null; color?: string }) => Promise<void>; onDelete: (noteId: string) => Promise<void> }) {
  const [tab, setTab] = useState<"notes" | "ask" | "tags">("notes");
  const [query, setQuery] = useState("");
  const [newTag, setNewTag] = useState("");
  const [detail, setDetail] = useState<Note | null>(null);
  const [draft, setDraft] = useState("");
  const visibleNotes = notes.filter((note) => `${note.selected_text} ${note.user_note || ""}`.toLowerCase().includes(query.toLowerCase()));
  const openDetail = (note: Note) => { setDetail(note); setDraft(note.user_note || ""); };
  if (Boolean(tab === "ask")) return <aside className="min-h-0 overflow-y-auto border-l border-[#e9e7df] bg-[#fafaf7] p-5"><div className="flex gap-4 border-b border-[#e9e9e4]"><button onClick={() => setTab("notes")} className="pb-3 text-sm text-[#92938a]">笔记{notes.length ? <sup>{notes.length}</sup> : null}</button><button className="border-b-2 border-[#435c4e] pb-3 text-sm font-medium text-[#263d34]">问书</button><button onClick={() => setTab("tags")} className="pb-3 text-sm text-[#92938a]">标签</button></div><AskBookPanel book={book}/></aside>;
  const addTag = async () => { const name = newTag.trim(); if (!name) return; if (name.length > 15) { await showAppDialog({title: "标签最多 15 个字", description: "请缩短标签名称后再保存。", confirmLabel: "知道了"}); return; } const created = await api.createTag(name, "#5B7C6C"); onTagsChange([...tags, created]); setNewTag(""); };
  const toggleBookTag = async (tag: Tag) => { if (!book) return; const attached = !book.tags?.some((item) => item.id === tag.id); if (attached && (book.tags?.length || 0) >= 5) { await showAppDialog({title: "最多绑定 5 个标签", description: "请先移除一个已有标签后再添加。", confirmLabel: "知道了"}); return; } await api.setBookTag(book.id, tag.id, attached); onBookChange({...book, tags: attached ? [...(book.tags || []), tag] : (book.tags || []).filter((item) => item.id !== tag.id)}); };
  const renameTag = async (tag: Tag) => { const name = (await promptAppDialog("重命名标签", "标签名称", tag.name, "例如：待读"))?.trim(); if (!name || name === tag.name) return; const updated = await api.updateTag(tag.id, {name}); onTagsChange(tags.map((item) => item.id === tag.id ? updated : item)); };
  const removeTag = async (tag: Tag) => { if (!await confirmAppDialog("删除标签？", `标签“${tag.name}”会从所有书籍中移除。`, true)) return; await api.deleteTag(tag.id); onTagsChange(tags.filter((item) => item.id !== tag.id)); if (book) onBookChange({...book, tags: (book.tags || []).filter((item) => item.id !== tag.id)}); };
  const chapterTitle = (note: Note) => book?.chapters?.find((chapter) => chapter.id === note.chapter_id)?.display_title || "所在章节";
  return <aside className="min-h-0 overflow-y-auto border-l border-[#e9e7df] bg-[#fafaf7] p-5"><div className="flex gap-4 border-b border-[#e9e9e4]"><button onClick={() => setTab("notes")} className={`pb-3 text-sm ${tab === "notes" ? "border-b-2 border-[#435c4e] font-medium text-[#263d34]" : "text-[#92938a]"}`}>笔记{notes.length ? <sup>{notes.length}</sup> : null}</button><button onClick={() => setTab("ask")} className={`pb-3 text-sm ${tab === "ask" ? "border-b-2 border-[#435c4e] font-medium text-[#263d34]" : "text-[#92938a]"}`}>问书</button><button onClick={() => setTab("tags")} className={`pb-3 text-sm ${tab === "tags" ? "border-b-2 border-[#435c4e] font-medium text-[#263d34]" : "text-[#92938a]"}`}>标签</button></div>{tab === "ask" && <div className="pt-7"><MessageSquareText className="text-[#d8694f]" size={22}/><h2 className="mt-3 font-serif text-xl font-semibold">和这本书聊聊</h2><p className="mt-2 text-xs leading-5 text-[#85877e]">AI 问答将在 Phase 4 接入。</p></div>}{tab === "tags" && <div className="pt-5"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold tracking-wide text-[#617168]">书籍标签</h3><span className="text-[10px] text-[#9a9f98]">点击绑定或移除</span></div><div className="mt-3 flex flex-wrap gap-1.5">{tags.map((tag) => { const attached = book?.tags?.some((item) => item.id === tag.id); return <button key={tag.id} onClick={() => void toggleBookTag(tag)} className={`rounded-full px-2 py-1 text-[10px] ${attached ? "text-white" : "bg-white text-[#68736d]"}`} style={attached ? {backgroundColor: tag.color} : {border: `1px solid ${tag.color}55`}}>{attached && <Check className="mr-1 inline" size={10}/>} {tag.name}</button>; })}</div><div className="mt-5 flex gap-1"><input value={newTag} onChange={(event) => setNewTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addTag(); }} className="min-w-0 flex-1 rounded border border-[#dde1da] bg-white px-2 py-1.5 text-xs outline-none" placeholder="新标签"/><button aria-label="创建标签" onClick={() => void addTag()} className="rounded bg-[#40584d] p-1.5 text-white"><Plus size={14}/></button></div><div className="mt-4 grid gap-1.5">{tags.map((tag) => <div key={tag.id} className="flex items-center gap-2 rounded border border-[#e5e7e2] bg-white px-2 py-2 text-xs"><i className="size-2 rounded-full" style={{backgroundColor: tag.color}}/><span className="min-w-0 flex-1 truncate">{tag.name}</span><button aria-label={`重命名 ${tag.name}`} onClick={() => void renameTag(tag)} className="text-[#7b837d]"><Pencil size={12}/></button><button aria-label={`删除标签 ${tag.name}`} onClick={() => void removeTag(tag)} className="text-[#7b837d]"><X size={12}/></button></div>)}</div></div>}{tab === "notes" && <><div className="mt-5 flex items-center gap-2 border-b border-[#e2e4de] pb-2"><Search size={13} className="text-[#9ca39d]"/><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-xs outline-none" placeholder="搜索选文或备注"/></div><div className="mt-4 grid gap-3">{!book && <p className="py-8 text-center text-xs text-[#91978f]">选择一本书后查看笔记。</p>}{book && !visibleNotes.length && <p className="py-8 text-center text-xs leading-5 text-[#91978f]">拖选正文文字，创建第一条高亮或备注。</p>}{visibleNotes.map((note) => <article key={note.id} className="rounded-lg border border-[#e3e5df] bg-white p-3 shadow-sm"><button onClick={() => void onJump(note)} className="block w-full text-left"><p className="line-clamp-3 border-l-2 pl-2 text-xs leading-5 text-[#556159]" style={{borderColor: note.color}}>“{note.selected_text}”</p>{note.user_note && <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#283b32]">{note.user_note}</p>}</button><div className="mt-2 flex items-center justify-between text-[10px] text-[#879088]"><span className="truncate">{chapterTitle(note)}</span><span>{formatDate(note.created_at)}</span></div><div className="mt-2 flex items-center justify-end gap-2 text-[#6d7a72]"><button onClick={() => void onJump(note)} className="text-[10px] hover:text-[#2f4d40]">定位</button><button onClick={() => openDetail(note)} className="flex items-center gap-1 text-[10px] hover:text-[#2f4d40]">{(note.selected_text.length > 90 || (note.user_note || "").length > 80) ? "展开" : "查看"}<ChevronRight size={12}/></button></div></article>)}</div></>}{detail && createPortal(<div className="fixed inset-0 z-[10001] grid place-items-center bg-black/25 p-5" onMouseDown={() => setDetail(null)}><section className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-xl bg-[#fffdf8] p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><header className="flex items-start justify-between gap-4"><div><p className="text-xs text-[#8c948c]">{chapterTitle(detail)}</p><h3 className="mt-1 font-serif text-xl font-semibold">笔记详情</h3></div><button aria-label="关闭笔记详情" onClick={() => setDetail(null)} className="rounded p-1 hover:bg-[#eef1ed]"><X size={18}/></button></header><blockquote className="mt-5 whitespace-pre-wrap border-l-2 pl-3 font-serif text-sm leading-7 text-[#37443d]" style={{borderColor: detail.color}}>“{detail.selected_text}”</blockquote><label className="mt-5 block text-xs font-medium text-[#65716a]">备注</label><textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="mt-2 min-h-28 w-full resize-y rounded border border-[#dce2da] bg-white p-3 text-sm leading-6 outline-none focus:border-[#6b8877]" placeholder="添加你的理解、问题或行动项…"/><div className="mt-3 flex items-center justify-between"><button onClick={() => { setDraft(""); void onUpdate(detail.id, {user_note: null}); }} className="text-xs text-[#8d5b50] hover:underline">清除备注</button><button onClick={() => { void onUpdate(detail.id, {user_note: draft.trim() || null}); setDetail({...detail, user_note: draft.trim() || null}); }} className="rounded bg-[#40584d] px-3 py-2 text-xs font-medium text-white">保存备注</button></div><div className="mt-5 border-t border-[#e7e7e0] pt-3 text-[11px] leading-5 text-[#8b928b]"><p>创建于：{formatDate(detail.created_at)}</p><p>最后编辑：{formatDate(detail.updated_at)}</p></div></section></div>, document.body)}</aside>;
}
