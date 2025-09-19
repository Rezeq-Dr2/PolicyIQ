interface NotificationRecipient {
  userId: string;
  email: string;
  firstName?: string;
}

interface AnalysisCompleteNotification {
  reportId: string;
  documentName: string;
  overallScore: number;
  riskLevel: string;
  gapCount: number;
}

export class NotificationService {
  private inAppNotifications: Map<string, any[]> = new Map();

  async sendAnalysisCompleteNotification(
    recipient: NotificationRecipient,
    analysisData: AnalysisCompleteNotification
  ): Promise<void> {
    try {
      // Send in-app notification
      await this.sendInAppNotification(recipient.userId, {
        type: 'analysis_complete',
        title: 'Compliance Analysis Complete',
        message: `Your analysis for "${analysisData.documentName}" is ready. Score: ${analysisData.overallScore.toFixed(1)}%`,
        data: analysisData,
        createdAt: new Date(),
        read: false
      });

      // In a real implementation, you would also send email notification here
      // For now, we'll just log it
      console.log(`Email notification would be sent to: ${recipient.email}`);
      console.log(`Analysis complete for document: ${analysisData.documentName}`);
      console.log(`Overall score: ${analysisData.overallScore.toFixed(1)}%`);
      console.log(`Risk level: ${analysisData.riskLevel}`);

    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  async sendInAppNotification(userId: string, notification: any): Promise<void> {
    const userNotifications = this.inAppNotifications.get(userId) || [];
    userNotifications.unshift(notification); // Add to beginning
    
    // Keep only last 50 notifications per user
    if (userNotifications.length > 50) {
      userNotifications.splice(50);
    }
    
    this.inAppNotifications.set(userId, userNotifications);
  }

  async getNotifications(userId: string): Promise<any[]> {
    return this.inAppNotifications.get(userId) || [];
  }

  async markNotificationAsRead(userId: string, notificationIndex: number): Promise<void> {
    const userNotifications = this.inAppNotifications.get(userId) || [];
    if (userNotifications[notificationIndex]) {
      userNotifications[notificationIndex].read = true;
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    const notifications = this.inAppNotifications.get(userId) || [];
    return notifications.filter(n => !n.read).length;
  }
}

export const notificationService = new NotificationService();