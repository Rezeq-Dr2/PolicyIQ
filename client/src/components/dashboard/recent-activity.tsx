import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  FileCheck, 
  Upload, 
  UserPlus, 
  AlertCircle,
  Calendar
} from "lucide-react";

export default function RecentActivity() {
  const { data: policies, isLoading: policiesLoading } = useQuery({
    queryKey: ["/api/policies"],
    retry: false,
  });

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ["/api/reports"],
    retry: false,
  });

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "analysis":
        return <FileCheck className="w-4 h-4 text-green-500" />;
      case "upload":
        return <Upload className="w-4 h-4 text-blue-500" />;
      case "signup":
        return <UserPlus className="w-4 h-4 text-purple-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getRelativeTime = (date: string) => {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
      return 'Less than an hour ago';
    }
  };

  // Combine and sort activities
  const activities: any[] = [];

  if (reports) {
    (reports as any[]).forEach((report: any) => {
      if (report.status === "completed") {
        activities.push({
          id: `report-${report.id}`,
          type: "analysis",
          title: "Policy analysis completed",
          time: report.completedAt || report.createdAt,
          description: `Compliance score: ${Math.round(report.overallScore || 0)}%`,
        });
      }
    });
  }

  if (policies) {
    (policies as any[]).forEach((policy: any) => {
      activities.push({
        id: `policy-${policy.id}`,
        type: "upload",
        title: "Document uploaded",
        time: policy.uploadedAt,
        description: policy.title,
      });
    });
  }

  // Sort by time (newest first) and take top 5
  const sortedActivities = activities
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 5);

  const isLoading = policiesLoading || reportsLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Calendar className="w-5 h-5" />
          <span>Recent Activity</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedActivities.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No recent activity</p>
            <p className="text-xs text-muted-foreground">Start by uploading a policy document</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedActivities.map((activity) => (
              <div 
                key={activity.id} 
                className="flex items-center space-x-3 p-3 bg-muted rounded-lg"
                data-testid={`activity-${activity.type}`}
              >
                <div className="w-8 h-8 bg-background rounded-full flex items-center justify-center flex-shrink-0">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {activity.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {activity.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getRelativeTime(activity.time)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
