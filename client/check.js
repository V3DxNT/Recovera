const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.incident.findMany().then(console.log).finally(() => prisma.$disconnect());
