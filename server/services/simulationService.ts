import { rulesEngine, RuleExpression } from './rulesEngine';

export class SimulationService {
  async simulatePolicy(params: { organizationId: string; policyText: string; baseRegulationId?: string; extraRules?: Array<{ name: string; severity: 'low'|'medium'|'high'|'critical'; expression: RuleExpression }> }): Promise<{ total: number; passed: number; results: Array<{ rule: string; passed: boolean }> }> {
    const { organizationId, policyText, baseRegulationId, extraRules } = params;
    const baseResults = await rulesEngine.evaluateRules({ organizationId, policyText, reportId: '00000000-0000-0000-0000-000000000000', regulationId: baseRegulationId });
    const results: Array<{ rule: string; passed: boolean }> = baseResults.map(r => ({ rule: r.ruleId, passed: r.passed }));
    // Evaluate extra adhoc rules if provided
    if (Array.isArray(extraRules) && extraRules.length) {
      for (const er of extraRules) {
        const ok = (rulesEngine as any)["evaluateExpression"] ? (rulesEngine as any)["evaluateExpression"](er.expression, policyText, new Set<string>(), undefined) : false;
        results.push({ rule: er.name, passed: ok });
      }
    }
    const passed = results.filter(r => r.passed).length;
    return { total: results.length, passed, results };
  }
}

export const simulationService = new SimulationService();


