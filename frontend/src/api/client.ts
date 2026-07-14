const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";
export const API_ORIGIN = API_BASE.replace(/\/api$/, "");
export type Chapter = { id: string; index: number; title: string | null; display_title: string; part?: number; group?: string };
export type TocEntry = { title: string; chapter_id: string | null; anchor?: string | null; children: TocEntry[] };
export type Tag = { id: string; name: string; color: string };
export type Note = { id: string; book_id: string; chapter_id: string; selected_text: string; start_offset: number; end_offset: number; user_note: string | null; color: string; tags: Tag[]; created_at: string; updated_at: string };
export type ReadingProgress = { current_chapter_id: string | null; scroll_position: number; tts_chapter_id?: string | null; tts_paragraph_index?: number; tts_char_offset?: number; tts_speed?: number; last_read_at?: string | null };
export type TtsSegment = { index: number; text: string; audio_url: string };
export type RagStatus = { status: "unfed" | "feeding" | "digesting" | "digested" | "failed" | "too_large"; chunk_count: number; estimated_seconds: number; total_characters?: number; max_characters?: number; error_message?: string | null; started_at?: string | null; completed_at?: string | null };
export type AskMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string | null };
export type AskThread = { id: string; book_id: string; chapter_id: string | null; selected_text: string | null; scope: "selection" | "book"; status: string; created_at: string | null; updated_at: string | null; messages: AskMessage[] };
export type ModelSettings = { provider: "deepseek"; base_url: string; model: string; has_api_key: boolean; api_key_masked: string | null; key_source: "database" | "environment" | "none"; encryption_mode: "app_secret" | "local_fallback" };
export type Book = { id: string; title: string; author: string | null; original_filename?: string | null; cover_url: string | null; total_chapters: number; total_characters?: number; progress: ReadingProgress | null; tags?: Tag[]; chapters?: Chapter[]; toc?: TocEntry[] };
const readJson = async <T>(response: Response): Promise<T> => { if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.detail || "请求失败"); } return response.json() as Promise<T>; };
export const api = {
  books: (tagId?: string) => fetch(`${API_BASE}/books${tagId ? `?tag=${tagId}` : ""}`).then((response) => response.json() as Promise<Book[]>),
  book: (bookId: string) => fetch(`${API_BASE}/books/${bookId}`).then((response) => response.json() as Promise<Book>),
  chapter: (bookId: string, chapterId: string) => fetch(`${API_BASE}/books/${bookId}/chapters/${chapterId}`).then((response) => response.json() as Promise<{title: string; display_title: string; raw_html: string}>),
  saveProgress: async (bookId: string, progress: Pick<ReadingProgress, "current_chapter_id" | "scroll_position">) => {
    const response = await fetch(`${API_BASE}/books/${bookId}/progress`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(progress) });
    if (!response.ok) throw new Error("阅读位置保存失败");
    return response.json() as Promise<ReadingProgress>;
  },
  tts: (bookId: string, chapterId: string, rate = "+0%") => fetch(`${API_BASE}/books/${bookId}/tts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({chapter_id: chapterId, rate}) }).then((response) => readJson<{chapter_id: string; segments: TtsSegment[]}>(response)),
  saveTtsProgress: (bookId: string, progress: Required<Pick<ReadingProgress, "tts_chapter_id" | "tts_paragraph_index" | "tts_char_offset" | "tts_speed">>) => fetch(`${API_BASE}/books/${bookId}/tts-progress`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(progress) }).then((response) => readJson<Pick<ReadingProgress, "tts_chapter_id" | "tts_paragraph_index" | "tts_char_offset" | "tts_speed">>(response)),
  ragStatus: (bookId: string) => fetch(`${API_BASE}/books/${bookId}/rag`).then((response) => readJson<RagStatus>(response)),
  ingestRag: (bookId: string) => fetch(`${API_BASE}/books/${bookId}/rag/ingest`, { method: "POST" }).then((response) => readJson<RagStatus>(response)),
  questions: (bookId: string) => fetch(`${API_BASE}/books/${bookId}/questions`).then((response) => readJson<AskThread[]>(response)),
  ask: (bookId: string, payload: { question: string; chapter_id?: string | null; selected_text?: string | null; scope: "selection" | "book"; thread_id?: string }) => fetch(`${API_BASE}/books/${bookId}/questions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((response) => readJson<AskThread>(response)),
  upload: async (file: File) => { const body = new FormData(); body.append("file", file); const response = await fetch(`${API_BASE}/books/upload`, { method: "POST", body }); if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.detail || "导入失败"); } return response.json() as Promise<Book>; },
  deleteBook: async (bookId: string) => { const response = await fetch(`${API_BASE}/books/${bookId}`, { method: "DELETE" }); if (!response.ok) throw new Error(await response.text()); },
  notes: (bookId: string) => fetch(`${API_BASE}/books/${bookId}/notes`).then((response) => readJson<Note[]>(response)),
  createNote: (note: { book_id: string; chapter_id: string; selected_text: string; start_offset: number; end_offset: number; user_note?: string | null; color?: string; tag_ids?: string[] }) => fetch(`${API_BASE}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(note) }).then((response) => readJson<Note>(response)),
  updateNote: (noteId: string, changes: { user_note?: string | null; color?: string; tag_ids?: string[] }) => fetch(`${API_BASE}/notes/${noteId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) }).then((response) => readJson<Note>(response)),
  deleteNote: async (noteId: string) => { const response = await fetch(`${API_BASE}/notes/${noteId}`, { method: "DELETE" }); if (!response.ok) throw new Error("删除笔记失败"); },
  tags: () => fetch(`${API_BASE}/tags`).then((response) => readJson<Tag[]>(response)),
  createTag: (name: string, color: string) => fetch(`${API_BASE}/tags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, color }) }).then((response) => readJson<Tag>(response)),
  updateTag: (tagId: string, changes: { name?: string; color?: string }) => fetch(`${API_BASE}/tags/${tagId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) }).then((response) => readJson<Tag>(response)),
  deleteTag: async (tagId: string) => { const response = await fetch(`${API_BASE}/tags/${tagId}`, { method: "DELETE" }); if (!response.ok) throw new Error("删除标签失败"); },
  setBookTag: async (bookId: string, tagId: string, attached: boolean) => { const response = await fetch(`${API_BASE}/tags/${tagId}/books/${bookId}`, { method: attached ? "PUT" : "DELETE" }); if (!response.ok) throw new Error("更新书籍标签失败"); },
  modelSettings: () => fetch(`${API_BASE}/settings/model`).then((response) => readJson<ModelSettings>(response)),
  saveModelSettings: (payload: { api_key?: string; clear_api_key?: boolean; base_url: string; model: string }) => fetch(`${API_BASE}/settings/model`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((response) => readJson<ModelSettings>(response)),
};
