import { z } from "zod";
import { Id } from "./schema";

const text = z.string().trim().min(1).max(500);

// Trình độ, strongest first: 0 hạt giống, 1 mạnh, 2 khá, 3 mới chơi. Hạt
// giống was added above the original three, which is why it is 0 rather than
// a renumbering of levels already stored.
export const SkillBandSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type SkillBand = z.infer<typeof SkillBandSchema>;

// Never deployed. `pnpm draw` reads this file and writes only public fields
// into frontend/public/tournament.json.
export const PrivateAthleteSchema = z.strictObject({
  id: Id,
  name: text,
  gender: z.enum(["male", "female"]),
  skillBand: SkillBandSchema.nullable(),
  phone: z.string().max(30).nullable(),
  note: z.string().max(2000),
  active: z.boolean(),
});

export const PrivateRosterSchema = z
  .strictObject({ athletes: z.array(PrivateAthleteSchema) })
  .superRefine((roster, ctx) => {
    if (
      new Set(roster.athletes.map((a) => a.id)).size !== roster.athletes.length
    )
      ctx.addIssue({ code: "custom", message: "Mã định danh bị trùng" });
  });

export type PrivateAthlete = z.infer<typeof PrivateAthleteSchema>;
export type PrivateRoster = z.infer<typeof PrivateRosterSchema>;
