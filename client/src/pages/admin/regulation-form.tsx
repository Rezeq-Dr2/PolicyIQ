import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, FileText } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";

const regulationFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name must be less than 255 characters"),
  fullName: z.string().optional(),
  description: z.string().optional(),
  jurisdiction: z.string().optional(),
  effectiveDate: z.string().optional(),
  version: z.string().optional(),
  isActive: z.boolean().default(true),
});

type RegulationFormData = z.infer<typeof regulationFormSchema>;

interface RegulationFormPageProps {
  regulationId?: string;
}

export default function RegulationFormPage({ regulationId }: RegulationFormPageProps) {
  const isEditing = !!regulationId;
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  // Check if user has admin access
  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== 'admin')) {
      toast({
        title: "Access Denied",
        description: "Admin access required to view this page.",
        variant: "destructive",
      });
      navigate("/admin");
    }
  }, [isAuthenticated, user, authLoading, toast, navigate]);

  // Fetch regulation data if editing
  const { data: regulation, isLoading: regulationLoading } = useQuery<any>({
    queryKey: ["/api/admin/regulations", regulationId],
    enabled: isEditing && !!user && user.role === 'admin',
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error as Error)) {
        return false;
      }
      return failureCount < 3;
    },
  });

  const form = useForm<RegulationFormData>({
    resolver: zodResolver(regulationFormSchema),
    defaultValues: {
      name: "",
      fullName: "",
      description: "",
      jurisdiction: "",
      effectiveDate: "",
      version: "",
      isActive: true,
    },
  });

  // Update form with fetched data
  useEffect(() => {
    if (regulation) {
      form.reset({
        name: regulation.name,
        fullName: regulation.fullName || "",
        description: regulation.description || "",
        jurisdiction: regulation.jurisdiction || "",
        effectiveDate: regulation.effectiveDate 
          ? new Date(regulation.effectiveDate).toISOString().split('T')[0] 
          : "",
        version: regulation.version || "",
        isActive: regulation.isActive,
      });
    }
  }, [regulation, form]);

  const createMutation = useMutation({
    mutationFn: async (data: RegulationFormData) => {
      const payload = {
        ...data,
        effectiveDate: data.effectiveDate ? new Date(data.effectiveDate).toISOString() : null,
        fullName: data.fullName || null,
        description: data.description || null,
        jurisdiction: data.jurisdiction || null,
        version: data.version || null,
      };
      return apiRequest("POST", "/api/admin/regulations", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/regulations"] });
      toast({
        title: "Success",
        description: "Regulation created successfully.",
      });
      navigate("/admin");
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to create regulation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: RegulationFormData) => {
      const payload = {
        ...data,
        effectiveDate: data.effectiveDate ? new Date(data.effectiveDate).toISOString() : null,
        fullName: data.fullName || null,
        description: data.description || null,
        jurisdiction: data.jurisdiction || null,
        version: data.version || null,
      };
      return apiRequest("PUT", `/api/admin/regulations/${regulationId}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/regulations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/regulations", regulationId] });
      toast({
        title: "Success",
        description: "Regulation updated successfully.",
      });
      navigate("/admin");
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update regulation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: RegulationFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  if (authLoading || !user || user.role !== 'admin') {
    return null;
  }

  if (isEditing && regulationLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 max-w-4xl mx-auto" data-testid="regulation-form">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin")}
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Admin
        </Button>
        <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="page-title">
          <FileText className="h-8 w-8 text-blue-600" />
          {isEditing ? "Edit Regulation" : "New Regulation"}
        </h1>
        <p className="text-gray-600 mt-2">
          {isEditing ? "Update regulation details" : "Add a new regulatory framework"}
        </p>
      </div>

      <Card data-testid="regulation-form-card">
        <CardHeader>
          <CardTitle>Regulation Details</CardTitle>
          <CardDescription>
            Enter the information for this regulatory framework
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., GDPR, CCPA, DPA 2018" 
                          {...field}
                          data-testid="input-name"
                        />
                      </FormControl>
                      <FormDescription>
                        Short name or acronym for the regulation
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="jurisdiction"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jurisdiction</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-jurisdiction">
                            <SelectValue placeholder="Select jurisdiction" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="UK">United Kingdom</SelectItem>
                          <SelectItem value="EU">European Union</SelectItem>
                          <SelectItem value="California">California</SelectItem>
                          <SelectItem value="Global">Global</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., General Data Protection Regulation" 
                        {...field}
                        data-testid="input-fullname"
                      />
                    </FormControl>
                    <FormDescription>
                      Complete official name of the regulation
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe the purpose and scope of this regulation..."
                        className="min-h-[100px]"
                        {...field}
                        data-testid="textarea-description"
                      />
                    </FormControl>
                    <FormDescription>
                      Brief description of what this regulation covers
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="version"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Version</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., 1.0, 2024.1" 
                          {...field}
                          data-testid="input-version"
                        />
                      </FormControl>
                      <FormDescription>
                        Version number or identifier
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="effectiveDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Effective Date</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field}
                          data-testid="input-effective-date"
                        />
                      </FormControl>
                      <FormDescription>
                        When this regulation came into effect
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active Status</FormLabel>
                      <FormDescription>
                        Whether this regulation is currently active and enforced
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-is-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4 pt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/admin")}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isPending}
                  data-testid="button-save"
                >
                  {isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {isEditing ? "Update Regulation" : "Create Regulation"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}