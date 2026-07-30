"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, labelFor, EVIDENCE_TYPE_LABELS } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EvidenceGrid } from "@/components/evidence/evidence-grid";
import { UploadQueue } from "@/components/evidence/upload-queue";
import { TaskLinker } from "@/components/evidence/task-linker";
import type { EvidenceItem } from "@/components/evidence/evidence-card";
import { ProjectBreadcrumb } from "@/components/layout/breadcrumb";
import { Upload, Filter, CheckSquare, X, Link2, Trash2 } from "lucide-react";
import { toast } from "sonner";

function TaskLinkerWithSuggestions({
  evidenceId,
  projectId,
  linkedTaskIds,
}: {
  evidenceId: string;
  projectId: string;
  linkedTaskIds: string[];
}) {
  const { data: suggestions } = trpc.evidence.suggest.useQuery({ evidenceId });
  return (
    <TaskLinker
      evidenceId={evidenceId}
      projectId={projectId}
      linkedTaskIds={linkedTaskIds}
      suggestions={suggestions}
    />
  );
}

function EvidenceNoteEditor({
  evidenceId,
  initialNote,
}: {
  evidenceId: string;
  initialNote: string | null;
}) {
  const utils = trpc.useUtils();
  const [note, setNote] = useState(initialNote ?? "");
  const updateNote = trpc.evidence.updateNote.useMutation({
    onSuccess: () => {
      toast.success("Note saved");
      utils.evidence.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const dirty = note !== (initialNote ?? "");

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Note</p>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note..."
        rows={2}
      />
      {dirty && (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => updateNote.mutate({ evidenceId, note })}
            disabled={updateNote.isPending}
          >
            {updateNote.isPending ? "Saving..." : "Save note"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function EvidencePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [uploaderFilter, setUploaderFilter] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<EvidenceItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounce search input
  useEffect(() => {
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [searchQuery]);

  // Bulk selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTaskId, setBulkTaskId] = useState<string>("");

  const utils = trpc.useUtils();

  const { data: tasks = [] } = trpc.task.list.useQuery({ projectId });
  const { data: uploaders = [] } = trpc.evidence.uploaders.useQuery({ projectId });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.evidence.list.useInfiniteQuery(
      {
        projectId,
        limit: 24,
        taskId: taskFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        type: (typeFilter as "photo" | "video") || undefined,
        search: debouncedSearch || undefined,
        uploadedBy: uploaderFilter || undefined,
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      }
    );

  const bulkLinkMutation = trpc.evidence.bulkLink.useMutation({
    onSuccess: (data) => {
      toast.success(`Linked ${data.linked} photos to task`);
      utils.evidence.list.invalidate();
      setSelectedIds(new Set());
      setSelectMode(false);
      setBulkTaskId("");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = trpc.evidence.delete.useMutation({
    onSuccess: () => {
      toast.success("Evidence deleted");
      setConfirmDelete(false);
      setSelectedItem(null);
      utils.evidence.list.invalidate();
      utils.evidence.count.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  // Resolve the detail-dialog item from the freshest list data so that
  // linking/unlinking/note edits reflect immediately after invalidation.
  const currentItem = selectedItem
    ? (items.find((i) => i.id === selectedItem.id) ?? selectedItem)
    : null;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkTaskId("");
  }

  function selectAll() {
    setSelectedIds(new Set(items.map((i) => i.id)));
  }

  function handleBulkLink() {
    if (!bulkTaskId || selectedIds.size === 0) return;
    bulkLinkMutation.mutate({
      evidenceIds: Array.from(selectedIds),
      taskId: bulkTaskId,
    });
  }

  function handleUploadComplete() {
    utils.evidence.list.invalidate();
  }

  function clearFilters() {
    setTaskFilter("");
    setDateFrom("");
    setDateTo("");
    setTypeFilter("");
    setSearchQuery("");
    setDebouncedSearch("");
    setUploaderFilter("");
  }

  const hasActiveFilters = taskFilter || dateFrom || dateTo || typeFilter || debouncedSearch || uploaderFilter;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProjectBreadcrumb items={[{ label: "Evidence" }]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold tracking-tight">Evidence</h2>
        <div className="flex flex-wrap items-center gap-2">
          {!selectMode ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectMode(true)}
                disabled={items.length === 0}
              >
                <CheckSquare className="mr-1 h-4 w-4" />
                Select
              </Button>
              <Button
                variant={hasActiveFilters ? "secondary" : "outline"}
                size="sm"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <Filter className="mr-1 h-4 w-4" />
                Filters
                {hasActiveFilters && " (active)"}
              </Button>
              <Button onClick={() => setUploadOpen(true)}>
                <Upload className="mr-1 h-4 w-4" />
                Upload
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={exitSelectMode}>
              <X className="mr-1 h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectMode && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Button variant="outline" size="sm" onClick={selectAll}>
            Select All ({items.length})
          </Button>
          <div className="flex items-center gap-2">
            <Select value={bulkTaskId} onValueChange={(val) => setBulkTaskId(val ?? "")}>
              <SelectTrigger className="w-56 h-8">
                <SelectValue placeholder="Link to task..." />
              </SelectTrigger>
              <SelectContent>
                {tasks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {"—".repeat(t.depth)} {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!bulkTaskId || selectedIds.size === 0 || bulkLinkMutation.isPending}
              onClick={handleBulkLink}
            >
              <Link2 className="mr-1 h-4 w-4" />
              {bulkLinkMutation.isPending ? "Linking..." : "Link"}
            </Button>
          </div>
        </div>
      )}

      {filtersOpen && !selectMode && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-1">
            <Label className="text-xs">Search</Label>
            <Input
              type="text"
              placeholder="Search notes &amp; filenames..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Task</Label>
              <Select
                value={taskFilter}
                onValueChange={(val) => setTaskFilter(val === "__all__" ? "" : (val ?? ""))}
              >
                <SelectTrigger className="w-48">
                  {/* Base UI's SelectValue renders the raw value (a UUID) once
                      selected, so render the task name ourselves. */}
                  <SelectValue placeholder="All tasks">
                    {(val: string | null) =>
                      val && val !== "__all__"
                        ? (tasks.find((t) => t.id === val)?.name ?? "All tasks")
                        : "All tasks"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All tasks</SelectItem>
                  {tasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {"—".repeat(t.depth)} {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={typeFilter}
                onValueChange={(val) => setTypeFilter(val === "__all__" ? "" : (val ?? ""))}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="All types">
                    {(val: string | null) =>
                      val && val !== "__all__"
                        ? labelFor(EVIDENCE_TYPE_LABELS, val)
                        : "All types"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All types</SelectItem>
                  <SelectItem value="photo">Photos</SelectItem>
                  <SelectItem value="video">Videos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Uploader</Label>
              <Select
                value={uploaderFilter}
                onValueChange={(val) => setUploaderFilter(val === "__all__" ? "" : (val ?? ""))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All uploaders" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All uploaders</SelectItem>
                  {uploaders.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </div>
      )}

      <EvidenceGrid
        items={items}
        onItemClick={selectMode ? undefined : setSelectedItem}
        selectedIds={selectMode ? selectedIds : undefined}
        onToggleSelect={selectMode ? toggleSelect : undefined}
        hasActiveFilters={Boolean(hasActiveFilters)}
        onClearFilters={clearFilters}
      />

      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Evidence</DialogTitle>
            <DialogDescription>
              Photos (JPEG, PNG, WebP, HEIC) and videos (MP4, MOV, WebM), up
              to 100 MB per file.
            </DialogDescription>
          </DialogHeader>
          <UploadQueue
            projectId={projectId}
            onUploadComplete={handleUploadComplete}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedItem !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {currentItem?.originalFilename ?? "Evidence Detail"}
            </DialogTitle>
          </DialogHeader>
          {currentItem && (
            <div className="space-y-4">
              {currentItem.type === "video" ? (
                <video
                  src={currentItem.publicUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full rounded-lg"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded R2 content
                <img
                  src={currentItem.publicUrl}
                  alt={currentItem.originalFilename ?? ""}
                  className="w-full rounded-lg"
                />
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Captured
                  </p>
                  <p>{formatDateTime(currentItem.capturedAt)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Uploaded by
                  </p>
                  <p>{currentItem.uploader?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Location
                  </p>
                  <p>
                    {currentItem.latitude != null && currentItem.longitude != null
                      ? `${currentItem.latitude.toFixed(5)}, ${currentItem.longitude.toFixed(5)}`
                      : "No location data"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Device
                  </p>
                  <p>{currentItem.deviceInfo ?? "—"}</p>
                </div>
              </div>
              <EvidenceNoteEditor
                key={currentItem.id}
                evidenceId={currentItem.id}
                initialNote={currentItem.note}
              />
              <TaskLinkerWithSuggestions
                evidenceId={currentItem.id}
                projectId={projectId}
                linkedTaskIds={currentItem.linkedTasks.map((t) => t.taskId)}
              />
              <div className="flex justify-end border-t pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this evidence?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedItem?.originalFilename ?? "This item"} will be removed
              from the gallery and future reports. Its task links are removed
              too. The deletion is recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!selectedItem) return;
                deleteMutation.mutate({ evidenceId: selectedItem.id });
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
