import { defineCatalog } from "@json-render/core"
import { schema } from "@json-render/react/schema"
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog"
import { z } from "zod"

export const catalog = defineCatalog(schema, {
  components: {
    ...shadcnComponentDefinitions,

    // ── Custom SiteBrief components ──

    MetricCard: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        unit: z.string().nullable(),
        trend: z.enum(["up", "down", "neutral"]).nullable(),
      }),
      description:
        "Display a single property metric with label and value. Use for lot area, FAR, year built, floors, units, building area.",
      example: { label: "Lot Area", value: "12,500", unit: "SF" },
    },

    RiskBadge: {
      props: z.object({
        level: z.enum(["low", "medium", "high"]),
        label: z.string().nullable(),
      }),
      description:
        "Color-coded risk level indicator. Green for low, yellow for medium, red for high.",
      example: { level: "low", label: "Violation Risk" },
    },

    ConstraintBadge: {
      props: z.object({
        type: z.enum(["FLOOD", "E-DESIG", "LANDMARK", "HISTORIC"]),
      }),
      description:
        "Property constraint flag chip. Use to indicate active constraints on the parcel.",
      example: { type: "FLOOD" },
    },

    DataRow: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        source: z.string().nullable(),
      }),
      description:
        "Label-value pair with optional data source citation. Use for detailed property data points.",
      example: { label: "Base FAR", value: "3.0", source: "LA County Assessor" },
    },

    ScoreIndicator: {
      props: z.object({
        score: z.enum(["high", "med", "low"]),
        label: z.string().nullable(),
      }),
      description:
        "Green/yellow/red dot with label. Use to indicate development potential score.",
      example: { score: "high", label: "Development Potential" },
    },
  },
  actions: {},
})
