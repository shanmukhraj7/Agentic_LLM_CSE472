import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <h2 className="text-2xl font-bold tracking-tight mb-2">Page Not Found</h2>
      <p className="text-muted-foreground mb-6 text-sm">
        The page you are looking for does not exist.
      </p>
      <Link href="/dashboard" className={buttonVariants()}>
        Back to Dashboard
      </Link>
    </div>
  );
}
