import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Calendar, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp,
  TrendingDown,
  FileText,
  Users,
  Shield,
  Bell,
  Plus,
  Filter
} from "lucide-react";
import { format, isToday, isTomorrow, isPast, isThisWeek, isThisMonth } from "date-fns";

interface ComplianceEvent {
  id: string;
  title: string;
  type: 'deadline' | 'renewal' | 'review' | 'training' | 'audit';
  date: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  relatedPolicyId?: string;
  relatedReportId?: string;
  regulation: string;
  status: 'upcoming' | 'due' | 'overdue' | 'completed';
  reminderDays: number[];
  assignedTo?: string;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
}

interface CalendarSummary {
  organizationId: string;
  generatedAt: string;
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

export default function ComplianceCalendar() {
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const queryClient = useQueryClient();

  const { data: calendarSummary, isLoading: summaryLoading } = useQuery<CalendarSummary>({
    queryKey: ['/api/calendar/summary'],
    retry: false,
  });

  const { data: allEvents, isLoading: eventsLoading } = useQuery<ComplianceEvent[]>({
    queryKey: ['/api/calendar/events'],
    retry: false,
  });

  const completeEventMutation = useMutation({
    mutationFn: async ({ eventId, notes }: { eventId: string; notes?: string }) => {
      return await apiRequest("POST", `/api/calendar/events/${eventId}/complete`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/events'] });
    },
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'overdue': return 'bg-red-100 text-red-800 border-red-200';
      case 'due': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'upcoming': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'deadline': return <AlertTriangle className="w-4 h-4" />;
      case 'renewal': return <FileText className="w-4 h-4" />;
      case 'review': return <Shield className="w-4 h-4" />;
      case 'training': return <Users className="w-4 h-4" />;
      case 'audit': return <CheckCircle className="w-4 h-4" />;
      default: return <Calendar className="w-4 h-4" />;
    }
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'excellent': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'good': return <TrendingUp className="w-5 h-5 text-blue-500" />;
      case 'needs_attention': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'critical': return <TrendingDown className="w-5 h-5 text-red-500" />;
      default: return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const formatEventDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM dd, yyyy');
  };

  const getFilteredEvents = () => {
    if (!allEvents) return [];
    
    switch (selectedFilter) {
      case 'overdue':
        return allEvents.filter(e => e.status === 'overdue');
      case 'upcoming':
        return allEvents.filter(e => e.status === 'upcoming' || e.status === 'due');
      case 'this-week':
        return allEvents.filter(e => isThisWeek(new Date(e.date)));
      case 'this-month':
        return allEvents.filter(e => isThisMonth(new Date(e.date)));
      case 'high-priority':
        return allEvents.filter(e => e.priority === 'critical' || e.priority === 'high');
      default:
        return allEvents;
    }
  };

  const handleCompleteEvent = (eventId: string) => {
    completeEventMutation.mutate({ eventId });
  };

  if (summaryLoading || eventsLoading) {
    return (
      <div className="h-full overflow-auto">
          <header className="bg-card border-b border-border px-6 py-4">
            <div>
              <h1 className="text-2xl font-bold mb-2">Compliance Calendar</h1>
              <p className="text-gray-600">Track regulatory deadlines and compliance activities</p>
            </div>
          </header>
          
          <main className="p-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader className="pb-3">
                      <Skeleton className="h-4 w-24" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-8 w-16 mb-2" />
                      <Skeleton className="h-3 w-32" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </main>
      </div>
    );
  }

  if (!calendarSummary) {
    return (
      <div className="h-full overflow-auto">
          <header className="bg-card border-b border-border px-6 py-4">
            <div>
              <h1 className="text-2xl font-bold mb-2">Compliance Calendar</h1>
              <p className="text-gray-600">Track regulatory deadlines and compliance activities</p>
            </div>
          </header>
          
          <main className="p-6">
            <Card className="text-center py-12">
              <CardContent>
                <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Calendar Data Available</h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Upload and analyze policy documents to generate compliance calendar events and deadlines.
                </p>
                <Button data-testid="button-upload-policy" onClick={() => window.location.href = '/upload'}>
                  Upload Policy Documents
                </Button>
              </CardContent>
            </Card>
          </main>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold mb-2" data-testid="text-page-title">Compliance Calendar</h1>
              <p className="text-gray-600">Track regulatory deadlines and compliance activities</p>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" data-testid="button-add-event">
                <Plus className="w-4 h-4 mr-2" />
                Add Event
              </Button>
              <Button variant="outline" size="sm" data-testid="button-notifications">
                <Bell className="w-4 h-4 mr-2" />
                Notifications
              </Button>
            </div>
          </div>
        </header>

        <main className="p-6">
          <div className="space-y-6">
            {/* Compliance Health Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card data-testid="card-compliance-health">
                <CardHeader className="pb-3">
                  <CardDescription>Compliance Health</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2 mb-2">
                    {getHealthIcon(calendarSummary.complianceHealth.status)}
                    <span className="text-2xl font-bold">
                      {calendarSummary.complianceHealth.score}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full" 
                      style={{ width: `${calendarSummary.complianceHealth.score}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-600 capitalize">
                    {calendarSummary.complianceHealth.status.replace('_', ' ')}
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-overdue-events">
                <CardHeader className="pb-3">
                  <CardDescription>Overdue Events</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="text-3xl font-bold text-red-600">
                      {calendarSummary.overdueEvents.length}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">Require immediate attention</p>
                </CardContent>
              </Card>

              <Card data-testid="card-upcoming-events">
                <CardHeader className="pb-3">
                  <CardDescription>Upcoming Events</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <span className="text-3xl font-bold">
                      {calendarSummary.upcomingEvents.length}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">Next 10 events</p>
                </CardContent>
              </Card>

              <Card data-testid="card-this-month">
                <CardHeader className="pb-3">
                  <CardDescription>This Month</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-green-500" />
                    <span className="text-3xl font-bold">
                      {calendarSummary.thisMonthEvents.length}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">Events scheduled</p>
                </CardContent>
              </Card>
            </div>

            {/* Priority & Type Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card data-testid="card-priority-breakdown">
                <CardHeader>
                  <CardTitle>Priority Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Critical</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-red-500 h-2 rounded-full" 
                            style={{ width: `${(calendarSummary.priorityBreakdown.critical / (calendarSummary.priorityBreakdown.critical + calendarSummary.priorityBreakdown.high + calendarSummary.priorityBreakdown.medium + calendarSummary.priorityBreakdown.low)) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">{calendarSummary.priorityBreakdown.critical}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">High</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-orange-500 h-2 rounded-full" 
                            style={{ width: `${(calendarSummary.priorityBreakdown.high / (calendarSummary.priorityBreakdown.critical + calendarSummary.priorityBreakdown.high + calendarSummary.priorityBreakdown.medium + calendarSummary.priorityBreakdown.low)) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">{calendarSummary.priorityBreakdown.high}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Medium</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-yellow-500 h-2 rounded-full" 
                            style={{ width: `${(calendarSummary.priorityBreakdown.medium / (calendarSummary.priorityBreakdown.critical + calendarSummary.priorityBreakdown.high + calendarSummary.priorityBreakdown.medium + calendarSummary.priorityBreakdown.low)) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">{calendarSummary.priorityBreakdown.medium}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Low</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-500 h-2 rounded-full" 
                            style={{ width: `${(calendarSummary.priorityBreakdown.low / (calendarSummary.priorityBreakdown.critical + calendarSummary.priorityBreakdown.high + calendarSummary.priorityBreakdown.medium + calendarSummary.priorityBreakdown.low)) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">{calendarSummary.priorityBreakdown.low}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-type-breakdown">
                <CardHeader>
                  <CardTitle>Event Type Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(calendarSummary.typeBreakdown).map(([type, count]) => (
                      <div key={type} className="flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                          {getTypeIcon(type)}
                          <span className="text-sm capitalize">{type}</span>
                        </div>
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Events List */}
            <Card data-testid="card-events-list">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Compliance Events</CardTitle>
                  <div className="flex space-x-2">
                    <select 
                      value={selectedFilter} 
                      onChange={(e) => setSelectedFilter(e.target.value)}
                      className="text-sm border rounded-md px-3 py-1"
                      data-testid="select-filter"
                    >
                      <option value="all">All Events</option>
                      <option value="overdue">Overdue</option>
                      <option value="upcoming">Upcoming</option>
                      <option value="this-week">This Week</option>
                      <option value="this-month">This Month</option>
                      <option value="high-priority">High Priority</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {getFilteredEvents().map((event, index) => (
                    <div key={event.id} className="border rounded-lg p-4" data-testid={`event-${index}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            {getTypeIcon(event.type)}
                            <h4 className="font-semibold">{event.title}</h4>
                            <Badge className={getPriorityColor(event.priority)}>
                              {event.priority}
                            </Badge>
                            <Badge className={getStatusColor(event.status)}>
                              {event.status}
                            </Badge>
                          </div>
                          
                          <p className="text-sm text-gray-600 mb-2">{event.description}</p>
                          
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            <span className="flex items-center space-x-1">
                              <Calendar className="w-4 h-4" />
                              <span>{formatEventDate(event.date)}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <Shield className="w-4 h-4" />
                              <span>{event.regulation}</span>
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex space-x-2">
                          {event.status !== 'completed' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCompleteEvent(event.id)}
                              disabled={completeEventMutation.isPending}
                              data-testid={`button-complete-${index}`}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Complete
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant="ghost"
                            data-testid={`button-view-${index}`}
                          >
                            View Details
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {getFilteredEvents().length === 0 && (
                    <div className="text-center py-8">
                      <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-500">No events found for the selected filter.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
    </div>
  );
}