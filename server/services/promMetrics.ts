import { getRecentMetrics } from './metrics';
import { llmMetricsService } from './llmMetrics';
import { analysisQueue, analysisDlq } from './queue';
import { retrievalMetrics } from './retrievalMetrics';

export class PromMetricsService {
  async render(org: string, minutes: number = 5): Promise<string> {
    const lines: string[] = [];
    const api = await getRecentMetrics(org, minutes);
    let apiCount = 0, apiLatency = 0, apiErrors = 0;
    for (const m of api) { apiCount += m.count; apiLatency += m.latencySum; apiErrors += m.errors; }
    lines.push(`# HELP policyiq_api_requests_total Total API requests in window`);
    lines.push(`# TYPE policyiq_api_requests_total counter`);
    lines.push(`policyiq_api_requests_total{org="${org}"} ${apiCount}`);
    lines.push(`# HELP policyiq_api_latency_ms_sum Total latency sum ms in window`);
    lines.push(`# TYPE policyiq_api_latency_ms_sum counter`);
    lines.push(`policyiq_api_latency_ms_sum{org="${org}"} ${apiLatency}`);
    lines.push(`# HELP policyiq_api_errors_total Total API 5xx errors in window`);
    lines.push(`# TYPE policyiq_api_errors_total counter`);
    lines.push(`policyiq_api_errors_total{org="${org}"} ${apiErrors}`);

    const models = process.env.LLM_MODELS?.split(',').filter(Boolean) || [];
    for (const m of models) {
      const s = await llmMetricsService.getRecent(m, minutes);
      lines.push(`# HELP policyiq_llm_requests_total Total model calls`);
      lines.push(`# TYPE policyiq_llm_requests_total counter`);
      lines.push(`policyiq_llm_requests_total{model="${m}"} ${s.count}`);
      lines.push(`# HELP policyiq_llm_latency_ms_sum Total model latency`);
      lines.push(`# TYPE policyiq_llm_latency_ms_sum counter`);
      lines.push(`policyiq_llm_latency_ms_sum{model="${m}"} ${s.avgLatencyMs * s.count}`);
      lines.push(`# HELP policyiq_llm_tokens_sum Token usage`);
      lines.push(`# TYPE policyiq_llm_tokens_sum counter`);
      lines.push(`policyiq_llm_tokens_sum{model="${m}"} ${s.tokens}`);
      lines.push(`# HELP policyiq_llm_errors_total Model errors`);
      lines.push(`# TYPE policyiq_llm_errors_total counter`);
      lines.push(`policyiq_llm_errors_total{model="${m}"} ${Math.round(s.errorRate * s.count)}`);
    }

    const qc = await analysisQueue.getJobCounts('wait','active','completed','failed','delayed');
    const dc = await analysisDlq.getJobCounts('failed');
    lines.push(`# HELP policyiq_queue_wait Jobs waiting`);
    lines.push(`# TYPE policyiq_queue_wait gauge`);
    lines.push(`policyiq_queue_wait ${qc.wait || 0}`);
    lines.push(`# HELP policyiq_queue_active Jobs active`);
    lines.push(`# TYPE policyiq_queue_active gauge`);
    lines.push(`policyiq_queue_active ${qc.active || 0}`);
    lines.push(`# HELP policyiq_queue_failed Jobs failed`);
    lines.push(`# TYPE policyiq_queue_failed gauge`);
    lines.push(`policyiq_queue_failed ${qc.failed || 0}`);
    lines.push(`# HELP policyiq_dlq_failed Dead letter queue size`);
    lines.push(`# TYPE policyiq_dlq_failed gauge`);
    lines.push(`policyiq_dlq_failed ${dc.failed || 0}`);

    const r = await retrievalMetrics.get({ organizationId: org, minutes });
    for (const [src, arr] of Object.entries(r)) {
      const sum = arr.reduce((s, it) => s + it.count, 0);
      lines.push(`# HELP policyiq_retrieval_count Retrieval count by source`);
      lines.push(`# TYPE policyiq_retrieval_count counter`);
      lines.push(`policyiq_retrieval_count{org="${org}",source="${src}"} ${sum}`);
    }

    return lines.join('\n') + '\n';
  }
}

export const promMetricsService = new PromMetricsService();


