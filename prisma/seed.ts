import { PrismaClient } from "@prisma/client";
import { seedBase } from "./seed-base";

const db = new PrismaClient();
seedBase(db)
  .then(() => console.log("Seed abgeschlossen."))
  .finally(() => db.$disconnect());
