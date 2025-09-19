import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Edit, Trash2, FileText } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const clauseFormSchema = z.object({
  clauseIdentifier: z.string().min(1, "Clause identifier is required"),
  clauseText: z.string().min(1, "Clause text is required"),
});

type ClauseFormData = z.infer<typeof clauseFormSchema>;

interface RegulationClause {
  id: string;
  regulationId: string;
  clauseIdentifier: string;
  clauseText: string;
  lastUpdatedBy: string | null;
}

interface Regulation {
  id: string;
  name: string;
  fullName: string | null;
  clauses: RegulationClause[];
}

interface RegulationClausesPageProps {
  regulationId: string;
}

export default function RegulationClausesPage({ regulationId }: RegulationClausesPageProps) {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClause, setEditingClause] = useState<RegulationClause | null>(null);

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

  const { data: regulation, isLoading } = useQuery<Regulation>({
    queryKey: ["/api/admin/regulations", regulationId],
    enabled: !!user && user.role === 'admin',
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error as Error)) {
        return false;
      }
      return failureCount < 3;
    },
  });

  const form = useForm<ClauseFormData>({
    resolver: zodResolver(clauseFormSchema),
    defaultValues: {
      clauseIdentifier: "",
      clauseText: "",
    },
  });

  useEffect(() => {
    if (editingClause) {
      form.reset({
        clauseIdentifier: editingClause.clauseIdentifier,
        clauseText: editingClause.clauseText,
      });
    } else {
      form.reset({
        clauseIdentifier: "",
        clauseText: "",
      });
    }
  }, [editingClause, form]);

  const createClauseMutation = useMutation({
    mutationFn: async (data: ClauseFormData) => {
      return apiRequest("POST", `/api/admin/regulations/${regulationId}/clauses`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/regulations", regulationId] });
      toast({
        title: "Success",
        description: "Clause added successfully.",
      });
      setIsDialogOpen(false);
      form.reset();
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
        description: "Failed to add clause. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateClauseMutation = useMutation({
    mutationFn: async (data: ClauseFormData) => {
      return apiRequest("PUT", `/api/admin/clauses/${editingClause?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/regulations", regulationId] });
      toast({
        title: "Success",
        description: "Clause updated successfully.",
      });
      setIsDialogOpen(false);
      setEditingClause(null);
      form.reset();
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
        description: "Failed to update clause. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteClauseMutation = useMutation({
    mutationFn: async (clauseId: string) => {
      return apiRequest("DELETE", `/api/admin/clauses/${clauseId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/regulations", regulationId] });
      toast({
        title: "Success",
        description: "Clause deleted successfully.",
      });
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
        description: "Failed to delete clause. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ClauseFormData) => {
    if (editingClause) {
      updateClauseMutation.mutate(data);
    } else {
      createClauseMutation.mutate(data);
    }
  };

  const handleEdit = (clause: RegulationClause) => {
    setEditingClause(clause);
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingClause(null);
    setIsDialogOpen(true);
  };

  const handleDelete = (clauseId: string) => {
    if (confirm("Are you sure you want to delete this clause?")) {
      deleteClauseMutation.mutate(clauseId);
    }
  };

  if (authLoading || !user || user.role !== 'admin') {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!regulation) {
    return (
      <div className="text-center py-8">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Regulation not found</h3>
        <Button onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Admin
        </Button>
      </div>
    );
  }

  const isPending = createClauseMutation.isPending || updateClauseMutation.isPending || deleteClauseMutation.isPending;

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="regulation-clauses">
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
          Manage Clauses: {regulation.name}
        </h1>
        {regulation.fullName && (
          <p className="text-gray-600 mt-2" data-testid="regulation-fullname">
            {regulation.fullName}
          </p>
        )}
      </div>

      <Card data-testid="clauses-management">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Regulation Clauses</CardTitle>
              <CardDescription>
                Manage individual clauses and requirements for this regulation
              </CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={handleAddNew} data-testid="button-add-clause">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Clause
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl" data-testid="clause-dialog">
                <DialogHeader>
                  <DialogTitle>
                    {editingClause ? "Edit Clause" : "Add New Clause"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingClause 
                      ? "Update the details of this regulation clause."
                      : "Add a new clause to this regulation."
                    }
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="clauseIdentifier"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Clause Identifier</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., Article 6, Section 1798.110" 
                              {...field}
                              data-testid="input-clause-identifier"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="clauseText"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Clause Text</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Enter the full text of this regulation clause..."
                              className="min-h-[200px]"
                              {...field}
                              data-testid="textarea-clause-text"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsDialogOpen(false);
                          setEditingClause(null);
                        }}
                        data-testid="button-cancel-clause"
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={isPending}
                        data-testid="button-save-clause"
                      >
                        {isPending ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                            Saving...
                          </>
                        ) : (
                          editingClause ? "Update Clause" : "Add Clause"
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {regulation.clauses?.length ? (
            <Table data-testid="clauses-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Identifier</TableHead>
                  <TableHead>Text Preview</TableHead>
                  <TableHead>Last Updated By</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regulation.clauses.map((clause) => (
                  <TableRow key={clause.id} data-testid={`clause-row-${clause.id}`}>
                    <TableCell>
                      <div className="font-medium" data-testid={`clause-identifier-${clause.id}`}>
                        {clause.clauseIdentifier}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-md" data-testid={`clause-text-${clause.id}`}>
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {clause.clauseText.length > 100 
                            ? `${clause.clauseText.substring(0, 100)}...`
                            : clause.clauseText
                          }
                        </p>
                      </div>
                    </TableCell>
                    <TableCell data-testid={`clause-updated-by-${clause.id}`}>
                      {clause.lastUpdatedBy || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(clause)}
                          data-testid={`button-edit-clause-${clause.id}`}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(clause.id)}
                          data-testid={`button-delete-clause-${clause.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8" data-testid="no-clauses-message">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No clauses found</h3>
              <p className="text-gray-500 mb-4">Start by adding the first clause for this regulation.</p>
              <Button onClick={handleAddNew} data-testid="button-add-first-clause">
                <Plus className="h-4 w-4 mr-2" />
                Add First Clause
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}