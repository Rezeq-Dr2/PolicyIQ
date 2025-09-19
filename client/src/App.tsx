import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/layout/app-layout";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Upload from "@/pages/upload";
import Reports from "@/pages/reports";
import Analytics from "@/pages/Analytics";
import ExecutivePage from "@/pages/executive";
import ComplianceCalendar from "@/pages/ComplianceCalendar";
import AdminPage from "@/pages/admin";
import RegulationFormPage from "@/pages/admin/regulation-form";
import RegulationClausesPage from "@/pages/admin/regulation-clauses";
import PromptABTestPage from "@/pages/admin/prompt-ab-test";
import PolicyStudio from "@/pages/policy-studio";
import RegulatoryPage from "@/pages/regulatory";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <AppLayout>
      <Switch>
        {isLoading || !isAuthenticated ? (
          <Route path="/" component={Landing} />
        ) : (
          <>
            <Route path="/" component={Dashboard} />
            <Route path="/upload" component={Upload} />
            <Route path="/reports" component={Reports} />
            <Route path="/reports/:id" component={Reports} />
            <Route path="/analytics" component={Analytics} />
            <Route path="/executive" component={ExecutivePage} />
            <Route path="/calendar" component={ComplianceCalendar} />
            <Route path="/regulatory" component={RegulatoryPage} />
            <Route path="/admin" component={AdminPage} />
            <Route path="/admin/regulations/new" component={() => <RegulationFormPage />} />
            <Route path="/admin/regulations/:id" component={({ params }) => <RegulationFormPage regulationId={params.id} />} />
            <Route path="/admin/regulations/:id/clauses" component={({ params }) => <RegulationClausesPage regulationId={params.id} />} />
            <Route path="/admin/prompts" component={PromptABTestPage} />
            <Route path="/policy-studio" component={PolicyStudio} />
          </>
        )}
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
