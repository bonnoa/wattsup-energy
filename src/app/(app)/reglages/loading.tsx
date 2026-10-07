import { SkeletonSection } from "@/components/skeleton";

/** Pendant qu'une section charge : titre et menu restent, le contenu montre son squelette. */
export default function Loading() {
  return <SkeletonSection />;
}
