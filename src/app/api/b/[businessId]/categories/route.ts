import { businessRoute } from "@/lib/api/business-route";
import { ok } from "@/lib/api/route";
import type { Permission } from "@/lib/permissions";
import { categoryAction } from "@/lib/validations/catalog";
import { createCategory, deleteCategory, moveCategory, setCategoryActive, updateCategory } from "@/services/category.service";

export const POST = businessRoute({
  schema: categoryAction,
  permission: (i): Permission => (i.action === "delete" ? "category:delete" : "category:write"),
  handler: async ({ input, businessId }) => {
    switch (input.action) {
      case "create":
        return ok({ category: await createCategory(businessId, input) });
      case "update":
        return ok({ category: await updateCategory(businessId, input.id, input) });
      case "setActive":
        await setCategoryActive(businessId, input.id, input.active);
        return ok();
      case "move":
        await moveCategory(businessId, input.id, input.direction);
        return ok();
      case "delete":
        await deleteCategory(businessId, input.id);
        return ok();
    }
  },
});
