import * as Y from 'yjs';
import { db } from '../db';
import { sql } from 'drizzle-orm';

export class CollabService {
  async loadDoc(policyDocumentId: string): Promise<Y.Doc> {
    const rows: any = await db.execute(sql`select extracted_text from policy_documents where id=${policyDocumentId}::uuid` as any);
    const txt = String(((rows?.rows ?? [])[0] || {}).extracted_text || '');
    const doc = new Y.Doc();
    const ytext = doc.getText('content');
    ytext.insert(0, txt);
    return doc;
  }
}

export const collabService = new CollabService();


