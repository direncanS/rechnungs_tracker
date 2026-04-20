import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || "Admin";

  if (!email || !password) {
    console.error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in environment"
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("SEED_ADMIN_PASSWORD must be at least 8 characters");
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Idempotent: only create if not exists
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (existing) {
    console.log(`Admin user already exists: ${normalizedEmail}`);
    return;
  }

  const passwordHash = await hash(password, 12);

  await prisma.user.create({
    data: {
      email: normalizedEmail,
      name,
      passwordHash,
      role: "OWNER",
      isActive: true,
    },
  });

  console.log(`Admin user created: ${normalizedEmail}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
