import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading calendar" className="space-y-6">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-4 w-full max-w-[60ch]" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
