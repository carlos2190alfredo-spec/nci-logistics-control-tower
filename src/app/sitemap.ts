import type { MetadataRoute } from "next";
import {
  INDEXABLE_PATHS,
  allowsIndexing,
  resolveSiteOrigin,
} from "@/components/brand/site";

/**
 * Solo la landing y el login, y solo en produccion. Fuera de produccion el
 * sitemap queda vacio para no anunciar URLs de un entorno que robots.ts cierra.
 * Sin `lastModified`: no se inventan fechas.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!allowsIndexing()) return [];
  const origin = resolveSiteOrigin();
  return INDEXABLE_PATHS.map((path) => ({
    url: new URL(path, origin).toString(),
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
