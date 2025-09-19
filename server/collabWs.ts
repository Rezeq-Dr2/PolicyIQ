import { Server as HttpServer } from 'http';
import { WebSocketServer } from 'ws';
import { db } from './db';
import { sql } from 'drizzle-orm';
import * as Y from 'yjs';

type Client = { ws: any; docId: string };
type Room = { doc: Y.Doc; clients: Set<Client>; saveTimer?: NodeJS.Timeout };
const rooms: Record<string, Room> = {};

async function loadText(docId: string): Promise<string> {
  const res: any = await db.execute(sql`select extracted_text from policy_documents where id=${docId}::uuid` as any);
  return String(((res?.rows ?? [])[0] || {}).extracted_text || '');
}

async function persistRoom(docId: string, room: Room) {
  try {
    const ytext = room.doc.getText('content');
    await db.execute(sql`update policy_documents set extracted_text=${ytext.toString()} where id=${docId}::uuid` as any);
  } catch {}
}

export function setupCollab(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws/collab' });
  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const docId = url.searchParams.get('docId') || '';
    if (!docId) { try { ws.close(); } catch {} return; }

    if (!rooms[docId]) {
      const ydoc = new Y.Doc();
      const ytext = ydoc.getText('content');
      try {
        const initial = await loadText(docId);
        if (initial) {
          ytext.insert(0, initial);
        }
      } catch {}
      // Debounced persistence on any update
      ydoc.on('update', () => {
        const room = rooms[docId];
        if (!room) return;
        if (room.saveTimer) clearTimeout(room.saveTimer);
        room.saveTimer = setTimeout(() => { persistRoom(docId, room).catch(() => {}); }, 1000);
      });
      rooms[docId] = { doc: ydoc, clients: new Set() };
    }

    const room = rooms[docId];
    const client: Client = { ws, docId };
    room.clients.add(client);

    // Send initial Yjs state to new client
    try {
      const update = Y.encodeStateAsUpdate(room.doc);
      ws.send(update);
    } catch {}

    // Broadcast presence
    const broadcastPresence = () => {
      const payload = JSON.stringify({ type: 'presence', count: room.clients.size });
      for (const c of room.clients) {
        try { c.ws.send(payload); } catch {}
      }
    };
    broadcastPresence();

    ws.on('message', (data: any) => {
      try {
        if (typeof data === 'string') {
          // ignore unknown JSON messages for now (presence pings etc.)
          return;
        }
        // binary update
        const buf: Uint8Array = data instanceof Buffer ? new Uint8Array(data) : new Uint8Array([]);
        if (buf.byteLength === 0) return;
        Y.applyUpdate(room.doc, buf);
        // fan-out to others
        for (const c of room.clients) {
          if (c.ws !== ws) {
            try { c.ws.send(buf); } catch {}
          }
        }
      } catch {}
    });

    ws.on('close', () => {
      room.clients.delete(client);
      broadcastPresence();
    });
  });
}


