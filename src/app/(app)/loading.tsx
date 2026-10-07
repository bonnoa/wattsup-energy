import { SkeletonPage } from "@/components/skeleton";

/** Pendant qu'une page charge : le menu reste, le contenu montre son squelette. */
export default function Loading() {
  return <SkeletonPage />;
}
