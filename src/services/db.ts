import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function connectDb() {
  try {
    await prisma.$connect();
    console.log('Successfully connected to the database.');
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    process.exit(1);
  }
}
