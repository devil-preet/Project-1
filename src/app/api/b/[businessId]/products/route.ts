import { businessRoute } from "@/lib/api/business-route";
import { ok } from "@/lib/api/route";
import { can, type Permission } from "@/lib/permissions";
import { productAction } from "@/lib/validations/catalog";
import { createProduct, deleteProduct, setProductStatus, updateProduct } from "@/services/product.service";

export const POST = businessRoute({
  schema: productAction,
  permission: (i): Permission => (i.action === "delete" ? "product:delete" : "product:write"),
  handler: async ({ input, businessId, role }) => {
    const actor = { canPublish: can(role, "product:publish") };
    switch (input.action) {
      case "create":
        return ok({ product: await createProduct(businessId, input.product, actor) });
      case "update":
        return ok({ product: await updateProduct(businessId, input.id, input.product, actor) });
      case "setStatus":
        await setProductStatus(businessId, input.id, input.status, actor);
        return ok();
      case "delete":
        await deleteProduct(businessId, input.id);
        return ok();
    }
  },
});
