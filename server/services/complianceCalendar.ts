import { storage } from "../storage";
import { db } from "../db";
import { PolicyDocument, ComplianceReport, complianceCalendarEvents } from "@shared/schema";
import { and, between, eq, desc } from "drizzle-orm";

export interface ComplianceEvent {
  id: string;
  title: string;
  type: 'deadline' | 'renewal' | 'review' | 'training' | 'audit';
  date: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  relatedPolicyId?: string;
  relatedReportId?: string;
  regulation: string;
  status: 'upcoming' | 'due' | 'overdue' | 'completed';
  reminderDays: number[];
  assignedTo?: string;
  completedAt?: Date;
  completedBy?: string;
  notes?: string;
}

export interface ComplianceCalendarSummary {
  organizationId: string;
  generatedAt: Date;
  upcomingEvents: ComplianceEvent[];
  overdueEvents: ComplianceEvent[];
  thisMonthEvents: ComplianceEvent[];
  priorityBreakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  typeBreakdown: {
    deadline: number;
    renewal: number;
    review: number;
    training: number;
    audit: number;
  };
  complianceHealth: {
    score: number;
    status: 'excellent' | 'good' | 'needs_attention' | 'critical';
    trend: 'improving' | 'stable' | 'declining';
  };
}

export class ComplianceCalendarService {

  /**
   * Generate compliance calendar events for an organization
   */
  static async generateCalendarEvents(organizationId: string): Promise<ComplianceEvent[]> {
    const events: ComplianceEvent[] = [];
    
    // Get all policies and reports for the organization
    const policies = await storage.getPolicyDocuments(organizationId);
    const reports = await storage.getComplianceReports(organizationId);

    // Generate policy renewal events
    for (const policy of policies) {
      const renewalEvents = this.generatePolicyRenewalEvents(policy);
      events.push(...renewalEvents);
    }

    // Generate compliance review events
    for (const report of reports) {
      if (report.status === 'completed') {
        const reviewEvents = this.generateComplianceReviewEvents(report, policies);
        events.push(...reviewEvents);
      }
    }

    // Generate regulatory deadline events
    const regulatoryEvents = await this.generateRegulatoryDeadlineEvents(organizationId);
    events.push(...regulatoryEvents);

    // Generate training events
    const trainingEvents = this.generateTrainingEvents(organizationId, reports);
    events.push(...trainingEvents);

    // Generate audit events
    const auditEvents = this.generateAuditEvents(organizationId, policies);
    events.push(...auditEvents);

    const finalized = events
      .map(event => this.updateEventStatus(event))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Persist events idempotently (unique constraint prevents duplicates)
    for (const e of finalized) {
      await db.insert(complianceCalendarEvents).values({
        organizationId,
        assignedTo: e.assignedTo,
        title: e.title,
        type: e.type,
        date: e.date as any,
        priority: e.priority,
        description: e.description,
        relatedPolicyId: e.relatedPolicyId,
        relatedReportId: e.relatedReportId,
        status: e.status,
        reminderDays: e.reminderDays,
        completedAt: e.completedAt as any,
        completedBy: e.completedBy,
        notes: e.notes,
      }).onConflictDoNothing();
    }

    return finalized;
  }

  /**
   * Get compliance calendar summary
   */
  static async getCalendarSummary(organizationId: string): Promise<ComplianceCalendarSummary> {
    // Use persisted events as source of truth; generate missing on first call
    let events = await db.select().from(complianceCalendarEvents)
      .where(eq(complianceCalendarEvents.organizationId, organizationId))
      .orderBy(desc(complianceCalendarEvents.date));

    if (events.length === 0) {
      events = await this.generateCalendarEvents(organizationId) as any;
    }
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Filter events
    const upcomingEvents = (events as any as ComplianceEvent[])
      .filter(e => e.status === 'upcoming' && new Date(e.date as any) > now)
      .slice(0, 10); // Next 10 upcoming events

    const overdueEvents = (events as any as ComplianceEvent[]).filter(e => e.status === 'overdue');

    const thisMonthEvents = (events as any as ComplianceEvent[]).filter(e => {
      const eventDate = new Date(e.date as any);
      return eventDate >= thisMonth && eventDate < nextMonth;
    });

    // Calculate breakdowns
    const priorityBreakdown = {
      critical: events.filter(e => e.priority === 'critical').length,
      high: events.filter(e => e.priority === 'high').length,
      medium: events.filter(e => e.priority === 'medium').length,
      low: events.filter(e => e.priority === 'low').length,
    };

    const typeBreakdown = {
      deadline: events.filter(e => e.type === 'deadline').length,
      renewal: events.filter(e => e.type === 'renewal').length,
      review: events.filter(e => e.type === 'review').length,
      training: events.filter(e => e.type === 'training').length,
      audit: events.filter(e => e.type === 'audit').length,
    };

    // Calculate compliance health
    const complianceHealth = this.calculateComplianceHealth(
      events as any as ComplianceEvent[],
      overdueEvents as any as ComplianceEvent[]
    );

    return {
      organizationId,
      generatedAt: new Date(),
      upcomingEvents,
      overdueEvents,
      thisMonthEvents,
      priorityBreakdown,
      typeBreakdown,
      complianceHealth
    };
  }

  /**
   * Generate policy renewal events
   */
  private static generatePolicyRenewalEvents(policy: PolicyDocument): ComplianceEvent[] {
    const events: ComplianceEvent[] = [];
    const policyDate = new Date(policy.uploadedAt || new Date());
    
    // UK businesses typically review privacy policies annually
    const annualReview = new Date(policyDate);
    annualReview.setFullYear(annualReview.getFullYear() + 1);

    events.push({
      id: `renewal-${policy.id}-annual`,
      title: `Annual Policy Review: ${policy.title}`,
      type: 'renewal',
      date: annualReview,
      priority: 'high',
      description: `Annual review required for ${policy.title} to ensure continued compliance with UK data protection regulations.`,
      relatedPolicyId: policy.id,
      regulation: 'UK GDPR',
      status: 'upcoming',
      reminderDays: [30, 14, 7, 1],
    });

    // Quarterly review for high-risk policies
    const quarterlyReview = new Date(policyDate);
    quarterlyReview.setMonth(quarterlyReview.getMonth() + 3);

    events.push({
      id: `renewal-${policy.id}-quarterly`,
      title: `Quarterly Policy Check: ${policy.title}`,
      type: 'review',
      date: quarterlyReview,
      priority: 'medium',
      description: `Quarterly compliance check for ${policy.title} to monitor for regulatory changes.`,
      relatedPolicyId: policy.id,
      regulation: 'UK GDPR',
      status: 'upcoming',
      reminderDays: [14, 7, 1],
    });

    return events;
  }

  /**
   * Generate compliance review events based on analysis results
   */
  private static generateComplianceReviewEvents(
    report: ComplianceReport, 
    policies: PolicyDocument[]
  ): ComplianceEvent[] {
    const events: ComplianceEvent[] = [];
    const policy = policies.find(p => p.id === report.policyDocumentId);
    
    if (!policy) return events;

    let reviewDate = new Date();
    let priority: ComplianceEvent['priority'] = 'medium';
    let reminderDays = [14, 7, 1];

    // Determine review frequency based on risk level
    switch (report.riskLevel) {
      case 'Critical':
        reviewDate.setDate(reviewDate.getDate() + 7); // Weekly review
        priority = 'critical';
        reminderDays = [3, 1];
        break;
      case 'High':
        reviewDate.setDate(reviewDate.getDate() + 30); // Monthly review
        priority = 'high';
        reminderDays = [7, 3, 1];
        break;
      case 'Medium':
        reviewDate.setMonth(reviewDate.getMonth() + 3); // Quarterly review
        priority = 'medium';
        break;
      case 'Low':
        reviewDate.setMonth(reviewDate.getMonth() + 6); // Semi-annual review
        priority = 'low';
        reminderDays = [30, 14, 7];
        break;
      default:
        reviewDate.setMonth(reviewDate.getMonth() + 3);
    }

    events.push({
      id: `review-${report.id}`,
      title: `Compliance Review: ${policy.title}`,
      type: 'review',
      date: reviewDate,
      priority,
      description: `Follow-up compliance review for ${policy.title} (${report.riskLevel} risk). Address identified gaps and verify implementation of recommendations.`,
      relatedPolicyId: policy.id,
      relatedReportId: report.id,
      regulation: 'UK GDPR',
      status: 'upcoming',
      reminderDays,
    });

    return events;
  }

  /**
   * Generate regulatory deadline events
   */
  private static async generateRegulatoryDeadlineEvents(organizationId: string): Promise<ComplianceEvent[]> {
    const events: ComplianceEvent[] = [];
    const currentYear = new Date().getFullYear();

    // UK GDPR specific deadlines
    const ukGdprDeadlines = [
      {
        title: 'UK GDPR Annual DPO Report',
        date: new Date(currentYear, 2, 31), // March 31
        description: 'Submit annual Data Protection Officer report to the Information Commissioner\'s Office (ICO).',
        priority: 'high' as const,
        regulation: 'UK GDPR'
      },
      {
        title: 'Data Protection Fee Renewal',
        date: new Date(currentYear, 11, 31), // December 31
        description: 'Renew data protection fee with the Information Commissioner\'s Office (ICO).',
        priority: 'critical' as const,
        regulation: 'UK GDPR'
      },
      {
        title: 'Privacy Impact Assessment Review',
        date: new Date(currentYear, 5, 30), // June 30
        description: 'Annual review of Privacy Impact Assessments for high-risk processing activities.',
        priority: 'medium' as const,
        regulation: 'UK GDPR'
      }
    ];

    // GDPR deadlines
    const gdprDeadlines = [
      {
        title: 'GDPR Compliance Audit',
        date: new Date(currentYear, 8, 30), // September 30
        description: 'Annual internal GDPR compliance audit and documentation review.',
        priority: 'high' as const,
        regulation: 'GDPR'
      }
    ];

    // Add all regulatory deadlines
    [...ukGdprDeadlines, ...gdprDeadlines].forEach((deadline, index) => {
      events.push({
        id: `deadline-${organizationId}-${index}`,
        title: deadline.title,
        type: 'deadline',
        date: deadline.date,
        priority: deadline.priority,
        description: deadline.description,
        regulation: deadline.regulation,
        status: 'upcoming',
        reminderDays: [60, 30, 14, 7, 1],
      });
    });

    return events;
  }

  /**
   * Generate staff training events
   */
  private static generateTrainingEvents(
    organizationId: string, 
    reports: ComplianceReport[]
  ): ComplianceEvent[] {
    const events: ComplianceEvent[] = [];
    const now = new Date();

    // Determine training frequency based on risk levels
    const criticalReports = reports.filter(r => r.riskLevel === 'Critical').length;
    const highRiskReports = reports.filter(r => r.riskLevel === 'High').length;

    let trainingFrequency = 6; // months
    let priority: ComplianceEvent['priority'] = 'medium';

    if (criticalReports > 0) {
      trainingFrequency = 3; // Quarterly training for critical risks
      priority = 'high';
    } else if (highRiskReports > 0) {
      trainingFrequency = 4; // Every 4 months for high risks
      priority = 'medium';
    }

    // Generate next training event
    const nextTraining = new Date(now);
    nextTraining.setMonth(nextTraining.getMonth() + trainingFrequency);

    events.push({
      id: `training-${organizationId}-general`,
      title: 'Data Protection Training Session',
      type: 'training',
      date: nextTraining,
      priority,
      description: 'Mandatory data protection training for all staff members. Covers UK GDPR requirements, data subject rights, and incident response procedures.',
      regulation: 'UK GDPR',
      status: 'upcoming',
      reminderDays: [30, 14, 7, 1],
    });

    // Management training
    const managementTraining = new Date(now);
    managementTraining.setMonth(managementTraining.getMonth() + 6);

    events.push({
      id: `training-${organizationId}-management`,
      title: 'Management Data Protection Training',
      type: 'training',
      date: managementTraining,
      priority: 'high',
      description: 'Advanced data protection training for management team covering strategic compliance, risk assessment, and regulatory updates.',
      regulation: 'UK GDPR',
      status: 'upcoming',
      reminderDays: [30, 14, 7],
    });

    return events;
  }

  /**
   * Generate audit events
   */
  private static generateAuditEvents(
    organizationId: string, 
    policies: PolicyDocument[]
  ): ComplianceEvent[] {
    const events: ComplianceEvent[] = [];
    const now = new Date();

    // Annual external audit
    const externalAudit = new Date(now);
    externalAudit.setFullYear(externalAudit.getFullYear() + 1);
    
    events.push({
      id: `audit-${organizationId}-external`,
      title: 'Annual External Compliance Audit',
      type: 'audit',
      date: externalAudit,
      priority: 'high',
      description: 'Annual third-party compliance audit to verify adherence to UK data protection regulations and industry standards.',
      regulation: 'UK GDPR',
      status: 'upcoming',
      reminderDays: [90, 60, 30, 14],
    });

    // Internal audits (quarterly)
    for (let quarter = 1; quarter <= 4; quarter++) {
      const internalAudit = new Date(now);
      internalAudit.setMonth(quarter * 3 - 1); // March, June, September, December
      
      events.push({
        id: `audit-${organizationId}-internal-q${quarter}`,
        title: `Q${quarter} Internal Compliance Audit`,
        type: 'audit',
        date: internalAudit,
        priority: 'medium',
        description: `Quarterly internal compliance audit covering policy implementation, data processing activities, and staff training compliance.`,
        regulation: 'UK GDPR',
        status: 'upcoming',
        reminderDays: [30, 14, 7],
      });
    }

    return events;
  }

  /**
   * Update event status based on current date
   */
  private static updateEventStatus(event: ComplianceEvent): ComplianceEvent {
    const now = new Date();
    const eventDate = new Date(event.date);
    
    if (event.completedAt) {
      event.status = 'completed';
    } else if (eventDate < now) {
      event.status = 'overdue';
    } else if (eventDate.getTime() - now.getTime() <= 24 * 60 * 60 * 1000) {
      event.status = 'due';
    } else {
      event.status = 'upcoming';
    }

    return event;
  }

  /**
   * Calculate compliance health score
   */
  private static calculateComplianceHealth(
    allEvents: ComplianceEvent[], 
    overdueEvents: ComplianceEvent[]
  ): ComplianceCalendarSummary['complianceHealth'] {
    const totalEvents = allEvents.length;
    const overdueCount = overdueEvents.length;
    const criticalOverdue = overdueEvents.filter(e => e.priority === 'critical').length;
    const highOverdue = overdueEvents.filter(e => e.priority === 'high').length;

    let score = 100;
    let status: 'excellent' | 'good' | 'needs_attention' | 'critical' = 'excellent';
    let trend: 'improving' | 'stable' | 'declining' = 'stable';

    // Deduct points for overdue events
    score -= criticalOverdue * 20;
    score -= highOverdue * 10;
    score -= (overdueCount - criticalOverdue - highOverdue) * 5;

    score = Math.max(0, score);

    // Determine status
    if (criticalOverdue > 0 || score < 50) {
      status = 'critical';
      trend = 'declining';
    } else if (highOverdue > 0 || score < 70) {
      status = 'needs_attention';
      trend = 'declining';
    } else if (score < 85) {
      status = 'good';
    } else {
      status = 'excellent';
      trend = 'improving';
    }

    return { score, status, trend };
  }

  /**
   * Mark event as completed
   */
  static async markEventCompleted(
    eventId: string,
    userId: string,
    notes?: string
  ): Promise<boolean> {
    try {
      await db.update(complianceCalendarEvents)
        .set({ status: 'completed', completedAt: new Date() as any, completedBy: userId, notes })
        .where(eq(complianceCalendarEvents.id, eventId));
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get events for a specific date range
   */
  static async getEventsInRange(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceEvent[]> {
    const events = await db.select().from(complianceCalendarEvents)
      .where(
        and(
          eq(complianceCalendarEvents.organizationId, organizationId),
          between(complianceCalendarEvents.date, startDate as any, endDate as any)
        )
      )
      .orderBy(complianceCalendarEvents.date);
    return events as any;
  }
}