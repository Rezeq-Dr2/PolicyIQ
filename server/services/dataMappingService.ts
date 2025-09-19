import { db } from '../db';
import { sql } from 'drizzle-orm';
import { EnhancedVectorDatabaseService } from './enhancedVectorDatabase';

export class DataMappingService {
  private vector = new EnhancedVectorDatabaseService();

  async upsertAsset(params: { organizationId: string; systemName: string; dataCategories?: any; locations?: any; processors?: any }): Promise<{ id: string }> {
    const { organizationId, systemName, dataCategories, locations, processors } = params;
    const res: any = await db.execute(sql`
      insert into data_assets (organization_id, system_name, data_categories, locations, processors)
      values (${organizationId}::uuid, ${systemName}, ${JSON.stringify(dataCategories || {})}::jsonb, ${JSON.stringify(locations || {})}::jsonb, ${JSON.stringify(processors || {})}::jsonb)
      returning id
    ` as any);
    return { id: (res?.rows ?? [])[0].id };
  }

  async mapAssetToRegulatoryNodes(params: { organizationId: string; assetId: string; description: string; topK?: number }): Promise<any[]> {
    const { description, topK } = params;
    const hits: any[] = await this.vector.performHybridSearch(description, topK || 5);
    return hits.map(h => ({ nodeRef: h.id, preview: (h as any).content?.slice(0, 200), score: (h as any).score || 0 }));
  }
}

export const dataMappingService = new DataMappingService();


