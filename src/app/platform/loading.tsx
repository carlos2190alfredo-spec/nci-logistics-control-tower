import { PageSkeleton } from "@/components/ui/skeleton";

export default function PlatformLoading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-6">
      <PageSkeleton />
    </div>
  );
}
