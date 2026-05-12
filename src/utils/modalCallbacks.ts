/**
 * Tiny module-local registry for DetailPanel's Add Command / Set Entity buttons.
 *
 * Background: Add Command 與 Set Entity 流程的 modal 與 state 都住在 Board.tsx，
 * 但 DetailPanel 自從 P1 改由 RightColumn 渲染後，已不在 Board.tsx 的 prop tree 內。
 * 為了不在 P1 把 modal state 也搬上去（會牽動更多檔案），這裡用一個 module-level
 * registry：Board.tsx mount 時 register handler，DetailPanel 透過這裡 invoke。
 *
 * P2/P3 之後若要做 audit log / undo，可以把這個 registry 換成 uiStore 的正式 action。
 */

type Handler = (noteId: string) => void;

let onAddCommandHandler: Handler | null = null;
let onSetEntityHandler: Handler | null = null;

export function registerAddCommandHandler(fn: Handler | null): void {
  onAddCommandHandler = fn;
}

export function registerSetEntityHandler(fn: Handler | null): void {
  onSetEntityHandler = fn;
}

export function invokeAddCommand(noteId: string): void {
  onAddCommandHandler?.(noteId);
}

export function invokeSetEntity(noteId: string): void {
  onSetEntityHandler?.(noteId);
}
