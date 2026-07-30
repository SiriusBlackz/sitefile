"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CONTRACT_TYPE_LABELS,
  REPORTING_FREQUENCY_LABELS,
  labelFor,
} from "@/lib/format";

const projectFormSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  reference: z.string().optional(),
  clientName: z.string().optional(),
  contractType: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  reportingFrequency: z.string().optional(),
}).refine(
  (data) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
  { message: "End date must be after start date", path: ["endDate"] }
);

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

interface ProjectFormProps {
  defaultValues?: Partial<ProjectFormValues>;
  onSubmit: (values: ProjectFormValues) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export function ProjectForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel = "Create Project",
}: ProjectFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: "",
      reference: "",
      clientName: "",
      contractType: "",
      startDate: "",
      endDate: "",
      reportingFrequency: "monthly",
      ...defaultValues,
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library -- React Hook Form watch()
  const contractType = watch("contractType") ?? "";
  const reportingFrequency = watch("reportingFrequency") ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{defaultValues?.name ? "Edit Project" : "New Project"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name *</Label>
            <Input id="name" {...register("name")} placeholder="e.g. Riverside Tower Block A" />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reference">Reference</Label>
              <Input id="reference" {...register("reference")} placeholder="e.g. RT-2024-001" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientName">Client Name</Label>
              <Input id="clientName" {...register("clientName")} placeholder="e.g. Acme Construction" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contractType">Contract Type</Label>
              <Select
                value={contractType || null}
                onValueChange={(val) => setValue("contractType", val ?? undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type">
                    {(val: string | null) =>
                      val ? labelFor(CONTRACT_TYPE_LABELS, val) : "Select type"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {/* Unknown stored value: keep it selectable so it displays and survives a save untouched */}
                  {contractType && !(contractType in CONTRACT_TYPE_LABELS) && (
                    <SelectItem value={contractType}>
                      {labelFor(CONTRACT_TYPE_LABELS, contractType)}
                    </SelectItem>
                  )}
                  {Object.entries(CONTRACT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reportingFrequency">Reporting Frequency</Label>
              <Select
                value={reportingFrequency || "monthly"}
                onValueChange={(val) => setValue("reportingFrequency", val ?? undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency">
                    {(val: string | null) =>
                      val
                        ? labelFor(REPORTING_FREQUENCY_LABELS, val)
                        : "Select frequency"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {reportingFrequency &&
                    !(reportingFrequency in REPORTING_FREQUENCY_LABELS) && (
                      <SelectItem value={reportingFrequency}>
                        {labelFor(REPORTING_FREQUENCY_LABELS, reportingFrequency)}
                      </SelectItem>
                    )}
                  {Object.entries(REPORTING_FREQUENCY_LABELS).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input id="startDate" type="date" {...register("startDate")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input id="endDate" type="date" {...register("endDate")} />
              {errors.endDate && (
                <p className="text-sm text-destructive">{errors.endDate.message}</p>
              )}
            </div>
          </div>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
