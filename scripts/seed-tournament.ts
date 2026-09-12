import { readFile } from "node:fs/promises";
import { createS3Repository } from "../backend/src/storage/s3-repository";
import { TournamentSchema } from "../packages/domain/src/schema";
if (!process.env.DATA_BUCKET) throw new Error("Cần DATA_BUCKET");
const seed = TournamentSchema.parse(
  JSON.parse(await readFile("data/tournament.seed.json", "utf8")),
);
await createS3Repository(process.env.DATA_BUCKET).create(seed);
console.log("Đã tạo dữ liệu giải mới. Không ghi đè dữ liệu đã có.");
