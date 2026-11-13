import type { MetadataRoute } from "next";
import {
  PRIVATE_PATH_PREFIXES,
  allowsIndexing,
  resolveSiteOrigin,
} from "@/components/brand/site";

/**
 * Solo APP_ENV=production permite rastrear la landing y el login. Local,
 * staging o un valor desconocido responden "disallow all": el staging tiene
 * datos demo y no debe aparecer en buscadores. Los prefijos privados quedan
 * excluidos tambien en produccion (areas autenticadas, APIs y flujos con token).
 */
export default function robots(): MetadataRoute.Robots {
  if (!allowsIndexing()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login"],
      disallow: [...PRIVATE_PATH_PREFIXES],
    },
    sitemap: `${resolveSiteOrigin()}/sitemap.xml`,
  };
}
