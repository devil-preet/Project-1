import { businessRoute } from "@/lib/api/business-route";
import { ok } from "@/lib/api/route";
import type { Permission } from "@/lib/permissions";
import { settingsAction } from "@/lib/validations/catalog";
import { setStorePublished, updateBranding, updateStoreSettings } from "@/services/settings.service";

export const POST = businessRoute({
  schema: settingsAction,
  // Publishing the store and changing store identity/currency are owner/admin only; branding also allows managers.
  permission: (i): Permission => (i.action === "branding" ? "branding:update" : "settings:update"),
  handler: async ({ input, businessId }) => {
    switch (input.action) {
      case "store":
        await updateStoreSettings(businessId, input);
        return ok();
      case "publish":
        await setStorePublished(businessId, input.published);
        return ok();
      case "branding":
        await updateBranding(businessId, input);
        return ok();
    }
  },
});
