import { v4 as uuidv4 } from 'uuid';

const KEY = 'es-coach-user-id';

/**
 * Coach 專用使用者識別。獨立於 apiSync.ts 的 clientId。
 * - clientId（既有 sessionStorage `es-client-id`）：board sync / broadcastExcept 的 sender 標識
 * - coachUserId（本檔 localStorage `es-coach-user-id`）：Coach session ownership，跨 tab 共用對話
 *
 * 不要把兩者合併 — apiSync 的 broadcastExcept(senderId) 期待 tab 為單位的 sender；
 * 若 coach 也用 sessionStorage clientId 同瀏覽器多 tab 會被當成同一 sender，cross-tab board sync 會壞掉。
 */
export function getCoachUserId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = uuidv4();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return uuidv4();
  }
}
