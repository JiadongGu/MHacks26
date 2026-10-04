import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading conversations" className="space-y-6">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-4 w-full max-w-[60ch]" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
