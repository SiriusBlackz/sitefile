"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ClipboardCheck, TrendingUp } from "lucide-react";
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
  CONTRACT_FORM_LABELS,
  CONTRACT_TYPE_LABELS,
  LOCATION_SCHEME_LABELS,
  REPORTING_FREQUENCY_LABELS,
  labelFor,
} from "@/lib/format";
import { CONTRACT_FORMS, LOCATION_SCHEMES } from "@/server/db/enums";
import { cn } from "@/lib/utils";

// Types a new project can be created as. condition_survey stays out until
// its workflow exists — the chooser must never offer an unbuilt mode.
const SELECTABLE_TYPES = ["progress", "inspection"] as const;

const TYPE_OPTIONS = [
  {
    value: "progress",
    title: "Progress reports",
    blurb:
      "Regular client reports: site photos linked to your programme, site diary, planned vs actual.",
    Icon: TrendingUp,
  },
  {
    value: "inspection",
    title: "Defects inspection",
    blurb:
      "Walk the site, record defects with photos, track each one to verified close-out, and issue inspection and close-out reports.",
    Icon: ClipboardCheck,
  },
] as const;

const projectFormSchema = z
  .object({
    projectType: z.enum(SELECTABLE_TYPES).optional(),
    name: z.string().min(1, "Project name is required"),
    reference: z.string().optional(),
    clientName: z.string().optional(),
    contractType: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    reportingFrequency: z.string().optional(),
    nextReportDue: z.string().optional(),
    // Number conversion happens in register()'s setValueAs so callers can
    // pass this straight to tRPC.
    firstReportNumber: z
      .number()
      .int("Whole number only")
      .min(1, "Must be 1 or higher")
      .max(9999, "Too high")
      .optional(),
    // Inspection setup (only submitted when projectType === "inspection")
    locationScheme: z.enum(LOCATION_SCHEMES).optional(),
    contractForm: z.enum(CONTRACT_FORMS).optional(),
    defaultCorrectionPeriodDays: z
      .number()
      .int("Whole days only")
      .min(1, "Must be 1 or higher")
      .max(365, "Too long")
      .optional(),
  })
  .refine(
    (data) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
    { message: "End date must be after start date", path: ["endDate"] }
  )
  .refine(
    (data) => data.projectType !== "inspection" || !!data.locationScheme,
    {
      message: "Choose how defect locations are recorded on this site",
      path: ["locationScheme"],
    }
  );

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

interface ProjectFormProps {
  defaultValues?: Partial<ProjectFormValues>;
  onSubmit: (values: ProjectFormValues) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  /** Create screens: let the user pick progress vs defects inspection. */
  allowTypeChoice?: boolean;
  /** Edit screens: project is in defects mode, so progress-only fields are hidden. */
  inspectionMode?: boolean;
}

export function ProjectForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel = "Create Project",
  allowTypeChoice = false,
  inspectionMode = false,
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
      nextReportDue: "",
      firstReportNumber: 1,
      ...(allowTypeChoice ? { projectType: "progress" as const } : {}),
      ...defaultValues,
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library -- React Hook Form watch()
  const contractType = watch("contractType") ?? "";
  const reportingFrequency = watch("reportingFrequency") ?? "";
  const chosenType = watch("projectType");
  const locationScheme = watch("locationScheme") ?? "";
  const contractForm = watch("contractForm") ?? "";

  const isInspection = allowTypeChoice
    ? chosenType === "inspection"
    : inspectionMode;

  // Send only the fields that belong to the chosen type. A progress project
  // submits exactly the fields it always has; inspection settings on an
  // existing project are edited in the Inspection settings card.
  const submit = (values: ProjectFormValues) => {
    const {
      projectType: type,
      locationScheme: scheme,
      contractForm: form,
      defaultCorrectionPeriodDays: days,
      ...shared
    } = values;
    if (!isInspection) {
      onSubmit(shared);
      return;
    }
    // Programme dates, cadence and contract type don't apply to an inspection
    const inspectionShared = {
      name: shared.name,
      reference: shared.reference,
      clientName: shared.clientName,
      firstReportNumber: shared.firstReportNumber,
    };
    onSubmit(
      allowTypeChoice && type === "inspection"
        ? {
            ...inspectionShared,
            projectType: type,
            locationScheme: scheme,
            contractForm: form,
            defaultCorrectionPeriodDays: days,
          }
        : inspectionShared
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{defaultValues?.name ? "Edit Project" : "New Project"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          {allowTypeChoice && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">
                What are you reporting on?
              </legend>
              <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
                {TYPE_OPTIONS.map(({ value, title, blurb, Icon }) => {
                  const selected = (chosenType ?? "progress") === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setValue("projectType", value)}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        selected
                          ? "border-primary bg-accent/50 ring-1 ring-primary"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 h-5 w-5 shrink-0",
                          selected ? "text-primary" : "text-muted-foreground"
                        )}
                        aria-hidden
                      />
                      <span className="space-y-0.5">
                        <span className="block text-sm font-semibold">{title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {blurb}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                This sets up the project&apos;s screens and report. A progress
                project can start its defects period later from Settings; a
                defects inspection can&apos;t be turned back into progress reporting.
              </p>
            </fieldset>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Project Name *</Label>
            <Input id="name" {...register("name")} placeholder="e.g. Riverside Tower Block A" />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {!isInspection && (
            <div className="space-y-2 rounded-lg border border-primary/40 bg-accent/50 p-3">
              <Label htmlFor="nextReportDue" className="text-sm font-semibold">
                When is your first report due?
              </Label>
              <Input id="nextReportDue" type="date" {...register("nextReportDue")} />
              <p className="text-xs text-muted-foreground">
                Question № 1 — everything hangs off this date. It drives the
                countdown and gap list, and moves forward automatically each
                time you send a report. Leave blank to set it later.
              </p>
            </div>
          )}

          {allowTypeChoice && isInspection && (
            <div className="space-y-3 rounded-lg border border-primary/40 bg-accent/50 p-3">
              <div className="space-y-2">
                <Label htmlFor="locationScheme" className="text-sm font-semibold">
                  How are defect locations described on this site? *
                </Label>
                <Select
                  value={locationScheme || null}
                  onValueChange={(val) =>
                    setValue(
                      "locationScheme",
                      (val ?? undefined) as ProjectFormValues["locationScheme"],
                      { shouldValidate: true }
                    )
                  }
                >
                  <SelectTrigger id="locationScheme">
                    <SelectValue placeholder="Choose a location scheme">
                      {(val: string | null) =>
                        val
                          ? labelFor(LOCATION_SCHEME_LABELS, val)
                          : "Choose a location scheme"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATION_SCHEMES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {LOCATION_SCHEME_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The phone asks for these fields on every defect you record —
                  linear for roads, rail and cable routes; building for block,
                  level and room.
                </p>
                {errors.locationScheme && (
                  <p className="text-sm text-destructive">
                    {errors.locationScheme.message}
                  </p>
                )}
              </div>
            </div>
          )}

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

          {!isInspection && (
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
          )}

          {allowTypeChoice && isInspection && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contractForm">Contract form</Label>
                <Select
                  value={contractForm || null}
                  onValueChange={(val) =>
                    setValue(
                      "contractForm",
                      (val ?? undefined) as ProjectFormValues["contractForm"]
                    )
                  }
                >
                  <SelectTrigger id="contractForm">
                    <SelectValue placeholder="Not set">
                      {(val: string | null) =>
                        val ? labelFor(CONTRACT_FORM_LABELS, val) : "Not set"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_FORMS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {CONTRACT_FORM_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultCorrectionPeriodDays">
                  Defect correction period (days)
                </Label>
                <Input
                  id="defaultCorrectionPeriodDays"
                  type="number"
                  min={1}
                  max={365}
                  className="w-28"
                  placeholder="e.g. 28"
                  {...register("defaultCorrectionPeriodDays", {
                    setValueAs: (v) =>
                      v === "" || v == null ? undefined : Number(v),
                  })}
                />
                {errors.defaultCorrectionPeriodDays && (
                  <p className="text-sm text-destructive">
                    {errors.defaultCorrectionPeriodDays.message}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground md:col-span-2">
                Both are optional and print on the report. Completion and
                defects dates are set in project settings once you&apos;ve
                checked them against the contract.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="firstReportNumber">First report number</Label>
            <Input
              id="firstReportNumber"
              type="number"
              min={1}
              max={9999}
              className="w-28"
              {...register("firstReportNumber", {
                setValueAs: (v) =>
                  v === "" || v == null ? undefined : Number(v),
              })}
            />
            <p className="text-xs text-muted-foreground">
              Already sent reports for this contract before Sitefile? Start
              numbering where they left off (e.g. 5). Applies to the first
              report you generate here — after that, numbering continues
              automatically.
            </p>
            {errors.firstReportNumber && (
              <p className="text-sm text-destructive">
                {errors.firstReportNumber.message}
              </p>
            )}
          </div>

          {!isInspection && (
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
          )}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
